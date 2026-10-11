// Same checks as server/src/taxIds.js, for instant feedback while typing
// (the server checks again on save). Format and GST check digit only — not a
// government lookup.
const STATES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

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
export function checkGstin(raw) {
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
export function checkUdyam(raw) {
  const compact = String(raw || "").replace(/[\s-]/g, "").toUpperCase();
  if (!compact) return { ok: true, value: "" };
  const m = compact.match(UDYAM_RE);
  if (!m) return { ok: false, value: String(raw).trim().toUpperCase(), error: "That isn't a Udyam number — it looks like UDYAM-PB-03-0012345" };
  return { ok: true, value: `UDYAM-${m[1]}-${m[2]}-${m[3]}`, stateCode: m[1] };
}
