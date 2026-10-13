// Two rules for bookings that move from one provider to another:
//
// 1. The price promise. A booking passed to another provider (they rejected it,
//    missed the ring, or handed it back) never costs the customer more than the
//    price they booked, and a cheaper provider costs them less. When the next
//    provider charges more, the provider who let it go pays the difference into
//    the new provider's wallet once the job is completed (store.settlePriceCover).
//    The provider the customer booked stays responsible through a chain of
//    rejections; a provider who accepts and then hands it back becomes responsible.
//
// 2. The "needs assignment" queue. When no provider is left to try, the booking
//    is not rejected: it waits here (still Pending, hidden from providers) for a
//    person in Admin to give it to someone. If nobody does before the deadline,
//    the customer gets an apology and the booking is rejected (index.js).
const jsonStore = require("./jsonStore");

const COVERS = "bookingPriceCovers"; // { id: bookingId, quoted, chargedProviderId, cover, coverProviderId, settledAt }
const QUEUE = "needsAssignment"; // { id: bookingId, since, tried: [providerId], alertedAt }

// ---- 1. price promise ----

// The price the customer pays when the booking moves to a provider charging `newPrice`
// (already × quantity), and the difference the responsible provider will cover.
// chargedProviderId: set when a provider who had accepted hands it back (a swap).
function priceForMove(booking, newPrice, newProviderId, { chargedProviderId } = {}) {
  const price = Math.max(0, Math.round(Number(newPrice) || 0));
  let rec = coverFor(booking.id);
  if (!rec) rec = jsonStore.insert(COVERS, { id: booking.id, quoted: Number(booking.amount) || 0, chargedProviderId: booking.providerId, cover: 0, at: new Date().toISOString() });
  const charged = chargedProviderId || rec.chargedProviderId;
  // Moving back to the provider who let it go: nobody covers anything.
  const cover = newProviderId === charged ? 0 : Math.max(0, price - rec.quoted);
  jsonStore.update(COVERS, booking.id, { chargedProviderId: charged, cover, coverProviderId: newProviderId, updatedAt: new Date().toISOString() });
  return { amount: Math.min(rec.quoted, price), cover, chargedProviderId: charged, quoted: rec.quoted };
}

function coverFor(bookingId) {
  return jsonStore.readAll(COVERS).find((r) => r.id === bookingId) || null;
}

// What is still to be paid when this booking is completed by `providerId`, or null.
function coverDue(bookingId, providerId) {
  const rec = coverFor(bookingId);
  if (!rec || rec.settledAt || !(rec.cover > 0) || rec.coverProviderId !== providerId || rec.chargedProviderId === providerId) return null;
  return rec;
}

function markSettled(bookingId) {
  jsonStore.update(COVERS, bookingId, { settledAt: new Date().toISOString() });
}

// ---- 2. needs-assignment queue ----

function addToQueue(bookingId, tried = []) {
  const existing = queued(bookingId);
  if (existing) return jsonStore.update(QUEUE, bookingId, { tried: [...new Set([...(existing.tried || []), ...tried])] });
  return jsonStore.insert(QUEUE, { id: bookingId, since: new Date().toISOString(), tried: [...new Set(tried)], alertedAt: null });
}

const queued = (bookingId) => jsonStore.readAll(QUEUE).find((r) => r.id === bookingId) || null;
const removeFromQueue = (bookingId) => jsonStore.remove(QUEUE, bookingId);
const listQueue = () => jsonStore.readAll(QUEUE).sort((a, b) => a.since.localeCompare(b.since));
const queuedIds = () => new Set(jsonStore.readAll(QUEUE).map((r) => r.id));
const markAlerted = (bookingId) => jsonStore.update(QUEUE, bookingId, { alertedAt: new Date().toISOString() });

// Booking slots are a date "YYYY-MM-DD" and a label like "10:00 AM – 12:00 PM", in IST.
const IST_MS = 5.5 * 3600 * 1000;
function slotStartMs(date, timeLabel) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const m = String(timeLabel || "").match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return Date.parse(`${date}T00:00:00Z`) + (h * 60 + min) * 60000 - IST_MS;
}

const GIVE_UP_BEFORE_SLOT_MS = 60 * 60 * 1000; // a timed booking: 1 hour before it starts
const GIVE_UP_AFTER_MS = 2 * 60 * 60 * 1000; // "as soon as possible" (no clock time): 2 hours of trying
const OWNER_ALERT_AFTER_MS = 10 * 60 * 1000; // nobody in Admin acted: WhatsApp the owner

// When the customer is told nobody could be found.
function deadlineFor(booking, since) {
  const start = slotStartMs(booking?.date, booking?.time);
  const fallback = Date.parse(since) + GIVE_UP_AFTER_MS;
  return start === null ? fallback : Math.max(start - GIVE_UP_BEFORE_SLOT_MS, Date.parse(since) + 15 * 60 * 1000);
}

module.exports = {
  priceForMove,
  coverFor,
  coverDue,
  markSettled,
  addToQueue,
  queued,
  removeFromQueue,
  listQueue,
  queuedIds,
  markAlerted,
  slotStartMs,
  deadlineFor,
  OWNER_ALERT_AFTER_MS,
};
