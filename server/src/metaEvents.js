// Meta Conversions API: tells Meta when an ad-driven customer signs up, books and gets a job
// done, so Ads Manager can count real bookings (not just clicks) and optimise for them.
//
//   CompleteRegistration  a new customer account (event_id reg:<customerId>)
//   Schedule              a booking or cart order is placed (event_id order:<orderId|bookingId>:schedule)
//   Purchase              a booking is completed (event_id booking:<id>:purchase), value = its amount
//
// The website's Meta Pixel (local-service-app/src/utils/metaPixel.js) fires the same events
// with the same event_id, so Meta counts each once. Bookings from the Android app are sent as
// action_source "other" (the app has no Meta SDK yet); website ones as "website" with the
// browser's _fbp/_fbc cookies, sent by the site as x-meta-fbp / x-meta-fbc headers.
//
// Only hashed (SHA-256) phone, customer id, PIN code and country are sent — never names,
// addresses or raw numbers. Off until META_PIXEL_ID and META_CAPI_TOKEN are set
// (deploy/set-meta-pixel.sh). META_TEST_EVENT_CODE sends to Events Manager → Test events.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const GRAPH = (process.env.META_GRAPH_URL || "https://graph.facebook.com/v23.0").replace(/\/$/, "");
const SOURCES = "metaBookingSources"; // { id: bookingId, web, fbp, fbc, ip, ua, url, at }
const cfg = () => ({ pixelId: process.env.META_PIXEL_ID || "", token: process.env.META_CAPI_TOKEN || "", testCode: process.env.META_TEST_EVENT_CODE || "" });
const enabled = () => Boolean(cfg().pixelId && cfg().token);
const sha = (s) => crypto.createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");
const stats = { sent: 0, failed: 0, lastError: null, lastAt: null };

// Indian numbers as Meta wants them: digits with the country code, no +.
function normPhone(p) {
  const d = String(p || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  return d.length === 10 ? `91${d}` : d;
}
const pinOf = (line) => (String(line || "").match(/\b\d{6}\b/) || [])[0] || null;
const cookie = (v) => (typeof v === "string" && /^fb\.\d\.\d+\.[\w.-]{1,200}$/.test(v) ? v : null);

// Where a request came from: the website (with Meta's browser ids) or the Android app.
function sourceOf(req, clientIp) {
  const origin = String(req.headers?.origin || "");
  const web = /^https:\/\/(www\.)?tikdum\.com$/i.test(origin);
  const url = String(req.headers?.["x-meta-url"] || "");
  return {
    web,
    fbp: web ? cookie(req.headers?.["x-meta-fbp"]) : null,
    fbc: web ? cookie(req.headers?.["x-meta-fbc"]) : null,
    ip: clientIp || null,
    ua: String(req.headers?.["user-agent"] || "").slice(0, 400) || null,
    url: web && /^https:\/\/(www\.)?tikdum\.com\//i.test(url) ? url.slice(0, 500) : web ? `${origin}/` : null,
  };
}

// One Conversions API event. Pure — tested in test/metaEvents.test.js.
function buildEvent({ name, eventId, time = Date.now(), phone, customerId, pincode, value, contentName, orderId, src = {} }) {
  const user = { country: [sha("in")] };
  const ph = normPhone(phone);
  if (ph) user.ph = [sha(ph)];
  if (customerId) user.external_id = [sha(customerId)];
  if (pincode) user.zp = [sha(pincode)];
  if (src.ip) user.client_ip_address = src.ip;
  if (src.ua) user.client_user_agent = src.ua;
  if (src.fbp) user.fbp = src.fbp;
  if (src.fbc) user.fbc = src.fbc;
  const event = {
    event_name: name,
    event_time: Math.floor(time / 1000),
    event_id: eventId,
    action_source: src.web ? "website" : "other",
    user_data: user,
  };
  if (src.web && src.url) event.event_source_url = src.url;
  const custom = {};
  if (value !== undefined && value !== null) Object.assign(custom, { currency: "INR", value: Math.max(0, Number(value) || 0) });
  if (contentName) custom.content_name = String(contentName).slice(0, 120);
  if (orderId) custom.order_id = String(orderId);
  if (Object.keys(custom).length) event.custom_data = custom;
  return event;
}

async function send(events) {
  if (!enabled() || !events.length) return null;
  const { pixelId, token, testCode } = cfg();
  const body = new URLSearchParams({ data: JSON.stringify(events), access_token: token, ...(testCode ? { test_event_code: testCode } : {}) });
  try {
    const r = await fetch(`${GRAPH}/${pixelId}/events`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) throw new Error(data.error?.message || `HTTP ${r.status}`);
    stats.sent += events.length;
    stats.lastAt = new Date().toISOString();
    return data;
  } catch (e) {
    stats.failed += events.length;
    stats.lastError = `${new Date().toISOString()} ${e.message}`.slice(0, 300);
    console.error("[meta-capi] send failed:", e.message);
    return null;
  }
}

function rememberSource(bookingIds, src) {
  const at = new Date().toISOString();
  for (const id of bookingIds) {
    if (jsonStore.readAll(SOURCES).some((r) => r.id === id)) continue;
    jsonStore.insert(SOURCES, { id, ...src, at });
  }
  // Keep 120 days: long enough for any job to be completed.
  const cutoff = Date.now() - 120 * 86400000;
  const old = jsonStore.readAll(SOURCES).filter((r) => Date.parse(r.at) < cutoff);
  for (const r of old) jsonStore.remove(SOURCES, r.id);
}
const sourceFor = (bookingId) => jsonStore.readAll(SOURCES).find((r) => r.id === bookingId) || {};

// ---- the three moments ----
function registration(customer, src) {
  if (!enabled() || !customer?.id) return;
  send([buildEvent({ name: "CompleteRegistration", eventId: `reg:${customer.id}`, phone: customer.phone, customerId: customer.id, src })]).catch(() => {});
}

function schedule(bookings, src) {
  const list = (bookings || []).filter(Boolean);
  if (!enabled() || !list.length) return;
  rememberSource(list.map((b) => b.id), src);
  const first = list[0];
  const orderId = first.orderId || first.id;
  send([
    buildEvent({
      name: "Schedule",
      eventId: `order:${orderId}:schedule`,
      phone: first.customer?.phone,
      customerId: first.customerId,
      pincode: pinOf(first.address?.line),
      value: list.reduce((s, b) => s + (Number(b.amount) || 0), 0),
      contentName: list.map((b) => b.service?.name).filter(Boolean).join(", "),
      orderId,
      src,
    }),
  ]).catch(() => {});
}

function purchase(booking) {
  if (!enabled() || !booking?.id) return;
  const src = sourceFor(booking.id);
  send([
    buildEvent({
      name: "Purchase",
      eventId: `booking:${booking.id}:purchase`,
      phone: booking.customer?.phone,
      customerId: booking.customerId,
      pincode: pinOf(booking.address?.line),
      value: booking.amount,
      contentName: booking.service?.name,
      orderId: booking.orderId || booking.id,
      src: { web: Boolean(src.web), fbp: src.fbp, fbc: src.fbc, ip: src.ip, ua: src.ua, url: src.url },
    }),
  ]).catch(() => {});
}

const status = () => ({ enabled: enabled(), pixelId: cfg().pixelId || null, testMode: Boolean(cfg().testCode), ...stats });
const pixelId = () => cfg().pixelId || null;

module.exports = { buildEvent, sourceOf, normPhone, registration, schedule, purchase, status, pixelId, send };
