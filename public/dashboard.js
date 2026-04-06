const authShell = document.getElementById("authShell");
const dashboardShell = document.getElementById("dashboardShell");
const loginForm = document.getElementById("loginForm");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginFeedback = document.getElementById("loginFeedback");
const logoutBtn = document.getElementById("logoutBtn");
const createAppointmentForm = document.getElementById("createAppointmentForm");
const createBtn = document.getElementById("createBtn");
const createNameInput = document.getElementById("createName");
const createPhoneInput = document.getElementById("createPhone");
const appointmentsBody = document.getElementById("appointmentsBody");
const feedback = document.getElementById("feedback");
const refreshBtn = document.getElementById("refreshBtn");
const searchInput = document.getElementById("searchInput");
const dateFilter = document.getElementById("dateFilter");
const statusFilter = document.getElementById("statusFilter");

let appointments = [];

document.addEventListener("DOMContentLoaded", () => {
  checkSession();
  loginForm.addEventListener("submit", handleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  createAppointmentForm.addEventListener("submit", handleCreateAppointment);
  createNameInput.addEventListener("input", () => {
    sanitizeNameInput(createNameInput);
  });
  createPhoneInput.addEventListener("input", () => {
    sanitizePhoneInput(createPhoneInput);
  });
  refreshBtn.addEventListener("click", loadAppointments);
  searchInput.addEventListener("input", renderAppointments);
  dateFilter.addEventListener("change", renderAppointments);
  statusFilter.addEventListener("change", renderAppointments);
});

async function checkSession() {
  try {
    const response = await fetch("/api/admin/session");
    const result = await response.json();

    if (!response.ok || !result.authenticated) {
      showLogin();
      return;
    }

    showDashboard();
    await loadAppointments();
  } catch (error) {
    showLogin();
  }
}

function showLogin() {
  authShell.hidden = false;
  dashboardShell.hidden = true;
}

function showDashboard() {
  authShell.hidden = true;
  dashboardShell.hidden = false;
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginFeedback("", "");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: loginUsername.value.trim(),
        password: loginPassword.value,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Connexion impossible.");
    }

    loginForm.reset();
    setLoginFeedback("", "");
    showDashboard();
    await loadAppointments();
  } catch (error) {
    setLoginFeedback(error.message, "error");
  }
}

async function handleLogout() {
  try {
    await fetch("/api/admin/logout", {
      method: "POST",
    });
  } finally {
    appointments = [];
    createAppointmentForm.reset();
    setFeedback("", "");
    showLogin();
  }
}

async function loadAppointments() {
  setFeedback("", "");
  appointmentsBody.innerHTML =
    '<tr><td colspan="7" class="empty-state">Chargement...</td></tr>';

  try {
    const response = await fetch("/api/admin/appointments");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Impossible de charger les rendez-vous.");
    }

    appointments = data.sort(compareAppointments);
    updateStats();
    renderAppointments();
  } catch (error) {
    if (error.message === "Authentification requise.") {
      showLogin();
      return;
    }

    setFeedback(error.message, "error");
    appointmentsBody.innerHTML =
      '<tr><td colspan="7" class="empty-state">Aucune donnee disponible.</td></tr>';
  }
}

function updateStats() {
  const today = formatDateForInput(new Date());
  const totals = {
    total: appointments.length,
    confirmed: appointments.filter((item) => item.status === "confirmed").length,
    pending: appointments.filter((item) => item.status === "pending").length,
    today: appointments.filter((item) => item.appointment_date === today).length,
    upcoming: appointments.filter((item) => item.appointment_date >= today).length,
  };

  document.getElementById("statTotal").textContent = totals.total;
  document.getElementById("statConfirmed").textContent = totals.confirmed;
  document.getElementById("statPending").textContent = totals.pending;
  document.getElementById("statToday").textContent = totals.today;
  document.getElementById("statUpcoming").textContent = totals.upcoming;
}

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderAppointments() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const selectedDate = dateFilter.value;
  const selectedStatus = statusFilter.value;

  const filtered = appointments.filter((appointment) => {
    const haystack = `${appointment.name} ${appointment.phone}`.toLowerCase();
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    const matchesDate =
      !selectedDate || appointment.appointment_date === selectedDate;
    const matchesStatus =
      !selectedStatus || appointment.status === selectedStatus;

    return matchesSearch && matchesDate && matchesStatus;
  });

  if (filtered.length === 0) {
    appointmentsBody.innerHTML =
      '<tr><td colspan="7" class="empty-state">Aucun rendez-vous trouve.</td></tr>';
    return;
  }

  appointmentsBody.innerHTML = filtered
    .map(
      (appointment) => `
        <tr>
          <td>${escapeHtml(appointment.name)}</td>
          <td>${escapeHtml(appointment.phone)}</td>
          <td>${formatDate(appointment.appointment_date)}</td>
          <td>${escapeHtml(formatTime24(appointment.appointment_time))}</td>
          <td class="notes-cell">${escapeHtml(appointment.notes || "-")}</td>
          <td>
            <span class="status-badge status-${appointment.status}">
              ${formatStatus(appointment.status)}
            </span>
          </td>
          <td>
            <div class="row-actions">
              <select class="status-select" data-id="${appointment.id}">
                <option value="pending" ${
                  appointment.status === "pending" ? "selected" : ""
                }>En attente</option>
                <option value="confirmed" ${
                  appointment.status === "confirmed" ? "selected" : ""
                }>Confirme</option>
                <option value="completed" ${
                  appointment.status === "completed" ? "selected" : ""
                }>Termine</option>
                <option value="cancelled" ${
                  appointment.status === "cancelled" ? "selected" : ""
                }>Annule</option>
              </select>
              <button class="delete-button" type="button" data-delete-id="${
                appointment.id
              }">
                Supprimer
              </button>
            </div>
          </td>
        </tr>`,
    )
    .join("");

  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", handleStatusChange);
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", handleDelete);
  });
}

async function handleStatusChange(event) {
  const appointmentId = event.target.dataset.id;
  const { value } = event.target;

  try {
    const response = await fetch(`/api/admin/appointments/${appointmentId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: value }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Mise a jour impossible.");
    }

    const appointment = appointments.find((item) => String(item.id) === appointmentId);
    if (appointment) {
      appointment.status = value;
    }

    appointments.sort(compareAppointments);
    updateStats();
    renderAppointments();
    setFeedback("Statut mis a jour.", "success");
  } catch (error) {
    setFeedback(error.message, "error");
    await loadAppointments();
  }
}

async function handleDelete(event) {
  const appointmentId = event.target.dataset.deleteId;

  try {
    const response = await fetch(`/api/admin/appointments/${appointmentId}`, {
      method: "DELETE",
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Suppression impossible.");
    }

    appointments = appointments.filter((item) => String(item.id) !== appointmentId);
    updateStats();
    renderAppointments();
    setFeedback("Rendez-vous supprime.", "success");
  } catch (error) {
    setFeedback(error.message, "error");
  }
}

async function handleCreateAppointment(event) {
  event.preventDefault();
  setFeedback("", "");
  createBtn.disabled = true;

  const nameValue = createNameInput.value.trim();
  const phoneValue = createPhoneInput.value.trim();

  if (!isNameValueValid(nameValue)) {
    setFeedback("Le nom complet doit contenir uniquement des lettres.", "error");
    createBtn.disabled = false;
    return;
  }

  if (!isPhoneValueValid(phoneValue)) {
    setFeedback("Le numero de telephone doit contenir uniquement des chiffres.", "error");
    createBtn.disabled = false;
    return;
  }

  try {
    const response = await fetch("/api/admin/appointments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: nameValue,
        phone: phoneValue,
        date: document.getElementById("createDate").value,
        time: document.getElementById("createTime").value,
        status: document.getElementById("createStatus").value,
        notes: document.getElementById("createNotes").value.trim(),
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Ajout impossible.");
    }

    createAppointmentForm.reset();
    appointments.unshift(result.appointment);
    appointments.sort(compareAppointments);
    updateStats();
    renderAppointments();
    setFeedback("Rendez-vous ajoute.", "success");
  } catch (error) {
    setFeedback(error.message, "error");
  } finally {
    createBtn.disabled = false;
  }
}

function setFeedback(message, type) {
  feedback.hidden = !message;
  feedback.className = `feedback${type ? ` ${type}` : ""}`;
  feedback.textContent = message;
}

function setLoginFeedback(message, type) {
  loginFeedback.hidden = !message;
  loginFeedback.className = `feedback${type ? ` ${type}` : ""}`;
  loginFeedback.textContent = message;
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatStatus(status) {
  if (status === "pending") return "En attente";
  if (status === "completed") return "Termine";
  if (status === "cancelled") return "Annule";
  return "Confirme";
}

function formatTime24(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return trimmed;
  }

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function compareAppointments(a, b) {
  return parseAppointmentDateTime(a) - parseAppointmentDateTime(b);
}

function sanitizePhoneInput(input) {
  input.value = input.value.replace(/[^\d +]/g, "");
}

function isPhoneValueValid(value) {
  return /^[0-9 +]+$/.test(value.trim());
}

function sanitizeNameInput(input) {
  input.value = input.value.replace(/[^\p{L} '-]/gu, "");
}

function isNameValueValid(value) {
  return /^[\p{L} '-]+$/u.test(value.trim());
}

function parseAppointmentDateTime(appointment) {
  const [year, month, day] = appointment.appointment_date.split("-").map(Number);
  const match = String(appointment.appointment_time)
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return new Date(year, month - 1, day).getTime();
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return new Date(year, month - 1, day, hours, minutes).getTime();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
