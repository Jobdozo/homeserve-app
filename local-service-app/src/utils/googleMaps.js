// Google Maps for the location picker, used when the server has a browser key
// (GOOGLE_MAPS_BROWSER_KEY; deploy/set-maps-key.sh). The key is a public, website-restricted
// browser key, fetched at run time so it can be changed without a new app release. Anything
// that fails — no key, the key refused, no network — and the picker uses OpenStreetMap instead.
import { API_BASE } from "../api";

let keyPromise = null;
// The key, or null when Google Maps isn't set up.
export function mapsKey() {
  if (!keyPromise) {
    keyPromise = fetch(`${API_BASE}/maps/config`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => (typeof c.googleMapsKey === "string" && c.googleMapsKey ? c.googleMapsKey : null))
      .catch(() => {
        keyPromise = null; // offline: ask again next time
        return null;
      });
  }
  return keyPromise;
}

// Google calls window.gm_authFailure when it refuses the key (wrong site, API not allowed, billing off).
const authListeners = new Set();
let authFailed = false;
window.gm_authFailure = () => {
  authFailed = true;
  authListeners.forEach((fn) => fn());
};
export function onGoogleAuthFailure(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

let loading = null;
export function loadGoogleMaps(key) {
  if (authFailed) return Promise.reject(new Error("Google refused the Maps key"));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const done = `__tikdumMapsReady${Date.now()}`;
      const timer = setTimeout(() => {
        loading = null;
        reject(new Error("Google Maps took too long to load"));
      }, 12000);
      window[done] = () => {
        clearTimeout(timer);
        delete window[done];
        resolve(window.google);
      };
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=en&region=IN&callback=${done}`;
      s.async = true;
      s.onerror = () => {
        clearTimeout(timer);
        loading = null;
        reject(new Error("Google Maps didn't load"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// Place suggestions for what's typed, near the map's centre, in India. Each result keeps its
// prediction; googlePlaceLocation() turns the chosen one into coordinates.
export async function googleSearch(g, query, near, sessionToken) {
  const { AutocompleteSuggestion } = await g.maps.importLibrary("places");
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    sessionToken,
    includedRegionCodes: ["in"],
    locationBias: { center: near, radius: 50000 },
  });
  return (suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 6)
    .map((p) => ({
      id: p.placeId,
      label: p.mainText?.text || p.text?.text || "",
      sub: p.secondaryText?.text || "",
      prediction: p,
    }));
}

export async function googlePlaceLocation(prediction) {
  const place = prediction.toPlace();
  await place.fetchFields({ fields: ["location"] });
  return { lat: place.location.lat(), lng: place.location.lng() };
}

// Coordinates -> { label, line, pincode }, the same shape as geolocation.reverseGeocode.
export async function googleReverse(g, lat, lng) {
  const { Geocoder } = await g.maps.importLibrary("geocoding");
  const { results } = await new Geocoder().geocode({ location: { lat, lng } });
  const best = results?.[0];
  if (!best) throw new Error("No address here");
  const part = (type) => results.flatMap((r) => r.address_components).find((c) => c.types.includes(type))?.long_name || "";
  const area = part("sublocality_level_1") || part("sublocality") || part("neighborhood");
  const city = part("locality") || part("administrative_area_level_3") || part("administrative_area_level_2");
  return {
    label: [area, city].filter(Boolean).join(", ") || "Pinned location",
    line: String(best.formatted_address || "").replace(/,\s*India$/, ""),
    pincode: part("postal_code"),
  };
}
