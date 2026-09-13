// Detects the browser's current GPS position and reverse-geocodes it into a
// human-readable address via OpenStreetMap's Nominatim (no API key needed).
export async function detectCurrentLocation() {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported on this device");
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    });
  });

  const { latitude, longitude } = position.coords;

  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
    { headers: { Accept: "application/json" } }
  );
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
