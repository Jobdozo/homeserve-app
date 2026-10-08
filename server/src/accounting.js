// Accounting & GST (Super Admin -> Accounting).
//
// Tikdum's own taxable supply is the platform fee it charges providers (taken
// from the provider's wallet when they accept a request). Each fee gets a GST
// tax invoice with a gap-free serial number per financial year; refunds are
// credit notes. Monthly reports follow the layout of GSTR-1 / GSTR-3B so the
// accountant can copy the figures into the returns.
//
// Deliberately NOT here (see the notes shown on the Accounting page):
//   - Sponsored/ad-click charges are not invoiced yet.
//   - Customers pay providers directly, so GST TCS (s.52) and income-tax TDS
//     (194-O) do not apply to Tikdum today.
//   - Section 9(5): for categories the owner marks as "ECO-liable", the
//     exposure report shows the value of jobs by providers with no GSTIN —
//     it informs the accountant, it does not file or collect anything.
// Rates, SAC and the 9(5) categories are settings, not hard-coded law: have
// your CA confirm them before turning invoicing on.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const SETTINGS = "accountingSettings";
const INVOICES = "taxInvoices";
const COUNTERS = "taxInvoiceCounters";

const STATES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland",
  "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

const GSTIN_RE = /^(0[1-9]|[12]\d|3[0-8]|97)[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

const fail = (status, message) => Object.assign(new Error(message), { status });
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const IST_MS = 5.5 * 3600 * 1000;
const istDate = (iso) => new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);

const normGstin = (v) => String(v || "").replace(/\s/g, "").toUpperCase();
const isGstin = (v) => GSTIN_RE.test(normGstin(v));
const stateOfGstin = (v) => (isGstin(v) ? normGstin(v).slice(0, 2) : "");

// Indian financial year: April to March. 7 Oct 2026 -> "26-27".
function financialYear(iso) {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  const start = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const two = (n) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

// ---- settings ----
const DEFAULTS = {
  enabled: false,
  legalName: "",
  tradeName: "Tikdum",
  gstin: "",
  pan: "",
  address: "",
  sacCode: "998599",
  sacDescription: "Platform service fee (lead / communication service)",
  gstRate: 18,
  feeIncludesGst: true,
  invoicePrefix: "TKD",
  creditNotePrefix: "TKC",
  ecoCategoryIds: [],
  startedAt: null,
  updatedAt: null,
  updatedBy: null,
};

function getSettings() {
  const row = jsonStore.readAll(SETTINGS)[0] || {};
  const s = { ...DEFAULTS, ...row };
  return { ...s, stateCode: stateOfGstin(s.gstin), stateName: STATES[stateOfGstin(s.gstin)] || "" };
}

function invoiceCount() {
  return jsonStore.readAll(INVOICES).length;
}

function setSettings(patch, actor) {
  const cur = getSettings();
  const next = { ...cur };
  const text = (k, max) => {
    if (patch[k] !== undefined) next[k] = String(patch[k] || "").trim().slice(0, max);
  };
  text("legalName", 120);
  text("tradeName", 80);
  text("address", 300);
  text("sacDescription", 120);

  if (patch.gstin !== undefined) {
    const g = normGstin(patch.gstin);
    if (g && !isGstin(g)) throw fail(400, "That GSTIN isn't valid — it should be 15 characters, like 01ABCDE1234F1Z5");
    next.gstin = g;
  }
  if (patch.pan !== undefined) {
    const p = String(patch.pan || "").replace(/\s/g, "").toUpperCase();
    if (p && !PAN_RE.test(p)) throw fail(400, "That PAN isn't valid — it should look like ABCDE1234F");
    next.pan = p;
  }
  if (patch.sacCode !== undefined) {
    const c = String(patch.sacCode || "").trim();
    if (!/^\d{4,8}$/.test(c)) throw fail(400, "The SAC code should be 4 to 8 digits");
    next.sacCode = c;
  }
  if (patch.gstRate !== undefined) {
    const n = Number(patch.gstRate);
    if (!Number.isFinite(n) || n < 0 || n > 28) throw fail(400, "GST rate must be between 0 and 28");
    next.gstRate = n;
  }
  if (patch.feeIncludesGst !== undefined) next.feeIncludesGst = Boolean(patch.feeIncludesGst);
  for (const [k, label] of [["invoicePrefix", "Invoice prefix"], ["creditNotePrefix", "Credit note prefix"]]) {
    if (patch[k] === undefined) continue;
    const v = String(patch[k] || "").trim().toUpperCase();
    // Invoice numbers may be at most 16 characters (letters, digits, / and -):
    // PREFIX + "/26-27/" + 6 digits.
    if (!/^[A-Z0-9]{1,3}$/.test(v)) throw fail(400, `${label} must be 1 to 3 letters or digits`);
    if (v !== cur[k] && invoiceCount() > 0) throw fail(409, `${label} can't change once invoices have been issued — numbering has to stay continuous`);
    next[k] = v;
  }
  if (next.invoicePrefix === next.creditNotePrefix) throw fail(400, "Invoices and credit notes need different prefixes");
  if (patch.ecoCategoryIds !== undefined) {
    next.ecoCategoryIds = [...new Set((Array.isArray(patch.ecoCategoryIds) ? patch.ecoCategoryIds : []).map(String))].slice(0, 200);
  }
  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);

  if (next.enabled) {
    if (!isGstin(next.gstin)) throw fail(400, "Add Tikdum's GSTIN before turning invoicing on");
    if (!next.legalName) throw fail(400, "Add the legal name before turning invoicing on");
    if (!next.address) throw fail(400, "Add the registered address before turning invoicing on");
    if (!cur.enabled && !cur.startedAt) next.startedAt = new Date().toISOString();
  }
  // Changing the GSTIN of a running ledger would mix two registrations in one series.
  if (cur.enabled && next.gstin !== cur.gstin && invoiceCount() > 0) throw fail(409, "The GSTIN can't change once invoices have been issued");

  next.updatedAt = new Date().toISOString();
  next.updatedBy = actor || null;
  const { stateCode, stateName, ...stored } = next; // derived, never stored
  jsonStore.writeAll(SETTINGS, [{ id: "settings", ...stored }]);
  return getSettings();
}

// ---- tax maths ----
// amount is what the provider is charged. Inclusive: it already contains the
// GST (Rs 40 at 18% = 33.90 + 6.10). Same state -> CGST + SGST halves; other
// state -> IGST. Paise are rounded so the parts always add up to the total.
function splitTax(amount, rate, inclusive, intraState) {
  const a = r2(amount);
  const taxable = inclusive ? r2((a * 100) / (100 + rate)) : a;
  const gst = inclusive ? r2(a - taxable) : r2((a * rate) / 100);
  const cgst = intraState ? r2(gst / 2) : 0;
  const sgst = intraState ? r2(gst - cgst) : 0;
  const igst = intraState ? 0 : gst;
  return { taxableValue: taxable, cgst, sgst, igst, total: r2(taxable + gst) };
}

// ---- numbering ----
// Gap-free per series and financial year. Read-modify-write with no await in
// between, so two simultaneous fees can't be handed the same number.
function nextNumber(kind, prefix, fy) {
  const id = `${kind}:${fy}`;
  const row = jsonStore.readAll(COUNTERS).find((c) => c.id === id);
  const seq = (row?.seq || 0) + 1;
  if (row) jsonStore.update(COUNTERS, id, { seq });
  else jsonStore.insert(COUNTERS, { id, seq });
  return { seq, number: `${prefix}/${fy}/${String(seq).padStart(6, "0")}` };
}

// ---- invoices ----
function supplierSnapshot(s) {
  return { legalName: s.legalName, tradeName: s.tradeName, gstin: s.gstin, pan: s.pan, address: s.address, stateCode: s.stateCode, stateName: s.stateName };
}

// Called when a platform fee is charged. Returns the invoice, or null when
// invoicing is off (or this fee already has one). Never throws into the caller's
// money flow — the caller wraps it, and a missed invoice shows up as "not invoiced".
function recordFee({ provider, bookingId, bookingRef, fee, at }) {
  const s = getSettings();
  if (!s.enabled || !(Number(fee) > 0)) return null;
  const existing = jsonStore.readAll(INVOICES).find((i) => i.type === "invoice" && i.sourceId === bookingId);
  if (existing) return existing;

  const date = at || new Date().toISOString();
  const gstin = isGstin(provider?.gstNumber) ? normGstin(provider.gstNumber) : "";
  // A registered provider's place of supply is their GSTIN state. Without a
  // GSTIN and with no address on record, it is the supplier's own state.
  const posCode = stateOfGstin(gstin) || s.stateCode;
  const intra = posCode === s.stateCode;
  const tax = splitTax(fee, s.gstRate, s.feeIncludesGst, intra);
  const fy = financialYear(date);
  const { seq, number } = nextNumber("invoice", s.invoicePrefix, fy);

  return jsonStore.insert(INVOICES, {
    id: crypto.randomBytes(8).toString("hex"),
    type: "invoice",
    number,
    fy,
    seq,
    date,
    sourceType: "commission",
    sourceId: bookingId,
    bookingRef: bookingRef || null,
    providerId: provider?.id || null,
    supplier: supplierSnapshot(s),
    recipient: {
      name: provider?.businessName || provider?.name || "Service provider",
      gstin,
      address: provider?.serviceArea || "",
      stateCode: posCode,
      stateName: STATES[posCode] || "",
    },
    description: `Platform service fee for booking${bookingRef ? ` #${bookingRef}` : ""}`,
    sacCode: s.sacCode,
    gstRate: s.gstRate,
    feeIncludesGst: s.feeIncludesGst,
    ...tax,
    placeOfSupplyCode: posCode,
    placeOfSupply: STATES[posCode] || "",
    status: "issued",
    creditNoteId: null,
  });
}

function listInvoices({ from, to, type, q, providerId, limit } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return jsonStore
    .readAll(INVOICES)
    .filter((i) => (!type || i.type === type) && (!providerId || i.providerId === providerId))
    .filter((i) => (!from || istDate(i.date) >= from) && (!to || istDate(i.date) <= to))
    .filter((i) => !needle || [i.number, i.recipient?.name, i.recipient?.gstin, i.bookingRef].some((v) => String(v || "").toLowerCase().includes(needle)))
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.seq - a.seq)
    .slice(0, Math.min(Number(limit) || 500, 5000));
}

function getInvoice(id) {
  return jsonStore.readAll(INVOICES).find((i) => i.id === id) || null;
}

// Full credit note against an invoice (e.g. the fee is refunded because the
// booking fell through). One per invoice. It reduces the month's GST liability;
// putting the money back in the provider's wallet is a separate wallet top-up.
function issueCreditNote(invoiceId, reason, actor) {
  const inv = getInvoice(invoiceId);
  if (!inv || inv.type !== "invoice") throw fail(404, "Invoice not found");
  if (inv.creditNoteId) throw fail(409, "This invoice already has a credit note");
  const why = String(reason || "").trim().slice(0, 300);
  if (!why) throw fail(400, "Say why the credit note is being issued");
  const s = getSettings();
  const date = new Date().toISOString();
  const fy = financialYear(date);
  const { seq, number } = nextNumber("credit_note", s.creditNotePrefix, fy);
  const note = jsonStore.insert(INVOICES, {
    ...inv,
    id: crypto.randomBytes(8).toString("hex"),
    type: "credit_note",
    number,
    fy,
    seq,
    date,
    originalInvoiceId: inv.id,
    originalNumber: inv.number,
    originalDate: inv.date,
    reason: why,
    issuedBy: actor || null,
    description: `Credit note for ${inv.number}: ${why}`,
    status: "issued",
    creditNoteId: null,
  });
  jsonStore.update(INVOICES, inv.id, { creditNoteId: note.id, status: "credited" });
  return note;
}

// ---- monthly GST summary (GSTR-1 / GSTR-3B layout) ----
const sum = (rows, k) => r2(rows.reduce((t, r) => t + (Number(r[k]) || 0), 0));

function monthSummary(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw fail(400, "Month must look like 2026-10");
  const rows = jsonStore.readAll(INVOICES).filter((i) => istDate(i.date).startsWith(month));
  const invoices = rows.filter((i) => i.type === "invoice");
  const notes = rows.filter((i) => i.type === "credit_note");
  const line = (i) => ({
    number: i.number, date: istDate(i.date), name: i.recipient?.name, gstin: i.recipient?.gstin || "",
    placeOfSupply: i.placeOfSupply, placeOfSupplyCode: i.placeOfSupplyCode, sacCode: i.sacCode, rate: i.gstRate,
    taxableValue: i.taxableValue, igst: i.igst, cgst: i.cgst, sgst: i.sgst, total: i.total,
    originalNumber: i.originalNumber || null, originalDate: i.originalDate ? istDate(i.originalDate) : null, reason: i.reason || null,
  });

  // GSTR-1 4A: supplies to registered recipients, invoice by invoice.
  const b2b = invoices.filter((i) => i.recipient?.gstin).map(line);
  // GSTR-1 7: supplies to unregistered recipients, totalled by state and rate.
  const b2cMap = new Map();
  for (const i of invoices.filter((x) => !x.recipient?.gstin)) {
    const k = `${i.placeOfSupplyCode}|${i.gstRate}`;
    const row = b2cMap.get(k) || { placeOfSupplyCode: i.placeOfSupplyCode, placeOfSupply: i.placeOfSupply, rate: i.gstRate, invoices: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0 };
    row.invoices += 1;
    for (const f of ["taxableValue", "igst", "cgst", "sgst"]) row[f] = r2(row[f] + i[f]);
    b2cMap.set(k, row);
  }
  // GSTR-1 9B: credit notes. 12: SAC summary.
  const hsnMap = new Map();
  for (const i of rows) {
    const sign = i.type === "credit_note" ? -1 : 1;
    const k = `${i.sacCode}|${i.gstRate}`;
    const row = hsnMap.get(k) || { sacCode: i.sacCode, rate: i.gstRate, count: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
    row.count += sign;
    for (const f of ["taxableValue", "igst", "cgst", "sgst", "total"]) row[f] = r2(row[f] + sign * i[f]);
    hsnMap.set(k, row);
  }
  // GSTR-3B 3.1(a): outward taxable supplies, net of credit notes issued in the month.
  const net = (f) => r2(sum(invoices, f) - sum(notes, f));
  return {
    month,
    counts: { invoices: invoices.length, creditNotes: notes.length },
    gstr3b: { taxableValue: net("taxableValue"), igst: net("igst"), cgst: net("cgst"), sgst: net("sgst"), totalTax: r2(net("igst") + net("cgst") + net("sgst")) },
    b2b,
    b2c: [...b2cMap.values()],
    creditNotes: notes.map(line),
    sacSummary: [...hsnMap.values()],
  };
}

// Fees charged since invoicing started that have no invoice (e.g. the invoice
// step failed) — so nothing slips past the return.
function uninvoicedFees(fees) {
  const s = getSettings();
  if (!s.enabled || !s.startedAt) return [];
  const have = new Set(jsonStore.readAll(INVOICES).filter((i) => i.type === "invoice").map((i) => i.sourceId));
  return (fees || []).filter((f) => f.at >= s.startedAt && !have.has(f.id));
}

// ---- Section 9(5) exposure (information only) ----
// Jobs completed in the month, in categories marked ECO-liable, by providers
// with no GSTIN. For these the platform may owe GST on the full job value —
// the figures are for the accountant to confirm, nothing is charged or filed.
function ecoExposure({ month, bookings, providers, categoryIds, rate }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) throw fail(400, "Month must look like 2026-10");
  const cats = new Set((categoryIds || []).map(String));
  const unreg = new Set((providers || []).filter((p) => !isGstin(p.gstNumber)).map((p) => p.id));
  const rows = (bookings || []).filter(
    (b) => b.status === "Completed" && cats.has(String(b.service?.categoryId)) && unreg.has(b.providerId) && istDate(b.statusHistory?.Completed || b.createdAt).startsWith(month)
  );
  const byCat = new Map();
  for (const b of rows) {
    const k = String(b.service?.categoryId);
    const row = byCat.get(k) || { categoryId: k, jobs: 0, jobValue: 0 };
    row.jobs += 1;
    row.jobValue = r2(row.jobValue + (Number(b.amount) || 0));
    byCat.set(k, row);
  }
  const value = r2(rows.reduce((t, b) => t + (Number(b.amount) || 0), 0));
  return {
    month,
    categories: [...byCat.values()],
    jobs: rows.length,
    jobValue: value,
    rate,
    gstIfAddedOnTop: r2((value * rate) / 100),
    gstIfIncluded: r2(value - (value * 100) / (100 + rate)),
  };
}

module.exports = {
  STATES, isGstin, stateOfGstin, financialYear, getSettings, setSettings, splitTax, recordFee,
  listInvoices, getInvoice, issueCreditNote, monthSummary, uninvoicedFees, ecoExposure,
};
