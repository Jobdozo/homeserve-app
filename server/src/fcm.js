// Firebase Cloud Messaging — the delivery channel for the native Android
// app's TikdumMessagingService (see provider-app/android's custom service),
// which is what makes a real full-screen, DND-bypassing ringing notification
// possible. Web Push (see push.js) can't do that even in principle, since a
// service worker has no access to Android's notification-channel APIs — this
// is entirely separate infrastructure, not a replacement for push.js.
const { getApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const jsonStore = require("./jsonStore");

function key(role, id) {
  return `${role}:${id}`;
}

function saveToken(role, id, token) {
  const all = jsonStore.readAll("fcmTokens");
  const k = key(role, id);
  const existing = all.find((t) => t.key === k && t.token === token);
  if (existing) return existing;
  // A device re-registering with a new token replaces its old one rather
  // than accumulating duplicates — tokens rotate periodically by design.
  const stale = all.filter((t) => t.key === k && t.token !== token);
  stale.forEach((t) => jsonStore.remove("fcmTokens", t.id));
  return jsonStore.insert("fcmTokens", { key: k, token });
}

function removeToken(token) {
  const all = jsonStore.readAll("fcmTokens");
  const match = all.find((t) => t.token === token);
  if (match) jsonStore.remove("fcmTokens", match.id);
}

// data values must all be strings — FCM's data payload doesn't accept any
// other type, unlike a regular JS object.
function toStringData(payload) {
  return Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v == null ? "" : String(v)]));
}

// Provider app versions up to 3.20 only handle the "booking:created" ring in
// their own code and drop every other data message, so announcements and
// other updates never showed. Adding a "notification" block makes Android
// itself show those while the app is in the background (no app code runs).
// Never use it for the ring: that would bypass the full-screen ringing
// notification, which only works through onMessageReceived.
const PROVIDER_UPDATES_CHANNEL = "tikdum_updates"; // created by the provider app from 3.21; older ones fall back to the default channel
function displayFor(role, data) {
  if (role !== "provider" || data.type === "booking:created" || !data.title) return null;
  return {
    notification: { title: String(data.title).slice(0, 200), body: String(data.body || "").slice(0, 1000) },
    android: { notification: { channelId: PROVIDER_UPDATES_CHANNEL, icon: "ic_launcher_foreground", color: "#634AE0" } },
  };
}

async function sendToDevices(role, id, data) {
  const all = jsonStore.readAll("fcmTokens");
  const mine = all.filter((t) => t.key === key(role, id));
  if (mine.length === 0) return;
  const messaging = getMessaging(getApp());
  const display = displayFor(role, data);
  await Promise.all(
    mine.map(async (t) => {
      try {
        await messaging.send({
          token: t.token,
          data: toStringData(data),
          ...(display ? { notification: display.notification } : {}),
          android: { priority: "high", ...(display ? display.android : {}) },
        });
      } catch (e) {
        // registration-token-not-registered means the app was uninstalled
        // or the token rotated without us hearing about it — drop it.
        if (e.code === "messaging/registration-token-not-registered") {
          jsonStore.remove("fcmTokens", t.id);
        } else {
          console.error("FCM send failed", e.code || e.message);
        }
      }
    })
  );
}

module.exports = { saveToken, removeToken, sendToDevices, displayFor };
