import { useState } from "react";
import { Capacitor } from "@capacitor/core";

// "Tikdum is better on the app" bar at the top of the website on Android phones (like
// Housing.com's): opens the app's Play Store page, which shows "Open" if it's already installed.
// Not in the app itself, not on iPhones (no iOS app yet) and not on computers. Closing it hides it
// for a week (kept in this browser only).
const PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.tikdum.customer&referrer=utm_source%3Dtikdum.com%26utm_medium%3Dapp_banner";
const CLOSED_KEY = "tikdum-app-banner-closed";
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

function shouldShow() {
  try {
    if (Capacitor.isNativePlatform()) return false;
    if (!/Android/i.test(navigator.userAgent)) return false;
    const closedAt = Number(localStorage.getItem(CLOSED_KEY) || 0);
    return !closedAt || Date.now() - closedAt > HIDE_MS;
  } catch {
    return false;
  }
}

export default function AppBanner() {
  const [show, setShow] = useState(shouldShow);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(CLOSED_KEY, String(Date.now()));
    } catch {
      // private mode: it just comes back next visit
    }
    setShow(false);
  };
  return (
    <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-line bg-white px-3 py-2 lg:hidden" role="region" aria-label="Get the Tikdum app">
      <button onClick={close} aria-label="Close" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[18px] leading-none text-ink-muted">
        ×
      </button>
      <img src="/pwa-192.png" alt="" className="h-10 w-10 flex-shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-ink">Tikdum is better on the app</p>
        <p className="truncate text-[11px] text-ink-muted">Faster booking · live updates · Free on Google Play</p>
      </div>
      <a
        href={PLAY_URL}
        target="_blank"
        rel="noopener"
        className="flex-shrink-0 rounded-xl border border-brand bg-brand-light px-3 py-2 text-[12.5px] font-bold text-brand-dark active:scale-[0.98]"
      >
        Use the App
      </a>
    </div>
  );
}
