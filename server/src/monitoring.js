// Live Service Provider Monitoring: real-time provider status board, order
// activity list and downloadable reports, all derived from existing data
// (bookings, providers, coverage, wallet, capacity) plus a presence heartbeat.
const store = require("./store");
const jsonStore = require("./jsonStore");

// ---- presence -------------------------------------------------------------
// A provider counts as Online while their app is talking to the server: every
// authenticated provider request is a heartbeat (the app polls every ~30s
// while open), so there's no separate client change to ship. "Last seen" is
// persisted (throttled) so it survives a server restart; Online itself is
// in-memory only, so after a restart everyone is Offline until they next call.
const ONLINE_WINDOW_MS = 90 * 1000;
const PERSIST_EVERY_MS = 60 * 1000;
const lastSeen = new Map();
const lastPersisted = new Map();

function touchProvider(id) {
  if (!id) return;
  const now = Date.now();
  lastSeen.set(id, now);
  if (now - (lastPersisted.get(id) || 0) < PERSIST_EVERY_MS) return;
  lastPersisted.set(id, now);
  try {
    const at = new Date(now).toISOString();
    if (!jsonStore.update("providerPresence", id, { lastSeenAt: at })) {
      jsonStore.insert("providerPresence", { id, lastSeenAt: at });
    }
  } catch (e) {
    console.error("presence persist failed", e);
  }
}

// ---- helpers --------------------------------------------------------------
const IST_MS = 5.5 * 60 * 60 * 1000;
const istDay = (iso) => (iso ? new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10) : null);
const todayIst = () => istDay(new Date().toISOString());
const addDays = (day, n) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const pinOf = (text) => (String(text || "").match(/\b\d{6}\b/) || [])[0] || "";
const lc = (v) => String(v || "").toLowerCase();

const OPEN_PENDING = ["Pending"];
const OPEN_ACTIVE = ["Accepted", "In Progress"];

// Order-level statuses a monitoring "status" filter can mean, and provider
// flags for the rest.
const ORDER_STATUS_FILTERS = {
  new_order: ["Pending"],
  in_progress: ["Accepted", "In Progress"],
  completed: ["Completed"],
  rejected: ["Rejected"],
};

function eventDays(b) {
  const days = new Set([istDay(b.createdAt)]);
  for (const at of Object.values(b.statusHistory || {})) days.add(istDay(at));
  if (b.cancelledAt) days.add(istDay(b.cancelledAt));
  days.delete(null);
  return days;
}

async function loadContext() {
  const [providers, bookings, services, categories, capacities] = await Promise.all([
    store.listProviders(),
    store.listBookings(),
    store.listServices(),
    store.listCategories(),
    store.getAllProviderCapacities(),
  ]);
  const presence = new Map(jsonStore.readAll("providerPresence").map((r) => [r.id, r.lastSeenAt]));
  return {
    providers,
    bookings,
    services,
    categories,
    capacities,
    presence,
    feeCtx: { overrides: store.listFeeOverrides(), ledger: store.getFeeLedger() },
    settings: store.getSettings(),
    catName: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    provById: new Map(providers.map((p) => [p.id, p])),
  };
}

function normalizeFilters(q = {}) {
  const today = todayIst();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || "") ? q.from : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || "") ? q.to : from > today ? from : today;
  return {
    provider: String(q.provider || "").trim(),
    pin: String(q.pin || "").trim(),
    area: String(q.area || "").trim(),
    serviceId: String(q.serviceId || "").trim(),
    categoryId: String(q.categoryId || "").trim(),
    status: String(q.status || "").trim(),
    orderId: String(q.orderId || "").trim(),
    from: from <= to ? from : to,
    to: from <= to ? to : from,
  };
}

// One flat, filter-ready row per order.
function toOrderRow(b, ctx) {
  const p = ctx.provById.get(b.providerId);
  const address = b.address?.line || "";
  return {
    id: b.id,
    ref: b.ref || "",
    orderRef: b.orderId || "",
    providerId: b.providerId,
    providerName: p?.name || "—",
    customerName: b.customer?.name || "—",
    serviceId: b.serviceId,
    serviceName: b.service?.name || "—",
    categoryId: b.service?.categoryId || "",
    categoryName: ctx.catName[b.service?.categoryId] || b.service?.categoryId || "",
    pin: pinOf(address),
    address,
    status: b.status,
    amount: b.amount,
    fee: b.status === "Completed" ? store.bookingCommunicationFee(b, ctx.settings, ctx.feeCtx) : 0,
    createdAt: b.createdAt,
    acceptedAt: b.statusHistory?.Accepted || "",
    completedAt: b.statusHistory?.Completed || "",
    rejectedAt: b.statusHistory?.Rejected || "",
    cancelledAt: b.cancelledAt || b.statusHistory?.Cancelled || "",
    days: eventDays(b),
  };
}

function orderMatches(o, f, { withStatus = true, withDate = true } = {}) {
  if (f.orderId && ![o.ref, o.id, o.orderRef].some((v) => lc(v).includes(lc(f.orderId)))) return false;
  if (f.pin && o.pin !== f.pin) return false;
  if (f.area && !lc(o.address).includes(lc(f.area))) return false;
  if (f.serviceId && o.serviceId !== f.serviceId) return false;
  if (f.categoryId && o.categoryId !== f.categoryId) return false;
  if (withStatus && ORDER_STATUS_FILTERS[f.status] && !ORDER_STATUS_FILTERS[f.status].includes(o.status)) return false;
  if (withDate) {
    let hit = false;
    for (const d of o.days) if (d >= f.from && d <= f.to) hit = true;
    if (!hit) return false;
  }
  return true;
}

const hasOrderFilter = (f) => Boolean(f.orderId || f.pin || f.area || f.serviceId || f.categoryId);

async function build(query) {
  const f = normalizeFilters(query);
  const ctx = await loadContext();
  const now = Date.now();

  const allOrders = ctx.bookings.map((b) => toOrderRow(b, ctx));
  const svcByProvider = new Map();
  for (const s of ctx.services) {
    if (!svcByProvider.has(s.providerId)) svcByProvider.set(s.providerId, []);
    svcByProvider.get(s.providerId).push(s);
  }

  const inRange = allOrders.filter((o) => orderMatches(o, f, { withStatus: false }));
  const inRangeByProvider = new Map();
  for (const o of inRange) {
    if (!inRangeByProvider.has(o.providerId)) inRangeByProvider.set(o.providerId, []);
    inRangeByProvider.get(o.providerId).push(o);
  }
  // Live (not date-bound) workload, still narrowed by the order filters.
  const liveByProvider = new Map();
  for (const o of allOrders) {
    if (![...OPEN_PENDING, ...OPEN_ACTIVE].includes(o.status)) continue;
    if (!orderMatches(o, f, { withStatus: false, withDate: false })) continue;
    if (!liveByProvider.has(o.providerId)) liveByProvider.set(o.providerId, []);
    liveByProvider.get(o.providerId).push(o);
  }

  const q = lc(f.provider);
  const rows = [];
  for (const p of ctx.providers) {
    const coverage = store.getProviderCoverage(p.id);
    const svcs = svcByProvider.get(p.id) || [];
    const mine = inRangeByProvider.get(p.id) || [];
    const live = liveByProvider.get(p.id) || [];

    // Provider-level filters: match the provider's profile, or (for the
    // order-derived ones) any of the orders in scope.
    if (q && !(lc(p.name).includes(q) || lc(p.businessName).includes(q) || lc(p.phone).includes(q) || p.id === f.provider)) continue;
    if (f.pin && !(coverage.pincodes || []).includes(f.pin) && mine.length + live.length === 0) continue;
    if (f.area && !lc(p.serviceArea).includes(lc(f.area)) && mine.length + live.length === 0) continue;
    if (f.serviceId && !svcs.some((s) => s.id === f.serviceId) && mine.length + live.length === 0) continue;
    if (f.categoryId && !svcs.some((s) => s.categoryId === f.categoryId) && lc(p.category) !== lc(f.categoryId) && mine.length + live.length === 0) continue;
    if (f.orderId && mine.length + live.length === 0) continue;

    const seenMs = lastSeen.get(p.id);
    const online = Boolean(seenMs && now - seenMs < ONLINE_WINDOW_MS);
    const lastSeenAt = seenMs ? new Date(seenMs).toISOString() : ctx.presence.get(p.id) || null;

    const cap = ctx.capacities[p.id];
    let unavailableReason = null;
    if (p.verificationStatus && p.verificationStatus !== "approved") unavailableReason = `Verification ${p.verificationStatus}`;
    else if (!coverage.acceptingRequests) unavailableReason = "Requests switched off";
    else if (store.isProviderSuspended(p.id)) unavailableReason = "Wallet empty — paused";
    else if (cap?.restricted) unavailableReason = "At open-request limit";

    const count = (status) => mine.filter((o) => o.status === status).length;
    const newOrders = live.filter((o) => OPEN_PENDING.includes(o.status)).length;
    const inProgress = live.filter((o) => OPEN_ACTIVE.includes(o.status)).length;
    const busy = Boolean(unavailableReason);
    const status = newOrders > 0 ? "new_order" : inProgress > 0 ? "in_progress" : busy ? "busy" : online ? "waiting" : "offline";

    const completed = count("Completed");
    const rejected = count("Rejected");
    const row = {
      id: p.id,
      name: p.name,
      businessName: p.businessName || "",
      phone: p.phone || "",
      category: p.category || "",
      serviceArea: p.serviceArea || "",
      pincodes: coverage.pincodes || [],
      serveAllAreas: Boolean(coverage.serveAllAreas),
      services: svcs.map((s) => s.name),
      online,
      lastSeenAt,
      status,
      unavailableReason,
      busy,
      newOrders,
      inProgress,
      completed,
      rejected,
      cancelled: count("Cancelled"),
      total: mine.length,
      completedValue: mine.filter((o) => o.status === "Completed").reduce((n, o) => n + o.amount, 0),
      fee: mine.reduce((n, o) => n + o.fee, 0),
      responseRate: p.responseRate ?? 100,
      walletBalance: store.getWallet(p.id).balance,
      openOrders: live.slice(0, 5).map((o) => ({ id: o.id, ref: o.ref, service: o.serviceName, status: o.status, createdAt: o.createdAt })),
    };
    rows.push(row);
  }

  // Provider-side status filter.
  const flag = {
    online: (r) => r.online,
    offline: (r) => !r.online,
    waiting: (r) => r.status === "waiting",
    new_order: (r) => r.newOrders > 0,
    in_progress: (r) => r.inProgress > 0,
    completed: (r) => r.completed > 0,
    rejected: (r) => r.rejected > 0,
    busy: (r) => r.busy,
  };
  const summary = {
    total: rows.length,
    online: rows.filter(flag.online).length,
    offline: rows.filter(flag.offline).length,
    waiting: rows.filter(flag.waiting).length,
    new_order: rows.filter(flag.new_order).length,
    in_progress: rows.filter(flag.in_progress).length,
    completed: rows.filter(flag.completed).length,
    rejected: rows.filter(flag.rejected).length,
    busy: rows.filter(flag.busy).length,
  };
  const providers = (f.status && flag[f.status] ? rows.filter(flag[f.status]) : rows).sort(
    (a, b) => b.newOrders - a.newOrders || b.inProgress - a.inProgress || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)
  );

  const visibleIds = new Set(providers.map((p) => p.id));
  const orders = allOrders
    .filter((o) => visibleIds.has(o.providerId) && orderMatches(o, f))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const strip = ({ days, ...rest }) => rest;
  return {
    generatedAt: new Date().toISOString(),
    filters: f,
    summary,
    providers,
    orderCount: orders.length,
    orders: orders.slice(0, 200).map(strip),
    _internal: { orders, providers, ctx },
  };
}

async function snapshot(query) {
  const { _internal, ...pub } = await build(query);
  return pub;
}

// ---- reports --------------------------------------------------------------
const REPORT_TYPES = ["daily", "weekly", "monthly", "provider", "status", "order"];
const STATUS_ORDER = ["Pending", "Accepted", "In Progress", "Completed", "Rejected", "Cancelled"];

function periodFor(type, f) {
  if (type === "daily") return { from: f.to, to: f.to };
  if (type === "weekly") return { from: addDays(f.to, -6), to: f.to };
  if (type === "monthly") return { from: `${f.to.slice(0, 8)}01`, to: f.to };
  return { from: f.from, to: f.to };
}

async function report(type, query) {
  if (!REPORT_TYPES.includes(type)) throw Object.assign(new Error("Unknown report type"), { status: 400 });
  const f0 = normalizeFilters(query);
  const period = periodFor(type, f0);
  const { _internal, filters } = await build({ ...query, from: period.from, to: period.to });
  const { orders, providers } = _internal;
  const inr = (n) => Math.round((n || 0) * 100) / 100;
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "");

  let title;
  let rows;
  if (["daily", "weekly", "monthly"].includes(type)) {
    title = `${type[0].toUpperCase()}${type.slice(1)} report ${period.from}${period.from === period.to ? "" : ` to ${period.to}`}`;
    const days = [];
    for (let d = period.from; d <= period.to; d = addDays(d, 1)) days.push(d);
    // Count by the day each event happened (placed / completed / rejected / cancelled).
    const bookingsAll = _internal.orders; // already order-filtered + provider-filtered
    const dayOf = (iso) => istDay(iso);
    rows = days.map((d) => {
      const placed = bookingsAll.filter((o) => dayOf(o.createdAt) === d);
      const completed = bookingsAll.filter((o) => o.status === "Completed" && dayOf(o.completedAt) === d);
      const rejected = bookingsAll.filter((o) => o.status === "Rejected" && dayOf(o.rejectedAt) === d);
      const cancelled = bookingsAll.filter((o) => o.status === "Cancelled" && dayOf(o.cancelledAt) === d);
      const active = new Set([...placed, ...completed, ...rejected].map((o) => o.providerId));
      return {
        Date: d,
        "Orders placed": placed.length,
        "Completed": completed.length,
        "Rejected": rejected.length,
        "Cancelled": cancelled.length,
        "Completed value (INR)": inr(completed.reduce((n, o) => n + o.amount, 0)),
        "Communication fees (INR)": inr(completed.reduce((n, o) => n + o.fee, 0)),
        "Active providers": active.size,
      };
    });
  } else if (type === "provider") {
    title = `Provider-wise report ${period.from} to ${period.to}`;
    rows = providers.map((p) => ({
      Provider: p.name,
      Business: p.businessName,
      Phone: p.phone,
      Category: p.category,
      Area: p.serviceArea,
      "PIN codes": p.serveAllAreas ? "All areas" : p.pincodes.join(" "),
      "Live status": p.status.replace("_", " "),
      Online: p.online ? "Yes" : "No",
      "Last seen": fmt(p.lastSeenAt),
      "Unavailable reason": p.unavailableReason || "",
      "Orders in period": p.total,
      "New orders now": p.newOrders,
      "In progress now": p.inProgress,
      Completed: p.completed,
      Rejected: p.rejected,
      Cancelled: p.cancelled,
      "Completed value (INR)": inr(p.completedValue),
      "Communication fees (INR)": inr(p.fee),
      "Response rate %": p.responseRate,
      "Wallet balance (INR)": inr(p.walletBalance),
    }));
  } else if (type === "status") {
    title = `Status-wise report ${period.from} to ${period.to}`;
    rows = STATUS_ORDER.map((s) => {
      const list = orders.filter((o) => o.status === s);
      return {
        Status: s,
        Orders: list.length,
        "Order value (INR)": inr(list.reduce((n, o) => n + o.amount, 0)),
        "Communication fees (INR)": inr(list.reduce((n, o) => n + o.fee, 0)),
        Providers: new Set(list.map((o) => o.providerId)).size,
      };
    });
    // Provider-status snapshot (Online / Offline / Waiting …) at download time.
    const snap = {
      Online: providers.filter((p) => p.online).length,
      Offline: providers.filter((p) => !p.online).length,
      Waiting: providers.filter((p) => p.status === "waiting").length,
      "New order": providers.filter((p) => p.newOrders > 0).length,
      "In progress": providers.filter((p) => p.inProgress > 0).length,
      "Busy / unavailable": providers.filter((p) => p.busy).length,
    };
    for (const [k, v] of Object.entries(snap)) rows.push({ Status: `Providers: ${k}`, Orders: "", "Order value (INR)": "", "Communication fees (INR)": "", Providers: v });
  } else {
    title = `Order-wise report ${period.from} to ${period.to}`;
    rows = orders.map((o) => ({
      "Request ID": o.ref,
      "Booking ID": o.id,
      Provider: o.providerName,
      Customer: o.customerName,
      Service: o.serviceName,
      Category: o.categoryName,
      "PIN code": o.pin,
      Address: o.address,
      Status: o.status,
      "Amount (INR)": o.amount,
      "Communication fee (INR)": o.fee,
      Placed: fmt(o.createdAt),
      Accepted: fmt(o.acceptedAt),
      Completed: fmt(o.completedAt),
      Rejected: fmt(o.rejectedAt),
      Cancelled: fmt(o.cancelledAt),
    }));
  }
  return { type, title, period, filters, rows };
}

module.exports = { touchProvider, snapshot, report, REPORT_TYPES };
