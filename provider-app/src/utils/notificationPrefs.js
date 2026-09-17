// Per-device notification preferences — deliberately client-only (localStorage),
// not server-persisted. Muting a type here filters it out of the in-app
// notification feed as it arrives over the socket, so this is a real,
// functioning setting rather than a placeholder toggle.
const KEY = "tikdum-provider-notification-prefs-v1";

export const NOTIFICATION_TYPES = [
  { type: "booking", label: "New Booking Requests", description: "When a customer requests a service" },
  { type: "message", label: "Messages", description: "New chat messages from customers" },
  { type: "review", label: "Reviews", description: "When a customer leaves a review" },
];

// ringVolume/vibrate control the incoming-request ringing overlay (see
// RingingOverlay + utils/ringtone) — only client-side settings, since that
// overlay only ever runs while this device's copy of the app is open.
const DEFAULTS = {
  ...Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t.type, true])),
  ringVolume: 0.8,
  vibrate: true,
};

export function loadNotificationPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    // ignore corrupt storage
  }
  return { ...DEFAULTS };
}

export function saveNotificationPrefs(prefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
