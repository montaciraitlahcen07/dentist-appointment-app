// =====================================================
// DentaCare - Dental Clinic Website JavaScript
// =====================================================

// State
let currentDate = new Date();
let selectedDate = null;
let selectedTime = null;
let bookedTimes = [];
let testimonialIndex = 0;
let activeBookingRequest = 0;
let fullyBookedDates = new Set();
let activeMonthAvailabilityRequest = 0;

const API_URL = "/api";

// Time slots (French format)
const allTimeSlots = [
  "9:00",
  "9:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

function normalizeTimeSlotValue(time) {
  const trimmed = String(time || "").trim();
  if (!trimmed) return "";

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hours, minutes] = trimmed.split(":");
    return `${Number(hours)}:${minutes}`;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return trimmed;

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return `${hours}:${minutes}`;
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initScrollEffects();
  initTestimonials();
  renderCalendar();
  loadMonthAvailability();
  initBookingForm();
});

// =====================================================
// NAVIGATION
// =====================================================
function initNavigation() {
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      navMenu.classList.toggle("active");
      navToggle.classList.toggle("active");
    });
  }

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (navMenu) navMenu.classList.remove("active");
      if (navToggle) navToggle.classList.remove("active");
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition =
          elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    });
  });

  const sections = document.querySelectorAll("section[id]");
  window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      if (window.pageYOffset >= sectionTop - 200) {
        current = section.getAttribute("id");
      }
    });

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href") === `#${current}`) {
        link.classList.add("active");
      }
    });
  });
}

// =====================================================
// SCROLL EFFECTS
// =====================================================
function initScrollEffects() {
  const navbar = document.getElementById("navbar");

  if (navbar) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 50) {
        navbar.classList.add("scrolled");
      } else {
        navbar.classList.remove("scrolled");
      }
    });
  }

  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("animate-fade-in");
      }
    });
  }, observerOptions);

  document.querySelectorAll(".section").forEach((section) => {
    observer.observe(section);
  });
}

// =====================================================
// TESTIMONIALS CAROUSEL
// =====================================================
function initTestimonials() {
  const track = document.getElementById("testimonialsTrack");
  const dotsContainer = document.getElementById("testimonialsDots");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  if (!track || !dotsContainer || !prevBtn || !nextBtn) return;

  const cards = track.querySelectorAll(".testimonial-card");
  let slidesPerView = getSlidesPerView();
  let totalSlides = Math.ceil(cards.length / slidesPerView);

  function createDots() {
    dotsContainer.innerHTML = "";
    for (let i = 0; i < totalSlides; i++) {
      const dot = document.createElement("span");
      dot.classList.add("dot");
      if (i === 0) dot.classList.add("active");
      dot.addEventListener("click", () => goToSlide(i));
      dotsContainer.appendChild(dot);
    }
  }

  function getSlidesPerView() {
    if (window.innerWidth < 768) return 1;
    if (window.innerWidth < 1024) return 2;
    return 3;
  }

  function updateCarousel() {
    if (!cards.length) return;

    const cardWidth = cards[0].offsetWidth + 24;
    track.style.transform = `translateX(-${testimonialIndex * cardWidth * slidesPerView}px)`;

    document.querySelectorAll(".testimonials-dots .dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === testimonialIndex);
    });
  }

  function goToSlide(index) {
    testimonialIndex = index;
    updateCarousel();
  }

  function nextSlide() {
    testimonialIndex = (testimonialIndex + 1) % totalSlides;
    updateCarousel();
  }

  function prevSlide() {
    testimonialIndex = (testimonialIndex - 1 + totalSlides) % totalSlides;
    updateCarousel();
  }

  prevBtn.addEventListener("click", prevSlide);
  nextBtn.addEventListener("click", nextSlide);

  window.addEventListener("resize", () => {
    slidesPerView = getSlidesPerView();
    totalSlides = Math.ceil(cards.length / slidesPerView);
    testimonialIndex = Math.min(testimonialIndex, totalSlides - 1);
    createDots();
    updateCarousel();
  });

  let autoplay = setInterval(nextSlide, 5000);

  track.addEventListener("mouseenter", () => clearInterval(autoplay));
  track.addEventListener("mouseleave", () => {
    autoplay = setInterval(nextSlide, 5000);
  });

  createDots();
  updateCarousel();
}

// =====================================================
// CALENDAR
// =====================================================
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = [
    "Janvier",
    "F\u00e9vrier",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Ao\u00fbt",
    "Septembre",
    "Octobre",
    "Novembre",
    "D\u00e9cembre",
  ];

  document.getElementById("calendarMonth").textContent =
    `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let html = "";

  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<button type="button" class="day other-month">${daysInPrevMonth - i}</button>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateForAPI(date);
    const dayOfWeek = date.getDay();
    const isPast = date < today;
    const isWeekend = dayOfWeek === 0;
    const isFullyBooked = fullyBookedDates.has(dateStr);
    const isSelected =
      selectedDate && date.toDateString() === selectedDate.toDateString();

    let classes = "day";
    if (isPast) {
      classes += " past";
    } else if (isFullyBooked) {
      classes += " booked";
    } else if (isWeekend) {
      classes += " weekend";
    } else {
      classes += " available";
    }

    if (isSelected) classes += " selected";

    const isUnavailable = isPast || isWeekend || isFullyBooked;
    const onclick =
      !isUnavailable
        ? `onclick="selectDate('${dateStr}')"`
        : "";

    html += `<button type="button" class="${classes}" ${onclick}>${day}</button>`;
  }

  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const remaining = totalCells - (firstDay + daysInMonth);
  for (let i = 1; i <= remaining; i++) {
    html += `<button type="button" class="day other-month">${i}</button>`;
  }

  document.getElementById("calendarDays").innerHTML = html;
}

async function loadMonthAvailability() {
  const requestId = ++activeMonthAvailabilityRequest;
  const visibleYear = currentDate.getFullYear();
  const visibleMonth = currentDate.getMonth();

  function computeFullyBookedDateSet(appointments) {
    const countsByDate = new Map();

    appointments.forEach((appointment) => {
      const dateKey = appointment.date || appointment.appointment_date;
      const timeKey = normalizeTimeSlotValue(
        appointment.time || appointment.appointment_time,
      );

      if (!dateKey || !timeKey) return;

      const appointmentDate = parseDateFromAPI(dateKey);
      if (
        appointmentDate.getFullYear() !== visibleYear ||
        appointmentDate.getMonth() !== visibleMonth
      ) {
        return;
      }

      const times = countsByDate.get(dateKey) || new Set();
      if (allTimeSlots.includes(timeKey)) {
        times.add(timeKey);
      }
      countsByDate.set(dateKey, times);
    });

    return new Set(
      Array.from(countsByDate.entries())
        .filter(([, times]) => times.size >= allTimeSlots.length)
        .map(([dateKey]) => dateKey),
    );
  }

  try {
    const response = await fetch(`${API_URL}/appointments`);
    const appointments = await response.json();

    if (requestId !== activeMonthAvailabilityRequest) return;

    fullyBookedDates = computeFullyBookedDateSet(appointments);
    renderCalendar();
  } catch (error) {
    const appointments = JSON.parse(localStorage.getItem("appointments") || "[]");

    if (requestId !== activeMonthAvailabilityRequest) return;

    fullyBookedDates = computeFullyBookedDateSet(appointments);
    renderCalendar();
  }
}

function changeMonth(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendar();
  loadMonthAvailability();
}

function formatDateForAPI(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateFromAPI(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateDisplay(date) {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function scrollToBookingStep(step) {
  if (window.innerWidth > 1024) return;

  const target = document.querySelector(`[data-booking-step="${step}"]`);
  if (!target) return;

  window.setTimeout(() => {
    const headerOffset = 110;
    const targetY =
      target.getBoundingClientRect().top + window.scrollY - headerOffset;

    window.scrollTo({
      top: targetY,
      behavior: "smooth",
    });
  }, 120);
}

async function selectDate(dateStr) {
  if (fullyBookedDates.has(dateStr)) {
    return;
  }

  const requestId = ++activeBookingRequest;
  selectedDate = parseDateFromAPI(dateStr);
  selectedTime = null;
  bookedTimes = [];

  renderCalendar();
  updateSummary();
  updateBookButton();

  const container = document.getElementById("timeSlots");
  container.innerHTML =
    '<p class="select-prompt">Chargement des horaires...</p>';

  try {
    const response = await fetch(`${API_URL}/booked-times/${dateStr}`);
    const nextBookedTimes = await response.json();

    if (requestId !== activeBookingRequest) return;

    bookedTimes = nextBookedTimes.map(normalizeTimeSlotValue);
    renderTimeSlots();
    scrollToBookingStep("time");
  } catch (error) {
    console.log("Server not available, using local storage");

    if (requestId !== activeBookingRequest) return;

    bookedTimes = JSON.parse(localStorage.getItem(`booked_${dateStr}`) || "[]").map(
      normalizeTimeSlotValue,
    );
    renderTimeSlots();
    scrollToBookingStep("time");
  }
}

// =====================================================
// TIME SLOTS
// =====================================================
function renderTimeSlots() {
  const container = document.getElementById("timeSlots");

  if (!selectedDate) {
    container.innerHTML =
      "<p class=\"select-prompt\">Veuillez d'abord s&eacute;lectionner une date</p>";
    return;
  }

  let html = "";

  allTimeSlots.forEach((time) => {
    const displayTime = formatTimeDisplay(time);
    const isBooked = bookedTimes.includes(time);
    const isSelected = selectedTime === time;

    let classes = "time-slot";
    if (isBooked) classes += " unavailable";
    if (isSelected) classes += " selected";

    const onclick = !isBooked ? `onclick="selectTime('${time}')"` : "";

    html += `<button type="button" class="${classes}" ${onclick}>${displayTime}</button>`;
  });

  container.innerHTML = html;
}

function formatTimeDisplay(time) {
  const [hours, minutes] = time.split(":");
  return `${hours}h${minutes === "00" ? "" : minutes}`;
}

function selectTime(time) {
  if (bookedTimes.includes(time)) {
    return;
  }

  selectedTime = time;
  renderTimeSlots();
  updateSummary();
  updateBookButton();
  scrollToBookingStep("form");

  const selectedSlot = document.querySelector(".time-slot.selected");
  if (selectedSlot) {
    selectedSlot.blur();
  }
}

// =====================================================
// BOOKING SUMMARY & FORM
// =====================================================
function updateSummary() {
  const dateEl = document.getElementById("summaryDate");
  const timeEl = document.getElementById("summaryTime");

  dateEl.textContent = selectedDate ? formatDateDisplay(selectedDate) : "-";
  timeEl.textContent = selectedTime ? formatTimeDisplay(selectedTime) : "-";
}

function updateBookButton() {
  const btn = document.getElementById("bookBtn");
  btn.disabled = !selectedDate || !selectedTime;
}

function setBookButtonLoading(isLoading) {
  const btn = document.getElementById("bookBtn");

  if (!btn) return;

  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Confirmation...";
  } else {
    btn.textContent = btn.dataset.originalText || "Confirmer le rendez-vous";
    updateBookButton();
  }
}

function initBookingForm() {
  const form = document.getElementById("bookingForm");
  const nameInput = document.getElementById("name");
  const phoneInput = document.getElementById("phone");
  const formError = document.getElementById("bookingFormError");

  ["name", "phone"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateBookButton);
  });

  nameInput.addEventListener("input", () => {
    sanitizeNameInput(nameInput);
    nameInput.setCustomValidity("");
    formError.hidden = true;
    formError.textContent = "";
  });

  phoneInput.addEventListener("input", () => {
    sanitizePhoneInput(phoneInput);
    phoneInput.setCustomValidity("");
    formError.hidden = true;
    formError.textContent = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const missingFields = [];

    if (!nameInput.value.trim()) {
      nameInput.setCustomValidity("Veuillez remplir votre nom complet.");
      missingFields.push(nameInput);
    } else if (!isNameValueValid(nameInput.value)) {
      nameInput.setCustomValidity(
        "Veuillez entrer uniquement des lettres pour le nom complet.",
      );
      missingFields.push(nameInput);
    }

    if (!phoneInput.value.trim()) {
      phoneInput.setCustomValidity(
        "Veuillez remplir votre numero de telephone.",
      );
      missingFields.push(phoneInput);
    } else if (!isPhoneValueValid(phoneInput.value)) {
      phoneInput.setCustomValidity(
        "Veuillez entrer uniquement des chiffres pour le numero de telephone.",
      );
      missingFields.push(phoneInput);
    }

    if (missingFields.length > 0) {
      formError.textContent = missingFields
        .map((field) => field.validationMessage)
        .join(" ");
      formError.hidden = false;
      missingFields[0].reportValidity();
      return;
    }

    formError.hidden = true;
    formError.textContent = "";

    await bookAppointment();
  });
}

function setBookingFormError(message) {
  const formError = document.getElementById("bookingFormError");
  if (!formError) return;

  formError.textContent = message;
  formError.hidden = !message;
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

// =====================================================
// BOOK APPOINTMENT
// =====================================================
async function bookAppointment() {
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const notes = document.getElementById("notes").value.trim();

  const appointmentData = {
    name,
    phone,
    date: formatDateForAPI(selectedDate),
    time: selectedTime,
    notes,
  };

  setBookButtonLoading(true);

  try {
    const response = await fetch(`${API_URL}/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(appointmentData),
    });

    const result = await response.json();

    if (result.success) {
      setBookingFormError("");
      bookedTimes = [...new Set([...bookedTimes, selectedTime])];
      if (bookedTimes.length >= allTimeSlots.length) {
        fullyBookedDates.add(appointmentData.date);
      }
      showConfirmation(name);
    } else {
      setBookButtonLoading(false);

      if (
        (result.error || "").toLowerCase().includes("creneau") ||
        (result.error || "").toLowerCase().includes("réservé") ||
        (result.error || "").toLowerCase().includes("reserve")
      ) {
        setBookingFormError("");
        activeBookingRequest++;
        bookedTimes = [];
        selectedTime = null;
        updateSummary();
        updateBookButton();
        renderTimeSlots();
        await loadMonthAvailability();
        await selectDate(appointmentData.date);
        return;
      }

      setBookingFormError(
        result.error || "Erreur lors de la reservation. Veuillez reessayer.",
      );
    }
  } catch (error) {
    console.log("Server not available, saving locally");

    const appointments = JSON.parse(
      localStorage.getItem("appointments") || "[]",
    );
    const newAppointment = {
      id: Date.now(),
      ...appointmentData,
      status: "confirmed",
      created_at: new Date().toISOString(),
    };
    appointments.push(newAppointment);
    localStorage.setItem("appointments", JSON.stringify(appointments));

    const dateKey = `booked_${appointmentData.date}`;
    const booked = JSON.parse(localStorage.getItem(dateKey) || "[]");
    if (!booked.includes(appointmentData.time)) {
      booked.push(appointmentData.time);
    }
    localStorage.setItem(dateKey, JSON.stringify(booked));
    bookedTimes = [...booked];
    if (bookedTimes.length >= allTimeSlots.length) {
      fullyBookedDates.add(appointmentData.date);
    }

    showConfirmation(name);
  }
}

// =====================================================
// MODAL
// =====================================================
function showConfirmation(name) {
  const modal = document.getElementById("successModal");
  const text = document.getElementById("confirmationText");

  const dateStr = formatDateDisplay(selectedDate);
  const timeStr = formatTimeDisplay(selectedTime);

  text.innerHTML = `
        <strong>${name}</strong>, votre demande de rendez-vous est en attente.<br><br>
        <strong>Date:</strong> ${dateStr}<br>
        <strong>Heure:</strong> ${timeStr}<br><br>
        Notre &eacute;quipe confirmera ou modifiera ce cr&eacute;neau rapidement.
    `;

  modal.classList.add("active");
}

function closeModal() {
  const modal = document.getElementById("successModal");
  modal.classList.remove("active");

  activeBookingRequest++;
  selectedDate = null;
  selectedTime = null;
  bookedTimes = [];
  document.getElementById("bookingForm").reset();
  renderCalendar();
  loadMonthAvailability();
  renderTimeSlots();
  updateSummary();
  setBookButtonLoading(false);
  updateBookButton();
}

// =====================================================
// EXPOSE FUNCTIONS TO WINDOW
// =====================================================
window.changeMonth = changeMonth;
window.selectDate = selectDate;
window.selectTime = selectTime;
window.closeModal = closeModal;
