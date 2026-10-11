// Extras a customer adds to an order at checkout:
//   - contact: "booking for someone else" — the person at the address, whom the
//     professional should call (jsonStore "orderContacts", keyed by orderId).
//   - note: one note for the professional, added to every service's issue text.
const jsonStore = require("./jsonStore");

const fail = (message) => Object.assign(new Error(message), { status: 400 });
let byOrder = null;
const load = () => {
  if (!byOrder) byOrder = new Map(jsonStore.readAll("orderContacts").map((r) => [r.id, { name: r.name, phone: r.phone }]));
  return byOrder;
};

// India-first: a bare 10-digit number gets +91.
function cleanContact(input) {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const digits = String(input.phone || "").replace(/\D/g, "");
  if (!name && !digits) return null;
  if (!name) throw fail("Add the name of the person at the address");
  const d = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(d)) throw fail("Enter their 10-digit mobile number");
  return { name, phone: `+91${d}` };
}

function cleanNote(note) {
  return String(note || "").trim().replace(/\s+/g, " ").slice(0, 300);
}

function saveContact(orderId, contact) {
  if (!orderId || !contact) return;
  jsonStore.insert("orderContacts", { id: orderId, ...contact, createdAt: new Date().toISOString() });
  if (byOrder) byOrder.set(orderId, contact);
}

function contactFor(orderId) {
  return orderId ? load().get(orderId) || null : null;
}

module.exports = { cleanContact, cleanNote, saveContact, contactFor };
