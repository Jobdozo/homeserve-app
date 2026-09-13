// In-memory live-location cache. This is deliberately not persisted to the
// database — it's a fast-changing, short-lived signal (refreshed every ~30s
// from the client) and losing it on a server restart is fine.
const locations = new Map(); // key: `${role}:${id}` -> { role, id, lat, lng, accuracy, updatedAt }

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

module.exports = { setLocation, getLocation };
