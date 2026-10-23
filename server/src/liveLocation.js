// In-memory live-location cache. This is deliberately not persisted to the
// database — it's a fast-changing, short-lived signal and losing it on a server
// restart is fine.
//
// Live tracking (customer and provider apps):
//   - a TRIP: the provider taps "Start trip" on an Accepted booking; from then their app reports
//     every few seconds and each fix is pushed straight to that booking's customer (and admins).
//     It ends when they stop it, or by itself when the booking leaves Accepted (start code
//     entered, cancelled, handed back …) — realtime.booking() calls bookingChanged().
//   - a SHARE: the customer turns on "Share my live location" (e.g. they're not at the booked
//     address); their fixes go to the booking's provider until they stop it or the job ends.
// Nobody receives a position for anything but their own active booking.
const locations = new Map(); // key: `${role}:${id}` -> { role, id, lat, lng, accuracy, updatedAt }
const trips = new Map(); // bookingId -> { bookingId, providerId, customerId, startedAt }
const shares = new Map(); // bookingId -> { bookingId, providerId, customerId, startedAt }

function setLocation(role, id, lat, lng, accuracy) {
  const entry = {
    role,
    id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    updatedAt: new Date().toISOString(),
  };
  locations.set(`${role}:${id}`, entry);
  return entry;
}

function getLocation(role, id) {
  return locations.get(`${role}:${id}`);
}

const record = (b) => ({ bookingId: b.id, providerId: b.providerId, customerId: b.customerId, startedAt: new Date().toISOString() });

function startTrip(b) {
  const t = trips.get(b.id) || record(b);
  trips.set(b.id, t);
  return t;
}
function stopTrip(bookingId) {
  return trips.delete(bookingId);
}
const getTrip = (bookingId) => trips.get(bookingId) || null;
const tripsOf = (providerId) => [...trips.values()].filter((t) => t.providerId === providerId);
const allTrips = () => [...trips.values()];

function startShare(b) {
  const s = shares.get(b.id) || record(b);
  shares.set(b.id, s);
  return s;
}
function stopShare(bookingId) {
  return shares.delete(bookingId);
}
const getShare = (bookingId) => shares.get(bookingId) || null;
const sharesOf = (customerId) => [...shares.values()].filter((s) => s.customerId === customerId);

// A booking changed: a trip only runs while it's Accepted (on the way), a share while it's
// Accepted or In Progress, and both belong to whoever holds it now. Returns what ended.
function bookingChanged(b) {
  const ended = [];
  const trip = trips.get(b.id);
  if (trip && (b.status !== "Accepted" || b.providerId !== trip.providerId)) {
    trips.delete(b.id);
    ended.push("trip");
  }
  const share = shares.get(b.id);
  if (share && (!["Accepted", "In Progress"].includes(b.status) || b.providerId !== share.providerId)) {
    shares.delete(b.id);
    ended.push("share");
  }
  return ended;
}

module.exports = { setLocation, getLocation, startTrip, stopTrip, getTrip, tripsOf, allTrips, startShare, stopShare, getShare, sharesOf, bookingChanged };
