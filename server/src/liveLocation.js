// Live locations, held in memory only: a fast-changing, short-lived signal that is never written
// to disk — losing the positions on a server restart is fine.
//
// Live tracking (customer and provider apps):
//   - a TRIP: the provider starts it ("Slide to start trip") on an Accepted booking; from then
//     their app reports every few seconds and each fix is pushed straight to that booking's
//     customer (and admins). It ends when they stop it, or by itself when the booking leaves
//     Accepted (start code entered, cancelled, handed back …) — realtime.booking() calls
//     bookingChanged().
//   - a SHARE: the customer turns on "Share my live location" (e.g. they're not at the booked
//     address); their fixes go to the booking's provider until they stop it or the job ends.
// Which trips and shares are on (not where anyone is) is saved in jsonStore "liveTrips", so a
// deploy or restart doesn't end them. Nobody receives a position for anything but their own
// active booking.
const jsonStore = require("./jsonStore");

const SAVED = "liveTrips"; // { id: "trip:<bookingId>" | "share:<bookingId>", kind, bookingId, providerId, customerId, to, startedAt }
const locations = new Map(); // key: `${role}:${id}` -> { role, id, lat, lng, accuracy, updatedAt }
const trips = new Map(); // bookingId -> { bookingId, providerId, customerId, to, startedAt }
const shares = new Map(); // bookingId -> same shape

for (const r of jsonStore.readAll(SAVED)) (r.kind === "trip" ? trips : shares).set(r.bookingId, r);

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

// The booked address is where a trip is heading (for the road route and the arrival time).
const destination = (b) => (typeof b.address?.lat === "number" && typeof b.address?.lng === "number" ? { lat: b.address.lat, lng: b.address.lng } : null);
const record = (b, kind) => ({ id: `${kind}:${b.id}`, kind, bookingId: b.id, providerId: b.providerId, customerId: b.customerId, to: destination(b), startedAt: new Date().toISOString() });

function start(map, b, kind) {
  if (map.has(b.id)) return map.get(b.id);
  const r = record(b, kind);
  map.set(b.id, r);
  jsonStore.insert(SAVED, r);
  return r;
}
function stop(map, bookingId, kind) {
  if (!map.delete(bookingId)) return false;
  jsonStore.remove(SAVED, `${kind}:${bookingId}`);
  return true;
}

const startTrip = (b) => start(trips, b, "trip");
const stopTrip = (bookingId) => stop(trips, bookingId, "trip");
const getTrip = (bookingId) => trips.get(bookingId) || null;
const tripsOf = (providerId) => [...trips.values()].filter((t) => t.providerId === providerId);
const allTrips = () => [...trips.values()];

const startShare = (b) => start(shares, b, "share");
const stopShare = (bookingId) => stop(shares, bookingId, "share");
const getShare = (bookingId) => shares.get(bookingId) || null;
const sharesOf = (customerId) => [...shares.values()].filter((s) => s.customerId === customerId);

// A booking changed: a trip only runs while it's Accepted (on the way), a share while it's
// Accepted or In Progress, and both belong to whoever holds it now. Returns what ended.
function bookingChanged(b) {
  const ended = [];
  const trip = trips.get(b.id);
  if (trip && (b.status !== "Accepted" || b.providerId !== trip.providerId)) {
    stopTrip(b.id);
    ended.push("trip");
  }
  const share = shares.get(b.id);
  if (share && (!["Accepted", "In Progress"].includes(b.status) || b.providerId !== share.providerId)) {
    stopShare(b.id);
    ended.push("share");
  }
  return ended;
}

module.exports = { setLocation, getLocation, startTrip, stopTrip, getTrip, tripsOf, allTrips, startShare, stopShare, getShare, sharesOf, bookingChanged };
