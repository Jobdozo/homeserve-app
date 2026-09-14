import { api } from "../api";

// A VAPID public key comes back base64url-encoded from the server; the Push
// API needs it as a raw Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Subscribes this device to push and saves the subscription server-side, so
// a new booking request can wake the app even backgrounded or fully closed.
// Silently no-ops wherever push isn't supported/permitted — ringing while
// the app is open keeps working regardless.
export async function ensurePushSubscribed() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission === "denied") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await api.subscribePush(existing.toJSON());
      return;
    }

    if (Notification.permission !== "granted") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
    }

    const { publicKey, configured } = await api.getVapidPublicKey();
    if (!configured || !publicKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await api.subscribePush(subscription.toJSON());
  } catch (e) {
    console.error("Push subscription failed", e);
  }
}
