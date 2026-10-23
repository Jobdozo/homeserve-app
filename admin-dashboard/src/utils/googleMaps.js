// Google Maps for Admin's live map (Live Provider Monitoring → On the way now). Same browser key as
// the website (server /api/maps/config); Google only accepts it from the sites listed on the key in
// Google Cloud, which include admin.tikdum.com. Rejects when there's no key or Google refuses it.
import { API_BASE } from "../api";

let keyPromise = null;
function mapsKey() {
  if (!keyPromise) {
    keyPromise = fetch(`${API_BASE}/maps/config`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => c.googleMapsKey || null)
      .catch(() => {
        keyPromise = null;
        return null;
      });
  }
  return keyPromise;
}

let refused = false;
const refusedListeners = new Set();
window.gm_authFailure = () => {
  refused = true;
  refusedListeners.forEach((fn) => fn());
};
export const onMapsRefused = (fn) => (refusedListeners.add(fn), () => refusedListeners.delete(fn));

let loading = null;
export async function loadGoogleMaps() {
  if (refused) throw new Error("Google refused the Maps key for this site");
  if (window.google?.maps?.importLibrary) return window.google;
  const key = await mapsKey();
  if (!key) throw new Error("Google Maps isn't set up (deploy/set-maps-key.sh)");
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const done = `__tikdumAdminMaps${Date.now()}`;
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
