// Offline checks for a provider's GST number (GSTIN) and Udyam registration
// number. This catches typos and made-up numbers; it does NOT confirm the
// number exists or is active — that needs a government-data lookup through a
// verification provider (the GST and Udyam portals have no public API).
const { STATES } = require("./accounting");

const fail = (message) => Object.assign(new Error(message), { status: 400 });
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ---- GSTIN: 2-digit state code, 10-character PAN (or other ID for special
// registrations), entity number, a letter (Z for normal taxpayers), and a
// check character computed from the first 14 (GSTN's mod-36 scheme).
const normGstin = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();
const GSTIN_SHAPE = /^\d{2}[0-9A-Z]{10}[1-9A-Z][0-9A-Z][0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

// -> { ok, value, error, stateCode, stateName, pan }
function checkGstin(raw) {
  const value = normGstin(raw);
  if (!value) return { ok: true, value: "" };
  if (value.length !== 15) return { ok: false, value, error: `A GST number has 15 characters — this has ${value.length}` };
  if (!GSTIN_SHAPE.test(value)) return { ok: false, value, error: "That isn't a GST number — it looks like 01ABCDE1234F1Z5" };
  const stateCode = value.slice(0, 2);
  if (!STATES[stateCode] && stateCode !== "99") return { ok: false, value, error: `"${stateCode}" isn't a GST state code` };
  if (gstinCheckChar(value) !== value[14]) return { ok: false, value, error: "That GST number has a typo — its last character doesn't match the rest" };
  const pan = value.slice(2, 12);
  return { ok: true, value, stateCode, stateName: STATES[stateCode] || "Centre", pan: PAN_RE.test(pan) ? pan : null };
}

// ---- Udyam: UDYAM-XX-00-0000000 (2-letter state, 2-digit district, 7 digits).
// Spaces, missing hyphens and lowercase are tidied up.
const UDYAM_RE = /^UDYAM([A-Z]{2})(\d{2})(\d{7})$/;
function checkUdyam(raw) {
  const compact = String(raw || "").replace(/[\s-]/g, "").toUpperCase();
  if (!compact) return { ok: true, value: "" };
  const m = compact.match(UDYAM_RE);
  if (!m) return { ok: false, value: String(raw).trim().toUpperCase(), error: "That isn't a Udyam number — it looks like UDYAM-PB-03-0012345" };
  return { ok: true, value: `UDYAM-${m[1]}-${m[2]}-${m[3]}`, stateCode: m[1] };
}

// Tidies gstNumber / udyamNumber in a profile patch (in place) or throws a 400.
function cleanTaxIds(patch) {
  if (!patch) return patch;
  if (patch.gstNumber !== undefined && patch.gstNumber !== null) {
    const g = checkGstin(patch.gstNumber);
    if (!g.ok) throw fail(g.error);
    patch.gstNumber = g.value;
  }
  if (patch.udyamNumber !== undefined && patch.udyamNumber !== null) {
    const u = checkUdyam(patch.udyamNumber);
    if (!u.ok) throw fail(u.error);
    patch.udyamNumber = u.value;
  }
  return patch;
}

// What Admin shows next to each number (also flags numbers saved before these checks).
function taxIdStatus(provider) {
  const out = {};
  if (provider?.gstNumber) {
    const g = checkGstin(provider.gstNumber);
    out.gst = g.ok ? { valid: true, stateName: g.stateName, pan: g.pan } : { valid: false, error: g.error };
  }
  if (provider?.udyamNumber) {
    const u = checkUdyam(provider.udyamNumber);
    out.udyam = u.ok ? { valid: true } : { valid: false, error: u.error };
  }
  return out;
}

module.exports = { checkGstin, checkUdyam, cleanTaxIds, taxIdStatus, gstinCheckChar };
