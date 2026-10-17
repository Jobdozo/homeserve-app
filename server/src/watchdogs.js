// What the Provider Quality, Retention and Fraud agents look at (agents/src/
// quality.js, retention.js, fraud.js). Each is a plain function of the data
// (tested in test/watchdogs.test.js); index.js gathers the data and serves them
// at /api/admin/watch/*. Nothing here changes anything — the agents only report
// and propose, and a person decides.
const DAY = 24 * 60 * 60 * 1000;
const last10 = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const at = (b) => Date.parse(b.statusHistory?.Completed || b.createdAt);
const DONE = new Set(["Completed"]);
const FELL_THROUGH = new Set(["Rejected", "Swapped"]); // turned down / handed back after accepting
const isOpenComplaint = (c) => !["resolved", "closed"].includes(String(c.status || "").toLowerCase());

// ---------------------------------------------------------------- provider quality

// Approved providers whose recent work needs a look, worst first.
// ignore: provider ids tagged "test" in Super Admin — their jobs are staff testing.
function providerQuality({ providers = [], bookings = [], declines = [], complaints = [], ignore = new Set(), now = Date.now() }) {
  const out = [];
  for (const p of providers) {
    if ((p.verificationStatus || "pending") !== "approved" || ignore.has(p.id)) continue;
    const mine = bookings.filter((b) => b.providerId === p.id);
    const recent = (days) => (b) => now - at(b) <= days * DAY;
    const issues = [];
    const add = (key, severity, label) => issues.push({ key, severity, label });

    // Ratings: the last 30 days against the 60 before.
    const rated = mine.filter((b) => b.review?.rating && Number.isFinite(at(b)));
    const r30 = rated.filter(recent(30)).map((b) => b.review.rating);
    const rPrev = rated.filter((b) => now - at(b) > 30 * DAY && now - at(b) <= 90 * DAY).map((b) => b.review.rating);
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    if (r30.length >= 3) {
      const a = avg(r30);
      if (a < 3.5) add("rating_low", a < 3 ? "high" : "medium", `Rating ${a.toFixed(1)} over the last 30 days (${r30.length} reviews)`);
      else if (rPrev.length >= 3 && avg(rPrev) - a >= 0.5) add("rating_drop", "medium", `Rating fell to ${a.toFixed(1)} from ${avg(rPrev).toFixed(1)}`);
    }
    const bad = r30.filter((x) => x <= 2).length;
    if (bad >= 2 && !issues.some((i) => i.key === "rating_low")) add("bad_reviews", "medium", `${plural(bad, "review")} of 1–2 stars in 30 days`);

    // Requests: acceptance over 30 days, missed rings over 7.
    const myDeclines = declines.filter((d) => d.providerId === p.id);
    const accepted30 = mine.filter((b) => (b.statusHistory?.Accepted || ["Accepted", "In Progress", "Completed"].includes(b.status)) && recent(30)(b)).length;
    const declined30 = myDeclines.filter((d) => now - Date.parse(d.at) <= 30 * DAY).length;
    const asked = accepted30 + declined30;
    if (asked >= 5 && accepted30 / asked < 0.5) add("low_acceptance", "medium", `Accepted ${accepted30} of ${asked} requests in 30 days (${Math.round((accepted30 / asked) * 100)}%)`);
    const missed7 = myDeclines.filter((d) => d.kind === "timeout" && now - Date.parse(d.at) <= 7 * DAY).length;
    if (missed7 >= 3) add("missed_rings", "medium", `Let ${missed7} requests ring out in 7 days`);

    // Jobs turned down or handed back after accepting.
    const fell = mine.filter((b) => b.statusHistory?.Accepted && FELL_THROUGH.has(b.status) && now - Date.parse(b.statusHistory.Accepted) <= 30 * DAY).length;
    if (fell >= 2) add("handed_back", fell >= 4 ? "high" : "medium", `Dropped ${plural(fell, "job")} after accepting (30 days)`);

    // Complaints.
    const mineC = complaints.filter((c) => c.providerId === p.id);
    const open = mineC.filter(isOpenComplaint).length;
    const c30 = mineC.filter((c) => now - Date.parse(c.createdAt) <= 30 * DAY).length;
    if (c30 >= 3) add("complaints", "high", `${plural(c30, "complaint")} in 30 days${open ? `, ${open} still open` : ""}`);
    else if (open >= 2) add("complaints", "medium", `${open} open complaints`);

    if (!issues.length) continue;
    const severity = issues.some((i) => i.severity === "high") || issues.length >= 3 ? "high" : "medium";
    out.push({ providerId: p.id, name: p.name || "(no name)", phone: p.phone || "", severity, issues, completed30: mine.filter((b) => DONE.has(b.status) && recent(30)(b)).length });
  }
  const rank = { high: 0, medium: 1 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.issues.length - a.issues.length || a.name.localeCompare(b.name));
}

// What a warning to the provider says (proposed for a person to send).
function warningText(row) {
  return `Hello ${row.name.split(" ")[0]}, this is the Tikdum team. We noticed: ${row.issues.map((i) => i.label.toLowerCase()).join("; ")}. Customers choose providers who answer quickly and do careful work — please take care with every job. Reply in the app if something is wrong or you need help.`;
}

// ---------------------------------------------------------------- retention

const SEGMENTS = {
  no_provider: { label: "Couldn't get a provider last time", title: "Sorry we missed you last time", text: "Sorry we couldn't get a professional to you last time. Please try booking again — we'll do our best to find someone quickly." },
  first_timer: { label: "Booked once, never came back", title: "Anything else to fix at home?", text: "Thanks for trying Tikdum! Need anything else fixed at home? Book a verified local professional in a minute." },
  lapsed: { label: "Regular customers who stopped booking", title: "We miss you at Tikdum", text: "It's been a while! Book a trusted local professional on Tikdum — plumbing, electrical, cleaning, repairs and more." },
};

// Customers worth a friendly nudge back, by segment. A customer is in at most one
// segment; anyone with a booking in the last 14 days, or an open one, is left alone.
function retention({ customers = [], bookings = [], now = Date.now() }) {
  const byCustomer = new Map();
  for (const b of bookings) {
    if (!b.customerId) continue;
    if (!byCustomer.has(b.customerId)) byCustomer.set(b.customerId, []);
    byCustomer.get(b.customerId).push(b);
  }
  const segments = { no_provider: [], first_timer: [], lapsed: [] };
  for (const c of customers) {
    const list = (byCustomer.get(c.id) || []).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (!list.length) continue;
    const latest = list[0];
    const sinceLatest = now - Date.parse(latest.createdAt);
    if (list.some((b) => ["Pending", "Accepted", "In Progress"].includes(b.status))) continue;
    if (sinceLatest < 3 * DAY) continue;
    const done = list.filter((b) => DONE.has(b.status));
    const row = { customerId: c.id, name: c.name || "", phone: c.phone || "", lastBookingAt: latest.createdAt, lastService: latest.service?.name || "", completed: done.length };
    // Their latest request ended with nobody taking it (and they haven't tried since).
    if (latest.status === "Rejected" && !latest.statusHistory?.Accepted && sinceLatest <= 21 * DAY) segments.no_provider.push(row);
    else if (sinceLatest < 14 * DAY) continue;
    else if (done.length === 1 && sinceLatest <= 60 * DAY) segments.first_timer.push(row);
    else if (done.length >= 2 && sinceLatest >= 45 * DAY && sinceLatest <= 180 * DAY) segments.lapsed.push(row);
  }
  return Object.entries(SEGMENTS).map(([key, s]) => ({ key, label: s.label, title: s.title, text: s.text, customers: segments[key] }));
}

// An offer worth mentioning: active, not expired, no minimum order.
function usableOffer(offers = [], now = Date.now()) {
  return offers.find((o) => o.active && (!o.expiresAt || Date.parse(o.expiresAt) > now) && !(o.minOrder > 0) && o.discountPercent > 0) || null;
}

// ---------------------------------------------------------------- fraud

// Patterns worth a person's look over the last 30 days. Each flag's id names the
// pattern and who it's about (not the count), so the agent reports it once.
// Flags are suspicions, never proof. ignore: providers tagged "test" — their
// bookings (staff testing) are left out.
function fraud({ bookings = [], providers = [], refundClaims = [], ignore = new Set(), now = Date.now() }) {
  const flags = [];
  const flag = (f) => flags.push(f);
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const recent = bookings.filter((b) => now - Date.parse(b.createdAt) <= 30 * DAY && !ignore.has(b.providerId));
  const ref = (b) => `#${b.ref || b.id}`;

  // 1. A provider booking their own service (customer phone = provider phone).
  const selfBy = new Map();
  for (const b of recent) {
    const p = providerById.get(b.providerId);
    if (p && last10(p.phone) && last10(p.phone) === last10(b.customer?.phone) && b.status !== "Cancelled") selfBy.set(p.id, [...(selfBy.get(p.id) || []), b]);
  }
  for (const [providerId, list] of selfBy) {
    const p = providerById.get(providerId);
    flag({ id: `self:${providerId}`, severity: "critical", title: `Provider ${p.name} booked their own service (${list.length}×)`, detail: `Bookings ${list.map(ref).join(", ")}: the customer's phone is the provider's own number. Check for fake jobs or ratings before paying anything out. If this is your own test account, tag the provider "test" in Super Admin.`, refs: { bookingId: list[0].id, providerId } });
  }

  // 2. The same customer and provider again and again (fake jobs or ratings).
  const pairs = new Map();
  for (const b of recent) {
    if (!DONE.has(b.status) || !b.customerId || !b.providerId || now - at(b) > 14 * DAY) continue;
    const k = `${b.customerId}|${b.providerId}`;
    pairs.set(k, [...(pairs.get(k) || []), b]);
  }
  for (const [k, list] of pairs) {
    if (list.length < 4) continue;
    const [customerId, providerId] = k.split("|");
    const fives = list.filter((b) => b.review?.rating === 5).length;
    const p = providerById.get(providerId);
    flag({ id: `pair:${k}`, severity: fives >= 3 ? "critical" : "warning", title: `${list[0].customer?.name || "One customer"} completed ${list.length} jobs with ${p?.name || "one provider"} in 14 days`, detail: `${fives} of them rated 5★. Could be a loyal customer — or fake jobs to boost ratings or earnings. Bookings: ${list.map(ref).join(", ")}.`, refs: { customerId, providerId } });
  }

  // 3. Customers who claim refunds a lot.
  const claimsBy = new Map();
  for (const c of refundClaims) if (c.customerId && now - Date.parse(c.createdAt) <= 30 * DAY) claimsBy.set(c.customerId, [...(claimsBy.get(c.customerId) || []), c]);
  for (const [customerId, list] of claimsBy) {
    if (list.length < 2) continue;
    const done = recent.filter((b) => b.customerId === customerId && DONE.has(b.status)).length;
    const name = recent.find((b) => b.customerId === customerId)?.customer?.name || "A customer";
    flag({ id: `refunds:${customerId}`, severity: list.length >= 3 ? "critical" : "warning", title: `${name} made ${list.length} refund claims in 30 days`, detail: `${done} completed bookings in the same time. Check the claims together before approving another.`, refs: { customerId } });
  }

  // 4. Many cancellations by one customer in a week (blocking providers' time).
  const cancelsBy = new Map();
  for (const b of recent) if (b.status === "Cancelled" && b.customerId && now - Date.parse(b.cancelledAt || b.createdAt) <= 7 * DAY) cancelsBy.set(b.customerId, [...(cancelsBy.get(b.customerId) || []), b]);
  for (const [customerId, list] of cancelsBy) {
    if (list.length < 4) continue;
    flag({ id: `cancels:${customerId}`, severity: "warning", title: `${list[0].customer?.name || "A customer"} cancelled ${list.length} bookings in 7 days`, detail: `Bookings: ${list.map(ref).join(", ")}. Could be testing, a competitor, or a genuine problem — worth a call.`, refs: { customerId } });
  }

  // 5. Jobs "completed" within minutes of being accepted.
  const fastBy = new Map();
  for (const b of recent) {
    const a = Date.parse(b.statusHistory?.Accepted);
    const c = Date.parse(b.statusHistory?.Completed);
    if (b.status === "Completed" && b.providerId && Number.isFinite(a) && Number.isFinite(c) && c - a >= 0 && c - a <= 5 * 60 * 1000) fastBy.set(b.providerId, [...(fastBy.get(b.providerId) || []), b]);
  }
  for (const [providerId, list] of fastBy) {
    if (list.length < 3) continue;
    flag({ id: `fast:${providerId}`, severity: "warning", title: `${providerById.get(providerId)?.name || "A provider"} marked ${list.length} jobs done within 5 minutes of accepting`, detail: `Bookings: ${list.map(ref).join(", ")}. Real jobs rarely finish that fast — check with the customers.`, refs: { providerId } });
  }

  const rank = { critical: 0, warning: 1 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

module.exports = { providerQuality, warningText, retention, usableOffer, SEGMENTS, fraud };
