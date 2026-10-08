// Phone numbers that may not sign in or use the app. Added by the team from
// Super Admin -> Customers -> Blocked numbers. A blocked number can't ask for a
// login code or verify one, and any session it already has stops working.
// Staff/admin sign-ins are never blocked here (that would lock the team out) —
// remove a staff member in User management instead.
const jsonStore = require("./jsonStore");

const COLL = "blockedPhones";

const last10 = (phone) => String(phone || "").replace(/\D/g, "").slice(-10);
const fail = (status, message) => Object.assign(new Error(message), { status });

// Called on every authenticated request, so keep it to one small file read.
function isBlocked(phone) {
  const key = last10(phone);
  if (key.length < 10) return false;
  return jsonStore.readAll(COLL).some((r) => r.id === key);
}

function list() {
  return jsonStore.readAll(COLL).sort((a, b) => new Date(b.blockedAt) - new Date(a.blockedAt));
}

function add(phone, reason, actor) {
  const key = last10(phone);
  if (key.length < 10) throw fail(400, "Enter a full 10-digit mobile number");
  if (isBlocked(phone)) throw fail(409, "That number is already blocked");
  return jsonStore.insert(COLL, {
    id: key,
    phone: `+91 ${key}`,
    reason: String(reason || "").trim().slice(0, 300),
    blockedAt: new Date().toISOString(),
    blockedBy: actor || null,
  });
}

function remove(id) {
  return jsonStore.remove(COLL, String(id));
}

module.exports = { isBlocked, list, add, remove };
