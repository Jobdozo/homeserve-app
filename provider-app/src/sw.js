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
// only reaches an app that's already running. A system notification (with
// vibration + the device's default sound) is the only alert the web
// platform lets a page trigger while it isn't running — our own custom
// ringtone is JS, so it can only play once the app's code is actually
// executing again. ----
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Tikdum Pro", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

      // Wake every open tab immediately — a tab that's merely backgrounded
      // (not closed) may still be running, but its socket connection is
      // very likely dead, so it never learned about this booking on its
      // own. This is what makes the real ringtone/overlay fire on tap
      // instead of silently opening to nothing.
      for (const client of allClients) {
        client.postMessage({ type: "tikdum-push", bookingId: data.bookingId, pushType: data.type });
      }

      // If a tab is already open AND visible, it's already ringing itself
      // via the socket/postMessage path above — a second OS notification
      // on top of that would just be noise, so skip it.
      const hasVisibleClient = allClients.some((c) => c.visibilityState === "visible");
      if (hasVisibleClient) return;

      await self.registration.showNotification(data.title || "New booking request", {
        body: data.body || "",
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        vibrate: [300, 150, 300, 150, 300, 150, 300],
        requireInteraction: true,
        silent: false,
        renotify: true,
        tag: data.bookingId ? `booking-${data.bookingId}` : undefined,
        data: { bookingId: data.bookingId, type: data.type },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const bookingId = event.notification.data?.bookingId;
  const path = bookingId ? `/#/requests/${bookingId}` : "/#/requests";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          // The push handler already tried this, but resend in case this
          // client only just (re)connected and missed it.
          client.postMessage({ type: "tikdum-push", bookingId });
          client.navigate(path);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
