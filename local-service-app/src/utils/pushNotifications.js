import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "../api";

const FcmToken = registerPlugin("FcmToken");

async function ensureFcmRegistered() {
  // Android 13+ treats notifications as a dangerous runtime permission —
  // declaring it in the manifest isn't enough, the OS prompt only appears
  // once something actually calls requestPermissions(). We only need the
  // prompt itself here; PushNotifications.register()/addListener() are
  // deliberately never called, since that plugin's own notification
  // listener would compete with our own FcmTokenPlugin-driven handling.
  try {
    await PushNotifications.requestPermissions();
  } catch (e) {
    console.error("Notification permission request failed", e);
  }

  try {
    const { token } = await FcmToken.getToken();
    if (token) await api.saveFcmToken(token);
  } catch (e) {
    console.error("FCM registration failed", e);
  }
  FcmToken.addListener("tokenRefresh", ({ token }) => {
    if (token) api.saveFcmToken(token).catch((e) => console.error("FCM token refresh save failed", e));
  });
}

// Fires when a tapped notification (or the cold-start fallback) carries a
// bookingId — lets the screen decide what to do with it (e.g. navigate to
// the booking) without this module knowing about routing.
export function onNativeNotificationTap(callback) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const listenerPromise = FcmToken.addListener("notificationTap", ({ bookingId }) => {
    if (bookingId) callback(bookingId);
  });
  FcmToken.consumePendingNotification()
    .then(({ bookingId }) => {
      if (bookingId) callback(bookingId);
    })
    .catch(() => {});
  return () => {
    listenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
}

// A VAPID public key comes back base64url-encoded from the server; the Push
// API needs it as a raw Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Subscribes this device to push and saves the subscription server-side —
// otherwise an admin broadcast (or a booking status update) only reaches a
// tab that's already open via the socket connection, never a backgrounded or
// closed app. Silently no-ops wherever push isn't supported/permitted.
export async function ensurePushSubscribed() {
  if (Capacitor.isNativePlatform()) return ensureFcmRegistered();
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
