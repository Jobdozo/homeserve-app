// Road route for a trip (Google Routes API, computeRoutes): the line the customer, the provider and
// Admin see from the provider to the booked address, with Google's distance and travel time.
// Uses the website's Maps key (GOOGLE_MAPS_BROWSER_KEY): Google only accepts it from tikdum.com, so
// the request says it comes from there. Kept per booking and redrawn only when it's old or the
// provider has moved well away from where it was drawn — a 20-minute trip costs about 10 routes.
const KEY = () => String(process.env.GOOGLE_MAPS_BROWSER_KEY || "").trim();
const URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const STALE_MS = 2 * 60 * 1000; // redraw at most every 2 minutes …
const MOVED_M = 250; // … unless they've gone this far from where it was drawn (30 s apart at least)
const MIN_GAP_MS = 30 * 1000;

const cache = new Map(); // bookingId -> { polyline, distanceMeters, durationSeconds, from, to, at }
const pending = new Map(); // bookingId -> Promise

function metres(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

// Pure: does this booking need a new route now? Exported for tests.
function needsRoute(old, from, to, now) {
  if (!old) return true;
  if (metres(old.to, to) > 30) return true; // the destination changed
  const age = now - old.at;
  if (age < MIN_GAP_MS) return false;
  return age >= STALE_MS || metres(old.from, from) >= MOVED_M;
}

async function compute(from, to, mode, fetchImpl) {
  const point = (p) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const res = await fetchImpl(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY(),
      // + the turn-by-turn steps for the Business app's full-screen trip view
      "X-Goog-FieldMask":
        "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.startLocation,routes.legs.steps.distanceMeters",
      Referer: "https://tikdum.com/",
    },
    body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: mode, languageCode: "en-IN", units: "METRIC" }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error?.message || `Routes API answered ${res.status}`), { status: res.status });
  const r = json.routes?.[0];
  if (!r?.polyline?.encodedPolyline) throw new Error("No route found");
  // Each turn: where it is, what to do ("Turn left onto Canal Rd") and the manoeuvre for the arrow.
  const steps = (r.legs || [])
    .flatMap((l) => l.steps || [])
    .map((s) => ({
      lat: s.startLocation?.latLng?.latitude,
      lng: s.startLocation?.latLng?.longitude,
      instruction: String(s.navigationInstruction?.instructions || "").slice(0, 160),
      maneuver: String(s.navigationInstruction?.maneuver || ""),
      distanceMeters: Number(s.distanceMeters) || 0,
    }))
    .filter((s) => typeof s.lat === "number" && typeof s.lng === "number" && s.instruction)
    .slice(0, 80);
  return { polyline: r.polyline.encodedPolyline, distanceMeters: Number(r.distanceMeters) || 0, durationSeconds: parseInt(String(r.duration || "0"), 10) || 0, steps };
}

// The route for this trip: a cached one, or a fresh one when needed. { route, fresh } or null
// (no key, no route, Google refused). Two-wheeler roads first (most professionals ride), else car.
async function routeFor(bookingId, from, to, { now = Date.now(), fetchImpl = fetch } = {}) {
  if (!KEY() || !from || !to) return null;
  const old = cache.get(bookingId) || null;
  if (!needsRoute(old, from, to, now)) return old ? { route: old, fresh: false } : null;
  if (pending.has(bookingId)) return pending.get(bookingId);
  const job = (async () => {
    let r;
    try {
      r = await compute(from, to, "TWO_WHEELER", fetchImpl);
    } catch (e) {
      if (e.status === 403 || e.status === 401) throw e;
      r = await compute(from, to, "DRIVE", fetchImpl);
    }
    const route = { ...r, from, to, at: now };
    cache.set(bookingId, route);
    return { route, fresh: true };
  })()
    .catch((e) => {
      console.warn(`[trip route] ${bookingId}: ${e.message}`);
      if (old) cache.set(bookingId, { ...old, at: now }); // don't retry on every fix
      return old ? { route: old, fresh: false } : null;
    })
    .finally(() => pending.delete(bookingId));
  pending.set(bookingId, job);
  return job;
}

const cached = (bookingId) => cache.get(bookingId) || null;
const forget = (bookingId) => cache.delete(bookingId);
// What the apps get: no internal fields.
const view = (r) =>
  r ? { polyline: r.polyline, distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds, steps: r.steps || [], from: r.from, computedAt: new Date(r.at).toISOString() } : null;

module.exports = { routeFor, cached, forget, view, needsRoute, metres };
