// Google AdSense on the blog only (tikdum.com/blog and its articles), on the website only — never
// in the Android app. The publisher ID comes from the API (/api/blog-ads; set in Admin → Blog →
// Ads); when none is set, nothing loads. A blog page opened straight from Google already has the
// script in its HTML (server/src/seoPages.js).
//
// AdSense can't be unloaded from a page, so leaving the blog for any other page loads that page
// fresh: no ad follows anyone into booking, checkout or their account.
import { Capacitor } from "@capacitor/core";

const API = `${import.meta.env.VITE_SERVER_URL || "http://localhost:4000"}/api`;
const SCRIPT = 'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]';

const onWebsite = () =>
  typeof window !== "undefined" && !Capacitor.isNativePlatform() && /(^|\.)tikdum\.com$/i.test(window.location.hostname);

export const isBlogPath = (pathname) => /^\/blog(\/|$)/.test(pathname || "");

let asked = null;
function loadAds() {
  if (asked || document.querySelector(SCRIPT)) return;
  asked = fetch(`${API}/blog-ads`)
    .then((r) => (r.ok ? r.json() : {}))
    .then(({ client }) => {
      if (!/^ca-pub-\d{10,20}$/.test(String(client || "")) || document.querySelector(SCRIPT)) return;
      const s = document.createElement("script");
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
      document.head.appendChild(s);
    })
    .catch(() => {});
}

// Call on every page change.
export function blogAdsFor(pathname) {
  if (!onWebsite()) return;
  if (isBlogPath(pathname)) loadAds();
  else if (document.querySelector(SCRIPT)) window.location.replace(window.location.href);
}
