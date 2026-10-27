// Google Ads booking tracking for tikdum.com, so Google Ads can count which ad clicks became
// bookings. Website only: it never loads inside the Android app. The tag ID and the "Booking"
// conversion's label come from the API (/api/google-ads, set in Admin → Social media → Google
// Ads); when they aren't set, nothing loads. Each order is reported once, with its value and
// order number; the customer's phone goes as Google's "enhanced conversions", which Google
// scrambles (hashes) in the browser before sending.
import { Capacitor } from "@capacitor/core";

const API = `${import.meta.env.VITE_SERVER_URL || "http://localhost:4000"}/api`;
let ready = null; // Promise<{ tagId, label } | null>

const onWebsite = () =>
  typeof window !== "undefined" && !Capacitor.isNativePlatform() && /(^|\.)tikdum\.com$/i.test(window.location.hostname);

function loadTag(tagId) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // gtag.js reads the arguments object itself
  };
  window.gtag("js", new Date());
  window.gtag("config", tagId, { allow_enhanced_conversions: true });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
  document.head.appendChild(s);
}

export function initGoogleAds() {
  if (ready) return ready;
  if (!onWebsite()) return (ready = Promise.resolve(null));
  ready = fetch(`${API}/google-ads`)
    .then((r) => (r.ok ? r.json() : {}))
    .then(({ tagId, label }) => {
      if (!/^AW-\d{6,15}$/.test(String(tagId || "")) || !/^[A-Za-z0-9_-]{6,40}$/.test(String(label || ""))) return null;
      loadTag(tagId);
      return { tagId, label };
    })
    .catch(() => null);
  return ready;
}

// Indian mobile in E.164 (+91…), as Google's enhanced conversions expect.
const e164 = (phone) => {
  const d = String(phone || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91${d}` : null;
};

// An order placed: value in rupees, the order's id (Google counts each id once), the customer's phone.
export function trackGoogleBooking({ value, orderId, phone }) {
  initGoogleAds().then((g) => {
    if (!g || !window.gtag) return;
    const phoneNumber = e164(phone);
    if (phoneNumber) window.gtag("set", "user_data", { phone_number: phoneNumber });
    window.gtag("event", "conversion", { send_to: `${g.tagId}/${g.label}`, value: Number(value) || 0, currency: "INR", transaction_id: String(orderId || "") });
  });
}
