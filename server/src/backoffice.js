// Back-office checks used by the Phase 3 agents and shown to staff:
//   - providerChecklist / precheckPending: is a pending provider's application
//     complete? (deterministic — documents still need a human eye)
//   - reconcile: do provider wallets, recorded commission fees and completed
//     bookings agree with each other?
// Read-only: nothing here changes data. Pure functions take plain data so they
// can be tested without the database.
const jsonStore = require("./jsonStore");
const store = require("./store");

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const EMAIL = /^\S+@\S+\.\S+$/;
const PLACEHOLDER_NAMES = ["new provider", "provider", "test", ""];
const lc = (v) => String(v || "").trim().toLowerCase();
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- provider application checklist ----
// Each check: { key, label, ok, required, detail? }
function providerChecklist(p, { docs = [], services = [], others = [] } = {}) {
  const checks = [];
  const add = (key, label, ok, required = true, detail) => checks.push({ key, label, ok: Boolean(ok), required, ...(detail ? { detail } : {}) });

  add("name", "Real name entered", !PLACEHOLDER_NAMES.includes(lc(p.name)));
  add("category", "Main category chosen", Boolean(p.category));
  add("area", "Service area / PIN codes set", Boolean(p.serviceArea) || p.coverage?.serveAllAreas || (p.coverage?.pincodes || []).length > 0);
  add("services", "At least one service added", services.length > 0, true, services.length ? `${services.length} service(s)` : undefined);
  add("id_proof", "ID proof uploaded", docs.some((d) => d.docType === "id_proof"));
  add("agreement", "Provider agreement accepted", p.agreementAccepted === true);
  if (p.gstNumber) {
    add("gst_format", "GST number format valid", GSTIN.test(String(p.gstNumber).toUpperCase().replace(/\s/g, "")), true);
    add("gst_doc", "GST certificate uploaded", docs.some((d) => d.docType === "gst_certificate"), true);
  }
  if (p.email) add("email", "Email looks valid", EMAIL.test(p.email), false);
  add("experience", "Experience filled in", Boolean(p.experience), false);

  // Possible duplicates: same GST, or same name + category, on another account.
  const dupes = others.filter(
    (o) =>
      o.id !== p.id &&
      ((p.gstNumber && lc(o.gstNumber) === lc(p.gstNumber)) ||
        (lc(p.name) && !PLACEHOLDER_NAMES.includes(lc(p.name)) && lc(o.name) === lc(p.name) && lc(o.category) === lc(p.category)))
  );
  add("duplicate", "No duplicate account found", dupes.length === 0, true, dupes.length ? `Looks like: ${dupes.map((d) => `${d.name} (${d.verificationStatus})`).join(", ")}` : undefined);

  const missing = checks.filter((c) => c.required && !c.ok);
  return {
    providerId: p.id,
    name: p.name,
    category: p.category || "",
    phone: p.phone,
    joinedAt: p.joinedAt || null,
    waitingDays: p.joinedAt ? Math.floor((Date.now() - Date.parse(p.joinedAt)) / 86400000) : null,
    docs: docs.map((d) => ({ id: d.id, docType: d.docType, url: d.url, uploadedAt: d.uploadedAt })),
    checks,
    missing: missing.map((c) => c.key),
    ready: missing.length === 0,
  };
}

async function precheckPending() {
  const [providers, services] = await Promise.all([store.listProviders(), store.listServices()]);
  const docs = jsonStore.readAll("kycDocuments");
  return providers
    .filter((p) => (p.verificationStatus || "pending") === "pending")
    .map((p) =>
      providerChecklist(p, {
        docs: docs.filter((d) => d.providerId === p.id),
        services: services.filter((s) => s.providerId === p.id),
        others: providers,
      })
    )
    .sort((a, b) => Number(b.ready) - Number(a.ready) || (b.waitingDays || 0) - (a.waitingDays || 0));
}

// ---- wallet & commission reconciliation ----
// issue: { key, type, severity, providerId, providerName, bookingId?, detail, amountInr? }
function reconcileData({ wallets = [], fees = [], bookings = [], providers = [], expectedFee = () => 0 }) {
  const issues = [];
  const name = new Map(providers.map((p) => [p.id, p.name]));
  const feeById = new Map(fees.map((f) => [f.id, f]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const push = (i) => issues.push({ providerName: name.get(i.providerId) || i.providerId || "—", ...i });

  // 1. Each wallet's balance should equal recharges minus deductions.
  for (const w of wallets) {
    const rech = (w.recharges || []).reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const ded = (w.deductions || []).reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const expected = r2(rech - ded);
    if (Math.abs(r2(w.balance) - expected) > 0.01) {
      push({ key: `wallet-mismatch:${w.id}:${r2(w.balance)}`, type: "wallet_mismatch", severity: "critical", providerId: w.id,
        detail: `Balance is ₹${r2(w.balance)} but recharges − deductions = ₹${expected}`, amountInr: r2(w.balance - expected) });
    }
    if (w.balance < 0) {
      push({ key: `negative:${w.id}:${r2(w.balance)}`, type: "negative_balance", severity: "warning", providerId: w.id, detail: `Wallet is negative (₹${r2(w.balance)}) — provider is paused until recharged`, amountInr: r2(w.balance) });
    }
    // 2. Commission deductions vs recorded fees for this provider.
    const commissions = (w.deductions || []).filter((d) => (d.reason || "commission") === "commission");
    const providerFees = fees.filter((f) => bookingById.get(f.id)?.providerId === w.id);
    const dSum = r2(commissions.reduce((t, d) => t + (Number(d.amount) || 0), 0));
    const fSum = r2(providerFees.reduce((t, f) => t + (Number(f.fee) || 0), 0));
    if (commissions.length !== providerFees.length || Math.abs(dSum - fSum) > 0.01) {
      push({ key: `commission-mismatch:${w.id}:${commissions.length}:${providerFees.length}`, type: "commission_mismatch", severity: "warning", providerId: w.id,
        detail: `${commissions.length} commission deductions (₹${dSum}) vs ${providerFees.length} recorded job fees (₹${fSum})`, amountInr: r2(dSum - fSum) });
    }
  }

  // 3. Completed jobs that should have been charged but weren't. Only jobs
  // finished after the first fee was ever recorded — older jobs predate
  // commission charging and would otherwise all show up.
  const feesStarted = fees.reduce((m, f) => (f.at && (!m || f.at < m) ? f.at : m), null);
  for (const b of bookings) {
    if (b.status !== "Completed" || feeById.has(b.id) || !feesStarted) continue;
    const completedAt = b.statusHistory?.Completed;
    if (!completedAt || completedAt < feesStarted) continue;
    const fee = r2(expectedFee(b));
    if (fee > 0) {
      push({ key: `uncharged:${b.id}`, type: "uncharged_job", severity: "warning", providerId: b.providerId, bookingId: b.id,
        detail: `Completed job #${b.ref || b.id} has no commission recorded (current rules: ₹${fee})`, amountInr: fee });
    }
  }

  // 4. Fees charged for jobs that fell through after acceptance (cancelled, rejected or handed back).
  //    The fee is charged on acceptance, so Accepted / In Progress / Completed are all normal.
  for (const f of fees) {
    const b = bookingById.get(f.id);
    if (!b) {
      push({ key: `orphan-fee:${f.id}`, type: "fee_without_booking", severity: "warning", providerId: null, bookingId: f.id, detail: `₹${r2(f.fee)} fee recorded for a booking that no longer exists`, amountInr: r2(f.fee) });
    } else if (!["Accepted", "In Progress", "Completed"].includes(b.status)) {
      push({ key: `fee-not-completed:${f.id}:${b.status}`, type: "fee_on_unfinished_job", severity: "warning", providerId: b.providerId, bookingId: b.id,
        detail: `₹${r2(f.fee)} commission charged but job #${b.ref || b.id} is now "${b.status}" — a refund to the wallet may be due`, amountInr: r2(f.fee) });
    }
  }

  const totals = {
    wallets: wallets.length,
    totalBalanceInr: r2(wallets.reduce((t, w) => t + (Number(w.balance) || 0), 0)),
    totalRechargedInr: r2(wallets.reduce((t, w) => t + (w.recharges || []).reduce((s, x) => s + (Number(x.amount) || 0), 0), 0)),
    totalCommissionInr: r2(fees.reduce((t, f) => t + (Number(f.fee) || 0), 0)),
    completedJobs: bookings.filter((b) => b.status === "Completed").length,
    negativeWallets: wallets.filter((w) => w.balance < 0).length,
  };
  const order = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { generatedAt: new Date().toISOString(), totals, issueCount: issues.length, issues };
}

async function reconcile() {
  const [bookings, providers] = await Promise.all([store.listBookings({}), store.listProviders()]);
  const cfg = store.getSettings();
  return reconcileData({
    wallets: jsonStore.readAll("providerWallets"),
    fees: jsonStore.readAll("bookingFees"),
    bookings,
    providers,
    expectedFee: (b) => store.bookingCommunicationFee(b, cfg, {}),
  });
}

module.exports = { providerChecklist, precheckPending, reconcileData, reconcile };
