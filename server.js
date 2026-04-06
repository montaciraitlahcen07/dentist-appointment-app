const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const { parse: parseConnectionString } = require("pg-connection-string");
const path = require("path");
const crypto = require("crypto");

dotenv.config();

const app = express();
app.disable("x-powered-by");
const PORT = Number(process.env.PORT) || 3000;

function readEnv(name, fallback = "") {
  return (process.env[name] || fallback).trim().replace(/^"(.*)"$/, "$1");
}

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function ensureIdentifier(value, label) {
  if (!IDENTIFIER_REGEX.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

const DATABASE_URL = readEnv("DATABASE_URL");
const DB_NAME = readEnv("DB_NAME", "dentacare");
const OWNER_USERNAME = readEnv("OWNER_USERNAME", "owner");
const OWNER_PASSWORD = readEnv("OWNER_PASSWORD", "change-me");
const OWNER_PASSWORD_HASH = readEnv("OWNER_PASSWORD_HASH");
const SESSION_SECRET = readEnv("SESSION_SECRET", OWNER_PASSWORD || "change-me-session-secret");
const SESSION_COOKIE = "dashboard_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const LOGIN_WINDOW_MS = 1000 * 60 * 10;
const MAX_LOGIN_ATTEMPTS = 5;
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

function buildStatusInClause(startIndex = 1) {
  return ACTIVE_BOOKING_STATUSES.map(
    (_value, idx) => `$${startIndex + idx}`,
  ).join(", ");
}

const SAFE_DB_NAME = DATABASE_URL
  ? null
  : ensureIdentifier(DB_NAME, "database name");
const PARSED_DATABASE_URL = DATABASE_URL ? parseConnectionString(DATABASE_URL) : null;
const RESOLVED_DB_NAME = PARSED_DATABASE_URL?.database || DB_NAME;
const ALLOW_SELF_SIGNED_DB_CERT =
  readEnv("DB_SSL_REJECT_UNAUTHORIZED", "true").toLowerCase() === "false";
const DB_SSL_ENABLED = DATABASE_URL
  ? readEnv("DB_SSL", "true").toLowerCase() === "true"
  : readEnv("DB_SSL", "false").toLowerCase() === "true";
const CORS_ORIGINS = readEnv("CORS_ORIGINS")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const dbConfig = {
  max: Number(readEnv("DB_MAX_CONNECTIONS", "10")),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: DB_SSL_ENABLED
    ? { rejectUnauthorized: !ALLOW_SELF_SIGNED_DB_CERT }
    : undefined,
  ...(DATABASE_URL
    ? { connectionString: DATABASE_URL }
    : {
        host: readEnv("DB_HOST", "localhost"),
        port: Number(readEnv("DB_PORT", "5432")),
        user: readEnv("DB_USER", "postgres"),
        password: readEnv("DB_PASSWORD"),
      }),
};

let pool;
let initializationPromise;
const loginAttempts = new Map();

async function initializeDatabase() {
  if (pool) {
    return pool;
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      const nextPool = new Pool(
        DATABASE_URL
          ? dbConfig
          : {
              ...dbConfig,
              database: SAFE_DB_NAME,
            },
      );

      await nextPool.query(`
        CREATE TABLE IF NOT EXISTS appointments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(50) NOT NULL,
          appointment_date DATE NOT NULL,
          appointment_time VARCHAR(20) NOT NULL,
          notes TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await nextPool.query(
        `CREATE INDEX IF NOT EXISTS idx_appointment_date ON appointments (appointment_date)`,
      );
      await nextPool.query(
        `CREATE INDEX IF NOT EXISTS idx_status ON appointments (status)`,
      );
      await nextPool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_slot
         ON appointments (appointment_date, appointment_time)`,
      );

      const { rows: deprecatedColumns } = await nextPool.query(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'appointments'
          AND column_name IN ('email', 'service')
      `,
      );

      for (const column of deprecatedColumns) {
        await nextPool.query(
          `ALTER TABLE appointments DROP COLUMN IF EXISTS ${column.column_name}`,
        );
      }

      pool = nextPool;
      return pool;
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

function getPool() {
  if (!pool) {
    throw new Error("Database pool has not been initialized.");
  }

  return pool;
}

function buildCorsOptions() {
  if (CORS_ORIGINS.length === 0) {
    return { origin: true, credentials: true };
  }

  return {
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  };
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAppointment(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    appointment_date:
      row.appointment_date instanceof Date
        ? formatDateValue(row.appointment_date)
        : row.appointment_date,
    appointment_time: row.appointment_time,
    notes: row.notes,
    status: row.status,
    created_at: row.created_at,
  };
}

function normalizeTimeValue(value = "") {
  const trimmed = String(value).trim();
  const twelveHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (twelveHourMatch) {
    const hours = Number(twelveHourMatch[1]);
    const minutes = twelveHourMatch[2];
    const meridiem = twelveHourMatch[3].toUpperCase();
    return `${hours}:${minutes} ${meridiem}`;
  }

  const twentyFourHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHourMatch) return trimmed;

  let hours = Number(twentyFourHourMatch[1]);
  const minutes = twentyFourHourMatch[2];
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${hours}:${minutes} ${meridiem}`;
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) return cookies;
      const key = part.slice(0, separatorIndex);
      const value = part.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function createSession(username) {
  const payload = {
    username,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function readSessionToken(token) {
  const [encodedPayload, providedSignature] = String(token || "").split(".");
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");

  if (!secretsMatch(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!payload?.username || !payload?.expiresAt) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];

  if (!token) return null;

  const session = readSessionToken(token);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    return null;
  }

  return {
    token,
    username: session.username,
    expiresAt: session.expiresAt,
    refreshedToken: createSession(session.username),
  };
}

function setSessionCookie(res, token) {
  const cookieParts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];

  if (process.env.NODE_ENV === "production") {
    cookieParts.push("Secure");
  }

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

function cleanupExpiredLoginAttempts() {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts.entries()) {
    if (attempt.resetAt <= now) {
      loginAttempts.delete(key);
    }
  }
}

function getRequestIdentifier(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function createComparableSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest();
}

function secretsMatch(left, right) {
  const leftHash = createComparableSecret(left);
  const rightHash = createComparableSecret(right);
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function verifyOwnerPassword(candidate) {
  if (OWNER_PASSWORD_HASH) {
    const [algorithm, salt, storedKey] = OWNER_PASSWORD_HASH.split(":");
    if (algorithm !== "scrypt" || !salt || !storedKey) return false;

    const derivedKey = crypto
      .scryptSync(candidate, salt, 64)
      .toString("hex");

    return secretsMatch(derivedKey, storedKey);
  }

  return secretsMatch(candidate, OWNER_PASSWORD);
}

function registerFailedLoginAttempt(identifier) {
  cleanupExpiredLoginAttempts();
  const current = loginAttempts.get(identifier);

  if (!current || current.resetAt <= Date.now()) {
    loginAttempts.set(identifier, {
      count: 1,
      resetAt: Date.now() + LOGIN_WINDOW_MS,
    });
    return;
  }

  current.count += 1;
}

function clearFailedLoginAttempts(identifier) {
  loginAttempts.delete(identifier);
}

function isLoginRateLimited(identifier) {
  cleanupExpiredLoginAttempts();
  const attempt = loginAttempts.get(identifier);
  return Boolean(attempt && attempt.count >= MAX_LOGIN_ATTEMPTS);
}

function withNoStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

function requireAdmin(req, res, next) {
  const session = getSessionFromRequest(req);

  if (!session) {
    return res.status(401).json({ error: "Authentification requise." });
  }

  req.adminSession = session;
  setSessionCookie(res, session.refreshedToken);
  next();
}

function isValidStatus(status) {
  return new Set(["pending", "confirmed", "completed", "cancelled"]).has(
    status,
  );
}

function isValidName(value) {
  return /^[\p{L} '-]+$/u.test(String(value).trim());
}

function isValidPhone(value) {
  return /^[0-9 +]+$/.test(String(value).trim());
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", async (_req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error("Failed to initialize PostgreSQL:", error);
    res.status(500).json({ error: "Impossible de se connecter a la base de donnees." });
  }
});

app.get("/api/admin/session", (req, res) => {
  const session = getSessionFromRequest(req);

  if (!session) {
    return withNoStore(res).status(401).json({ authenticated: false });
  }

  setSessionCookie(res, session.refreshedToken);
  withNoStore(res).json({
    authenticated: true,
    username: session.username,
  });
});

app.post("/api/admin/login", (req, res) => {
  const identifier = getRequestIdentifier(req);
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (isLoginRateLimited(identifier)) {
    return withNoStore(res)
      .status(429)
      .json({ error: "Trop de tentatives. Reessayez plus tard." });
  }

  if (!secretsMatch(username, OWNER_USERNAME) || !verifyOwnerPassword(password)) {
    registerFailedLoginAttempt(identifier);
    return withNoStore(res)
      .status(401)
      .json({ error: "Identifiants invalides." });
  }

  clearFailedLoginAttempts(identifier);
  const token = createSession(username);
  setSessionCookie(res, token);
  withNoStore(res).json({ success: true, username });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  clearSessionCookie(res);
  withNoStore(res).json({ success: true });
});

app.get("/api/appointments", async (_req, res) => {
  try {
    const statusClause = buildStatusInClause();
    const { rows } = await getPool().query(
      `SELECT appointment_date, appointment_time, status
       FROM appointments
       WHERE status IN (${statusClause})
       ORDER BY appointment_date ASC, appointment_time ASC`,
      ACTIVE_BOOKING_STATUSES,
    );

    res.json(
      rows.map((row) => ({
        appointment_date:
          row.appointment_date instanceof Date
            ? formatDateValue(row.appointment_date)
            : row.appointment_date,
        appointment_time: row.appointment_time,
        status: row.status,
      })),
    );
  } catch (error) {
    console.error("Failed to fetch public appointments:", error);
    res.status(500).json({ error: "Impossible de charger les disponibilités." });
  }
});

app.get("/api/admin/appointments", requireAdmin, async (_req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, phone, appointment_date, appointment_time, notes, status, created_at
       FROM appointments
       ORDER BY appointment_date ASC, appointment_time ASC`,
    );

    res.json(rows.map(normalizeAppointment));
  } catch (error) {
    console.error("Failed to fetch appointments:", error);
    res.status(500).json({ error: "Impossible de charger les rendez-vous." });
  }
});

app.get("/api/admin/appointments/date/:date", requireAdmin, async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, name, phone, appointment_date, appointment_time, notes, status, created_at
       FROM appointments
       WHERE appointment_date = $1
       ORDER BY appointment_time ASC`,
      [req.params.date],
    );

    res.json(rows.map(normalizeAppointment));
  } catch (error) {
    console.error("Failed to fetch appointments by date:", error);
    res
      .status(500)
      .json({ error: "Impossible de charger les rendez-vous de cette date." });
  }
});

app.get("/api/booked-times/:date", async (req, res) => {
  try {
    const statusClause = buildStatusInClause(2);
    const queryParams = [req.params.date, ...ACTIVE_BOOKING_STATUSES];
    const { rows } = await getPool().query(
      `SELECT appointment_time
       FROM appointments
       WHERE appointment_date = $1
         AND status IN (${statusClause})
       ORDER BY appointment_time ASC`,
      queryParams,
    );

    res.json(rows.map((row) => row.appointment_time));
  } catch (error) {
    console.error("Failed to fetch booked times:", error);
    res.status(500).json({ error: "Impossible de charger les horaires." });
  }
});

app.post("/api/appointments", async (req, res) => {
  const { name, phone, date, time, notes } = req.body;
  const normalizedTime = normalizeTimeValue(time);
  const normalizedName = String(name || "").trim();
  const normalizedPhone = String(phone || "").trim();

  if (!normalizedName || !normalizedPhone || !date || !normalizedTime) {
    return res.status(400).json({
      error: "Les champs nom, téléphone, date et heure sont obligatoires.",
    });
  }

  if (!isValidName(normalizedName)) {
    return res.status(400).json({
      error: "Le nom complet doit contenir uniquement des lettres.",
    });
  }

  if (!isValidPhone(normalizedPhone)) {
    return res.status(400).json({
      error: "Le numero de telephone doit contenir uniquement des chiffres.",
    });
  }

  try {
    const statusClause = buildStatusInClause(3);
    const { rows: existingRows } = await getPool().query(
      `SELECT id
       FROM appointments
       WHERE appointment_date = $1 AND appointment_time = $2
         AND status IN (${statusClause})
       LIMIT 1`,
      [date, normalizedTime, ...ACTIVE_BOOKING_STATUSES],
    );

    if (existingRows.length > 0) {
      return res.status(400).json({ error: "Ce créneau est déjà réservé." });
    }

    const insertResult = await getPool().query(
      `INSERT INTO appointments (
         name,
         phone,
         appointment_date,
         appointment_time,
         notes,
         status
       ) VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [normalizedName, normalizedPhone, date, normalizedTime, notes?.trim() || null],
    );

    res.status(201).json({
      success: true,
      id: insertResult.rows[0]?.id,
    });
  } catch (error) {
    console.error("Failed to create appointment:", error);
    res.status(500).json({ error: "Impossible d'enregistrer le rendez-vous." });
  }
});

app.post("/api/admin/appointments", requireAdmin, async (req, res) => {
  const { name, phone, date, time, notes, status } = req.body;
  const normalizedTime = normalizeTimeValue(time);
  const normalizedStatus = String(status || "confirmed").trim().toLowerCase();
  const normalizedName = String(name || "").trim();
  const normalizedPhone = String(phone || "").trim();

  if (!normalizedName || !normalizedPhone || !date || !normalizedTime) {
    return res.status(400).json({
      error: "Les champs nom, téléphone, date et heure sont obligatoires.",
    });
  }

  if (!isValidName(normalizedName)) {
    return res.status(400).json({
      error: "Le nom complet doit contenir uniquement des lettres.",
    });
  }

  if (!isValidPhone(normalizedPhone)) {
    return res.status(400).json({
      error: "Le numero de telephone doit contenir uniquement des chiffres.",
    });
  }

  if (!isValidStatus(normalizedStatus)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  try {
    const statusClause = buildStatusInClause(3);
    const { rows: existingRows } = await getPool().query(
      `SELECT id
       FROM appointments
       WHERE appointment_date = $1 AND appointment_time = $2
         AND status IN (${statusClause})
       LIMIT 1`,
      [date, normalizedTime, ...ACTIVE_BOOKING_STATUSES],
    );

    if (existingRows.length > 0) {
      return res.status(400).json({ error: "Ce créneau est déjà réservé." });
    }

    const insertResult = await getPool().query(
      `INSERT INTO appointments (
         name,
         phone,
         appointment_date,
         appointment_time,
         notes,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, phone, appointment_date, appointment_time, notes, status, created_at`,
      [
        normalizedName,
        normalizedPhone,
        date,
        normalizedTime,
        notes?.trim() || null,
        normalizedStatus,
      ],
    );

    const [insertedAppointment] = insertResult.rows;

    res.status(201).json({
      success: true,
      appointment: normalizeAppointment(insertedAppointment),
    });
  } catch (error) {
    console.error("Failed to create admin appointment:", error);
    res.status(500).json({ error: "Impossible d'ajouter le rendez-vous." });
  }
});

app.patch("/api/admin/appointments/:id/status", requireAdmin, async (req, res) => {
  const normalizedStatus = String(req.body.status || "").trim().toLowerCase();

  if (!isValidStatus(normalizedStatus)) {
    return res.status(400).json({ error: "Statut invalide." });
  }

  try {
    const result = await getPool().query(
      "UPDATE appointments SET status = $1 WHERE id = $2",
      [normalizedStatus, req.params.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Rendez-vous introuvable." });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to update appointment status:", error);
    res.status(500).json({ error: "Impossible de mettre à jour le statut." });
  }
});

app.delete("/api/admin/appointments/:id", requireAdmin, async (req, res) => {
  try {
    const result = await getPool().query("DELETE FROM appointments WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Rendez-vous introuvable." });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete appointment:", error);
    res.status(500).json({ error: "Impossible de supprimer le rendez-vous." });
  }
});

app.get("/dashboard", (_req, res) => {
  withNoStore(res).sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`DentaCare server running on http://localhost:${PORT}`);
        console.log(`PostgreSQL database: ${RESOLVED_DB_NAME}`);
      });
    })
    .catch((error) => {
      console.error("Failed to initialize PostgreSQL:", error);
      process.exit(1);
    });
}

module.exports = { app, initializeDatabase };
