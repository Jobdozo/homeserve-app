// Business rules: the settings the Super Admin can change without a release.
// This module is pure (no store access) — it defines each new setting's
// default and validates changes; store.js merges the defaults into the
// platform settings and applies validate() in updateSettings.

const BOOKING_STATUSES = ["Pending", "Accepted", "In Progress", "Completed", "Rejected", "Cancelled"];
const SERVICE_CHANGE_FIELDS = ["name", "tagline", "price", "originalPrice", "distanceLabel"];
const VISIBILITY_RULE_KEYS = ["pincode", "wallet", "approval", "verification", "requestsSwitch", "openLimit", "stale"];

const DEFAULT_SWAP_REASONS = [
  { key: "unavailable", label: "I'm no longer available at that time" },
  { key: "emergency", label: "Personal emergency" },
  { key: "location", label: "I can't reach the customer's location" },
  { key: "tools", label: "I don't have the required tools or parts" },
  { key: "other", label: "Other" },
];
const DEFAULT_COMPLAINT_CATEGORIES = ["Service quality", "Provider behaviour", "No-show / delay", "Payment or refund", "Safety", "Damage or loss", "App / booking issue", "Other"];
const DEFAULT_COMPLAINT_OUTCOMES = ["Refund issued", "Provider warned", "Provider suspended", "Redo / re-service", "Explained to customer", "No action needed", "Other"];

const DEFAULTS = {
  // requests
  ringTimeoutSeconds: 90,
  // visibility & coverage
  visibilityRules: Object.fromEntries(VISIBILITY_RULE_KEYS.map((k) => [k, true])),
  pinRequireCoverage: false,
  pinMaxPerProvider: 100,
  visibilityOverrideDefaultHours: 0,
  // advertising
  adsEnabled: true,
  adsMaxActivePerProvider: 0,
  adsMinBalance: 0,
  // order swap
  swapEnabled: true,
  swapMaxPerOrder: 3,
  swapReasons: DEFAULT_SWAP_REASONS,
  // service approval
  serviceApprovalRequired: true,
  serviceChangeApprovalRequired: true,
  serviceChangeFields: SERVICE_CHANGE_FIELDS,
  // customer <-> provider communication
  commsChatEnabled: true,
  commsCallEnabled: true,
  commsChatStatuses: ["Pending", "Accepted", "In Progress", "Rejected", "Cancelled"],
  commsCallStatuses: ["Accepted", "In Progress"],
  commsAfterCompletionHours: 0,
  // provider staff
  providerStaffEnabled: true,
  providerStaffMax: 25,
  providerStaffRoleTemplates: null, // null = built-in defaults
  // complaints
  complaintCategories: DEFAULT_COMPLAINT_CATEGORIES,
  complaintOutcomes: DEFAULT_COMPLAINT_OUTCOMES,
};

const fail = (message) => Object.assign(new Error(message), { status: 400 });
const bool = (v) => Boolean(v);
function int(v, min, max, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) throw fail(`${label} must be a whole number from ${min} to ${max}`);
  return n;
}
function subset(v, allowed, label) {
  const list = [...new Set((Array.isArray(v) ? v : []).map(String))];
  const bad = list.find((x) => !allowed.includes(x));
  if (bad) throw fail(`${label}: "${bad}" isn't allowed`);
  return list;
}
function textList(v, label, { min = 1, max = 30, maxLen = 60 } = {}) {
  const list = [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))];
  if (list.length < min) throw fail(`${label} needs at least ${min} item${min === 1 ? "" : "s"}`);
  if (list.length > max) throw fail(`${label} can have at most ${max} items`);
  if (list.some((x) => x.length > maxLen)) throw fail(`${label}: each item can be up to ${maxLen} characters`);
  return list;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);

// Each validator returns the cleaned value, or throws a 400.
const VALIDATORS = {
  ringTimeoutSeconds: (v) => int(v, 15, 600, "Request ring time (seconds)"),
  visibilityRules: (v, current) => {
    const out = { ...(current || DEFAULTS.visibilityRules) };
    for (const k of VISIBILITY_RULE_KEYS) if (v && v[k] !== undefined) out[k] = bool(v[k]);
    return out;
  },
  pinRequireCoverage: bool,
  pinMaxPerProvider: (v) => int(v, 1, 500, "Maximum PIN codes per provider"),
  visibilityOverrideDefaultHours: (v) => int(v, 0, 8760, "Default override length (hours)"),
  adsEnabled: bool,
  adsMaxActivePerProvider: (v) => int(v, 0, 100, "Maximum active ads per provider"),
  adsMinBalance: (v) => int(v, 0, 1000000, "Minimum wallet balance to start an ad"),
  swapEnabled: bool,
  swapMaxPerOrder: (v) => int(v, 1, 10, "Maximum swaps per order"),
  swapReasons: (v) => {
    if (!Array.isArray(v)) throw fail("Swap reasons must be a list");
    const seen = new Set();
    const out = [];
    for (const r of v) {
      const label = String(r?.label || "").trim();
      if (!label) continue;
      if (label.length > 80) throw fail("Each swap reason can be up to 80 characters");
      let key = r.key === "other" || /^other$/i.test(label) ? "other" : slug(r.key || label) || `reason_${out.length + 1}`;
      while (seen.has(key)) key = `${key}_2`;
      seen.add(key);
      out.push({ key, label });
    }
    if (out.length > 12) throw fail("Up to 12 swap reasons");
    if (out.filter((r) => r.key !== "other").length < 1) throw fail("Add at least one swap reason");
    // "Other" (free-text) is always available last.
    if (!seen.has("other")) out.push({ key: "other", label: "Other" });
    return [...out.filter((r) => r.key !== "other"), out.find((r) => r.key === "other")];
  },
  serviceApprovalRequired: bool,
  serviceChangeApprovalRequired: bool,
  serviceChangeFields: (v) => subset(v, SERVICE_CHANGE_FIELDS, "Fields needing approval"),
  commsChatEnabled: bool,
  commsCallEnabled: bool,
  commsChatStatuses: (v) => subset(v, BOOKING_STATUSES, "Chat statuses"),
  commsCallStatuses: (v) => subset(v, BOOKING_STATUSES, "Call statuses"),
  commsAfterCompletionHours: (v) => int(v, 0, 720, "Chat/call window after completion (hours)"),
  providerStaffEnabled: bool,
  providerStaffMax: (v) => int(v, 1, 500, "Maximum staff per provider"),
  providerStaffRoleTemplates: (v) => v, // validated against the permission catalogue in the route
  complaintCategories: (v) => textList(v, "Complaint categories", { min: 1, max: 20 }),
  complaintOutcomes: (v) => textList(v, "Resolution outcomes", { min: 1, max: 20 }),
};

// Cleans the business-rule keys present in `patch` (leaves other keys alone).
function validate(patch, current = {}) {
  const out = { ...patch };
  for (const key of Object.keys(VALIDATORS)) {
    if (patch[key] !== undefined) out[key] = VALIDATORS[key](patch[key], current[key]);
  }
  return out;
}

module.exports = {
  DEFAULTS, validate, BOOKING_STATUSES, SERVICE_CHANGE_FIELDS, VISIBILITY_RULE_KEYS,
  DEFAULT_SWAP_REASONS, DEFAULT_COMPLAINT_CATEGORIES, DEFAULT_COMPLAINT_OUTCOMES,
};
