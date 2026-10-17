// Meta Pixel for tikdum.com, so Meta ads can count website visits, service views and bookings.
// Website only: it never loads inside the Android app (no Meta SDK there, and the app's Play
// listing doesn't declare ad tracking). The pixel id comes from the API (/api/meta/pixel);
// when none is set, nothing loads.
//
// Booking and sign-up events use the same event ids as the server's Conversions API
// (server/src/metaEvents.js), so Meta counts each once even when both report it.
import { Capacitor } from "@capacitor/core";

const API = `${import.meta.env.VITE_SERVER_URL || "http://localhost:4000"}/api`;
let ready = null; // Promise<boolean>: is the pixel loaded?

const onWebsite = () =>
  typeof window !== "undefined" && !Capacitor.isNativePlatform() && /(^|\.)tikdum\.com$/i.test(window.location.hostname);

function loadPixel(pixelId) {
  /* eslint-disable */
  // Meta's standard loader (creates window.fbq and queues calls until fbevents.js arrives).
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq("init", pixelId);
}

export function initMetaPixel() {
  if (ready) return ready;
  if (!onWebsite()) return (ready = Promise.resolve(false));
  ready = fetch(`${API}/meta/pixel`)
    .then((r) => (r.ok ? r.json() : {}))
    .then(({ pixelId }) => {
      if (!pixelId || !/^\d{5,25}$/.test(String(pixelId))) return false;
      loadPixel(String(pixelId));
      return true;
    })
    .catch(() => false);
  return ready;
}

// name: a Meta standard event (PageView, ViewContent, InitiateCheckout, Schedule, CompleteRegistration).
export function trackMeta(name, params, eventID) {
  initMetaPixel().then((ok) => {
    if (!ok || !window.fbq) return;
    if (eventID) window.fbq("track", name, params || {}, { eventID });
    else window.fbq("track", name, params || {});
  });
}

const cookie = (name) => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};

// Meta's browser ids (_fbp, and _fbc after an ad click), sent with API calls so the server's
// booking events are matched to the same visitor. Empty in the Android app.
export function metaHeaders() {
  if (!onWebsite()) return {};
  const h = { "x-meta-url": window.location.href.slice(0, 500) };
  const fbp = cookie("_fbp");
  const fbc = cookie("_fbc");
  if (fbp) h["x-meta-fbp"] = fbp;
  if (fbc) h["x-meta-fbc"] = fbc;
  return h;
}
