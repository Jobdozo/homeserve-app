import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

self.skipWaiting();
clientsClaim();

// vite-plugin-pwa (injectManifest strategy) replaces this with the real
// precache list at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

registerRoute(
  ({ url, request }) =>
    request.method === "GET" && /\/api\/(providers|services|bookings|notifications)(\/|\?|$)/.test(url.pathname),
  new NetworkFirst({
    cacheName: "tikdum-pro-api-cache",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ---- push notifications: this is what actually wakes a backgrounded or
// fully-closed app for a new booking request — the Socket.IO event alone
// only reaches an app that's already running. ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Tikdum Pro", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "New booking request";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    tag: data.bookingId ? `booking-${data.bookingId}` : undefined,
    data: { bookingId: data.bookingId, type: data.type },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const bookingId = event.notification.data?.bookingId;
  const path = bookingId ? `/#/requests/${bookingId}` : "/#/requests";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(path);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
