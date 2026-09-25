const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET not set — using an insecure default. Set JWT_SECRET in production.");
}

const ADMIN_PHONES = (process.env.ADMIN_PHONES || "+91 98765 43210")
  .split(",")
  .map((p) => normalizePhone(p))
  .filter(Boolean);

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const otpStore = new Map(); // key: `${role}:${normalizedPhone}` -> { code, expiresAt, attempts }

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function isAdminPhone(phone) {
  return ADMIN_PHONES.includes(normalizePhone(phone));
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function requestOtp(role, phone) {
  const key = `${role}:${normalizePhone(phone)}`;
  const code = generateOtp();
  otpStore.set(key, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return code;
}

function verifyOtp(role, phone, code) {
  const key = `${role}:${normalizePhone(phone)}`;
  const entry = otpStore.get(key);
  if (!entry) return { ok: false, error: "No OTP requested for this number. Request a new code." };
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { ok: false, error: "OTP expired. Request a new code." };
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { ok: false, error: "Too many incorrect attempts. Request a new code." };
  }
  if (entry.code !== String(code || "").trim()) {
    entry.attempts += 1;
    return { ok: false, error: "Incorrect code." };
  }
  otpStore.delete(key);
  return { ok: true };
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Installed by access.js: for admin-role tokens, checks the account is still
// active and that its role permits this route (see access.guard).
let adminGuard = null;
function setAdminGuard(fn) {
  adminGuard = fn;
}

function requireAuth(...allowedRoles) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token && verifyToken(token);
    if (!payload) return res.status(401).json({ error: "Not authenticated" });
    if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
      return res.status(403).json({ error: "Not authorized for this action" });
    }
    req.user = payload;
    if (payload.role === "admin" && adminGuard) {
      const denied = adminGuard(req, payload);
      if (denied) return res.status(denied.status).json({ error: denied.error });
    }
    next();
  };
}

module.exports = {
  normalizePhone,
  isAdminPhone,
  adminPhones: () => [...ADMIN_PHONES],
  setAdminGuard,
  requestOtp,
  verifyOtp,
  signToken,
  verifyToken,
  requireAuth,
};
