// Dispatch ranking: when a booking moves on (the provider declined it, missed the
// ring, or handed it back) every eligible provider passes the same visibility
// rules as before (store.providerVisibilityIssues). This only decides who to
// ring FIRST among them, instead of whoever the database happened to list first.
//
// Points (higher is better), each with a reason a person can read:
//   online now ........ up to 25   (seen in the app in the last 5 / 30 min / 6 h)
//   accepts requests .. up to 30   (accepted ÷ asked over the last 60 days;
//                                   a provider asked fewer than 3 times gets 15)
//   rating ............ up to 15   (★3 or less = 0, ★5 = 15; no rating yet = 8)
//   free to take it ... up to 15   (0 open jobs = 15, 1 = 10, 2 = 5)
//   fairness .......... up to 10   (no requests yet today = 10, one = 5)
//   open complaints ... -10 each, at most -20
// Plain functions of their inputs (tested in test/dispatchRank.test.js); store.js
// gathers the data.
const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 60;
const MIN_ASKED = 3;
const ACCEPTED = new Set(["Accepted", "In Progress", "Completed"]);
const IST_MS = 5.5 * 3600 * 1000;
const istDay = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Per-provider counts from recent bookings, recorded declines/timeouts and complaints.
function buildStats({ bookings = [], declines = [], complaints = [], now = Date.now() }) {
  const since = now - WINDOW_DAYS * DAY;
  const today = istDay(now);
  const by = {};
  const get = (id) => (by[id] = by[id] || { accepted: 0, declined: 0, timedOut: 0, today: 0, openComplaints: 0 });
  for (const b of bookings) {
    const t = Date.parse(b.createdAt);
    if (!b.providerId || !Number.isFinite(t)) continue;
    if (istDay(t) === today) get(b.providerId).today++;
    if (t >= since && ACCEPTED.has(b.status)) get(b.providerId).accepted++;
  }
  for (const d of declines) {
    const t = Date.parse(d.at);
    if (!d.providerId || !(t >= since)) continue;
    if (d.kind === "timeout") get(d.providerId).timedOut++;
    else get(d.providerId).declined++;
  }
  for (const c of complaints) {
    if (!c.providerId || ["resolved", "closed"].includes(String(c.status || "").toLowerCase())) continue;
    const t = Date.parse(c.createdAt);
    if (Number.isFinite(t) && t < since) continue;
    get(c.providerId).openComplaints++;
  }
  return by;
}

function agoText(ms) {
  if (ms < 60 * 1000) return "just now";
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60000)} min ago`;
  return `${Math.max(1, Math.round(ms / 3600000))} h ago`;
}

// One provider's points and the reasons behind them.
function scoreProvider({ stat, rating = 0, openJobs = 0, lastSeenMs = null, now = Date.now() } = {}) {
  const s = { accepted: 0, declined: 0, timedOut: 0, today: 0, openComplaints: 0, ...(stat || {}) };
  const reasons = [];
  let points = 0;

  const ago = lastSeenMs ? Math.max(0, now - lastSeenMs) : null;
  if (ago !== null && ago <= 5 * 60 * 1000) points += 25;
  else if (ago !== null && ago <= 30 * 60 * 1000) points += 15;
  else if (ago !== null && ago <= 6 * 3600 * 1000) points += 5;
  reasons.push(ago === null ? "not seen in the app recently" : ago <= 5 * 60 * 1000 ? `online ${agoText(ago)}` : `last seen ${agoText(ago)}`);

  const asked = s.accepted + s.declined + s.timedOut;
  if (asked >= MIN_ASKED) {
    const rate = s.accepted / asked;
    points += Math.round(rate * 30);
    reasons.push(`accepts ${Math.round(rate * 100)}% of requests`);
  } else {
    points += 15;
    reasons.push("new — few requests so far");
  }

  const r = Number(rating) || 0;
  if (r > 0) {
    points += Math.round(clamp((r - 3) / 2, 0, 1) * 15);
    reasons.push(`★ ${r}`);
  } else {
    points += 8;
  }

  const open = Math.max(0, Number(openJobs) || 0);
  points += [15, 10, 5][open] ?? 0;
  reasons.push(open ? plural(open, "open job") : "no open jobs");

  points += s.today === 0 ? 10 : s.today === 1 ? 5 : 0;
  reasons.push(s.today ? `${plural(s.today, "request")} today` : "no requests yet today");

  if (s.openComplaints) {
    points -= Math.min(20, 10 * s.openComplaints);
    reasons.push(plural(s.openComplaints, "open complaint"));
  }
  return { score: clamp(points, 0, 100), reasons };
}

// Best first. `inputFor(item)` gives scoreProvider's input; ties keep the cheaper
// price (item.price), then the original order.
function rank(items, inputFor) {
  return items
    .map((item, i) => ({ item, i, match: scoreProvider(inputFor(item)) }))
    .sort((a, b) => b.match.score - a.match.score || (Number(a.item.price) || 0) - (Number(b.item.price) || 0) || a.i - b.i)
    .map(({ item, match }) => ({ ...item, match }));
}

module.exports = { buildStats, scoreProvider, rank, WINDOW_DAYS, MIN_ASKED };
