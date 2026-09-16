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
    request.method === "GET" &&
    /\/api\/(bootstrap|categories|services|providers|bookings|notifications|banners)(\/|\?|$)/.test(url.pathname),
  new NetworkFirst({
    cacheName: "tikdum-api-cache",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ---- push notifications: this is what actually reaches a backgrounded or
// fully-closed app — an admin broadcast, a booking status update, or a new
// chat message otherwise only arrives over the live Socket.IO connection,
// which only exists while a tab is open. ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Tikdum", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        client.postMessage({ type: "tikdum-push", bookingId: data.bookingId, pushType: data.type });
      }

      // A tab that's already open and visible will pick this up live over
      // the socket — a second OS notification on top would just be noise.
      const hasVisibleClient = allClients.some((c) => c.visibilityState === "visible");
      if (hasVisibleClient) return;

      await self.registration.showNotification(data.title || "Tikdum", {
        body: data.body || "",
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        vibrate: [200, 100, 200],
        data: { bookingId: data.bookingId, type: data.type },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const bookingId = event.notification.data?.bookingId;
  const type = event.notification.data?.type;
  const path = type === "booking" && bookingId ? `/#/booking/${bookingId}` : "/#/notifications";
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
