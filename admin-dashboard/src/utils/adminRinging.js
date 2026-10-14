import { Capacitor, registerPlugin } from "@capacitor/core";
import { api } from "../api";

// The Admin app (Android) rings for bookings no provider accepted, even when
// it's closed — the same native ringing the Business app uses (see
// android/.../TikdumMessagingService.java and FcmTokenPlugin.java). In a browser
// these do nothing; the assignment desk's in-page chime covers an open tab.
const FcmToken = registerPlugin("FcmToken");
let savedToken = null;
let refreshListener = null;

// After sign-in: ask for notification permission (Android 13+) and save this
// phone's push token for the signed-in admin.
export async function registerAdminPhone() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await FcmToken.requestNotificationPermission();
  } catch (e) {
    console.error("Notification permission request failed", e);
  }
  try {
    const { token } = await FcmToken.getToken();
    if (token) {
      await api.saveAdminFcmToken(token);
      savedToken = token;
    }
  } catch (e) {
    console.error("Admin push registration failed", e);
  }
  if (!refreshListener) {
    refreshListener = FcmToken.addListener("tokenRefresh", ({ token }) => {
      if (!token) return;
      savedToken = token;
      api.saveAdminFcmToken(token).catch(() => {});
    });
  }
}

// On sign-out: this phone stops ringing for that account.
export function unregisterAdminPhone() {
  if (!savedToken) return;
  api.removeAdminFcmToken(savedToken).catch(() => {});
  savedToken = null;
}

// The ringing notification was tapped (or opened the app full-screen): calls back
// so the assignment desk opens. Also catches a ring that arrived before the page
// was ready. Returns an unsubscribe function.
export function onNativeRing(callback) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = FcmToken.addListener("ring", ({ bookingId }) => bookingId && callback(bookingId));
  FcmToken.consumePendingRing()
    .then(({ bookingId }) => bookingId && callback(bookingId))
    .catch(() => {});
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
