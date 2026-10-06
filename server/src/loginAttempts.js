// A log of people who asked for a login code — so the team can follow up with
// anyone who tried to sign in or sign up but never got through (a wrong
// number, a code that never arrived, someone who gave up), and spot numbers
// poking at the admin login that aren't admins.
//
// One record per role + number, updated on every attempt. Kept for 90 days
// (see the privacy policy), then removed.
const jsonStore = require("./jsonStore");

const COLL = "loginAttempts";
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

const last10 = (phone) => String(phone || "").replace(/\D/g, "").slice(-10);
const keyOf = (role, phone) => `${role}:${last10(phone)}`;
const now = () => new Date().toISOString();

function purgeOld() {
  const cutoff = Date.now() - KEEP_MS;
  for (const r of jsonStore.readAll(COLL)) {
    if (new Date(r.lastAt).getTime() < cutoff) jsonStore.remove(COLL, r.id);
  }
}

function find(role, phone) {
  const id = keyOf(role, phone);
  return jsonStore.readAll(COLL).find((r) => r.id === id);
}

// outcome: "sent" | "dev-code" | "send-failed" | "not-admin"
function recordRequest({ phone, role, ip, outcome }) {
  if (last10(phone).length < 6) return; // not a real number — nothing to follow up
  const existing = find(role, phone);
  if (existing) {
    jsonStore.update(COLL, existing.id, {
      phone: String(phone).trim(),
      lastAt: now(),
      requests: (existing.requests || 0) + 1,
      lastResult: outcome,
      ip: ip || existing.ip || null,
      // They're back after we'd marked them done — put them back in the list.
      status: existing.status === "contacted" || existing.status === "ignored" ? existing.status : "new",
    });
    return;
  }
  jsonStore.insert(COLL, {
    id: keyOf(role, phone),
    role,
    phone: String(phone).trim(),
    firstAt: now(),
    lastAt: now(),
    requests: 1,
    failedCodes: 0,
    verified: false,
    lastResult: outcome,
    ip: ip || null,
    status: "new",
    note: "",
  });
  if (Math.random() < 0.05) purgeOld();
}

function recordVerified(role, phone) {
  const r = find(role, phone);
  if (r) jsonStore.update(COLL, r.id, { verified: true, verifiedAt: now() });
}

function recordWrongCode(role, phone) {
  const r = find(role, phone);
  if (r) jsonStore.update(COLL, r.id, { failedCodes: (r.failedCodes || 0) + 1, lastResult: "wrong-code", lastAt: now() });
}

// People who asked for a code but have no account to show for it, newest first.
// `hasAccount(role, phone)` says whether a customer/provider/admin exists for
// the number; someone who verified AND has an account is simply registered.
async function listUnregistered(hasAccount) {
  purgeOld();
  const rows = [];
  for (const r of jsonStore.readAll(COLL)) {
    const registered = r.verified && (await hasAccount(r.role, r.phone));
    if (registered) continue;
    rows.push({ ...r, hasAccount: await hasAccount(r.role, r.phone) });
  }
  return rows.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

const STATUSES = ["new", "contacted", "ignored"];

function update(id, { status, note }, actor) {
  const r = jsonStore.readAll(COLL).find((x) => x.id === id);
  if (!r) return undefined;
  const patch = {};
  if (status !== undefined) {
    if (!STATUSES.includes(status)) throw Object.assign(new Error("Unknown status"), { status: 400 });
    patch.status = status;
    if (status === "contacted") {
      patch.contactedAt = now();
      patch.contactedBy = actor || null;
    }
  }
  if (note !== undefined) patch.note = String(note).slice(0, 500);
  return jsonStore.update(COLL, id, patch);
}

module.exports = { recordRequest, recordVerified, recordWrongCode, listUnregistered, update, STATUSES };
