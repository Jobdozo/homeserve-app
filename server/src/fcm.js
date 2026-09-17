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

async function sendToDevices(role, id, data) {
  const all = jsonStore.readAll("fcmTokens");
  const mine = all.filter((t) => t.key === key(role, id));
  if (mine.length === 0) return;
  const messaging = getMessaging(getApp());
  await Promise.all(
    mine.map(async (t) => {
      try {
        await messaging.send({
          token: t.token,
          data: toStringData(data),
          android: { priority: "high" },
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

module.exports = { saveToken, removeToken, sendToDevices };
