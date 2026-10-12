// What the Business app's Insights, Money, Services score, Reviews and Grow
// screens are built from, plus the small records behind them: the provider's
// own offers, replies to reviews, how a customer paid, the unanswered-request
// streak that takes a provider offline, and a log of the online switch.
// Flat-JSON storage (see jsonStore.js); the maths are pure functions taking
// `now` so tests can pin the clock.
const jsonStore = require("./jsonStore");

const DAY = 24 * 60 * 60 * 1000;
const IST_MS = 330 * 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const r0 = (n) => Math.round(Number(n) || 0);

// India runs on IST whatever the server's clock says.
const istDay = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const istHour = (ms) => new Date(ms + IST_MS).getUTCHours();
// Midnight IST of the day `ms` falls in, as a UTC timestamp.
const istMidnight = (ms) => Date.parse(`${istDay(ms)}T00:00:00Z`) - IST_MS;
// Monday 00:00 IST of the week `ms` falls in.
function istWeekStart(ms) {
  const mid = istMidnight(ms);
  const dow = new Date(mid + IST_MS).getUTCDay(); // 0 = Sunday
  return mid - ((dow + 6) % 7) * DAY;
}
const at = (iso) => (iso ? Date.parse(iso) : NaN);
const doneAt = (b) => at(b.statusHistory?.Completed) || at(b.createdAt);

// ---------------------------------------------------------------- unanswered streak & online log

const STREAK = "providerMissStreak";
const ONLINE_LOG = "providerOnlineLog";
const AUTO_OFFLINE_AFTER = 3;

function streakOf(providerId) {
  return jsonStore.readAll(STREAK).find((r) => r.id === providerId)?.count || 0;
}
function setStreak(providerId, count) {
  if (jsonStore.readAll(STREAK).some((r) => r.id === providerId)) jsonStore.update(STREAK, providerId, { count, at: new Date().toISOString() });
  else jsonStore.insert(STREAK, { id: providerId, count, at: new Date().toISOString() });
}
// The provider answered a request (accepted or declined): the streak starts over.
function noteResponse(providerId) {
  if (providerId && streakOf(providerId)) setStreak(providerId, 0);
}
// A request rang out unanswered. Returns true when this one makes it AUTO_OFFLINE_AFTER in a row.
function noteTimeout(providerId) {
  if (!providerId) return false;
  const count = streakOf(providerId) + 1;
  setStreak(providerId, count);
  return count >= AUTO_OFFLINE_AFTER;
}

function logOnline(providerId, accepting, reason = "provider") {
  if (!providerId) return;
  jsonStore.insert(ONLINE_LOG, { providerId, accepting: !!accepting, reason, at: new Date().toISOString() });
  if (accepting) setStreak(providerId, 0);
}
function onlineLogFor(providerId) {
  return jsonStore.readAll(ONLINE_LOG).filter((r) => r.providerId === providerId).sort((a, b) => a.at.localeCompare(b.at));
}
// Why the provider is offline, when the system did it.
function offlineReason(providerId, accepting) {
  if (accepting) return null;
  const last = onlineLogFor(providerId).pop();
  return last && !last.accepting && last.reason === "missed" ? { reason: "missed", at: last.at, count: AUTO_OFFLINE_AFTER } : null;
}

// Share of the last `days` days' working time the Receive Requests switch was on.
// Working time = the schedule's open hours, or 8 AM–8 PM when no hours are set.
function onlineShare({ log = [], schedule, acceptingNow = true, now = Date.now(), days = 7 }) {
  const start = now - days * DAY;
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const windows = [];
  for (let d = istMidnight(start); d < now; d += DAY) {
    const key = DAYS[(new Date(d + IST_MS).getUTCDay() + 6) % 7];
    const row = schedule?.enabled ? schedule.days?.[key] : { open: true, from: "08:00", to: "20:00" };
    if (!row?.open) continue;
    const s = Math.max(d + mins(row.from) * 60000, start);
    const e = Math.min(d + mins(row.to) * 60000, now);
    if (e > s) windows.push([s, e]);
  }
  const total = windows.reduce((n, [s, e]) => n + (e - s), 0);
  if (!total) return { pct: null, offlineHours: 0 };
  // The switch's state at `start` is the last change before it; with no history it is today's state.
  const changes = log.map((r) => ({ t: at(r.at), on: r.accepting })).filter((c) => Number.isFinite(c.t)).sort((a, b) => a.t - b.t);
  const before = changes.filter((c) => c.t <= start).pop();
  let state = before ? before.on : changes.length ? !changes[0].on : acceptingNow;
  const spans = [];
  let cursor = start;
  for (const c of changes.filter((c) => c.t > start && c.t <= now)) {
    if (state) spans.push([cursor, c.t]);
    state = c.on;
    cursor = c.t;
  }
  if (state) spans.push([cursor, now]);
  let on = 0;
  for (const [ws, we] of windows) for (const [s, e] of spans) on += Math.max(0, Math.min(we, e) - Math.max(ws, s));
  return { pct: Math.round((on / total) * 100), offlineHours: Math.round((total - on) / 3600000) };
}

// ---------------------------------------------------------------- how the customer paid

const PAYMENTS = "bookingPayments";
const PAY_METHODS = ["cash", "upi", "other"];
function recordPayment(bookingIds, method) {
  if (!PAY_METHODS.includes(method)) return;
  for (const id of bookingIds) {
    if (jsonStore.readAll(PAYMENTS).some((r) => r.id === id)) jsonStore.update(PAYMENTS, id, { method });
    else jsonStore.insert(PAYMENTS, { id, method, at: new Date().toISOString() });
  }
}
function paymentMap() {
  return new Map(jsonStore.readAll(PAYMENTS).map((r) => [r.id, r.method]));
}

// ---------------------------------------------------------------- replies to reviews

const REPLIES = "reviewReplies";
function replyFor(bookingId) {
  const r = jsonStore.readAll(REPLIES).find((x) => x.id === bookingId);
  return r ? { text: r.text, at: r.at } : null;
}
function replyMap() {
  return new Map(jsonStore.readAll(REPLIES).map((r) => [r.id, { text: r.text, at: r.at }]));
}
function setReply(providerId, booking, text) {
  if (!booking || booking.providerId !== providerId) throw fail(404, "Review not found");
  if (!booking.reviewed) throw fail(400, "This booking has no review yet");
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (clean.length < 2) throw fail(400, "Write a reply first");
  const row = { providerId, text: clean, at: new Date().toISOString() };
  if (jsonStore.readAll(REPLIES).some((r) => r.id === booking.id)) jsonStore.update(REPLIES, booking.id, row);
  else jsonStore.insert(REPLIES, { id: booking.id, ...row });
  return { text: clean, at: row.at };
}

// ---------------------------------------------------------------- the provider's own offers

const OFFERS = "providerOffers";
const MAX_LIVE_OFFERS = 3;

function isLive(o, now = Date.now()) {
  return o.active !== false && !(o.endsAt && at(o.endsAt) < now);
}
// What a provider offer takes off `subtotal` (that provider's part of the cart).
function offerDiscount(o, subtotal) {
  const sub = Math.max(0, Number(subtotal) || 0);
  if (!o || sub <= 0 || (o.minOrder > 0 && sub < o.minOrder)) return 0;
  const raw = o.kind === "flat" ? o.value : (sub * o.value) / 100;
  const capped = o.kind === "percent" && o.maxDiscount > 0 ? Math.min(raw, o.maxDiscount) : raw;
  return Math.min(sub, r0(capped));
}
function describeOffer(o) {
  const what = o.kind === "flat" ? `₹${o.value} off` : `${o.value}% off`;
  const cap = o.kind === "percent" && o.maxDiscount > 0 ? ` up to ₹${o.maxDiscount}` : "";
  const min = o.minOrder > 0 ? ` on ₹${o.minOrder}+` : "";
  return `${what}${cap}${min}${o.audience === "new" ? " · your first booking" : ""}`;
}
function publicOffer(o) {
  return {
    code: o.code, providerId: o.providerId, kind: o.kind, value: o.value, maxDiscount: o.maxDiscount || 0, minOrder: o.minOrder || 0,
    audience: o.audience, endsAt: o.endsAt || null, description: describeOffer(o),
    // older clients read discountPercent; a flat offer has none
    discountPercent: o.kind === "percent" ? o.value : 0,
  };
}
function listProviderOffers(providerId) {
  return jsonStore
    .readAll(OFFERS)
    .filter((o) => o.providerId === providerId)
    .map((o) => ({ ...o, description: describeOffer(o), live: isLive(o), uses: o.uses || 0 }))
    .sort((a, b) => Number(b.live) - Number(a.live) || b.createdAt.localeCompare(a.createdAt));
}
function liveProviderOffers({ providerIds } = {}) {
  const want = providerIds ? new Set(providerIds) : null;
  return jsonStore.readAll(OFFERS).filter((o) => isLive(o) && (!want || want.has(o.providerId))).map(publicOffer);
}
// One more checkout used this offer.
function countOfferUse(id) {
  const o = jsonStore.readAll(OFFERS).find((x) => x.id === id);
  if (o) jsonStore.update(OFFERS, id, { uses: (o.uses || 0) + 1 });
}
function findProviderOffer(code) {
  const c = String(code || "").trim().toUpperCase();
  return c ? jsonStore.readAll(OFFERS).find((o) => o.code === c) || null : null;
}
function makeCode(name, value, taken) {
  const stem = (String(name || "PRO").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "PRO") + String(value);
  let code = stem;
  for (let i = 2; taken.has(code); i++) code = `${stem}${String.fromCharCode(64 + i)}`;
  return code;
}
function createProviderOffer(providerId, providerName, input = {}, globalCodes = []) {
  const kind = input.kind === "flat" ? "flat" : "percent";
  const value = r0(input.value);
  if (kind === "percent" && (value < 5 || value > 50)) throw fail(400, "Choose a discount between 5% and 50%");
  if (kind === "flat" && (value < 20 || value > 2000)) throw fail(400, "Choose an amount between ₹20 and ₹2,000");
  const maxDiscount = kind === "percent" ? Math.max(0, r0(input.maxDiscount)) : 0;
  const minOrder = Math.max(0, r0(input.minOrder));
  if (kind === "flat" && minOrder > 0 && value >= minOrder) throw fail(400, "The minimum booking must be more than the amount off");
  const audience = input.audience === "new" ? "new" : "all";
  let endsAt = null;
  if (input.endsAt) {
    const t = Date.parse(input.endsAt);
    if (!Number.isFinite(t) || t < Date.now()) throw fail(400, "Pick an end date in the future");
    endsAt = new Date(t).toISOString();
  }
  const mine = jsonStore.readAll(OFFERS).filter((o) => o.providerId === providerId && isLive(o));
  if (mine.length >= MAX_LIVE_OFFERS) throw fail(409, `You can run up to ${MAX_LIVE_OFFERS} offers at a time — end one first`);
  const taken = new Set([...jsonStore.readAll(OFFERS).map((o) => o.code), ...globalCodes.map((c) => String(c).toUpperCase())]);
  return jsonStore.insert(OFFERS, {
    providerId, code: makeCode(providerName, value, taken), kind, value, maxDiscount, minOrder, audience, endsAt,
    active: true, createdAt: new Date().toISOString(),
  });
}
function setProviderOfferActive(providerId, id, active) {
  const o = jsonStore.readAll(OFFERS).find((x) => x.id === id && x.providerId === providerId);
  if (!o) throw fail(404, "Offer not found");
  if (active && !isLive({ ...o, active: true })) throw fail(400, "This offer has ended — create a new one");
  if (active && jsonStore.readAll(OFFERS).filter((x) => x.providerId === providerId && x.id !== id && isLive(x)).length >= MAX_LIVE_OFFERS) {
    throw fail(409, `You can run up to ${MAX_LIVE_OFFERS} offers at a time`);
  }
  return jsonStore.update(OFFERS, id, { active: !!active });
}

// ---------------------------------------------------------------- service score

// Each live service earns up to 100: its own photo (not the stock one) 40, a
// description customers can act on (a tagline or what's included) 30, choices
// (option groups) 15, a price near what others charge for the category 15.
function serviceParts(s, medianByCategory) {
  const median = medianByCategory.get(s.categoryId);
  const fair = !median || (s.price >= median * 0.5 && s.price <= median * 1.6);
  return {
    photo: Boolean(s.imageUrl) && !s.imageFromCatalog,
    description: String(s.tagline || "").trim().length >= 20 || (s.includes || []).length >= 2,
    options: Array.isArray(s.options) && s.options.length > 0,
    fairPrice: fair,
  };
}
const partsScore = (p) => (p.photo ? 40 : 0) + (p.description ? 30 : 0) + (p.options ? 15 : 0) + (p.fairPrice ? 15 : 0);
const isLiveService = (s) => !s.status || s.status === "active";

function categoryMedians(services) {
  const by = new Map();
  for (const s of services) if (s.price > 0) (by.get(s.categoryId) || by.set(s.categoryId, []).get(s.categoryId)).push(s.price);
  const out = new Map();
  for (const [k, list] of by) {
    const sorted = list.sort((a, b) => a - b);
    out.set(k, sorted[Math.floor(sorted.length / 2)]);
  }
  return out;
}
function providerScore(services, medians) {
  const live = services.filter(isLiveService);
  if (!live.length) return null;
  return Math.round(live.reduce((n, s) => n + partsScore(serviceParts(s, medians)), 0) / live.length);
}
// Score of the provider at the 90th percentile — "top pros".
function topScore(allServices, medians) {
  const by = new Map();
  for (const s of allServices) if (s.providerId) (by.get(s.providerId) || by.set(s.providerId, []).get(s.providerId)).push(s);
  const scores = [...by.values()].map((list) => providerScore(list, medians)).filter((n) => n !== null).sort((a, b) => a - b);
  if (!scores.length) return null;
  return scores[Math.min(scores.length - 1, Math.floor(scores.length * 0.9))];
}

// ---------------------------------------------------------------- insights

// "10:00 AM - 12:00 PM" → hour the slot ends (24h), or null
function slotEndHour(slot) {
  const m = String(slot || "").match(/[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  const h = Number(m[1]) % 12;
  return (m[3].toUpperCase() === "PM" ? h + 12 : h) + Number(m[2]) / 60;
}
// The slot's end as a timestamp (the booking date is a calendar day in IST).
function slotEndAt(b) {
  const day = String(b.date || "").slice(0, 10);
  const h = slotEndHour(b.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || h === null) return NaN;
  return Date.parse(`${day}T00:00:00Z`) - IST_MS + h * 3600000;
}

function qualityFor({ bookings, declines, from, to }) {
  const inRange = (t) => t >= from && t < to;
  const asked = bookings.filter((b) => inRange(at(b.statusHistory?.Pending || b.createdAt)));
  const accepted = asked.filter((b) => b.statusHistory?.Accepted);
  const ds = declines.filter((d) => inRange(at(d.at)));
  const missed = ds.filter((d) => d.kind === "timeout").length;
  const declined = ds.filter((d) => d.kind !== "timeout").length;
  const requests = accepted.length + missed + declined;
  const waits = accepted
    .map((b) => (at(b.statusHistory.Accepted) - at(b.statusHistory.Pending || b.createdAt)) / 1000)
    .filter((s) => Number.isFinite(s) && s >= 0);
  const started = bookings.filter((b) => inRange(at(b.statusHistory?.["In Progress"])) && Number.isFinite(slotEndAt(b)));
  const onTime = started.filter((b) => at(b.statusHistory["In Progress"]) <= slotEndAt(b)).length;
  const rated = bookings.filter((b) => b.review?.rating && inRange(doneAt(b)));
  return {
    requests,
    missed,
    declined,
    declinedPct: requests ? Math.round((declined / requests) * 100) : 0,
    avgAcceptSec: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    onTimePct: started.length ? Math.round((onTime / started.length) * 100) : null,
    lowRated: rated.filter((b) => b.review.rating <= 2).length,
    avgRating: rated.length ? Number((rated.reduce((n, b) => n + b.review.rating, 0) / rated.length).toFixed(1)) : null,
  };
}

function computeInsights({ bookings = [], declines = [], onlineLog = [], schedule, acceptingNow = true, now = Date.now() }) {
  const today0 = istMidnight(now);
  const completed = bookings.filter((b) => b.status === "Completed");
  const doneToday = completed.filter((b) => doneAt(b) >= today0);
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const b of doneToday) hourly[istHour(doneAt(b))] += b.amount || 0;

  const week0 = now - 7 * DAY;
  const quality = qualityFor({ bookings, declines, from: week0, to: now });
  const prev = qualityFor({ bookings, declines, from: week0 - 7 * DAY, to: week0 });
  const online = onlineShare({ log: onlineLog, schedule, acceptingNow, now });

  // Customers, by their own history with this provider (cancelled visits don't count).
  const byCustomer = new Map();
  for (const b of bookings) {
    if (!b.customerId || ["Cancelled", "Rejected", "Swapped"].includes(b.status)) continue;
    const t = at(b.createdAt);
    const c = byCustomer.get(b.customerId) || { first: t, last: t, count: 0 };
    c.first = Math.min(c.first, t);
    c.last = Math.max(c.last, t);
    c.count += 1;
    byCustomer.set(b.customerId, c);
  }
  let fresh = 0, repeat = 0, quiet = 0;
  for (const c of byCustomer.values()) {
    if (c.first >= now - 30 * DAY) fresh += 1;
    else if (c.last >= now - 60 * DAY) repeat += 1;
    else if (c.last >= now - 365 * DAY) quiet += 1;
  }
  return {
    today: { earned: doneToday.reduce((n, b) => n + (b.amount || 0), 0), jobs: doneToday.length, hourly },
    week: { ...quality, onlinePct: online.pct, offlineHours: online.offlineHours },
    prevWeek: prev,
    customers: { new: fresh, repeat, quiet },
  };
}

// Bookings in the last 60 days per service, for the Services screen and the nudges.
function bookingsPerService(bookings, now = Date.now()) {
  const out = {};
  for (const b of bookings) {
    if (!b.serviceId || ["Cancelled", "Rejected", "Swapped"].includes(b.status)) continue;
    if (at(b.createdAt) < now - 60 * DAY) continue;
    out[b.serviceId] = (out[b.serviceId] || 0) + 1;
  }
  return out;
}

function scoreReport({ myServices = [], allServices = [], bookings = [], now = Date.now() }) {
  const medians = categoryMedians(allServices);
  const counts = bookingsPerService(bookings, now);
  const live = myServices.filter(isLiveService);
  const parts = live.map((s) => ({ id: s.id, name: s.name, price: s.price, bookings60: counts[s.id] || 0, ...serviceParts(s, medians) }));
  const noPhoto = parts.filter((p) => !p.photo).sort((a, b) => b.bookings60 - a.bookings60);
  const old = (s) => !s.createdAt || at(s.createdAt) < now - 60 * DAY;
  const unbooked = live.filter((s) => !counts[s.id] && old(s)).map((s) => ({ id: s.id, name: s.name, categoryId: s.categoryId }));
  return {
    score: providerScore(live, medians),
    top: topScore(allServices, medians),
    photoGain: live.length ? Math.round((noPhoto.length * 40) / live.length) : 0,
    noPhoto: noPhoto.slice(0, 3),
    noDescription: parts.filter((p) => !p.description).length,
    noOptions: parts.filter((p) => !p.options).length,
    unbooked,
    bookings60: counts,
  };
}

// ---------------------------------------------------------------- money

// Monday–Sunday weeks, newest first: what customers paid, the fees, what's kept.
function weeklyCycles({ bookings = [], fees = new Map(), payments = new Map(), now = Date.now(), weeks = 8 }) {
  const completed = bookings.filter((b) => b.status === "Completed");
  const out = [];
  let start = istWeekStart(now);
  for (let i = 0; i < weeks; i++, start -= 7 * DAY) {
    const end = start + 7 * DAY;
    const list = completed.filter((b) => doneAt(b) >= start && doneAt(b) < end);
    const sum = (f) => list.reduce((n, b) => n + f(b), 0);
    const collected = sum((b) => b.amount || 0);
    const fee = sum((b) => fees.get(b.id) || 0);
    out.push({
      from: istDay(start),
      to: istDay(end - DAY),
      jobs: list.length,
      collected,
      cash: sum((b) => (payments.get(b.id) === "cash" ? b.amount || 0 : 0)),
      upi: sum((b) => (payments.get(b.id) === "upi" ? b.amount || 0 : 0)),
      unmarked: sum((b) => (payments.has(b.id) ? 0 : b.amount || 0)),
      fees: Math.round(fee * 100) / 100,
      kept: Math.round((collected - fee) * 100) / 100,
    });
  }
  return out;
}

function walletHistory(wallet, { feeLabels = new Map(), limit = 30 } = {}) {
  const rows = [
    ...(wallet.recharges || []).map((r) => ({ kind: "recharge", amount: r.amount, at: r.at, label: r.note || "Money added" })),
    ...(wallet.deductions || []).map((d) => ({
      kind: d.reason === "commission" ? "fee" : d.reason || "charge",
      amount: -d.amount,
      at: d.at,
      label: d.reason === "commission" ? "Tikdum fee" : d.reason === "ad_click" ? "Ad click" : "Charge",
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// Fee invoices grouped by month (IST), newest first.
function invoiceMonths(invoices = []) {
  const by = new Map();
  for (const i of invoices) {
    const month = istDay(at(i.date)).slice(0, 7);
    const m = by.get(month) || { month, count: 0, taxable: 0, gst: 0, total: 0 };
    const sign = i.type === "credit_note" ? -1 : 1;
    m.count += 1;
    m.taxable += sign * (i.taxableValue || 0);
    m.gst += sign * ((i.cgst || 0) + (i.sgst || 0) + (i.igst || 0));
    m.total += sign * (i.total || 0);
    by.set(month, m);
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return [...by.values()].map((m) => ({ ...m, taxable: r2(m.taxable), gst: r2(m.gst), total: r2(m.total) })).sort((a, b) => b.month.localeCompare(a.month));
}

module.exports = {
  AUTO_OFFLINE_AFTER,
  MAX_LIVE_OFFERS,
  istDay,
  istWeekStart,
  noteResponse,
  noteTimeout,
  streakOf,
  logOnline,
  onlineLogFor,
  offlineReason,
  onlineShare,
  recordPayment,
  paymentMap,
  replyFor,
  replyMap,
  setReply,
  offerDiscount,
  describeOffer,
  publicOffer,
  listProviderOffers,
  liveProviderOffers,
  findProviderOffer,
  countOfferUse,
  isLive,
  createProviderOffer,
  setProviderOfferActive,
  serviceParts,
  categoryMedians,
  providerScore,
  topScore,
  slotEndAt,
  qualityFor,
  computeInsights,
  bookingsPerService,
  scoreReport,
  weeklyCycles,
  walletHistory,
  invoiceMonths,
};
