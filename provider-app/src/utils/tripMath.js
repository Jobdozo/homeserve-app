// Small maths for live tracking (TripCard.jsx). The same file is in the customer app and Admin.

// Straight-line distance in km.
export function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Compass direction from a to b in degrees (0 = north), to turn the vehicle the way it's going.
export function bearing(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Google's encoded polyline -> [{ lat, lng }].
export function decodePolyline(str) {
  const points = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < (str || "").length) {
    for (const which of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

// What's left of the trip: Google's road distance and time for the route, scaled by how much of the
// straight-line way is still to go; without a route, an estimate (roads ×1.3 at ~20 km/h in town).
export function remaining(pos, dest, route) {
  if (!pos || !dest) return null;
  const left = km(pos, dest);
  if (route?.distanceMeters && route.from) {
    const atStart = Math.max(0.05, km(route.from, dest));
    const share = Math.min(1.2, left / atStart);
    return { km: (route.distanceMeters / 1000) * share, minutes: Math.max(1, Math.round((route.durationSeconds / 60) * share)), byRoad: true };
  }
  return { km: left * 1.3, minutes: Math.max(1, Math.round(((left * 1.3) / 20) * 60)), byRoad: false };
}

// The muted Google map look that lets the route and the vehicle stand out.
export const QUIET_MAP_STYLE = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f1efe9" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fbfaf7" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fdf3d6" }] },
  { featureType: "water", stylers: [{ color: "#c9dff0" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#7a7a7a" }] },
];

// Vehicle (an arrow pointing the way they ride) and destination pin, as SVG paths for map markers.
export const VEHICLE_PATH = "M 0,-14 L 9,11 L 0,6 L -9,11 Z";
export const PIN_PATH = "M 0,0 C -2,-14 -11,-18 -11,-28 A 11,11 0 1,1 11,-28 C 11,-18 2,-14 0,0 Z";
