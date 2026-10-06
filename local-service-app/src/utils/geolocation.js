// Location helpers.
//  - detectCurrentLocation(): quick, coarse fix + address — enough to find the PIN code.
//  - detectPreciseLocation(): the device's best GPS fix, for pinning an exact spot.
//  - reverseGeocode(): coordinates -> readable address, via OpenStreetMap's
//    Nominatim (no API key needed).

// Reverse-geocode a coordinate into a short English address and PIN code.
export async function reverseGeocode(lat, lng, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let res;
  try {
    res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&zoom=18&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!res.ok) throw new Error("Failed to resolve address for your location");
  const data = await res.json();
  const addr = data.address || {};

  const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.village || addr.town;
  const city = addr.city || addr.town || addr.state_district || addr.state;
  const label = [area, city].filter(Boolean).join(", ") || "Current location";

  // A short, readable address (most specific first, no repeated names, no
  // country) instead of OpenStreetMap's long display_name, which repeats the
  // same place several times and can mix scripts.
  const seen = new Set();
  const line =
    [
      addr.house_number && addr.road ? `${addr.house_number} ${addr.road}` : addr.road,
      addr.neighbourhood,
      addr.suburb,
      addr.hamlet,
      addr.village,
      addr.town,
      addr.city,
      addr.county,
      addr.state_district,
      addr.state,
      addr.postcode,
    ]
      .filter(Boolean)
      .filter((part) => {
        const key = String(part).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(", ") ||
    data.display_name ||
    label;

  return { label, pincode: addr.postcode || "", line };
}

// Detects the browser's current position and reverse-geocodes it.
export async function detectCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported on this device");
  }

  // PIN-code level accuracy doesn't need GPS-grade precision; the coarse
  // network fix is faster, works indoors and on weak connections.
  //
  // Some desktop browsers (e.g. Windows with location services off) never
  // call back — not even with an error — so the `timeout` option below is not
  // enough. Our own timer guarantees the caller always gets an answer instead
  // of a "Detecting…" label that never clears.
  const position = await new Promise((resolve, reject) => {
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error("Location lookup timed out"), { code: 3 }));
    }, 14000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve(p);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        reject(err);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
    );
  });

  const { latitude, longitude, accuracy } = position.coords;
  const place = await reverseGeocode(latitude, longitude);
  // accuracy is the device's own ± radius in metres. A laptop without GPS
  // reports a guess from its internet connection — often 1,000+ m and sometimes
  // the wrong city — so callers use this to flag "approximate" locations.
  return { lat: latitude, lng: longitude, accuracy: Math.round(accuracy || 0), ...place };
}

// The device's best GPS fix. A single reading is often 30–100 m off, because
// the first fix comes from towers/Wi-Fi and the satellite lock improves over a
// few seconds — so this keeps listening and reports every improvement through
// onProgress, finishing as soon as the accuracy reaches `targetMeters` (or
// after `maxWaitMs`, with the best fix seen). Returns { lat, lng, accuracy }
// where accuracy is the device's own ± radius in metres.
//
// Honest limits: outdoors with a clear sky a phone typically reaches 3–10 m;
// indoors or on a desktop it may only manage tens or hundreds of metres. The
// map pin exists so the customer can correct the last few metres by hand.
export function detectPreciseLocation({ targetMeters = 10, maxWaitMs = 20000, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device"));
      return;
    }
    let best = null;
    let finished = false;
    let watchId = null;

    const finish = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      signal?.removeEventListener("abort", onAbort);
      if (best) resolve(best);
      else reject(err || Object.assign(new Error("Couldn't get a GPS fix"), { code: 3 }));
    };
    const onAbort = () => finish(Object.assign(new Error("Cancelled"), { code: 0 }));
    const timer = setTimeout(() => finish(), maxWaitMs);
    signal?.addEventListener("abort", onAbort);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (!best || accuracy < best.accuracy) {
          best = { lat: latitude, lng: longitude, accuracy: Math.round(accuracy) };
          onProgress?.(best);
        }
        if (accuracy <= targetMeters) finish();
      },
      (err) => {
        // Permission denied is final; anything else, keep waiting for a fix.
        if (err.code === 1) finish(err);
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    );
  });
}

// Find a place by name (for people on a computer, which usually has no GPS).
// Biased towards Jammu & Kashmir but not limited to it.
export async function searchPlaces(query, signal) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=en&countrycodes=in&limit=6&viewbox=73.3,35.0,77.2,32.2&q=${encodeURIComponent(q)}`,
    { headers: { Accept: "application/json" }, signal }
  );
  if (!res.ok) throw new Error("Search failed");
  const rows = await res.json();
  return rows.map((r) => ({
    id: r.place_id,
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: String(r.display_name || "").split(",").slice(0, 3).join(",").trim(),
    sub: String(r.display_name || "").split(",").slice(3, 6).join(",").trim(),
  }));
}

// A location is "approximate" when the device could only guess it (city-level).
export const APPROXIMATE_OVER_METERS = 1500;
