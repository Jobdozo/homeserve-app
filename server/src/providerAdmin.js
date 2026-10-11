// Super Admin tools for one provider and for the provider list: document (KYC) review, performance,
// money, notes and tags, bulk prices, search with filters, and "needs attention" alerts.
// The calculations are plain functions of their inputs (tested in test/providerAdmin.test.js);
// the async wrappers below only gather the data.
const jsonStore = require("./jsonStore");
const store = require("./store");
const accounting = require("./accounting");
const presence = require("./presence");
const { KYC_DOC_TYPES } = require("./rules");

const DAY = 24 * 60 * 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const monthOf = (iso) => String(iso || "").slice(0, 7);

// ---------------------------------------------------------------- documents (KYC)

const DOC_LABELS = {
  id_proof: "ID proof",
  address_proof: "Address proof",
  pan_card: "PAN card",
  gst_certificate: "GST certificate",
  bank_details: "Bank / UPI proof",
  police_verification: "Police verification",
  other: "Other",
};

// The newest document of each type decides that type's status: approved, rejected, waiting (uploaded, not
// reviewed), expired (approved but past its date) or missing.
function kycStatus(docs, required, now = Date.now()) {
  const latest = new Map();
  for (const d of docs || []) {
    const cur = latest.get(d.docType);
    if (!cur || String(d.uploadedAt) > String(cur.uploadedAt)) latest.set(d.docType, d);
  }
  const types = KYC_DOC_TYPES.map((type) => {
    const doc = latest.get(type) || null;
    let status = "missing";
    if (doc) {
      status = doc.status === "approved" ? "approved" : doc.status === "rejected" ? "rejected" : "waiting";
      if (status === "approved" && doc.expiresAt && Date.parse(doc.expiresAt) <= now) status = "expired";
    }
    return { type, label: DOC_LABELS[type] || type, required: required.includes(type), status, doc };
  });
  const missing = types.filter((t) => t.required && t.status !== "approved");
  return { types, missing: missing.map((t) => t.label), complete: missing.length === 0, waiting: types.filter((t) => t.status === "waiting").length };
}

function providerKyc(providerId) {
  return kycStatus(store.listKycDocuments(providerId), store.getSettings().kycRequiredDocs || []);
}

async function reviewDocument(providerId, docId, { status, note, expiresAt } = {}, actor) {
  if (!["approved", "rejected"].includes(status)) throw fail(400, "status must be approved or rejected");
  const doc = jsonStore.readAll("kycDocuments").find((d) => d.id === docId && d.providerId === providerId);
  if (!doc) throw fail(404, "Document not found");
  const reason = String(note || "").trim().slice(0, 200);
  if (status === "rejected" && !reason) throw fail(400, "Tell the provider why the document was rejected");
  let expiry = null;
  if (expiresAt) {
    const t = Date.parse(expiresAt);
    if (!Number.isFinite(t)) throw fail(400, "The expiry date isn't valid");
    expiry = new Date(t).toISOString();
  }
  const updated = jsonStore.update("kycDocuments", docId, {
    status,
    note: reason || null,
    expiresAt: status === "approved" ? expiry : null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor || null,
    remindedAt: null,
  });
  const provider = await store.getProvider(providerId);
  const label = DOC_LABELS[doc.docType] || "document";
  store.recordAdminChange({ actor, action: `kyc.${status}`, entityType: "provider", entityId: providerId, entityName: provider?.name, changes: [{ field: label, from: doc.status || "waiting", to: status }, ...(reason ? [{ field: "reason", from: null, to: reason }] : [])] });
  await store.addNotification({
    recipientType: "provider",
    recipientId: providerId,
    type: "account",
    title: status === "approved" ? `${label} approved` : `${label} not accepted`,
    message: status === "approved" ? `Your ${label} has been verified.` : `Your ${label} was not accepted: ${reason}. Please upload a clearer or correct one in Documents & KYC.`,
  });
  return updated;
}

// Reminders 30 and 7 days before an approved document expires, and once when it has expired.
function expiryReminderStage(doc, now = Date.now()) {
  if (doc.status !== "approved" || !doc.expiresAt) return null;
  const left = Date.parse(doc.expiresAt) - now;
  const stage = left <= 0 ? "expired" : left <= 7 * DAY ? "7" : left <= 30 * DAY ? "30" : null;
  return stage && doc.remindedStage !== stage ? stage : null;
}

async function sendExpiryReminders() {
  let sent = 0;
  for (const doc of jsonStore.readAll("kycDocuments")) {
    const stage = expiryReminderStage(doc);
    if (!stage) continue;
    const label = DOC_LABELS[doc.docType] || "document";
    const date = new Date(doc.expiresAt).toLocaleDateString("en-IN");
    await store.addNotification({
      recipientType: "provider",
      recipientId: doc.providerId,
      type: "account",
      title: stage === "expired" ? `${label} has expired` : `${label} expires soon`,
      message: stage === "expired" ? `Your ${label} expired on ${date}. Upload a new one in Documents & KYC.` : `Your ${label} expires on ${date}. Upload the new one in Documents & KYC before then.`,
    });
    jsonStore.update("kycDocuments", doc.id, { remindedStage: stage, remindedAt: new Date().toISOString() });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------- declines (for the acceptance rate)

// A request the provider turned down or let time out. Kept so acceptance can be measured — the booking itself
// moves on to another provider and no longer points at this one.
function recordDecline(providerId, bookingId, kind = "declined") {
  if (!providerId || !bookingId) return;
  jsonStore.insert("providerDeclines", { providerId, bookingId, kind, at: new Date().toISOString() });
}

// ---------------------------------------------------------------- performance

function computePerformance({ bookings = [], declines = [], complaints = [], now = Date.now() }) {
  const count = (st) => bookings.filter((b) => b.status === st).length;
  const accepted = bookings.filter((b) => b.statusHistory?.Accepted || ["Accepted", "In Progress", "Completed"].includes(b.status));
  // Requests turned down before declines were recorded stay with the provider as "Rejected", never accepted.
  const recorded = new Set(declines.map((d) => d.bookingId));
  const olderDeclines = bookings.filter((b) => b.status === "Rejected" && !b.statusHistory?.Accepted && !recorded.has(b.id)).length;
  const declined = declines.filter((d) => d.kind !== "timeout").length + olderDeclines;
  const timedOut = declines.filter((d) => d.kind === "timeout").length;
  const asked = accepted.length + declined + timedOut;
  const responses = accepted
    .map((b) => {
      const start = Date.parse(b.statusHistory?.Pending || b.createdAt);
      const end = Date.parse(b.statusHistory?.Accepted);
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null;
    })
    .filter((m) => m !== null);
  const completed = bookings.filter((b) => b.status === "Completed");

  // the last 6 calendar months, oldest first
  const months = [];
  const d = new Date(now);
  for (let i = 5; i >= 0; i--) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  const byMonth = (list, valueOf) =>
    months.map((m) => {
      const inMonth = list.filter((b) => monthOf(b.statusHistory?.Completed || b.date || b.createdAt) === m);
      return { month: m, count: inMonth.length, value: inMonth.reduce((t, b) => t + valueOf(b), 0) };
    });
  const reviewed = completed.filter((b) => b.review?.rating);
  return {
    total: bookings.length,
    pending: count("Pending"),
    open: count("Accepted") + count("In Progress"),
    completed: completed.length,
    cancelled: count("Cancelled"),
    declined,
    timedOut,
    acceptanceRate: asked ? Math.round((accepted.length / asked) * 100) : null,
    completionRate: accepted.length ? Math.round((completed.length / accepted.length) * 100) : null,
    avgResponseSeconds: responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length) : null,
    complaints: complaints.length,
    openComplaints: complaints.filter((c) => !["resolved", "closed"].includes(String(c.status || "").toLowerCase())).length,
    earningsByMonth: byMonth(completed, (b) => Number(b.amount) || 0).map(({ month, count: jobs, value }) => ({ month, jobs, amount: value })),
    ratingByMonth: byMonth(reviewed, (b) => b.review.rating).map(({ month, count: reviews, value }) => ({ month, reviews, average: reviews ? Math.round((value / reviews) * 10) / 10 : null })),
  };
}

async function performance(providerId) {
  const bookings = await store.listBookings({ providerId });
  const declines = jsonStore.readAll("providerDeclines").filter((x) => x.providerId === providerId);
  const complaints = jsonStore.readAll("complaints").filter((c) => c.providerId === providerId);
  const recent = [...bookings]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 200)
    .map((b) => ({ id: b.id, ref: b.ref, status: b.status, service: b.service?.name, customer: b.customer?.name, amount: b.amount, date: b.date, time: b.time, createdAt: b.createdAt, rating: b.review?.rating || null }));
  return { stats: computePerformance({ bookings, declines, complaints }), bookings: recent };
}

// ---------------------------------------------------------------- money

const LOW_BALANCE_FRACTION = 0.2;
function walletLow(wallet) {
  if (!wallet) return false;
  if (wallet.balance <= 0) return true;
  const last = [...(wallet.recharges || [])].pop();
  return Boolean(last && wallet.balance <= last.amount * LOW_BALANCE_FRACTION);
}

async function money(providerId) {
  const wallet = store.getWallet(providerId);
  const bookings = await store.listBookings({ providerId });
  const refs = new Map(bookings.map((b) => [b.id, b]));
  const fees = jsonStore
    .readAll("bookingFees")
    .filter((f) => refs.has(f.id))
    .map((f) => ({ bookingId: f.id, ref: refs.get(f.id).ref, service: refs.get(f.id).service?.name, fee: f.fee, at: f.at }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const ledger = [
    ...(wallet.recharges || []).map((r) => ({ type: "recharge", amount: r.amount, at: r.at, note: r.note || null })),
    ...(wallet.deductions || []).map((r) => ({ type: r.reason === "commission" ? "fee" : r.reason || "deduction", amount: -r.amount, at: r.at, note: null })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const invoices = accounting.listInvoices({ providerId, limit: 200 });
  return {
    balance: wallet.balance,
    low: walletLow(wallet),
    totals: {
      recharged: (wallet.recharges || []).reduce((t, r) => t + (Number(r.amount) || 0), 0),
      fees: (wallet.deductions || []).reduce((t, r) => t + (Number(r.amount) || 0), 0),
    },
    ledger,
    fees,
    invoices: Array.isArray(invoices) ? invoices : invoices?.rows || [],
  };
}

// ---------------------------------------------------------------- prices

function scalePrice(price, percent) {
  return Math.max(0, Math.round(Number(price || 0) * (1 + percent / 100)));
}

// Raises or lowers all of one provider's prices (optionally one category) by a percentage; the crossed-out
// "original" price moves the same way so the shown discount stays the same.
async function adjustPrices(providerId, { percent, categoryId } = {}, actor) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p === 0 || p < -90 || p > 500) throw fail(400, "Give a percentage between -90 and 500 (not 0)");
  const services = (await store.listProviderServices(providerId)).filter((s) => s.status !== "rejected" && (!categoryId || s.categoryId === categoryId));
  if (!services.length) throw fail(404, "No services to change");
  const changed = [];
  for (const s of services) {
    const price = scalePrice(s.price, p);
    const original = s.originalPrice ? scalePrice(s.originalPrice, p) : null;
    await store.adminUpdateService(s.id, { price, originalPrice: original && original > price ? original : null }, actor);
    changed.push({ id: s.id, name: s.name, from: s.price, to: price });
  }
  return { changed: changed.length, services: changed };
}

// ---------------------------------------------------------------- tags & notes

const cleanTag = (t) => String(t || "").trim().replace(/\s+/g, " ").slice(0, 30);
function getTags(providerId) {
  return jsonStore.readAll("providerTags").find((r) => r.id === providerId)?.tags || [];
}
function setTags(providerId, tags, actor) {
  const seen = new Set();
  const clean = (Array.isArray(tags) ? tags : [])
    .map(cleanTag)
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, 12);
  const before = getTags(providerId);
  if (jsonStore.readAll("providerTags").some((r) => r.id === providerId)) jsonStore.update("providerTags", providerId, { tags: clean });
  else jsonStore.insert("providerTags", { id: providerId, tags: clean });
  store.recordAdminChange({ actor, action: "provider.tags", entityType: "provider", entityId: providerId, changes: [{ field: "tags", from: before.join(", ") || null, to: clean.join(", ") || null }] });
  return clean;
}
function allTags() {
  return [...new Set(jsonStore.readAll("providerTags").flatMap((r) => r.tags || []))].sort();
}

function listNotes(providerId) {
  return jsonStore.readAll("providerNotes").filter((n) => n.providerId === providerId).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
function addNote(providerId, text, actor) {
  const t = String(text || "").trim().slice(0, 2000);
  if (!t) throw fail(400, "Write a note first");
  return jsonStore.insert("providerNotes", { providerId, text: t, by: actor || null, at: new Date().toISOString() });
}
function deleteNote(providerId, noteId) {
  const n = jsonStore.readAll("providerNotes").find((x) => x.id === noteId && x.providerId === providerId);
  if (!n) throw fail(404, "Note not found");
  jsonStore.remove("providerNotes", noteId);
  return { deleted: true };
}

// ---------------------------------------------------------------- the provider list: search, filters, pages

// Phone numbers match on their digits ("+91 98765 43210" = "9876543210").
function matchesQuery(p, q) {
  const text = String(q || "").trim().toLowerCase();
  if (!text) return true;
  const digits = text.replace(/[^0-9]/g, "");
  if (digits.length >= 3) {
    const phone = String(p.phone || "").replace(/[^0-9]/g, "");
    if (phone.includes(digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits)) return true;
  }
  return [p.name, p.businessName, p.email, p.category, ...(p.tags || [])].some((v) => String(v || "").toLowerCase().includes(text));
}

// rows are providers already enriched with walletBalance, lastSeenAt, docsWaiting, kycComplete, tags, paused, pincodes.
function filterProviders(rows, f = {}, now = Date.now()) {
  let out = rows.filter((p) => matchesQuery(p, f.q));
  if (f.status && f.status !== "all") out = out.filter((p) => (p.verificationStatus || "pending") === f.status);
  if (f.category) out = out.filter((p) => String(p.category || "").toLowerCase() === String(f.category).toLowerCase());
  if (f.pin) out = out.filter((p) => (p.pincodes || []).some((x) => String(f.pin).startsWith(String(x)) || String(x).startsWith(String(f.pin))) || p.serveAllAreas);
  if (f.tag) out = out.filter((p) => (p.tags || []).includes(f.tag));
  if (f.docs === "waiting") out = out.filter((p) => p.docsWaiting > 0);
  if (f.docs === "incomplete") out = out.filter((p) => !p.kycComplete);
  if (f.wallet === "low") out = out.filter((p) => p.walletLow);
  if (f.inactiveDays) out = out.filter((p) => !p.lastSeenAt || now - Date.parse(p.lastSeenAt) > Number(f.inactiveDays) * DAY);
  if (f.maxRating) out = out.filter((p) => p.reviews > 0 && Number(p.rating) < Number(f.maxRating));
  if (f.paused === "yes") out = out.filter((p) => p.paused);
  const sorters = {
    newest: (a, b) => String(b.joinedAt || "").localeCompare(String(a.joinedAt || "")),
    name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
    rating: (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0),
    wallet: (a, b) => (a.walletBalance || 0) - (b.walletBalance || 0),
    lastSeen: (a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")),
  };
  return [...out].sort(sorters[f.sort] || sorters.newest);
}

async function enrichedProviders() {
  const providers = await store.listProviders();
  const seen = presence.snapshot();
  const required = store.getSettings().kycRequiredDocs || [];
  const docs = jsonStore.readAll("kycDocuments");
  const tags = new Map(jsonStore.readAll("providerTags").map((r) => [r.id, r.tags || []]));
  return providers.map((p) => {
    const wallet = store.getWallet(p.id);
    const kyc = kycStatus(docs.filter((d) => d.providerId === p.id), required);
    const pause = store.getAdminPause(p.id);
    return {
      ...p,
      walletBalance: wallet.balance,
      walletLow: walletLow(wallet),
      lastSeenAt: seen.get(p.id) ? new Date(seen.get(p.id)).toISOString() : null,
      docsWaiting: kyc.waiting,
      kycComplete: kyc.complete,
      kycMissing: kyc.missing,
      tags: tags.get(p.id) || [],
      paused: pause ? { reason: pause.reason, until: pause.until } : null,
      pincodes: p.coverage?.pincodes || [],
      serveAllAreas: Boolean(p.coverage?.serveAllAreas),
    };
  });
}

async function search(f = {}) {
  const everyone = await enrichedProviders();
  const all = filterProviders(everyone, f);
  const pageSize = f.all ? all.length : Math.min(Math.max(Number(f.pageSize) || 60, 1), 200);
  const page = Math.max(Number(f.page) || 1, 1);
  const counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const p of filterProviders(everyone, { ...f, status: "all" })) {
    counts.all++;
    counts[p.verificationStatus || "pending"] = (counts[p.verificationStatus || "pending"] || 0) + 1;
  }
  return { total: all.length, page, pageSize, counts, rows: all.slice((page - 1) * pageSize, page * pageSize) };
}

// ---------------------------------------------------------------- alerts ("needs attention")

function computeAlerts({ providers = [], ratingsByProvider = new Map(), docs = [], now = Date.now() }) {
  const out = [];
  const push = (p, type, severity, detail) => out.push({ providerId: p.id, name: p.name, phone: p.phone, type, severity, detail });
  for (const p of providers) {
    const live = (p.verificationStatus || "pending") === "approved";
    for (const d of docs.filter((x) => x.providerId === p.id && x.status === "approved" && x.expiresAt)) {
      const left = Date.parse(d.expiresAt) - now;
      const label = DOC_LABELS[d.docType] || "Document";
      if (left <= 0) push(p, "document_expired", "high", `${label} expired on ${d.expiresAt.slice(0, 10)}`);
      else if (left <= 30 * DAY) push(p, "document_expiring", "medium", `${label} expires on ${d.expiresAt.slice(0, 10)}`);
    }
    if (p.docsWaiting > 0) push(p, "documents_waiting", "medium", `${p.docsWaiting} document${p.docsWaiting === 1 ? "" : "s"} waiting for your review`);
    if (!live) continue;
    if (p.walletBalance <= 0) push(p, "wallet_empty", "high", "Wallet is empty — not getting new requests");
    else if (p.walletLow) push(p, "wallet_low", "medium", `Wallet is low (₹${p.walletBalance})`);
    if (!p.lastSeenAt || now - Date.parse(p.lastSeenAt) > 14 * DAY) push(p, "inactive", "low", p.lastSeenAt ? `Not opened the app since ${p.lastSeenAt.slice(0, 10)}` : "Never opened the app");
    const r = ratingsByProvider.get(p.id);
    if (r && r.recentCount >= 3 && (r.recentAvg < 3.5 || (r.previousCount >= 3 && r.previousAvg - r.recentAvg >= 0.5))) {
      push(p, "rating_drop", "high", `Rating ${r.recentAvg.toFixed(1)} in the last 30 days${r.previousCount ? ` (was ${r.previousAvg.toFixed(1)})` : ""}`);
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || String(a.name).localeCompare(String(b.name)));
}

// Average review in the last 30 days vs the 60 before, per provider.
function ratingWindows(bookings, now = Date.now()) {
  const map = new Map();
  for (const b of bookings) {
    if (!b.review?.rating || !b.providerId) continue;
    const at = Date.parse(b.statusHistory?.Completed || b.date || b.createdAt);
    if (!Number.isFinite(at)) continue;
    const age = now - at;
    const r = map.get(b.providerId) || { recentSum: 0, recentCount: 0, previousSum: 0, previousCount: 0 };
    if (age <= 30 * DAY) {
      r.recentSum += b.review.rating;
      r.recentCount++;
    } else if (age <= 90 * DAY) {
      r.previousSum += b.review.rating;
      r.previousCount++;
    }
    map.set(b.providerId, r);
  }
  for (const r of map.values()) {
    r.recentAvg = r.recentCount ? r.recentSum / r.recentCount : 0;
    r.previousAvg = r.previousCount ? r.previousSum / r.previousCount : 0;
  }
  return map;
}

async function alerts() {
  const [providers, bookings] = await Promise.all([enrichedProviders(), store.listBookings({})]);
  return computeAlerts({ providers, ratingsByProvider: ratingWindows(bookings), docs: jsonStore.readAll("kycDocuments") });
}

// ---------------------------------------------------------------- messages to many providers

async function messageProviders(ids, { title, message } = {}) {
  const list = [...new Set(Array.isArray(ids) ? ids : [])].slice(0, 500);
  const t = String(title || "").trim().slice(0, 120);
  const m = String(message || "").trim().slice(0, 1000);
  if (!list.length) throw fail(400, "Choose at least one provider");
  if (!t || !m) throw fail(400, "Write a title and a message");
  for (const id of list) await store.addNotification({ recipientType: "provider", recipientId: id, type: "announcement", title: t, message: m });
  return { sent: list.length };
}

module.exports = {
  DOC_LABELS,
  kycStatus,
  providerKyc,
  reviewDocument,
  expiryReminderStage,
  sendExpiryReminders,
  recordDecline,
  computePerformance,
  performance,
  walletLow,
  money,
  scalePrice,
  adjustPrices,
  getTags,
  setTags,
  allTags,
  listNotes,
  addNote,
  deleteNote,
  matchesQuery,
  filterProviders,
  search,
  computeAlerts,
  ratingWindows,
  alerts,
  messageProviders,
};
