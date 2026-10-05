// Detects the browser's current GPS position and reverse-geocodes it into a
// human-readable address via OpenStreetMap's Nominatim (no API key needed).
export async function detectCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported on this device");
  }

  // PIN-code level accuracy doesn't need GPS-grade precision; the coarse
  // network fix is faster, works indoors and on weak connections.
  // Some desktop browsers (e.g. Windows with location services off) never
  // call back — not even with an error — so the `timeout` option above is not
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

  const { latitude, longitude } = position.coords;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${latitude}&lon=${longitude}`,
      { headers: { Accept: "application/json" }, signal: controller.signal }
    );
  } finally {
    clearTimeout(timer);
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

  return {
    lat: latitude,
    lng: longitude,
    label,
    pincode: addr.postcode || "",
    line,
  };
}
