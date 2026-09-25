// Provider presence: every authenticated provider request is a heartbeat (the
// app polls about every 30s while open), so no separate client change is
// needed. The last-seen time is persisted (throttled) so it survives a server
// restart; "seen in the last N seconds" from memory is what Live Monitoring
// uses for Online, while visibility rules use the wider persisted window.
const jsonStore = require("./jsonStore");

const PERSIST_EVERY_MS = 60 * 1000;
const lastSeen = new Map();
const lastPersisted = new Map();

function touchProvider(id) {
  if (!id) return;
  const now = Date.now();
  lastSeen.set(id, now);
  if (now - (lastPersisted.get(id) || 0) < PERSIST_EVERY_MS) return;
  lastPersisted.set(id, now);
  try {
    const at = new Date(now).toISOString();
    if (!jsonStore.update("providerPresence", id, { lastSeenAt: at })) {
      jsonStore.insert("providerPresence", { id, lastSeenAt: at });
    }
  } catch (e) {
    console.error("presence persist failed", e);
  }
}

// In-memory only: the precise "online right now" signal.
const memorySeenMs = (id) => lastSeen.get(id) || null;

// providerId -> last seen (ms), merging the persisted record with memory. One
// file read, meant to be taken once per request and reused for many providers.
function snapshot() {
  const map = new Map();
  for (const r of jsonStore.readAll("providerPresence")) {
    const t = new Date(r.lastSeenAt).getTime();
    if (Number.isFinite(t)) map.set(r.id, t);
  }
  for (const [id, t] of lastSeen) map.set(id, Math.max(t, map.get(id) || 0));
  return map;
}

module.exports = { touchProvider, memorySeenMs, snapshot };
