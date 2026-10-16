// Getting reviews from real customers, and showing them.
//
// - A rating counts only for a completed booking, once (index.js uses canReview).
// - Each completed booking gets a personal link, tikdum.com/rate/<token>: the customer rates
//   with one tap, without signing in. The token is the booking id signed with the server's
//   secret, so it can't be guessed or changed to rate someone else's booking.
// - Some hours after completion, if there's still no rating, one WhatsApp message with that
//   link goes to the customer (Super Admin → Settings → Communication can switch it off or
//   change the delay). Never twice for the same booking.
// - Recent real reviews (first name and initial only) feed the city pages and the providers'
//   structured data for search.
//
// The rules are plain functions of their inputs (tested in test/reviewRequests.test.js).
const crypto = require("crypto");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LINK_DAYS = 60; // a review link works this long after the job was completed
const REQUEST_WITHIN_DAYS = 7; // older completed jobs are never messaged

const secret = () => `${process.env.JWT_SECRET || "dev-secret"}:review-link`;
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sign = (id) => b64url(crypto.createHmac("sha256", secret()).update(String(id)).digest()).slice(0, 22);

function tokenFor(bookingId) {
  return `${b64url(String(bookingId))}.${sign(bookingId)}`;
}

// The booking id a link stands for, or null if the link was altered.
function bookingIdFromToken(token) {
  const [idPart, sig] = String(token || "").split(".");
  if (!idPart || !sig) return null;
  let id;
  try {
    id = Buffer.from(idPart.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[\w-]{6,64}$/.test(id)) return null;
  const want = sign(id);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  return id;
}

const completedAt = (b) => Date.parse(b?.statusHistory?.Completed || "") || null;

// Can this booking be rated now? { ok } or { ok: false, reason } (shown to the customer).
function canReview(b, now = Date.now(), { viaLink = false } = {}) {
  if (!b) return { ok: false, reason: "Booking not found" };
  if (b.reviewed || b.review?.rating) return { ok: false, reason: "This booking has already been rated — thank you!", already: true };
  if (b.status !== "Completed") return { ok: false, reason: "You can rate a booking once the job is completed" };
  if (viaLink) {
    const done = completedAt(b);
    if (done && now - done > LINK_DAYS * DAY) return { ok: false, reason: "This rating link has expired" };
  }
  return { ok: true };
}

function cleanReview({ rating, text } = {}) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) throw Object.assign(new Error("Pick 1 to 5 stars"), { status: 400 });
  return { rating: r, text: String(text || "").trim().slice(0, 1000) };
}

// A customer's first name to greet them with, or null for the placeholder names an account
// starts with ("New Customer") — "Hello New," reads badly.
const PLACEHOLDER = new Set(["new", "customer", "user", "guest", "tikdum"]);
function firstNameOf(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first && !PLACEHOLDER.has(first.toLowerCase()) && /\p{L}/u.test(first) ? first : null;
}

// "Rahul Sharma" -> "Rahul S."
function shortName(name) {
  if (!firstNameOf(name)) return "A customer";
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A customer";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

// Completed, unrated bookings whose WhatsApp request is due now and hasn't been sent.
function dueForRequest(bookings, sentIds, { delayHours = 2 } = {}, now = Date.now()) {
  const sent = new Set(sentIds);
  return bookings.filter((b) => {
    if (b.status !== "Completed" || b.reviewed || sent.has(b.id)) return false;
    const done = completedAt(b);
    if (!done) return false;
    const age = now - done;
    return age >= delayHours * HOUR && age <= REQUEST_WITHIN_DAYS * DAY && Boolean(b.customer?.phone);
  });
}

function requestMessage(b, siteUrl = "https://tikdum.com") {
  const service = b.service?.name || "your service";
  const provider = b.provider?.businessName || b.provider?.name;
  // A whole sentence: it goes inside the approved template ("Hello {{1}}, …{{2}}…").
  return `How was your ${service}${provider ? ` with ${provider}` : ""}? Please rate it in one tap (takes 10 seconds): ${siteUrl}/rate/${tokenFor(b.id)} — it helps other families in your area choose.`;
}

// Real reviews for public pages: newest first, first name + initial, only ones with words.
function publicReviews(bookings, { limit = 200 } = {}) {
  return bookings
    .filter((b) => b.reviewed && b.review?.rating && String(b.review.text || "").trim().length >= 3)
    .map((b) => ({
      bookingId: b.id,
      rating: Number(b.review.rating),
      text: String(b.review.text).trim().slice(0, 400),
      name: shortName(b.customer?.name),
      at: b.statusHistory?.Completed || b.createdAt || null,
      service: b.service?.name || null,
      serviceId: b.serviceId || b.service?.id || null,
      categoryId: b.service?.categoryId || b.categoryId || null,
      providerId: b.providerId || null,
    }))
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, limit);
}

// ---------------------------------------------------------------- the job

let running = false;
async function runJob({ store, jsonStore, whatsapp, now = Date.now() } = {}) {
  const settings = store.getSettings();
  if (running || settings.reviewRequestWhatsApp === false) return { sent: 0 };
  running = true;
  try {
    const sentIds = jsonStore.readAll("reviewRequests").map((r) => r.id);
    const bookings = await store.listBookings({});
    const due = dueForRequest(bookings, sentIds, { delayHours: settings.reviewRequestDelayHours ?? 2 }, now);
    if (!due.length) return { sent: 0 };
    const providers = new Map((await store.listProviders()).map((p) => [p.id, p]));
    let sent = 0;
    for (const b of due) {
      // Record first: a slow or failed send is never retried into a second message.
      jsonStore.insert("reviewRequests", { id: b.id, at: new Date(now).toISOString(), channel: "whatsapp" });
      const message = requestMessage({ ...b, provider: providers.get(b.providerId) });
      const result = await whatsapp(b.customer.phone, { name: firstNameOf(b.customer?.name) || "there", message }).catch((e) => ({ ok: false, error: e.message }));
      if (result?.ok === false) jsonStore.update("reviewRequests", b.id, { failed: String(result.error || "send failed").slice(0, 200) });
      else sent++;
    }
    return { sent };
  } finally {
    running = false;
  }
}

// Recent real reviews for the public pages, refreshed every 10 minutes.
let cache = { at: 0, list: [] };
async function recentReviews(store) {
  if (Date.now() - cache.at < 10 * 60 * 1000) return cache.list;
  try {
    const bookings = await store.listBookings({});
    const services = new Map((await store.listServices({})).map((s) => [s.id, s]));
    const withCategory = bookings.map((b) => ({ ...b, service: { ...(b.service || {}), categoryId: services.get(b.serviceId || b.service?.id)?.categoryId || b.service?.categoryId } }));
    cache = { at: Date.now(), list: publicReviews(withCategory) };
  } catch {
    cache.at = Date.now() - 9 * 60 * 1000; // keep what we had; try again in a minute
  }
  return cache.list;
}

module.exports = { tokenFor, bookingIdFromToken, canReview, cleanReview, shortName, firstNameOf, dueForRequest, requestMessage, publicReviews, runJob, recentReviews, LINK_DAYS };
