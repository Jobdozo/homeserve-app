// The last data the app showed, kept on the phone so the next open draws it at
// once while fresh data loads quietly behind it. Saved per account and wiped on
// sign-out. Storage can be full or blocked (private browsing): then nothing is
// saved and the app simply loads as before.
const PREFIX = "tikdum-snap-v1:";

export function readSnap(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw).data ?? null : null;
  } catch {
    return null;
  }
}

export function writeSnap(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // full or blocked: skip saving
  }
}

export function clearSnaps(startsWith = "") {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX + startsWith)) localStorage.removeItem(k);
  } catch {
    // blocked: nothing was saved either
  }
}

// The newest `max` records, so a long history never fills the phone's storage.
export function newest(list, max = 300) {
  if (!Array.isArray(list) || list.length <= max) return list;
  return [...list].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, max);
}
