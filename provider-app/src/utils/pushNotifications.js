import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "../api";

// A VAPID public key comes back base64url-encoded from the server; the Push
// API needs it as a raw Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Bridges to the custom native plugin in TikdumMessagingService/
// FcmTokenPlugin.java — not @capacitor/push-notifications' own plugin,
// which would also wire up its own default notification display and
// compete with the custom full-screen ringing notification.
const FcmToken = registerPlugin("FcmToken");

// Real background ringing (bypassing silent mode, full-screen on the lock
// screen) is only possible in the native app build — see
// TikdumMessagingService.java for why a web Service Worker can't do this.
async function ensureFcmRegistered() {
  // Android 13+ treats notifications as a dangerous runtime permission —
  // declaring it in the manifest isn't enough, the OS prompt only appears
  // once something actually calls requestPermissions(). We only need the
  // prompt itself here; PushNotifications.register()/addListener() are
  // deliberately never called, since that plugin's own notification
  // listener would compete with TikdumMessagingService's full-screen ringing.
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

  // A token can rotate after the initial registration — re-save it
  // whenever that happens instead of only on first login.
  FcmToken.addListener("tokenRefresh", ({ token }) => {
    if (token) api.saveFcmToken(token).catch((e) => console.error("FCM token refresh save failed", e));
  });
}

// Subscribes this device to push and saves the subscription server-side, so
// a new booking request can wake the app even backgrounded or fully closed.
// Silently no-ops wherever push isn't supported/permitted — ringing while
// the app is open keeps working regardless.
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

// Listens for the native "ring" event (fired when the app is launched or
// resumed via the full-screen ringing notification) and for a pending ring
// that may have fired before this listener was ready (the cold-start race —
// see FcmTokenPlugin.consumePendingRing). Returns an unsubscribe function.
export function onNativeRing(callback) {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listenerPromise = FcmToken.addListener("ring", ({ bookingId }) => {
    if (bookingId) callback(bookingId);
  });

  FcmToken.consumePendingRing()
    .then(({ bookingId }) => {
      if (bookingId) callback(bookingId);
    })
    .catch(() => {});

  return () => {
    listenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
}
