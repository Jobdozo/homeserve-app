// Detects the browser's current GPS position and reverse-geocodes it into a
// human-readable address via OpenStreetMap's Nominatim (no API key needed).
export async function detectCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported on this device");
  }

  // PIN-code level accuracy doesn't need GPS-grade precision; the coarse
  // network fix is faster, works indoors and on weak connections.
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 30000,
    });
  });

  const { latitude, longitude } = position.coords;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
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

  return {
    lat: latitude,
    lng: longitude,
    label,
    pincode: addr.postcode || "",
    line: data.display_name || label,
  };
}
