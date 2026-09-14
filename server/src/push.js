const webpush = require("web-push");
const jsonStore = require("./jsonStore");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@tikdum.com";

const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications are disabled.");
}

// One provider can have several subscriptions (multiple devices/browsers).
// Keyed by role so this same store can extend to customer push later.
function key(role, id) {
  return `${role}:${id}`;
}

function saveSubscription(role, id, subscription) {
  const all = jsonStore.readAll("pushSubscriptions");
  const k = key(role, id);
  const existing = all.find((s) => s.key === k && s.subscription.endpoint === subscription.endpoint);
  if (existing) return existing;
  return jsonStore.insert("pushSubscriptions", { key: k, subscription });
}

function removeSubscriptionByEndpoint(endpoint) {
  const all = jsonStore.readAll("pushSubscriptions");
  const match = all.find((s) => s.subscription.endpoint === endpoint);
  if (match) jsonStore.remove("pushSubscriptions", match.id);
}

async function sendPush(role, id, payload) {
  if (!configured) return;
  const all = jsonStore.readAll("pushSubscriptions");
  const mine = all.filter((s) => s.key === key(role, id));
  const body = JSON.stringify(payload);
  await Promise.all(
    mine.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, body);
      } catch (e) {
        // 404/410 means the subscription is dead (uninstalled, expired) — drop it.
        if (e.statusCode === 404 || e.statusCode === 410) {
          jsonStore.remove("pushSubscriptions", s.id);
        } else {
          console.error("Push send failed", e.statusCode, e.body);
        }
      }
    })
  );
}

module.exports = { configured, VAPID_PUBLIC_KEY, saveSubscription, removeSubscriptionByEndpoint, sendPush };
