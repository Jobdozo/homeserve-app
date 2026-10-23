// Google Maps for the Business app's trip map (TripCard), used when the server has a browser key
// (GOOGLE_MAPS_BROWSER_KEY; deploy/set-maps-key.sh; the key allows provider.tikdum.com). A public,
// website-restricted browser key, fetched at run time so it can change without an app release. Anything
// that fails — no key, the key refused, no network — and the job screen simply shows no map.
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
