const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-accounting-"));
process.env.JWT_SECRET = "test-secret";
const accounting = require("../src/accounting");
const access = require("../src/access");

const GSTIN_JK = "01AAACT1234A1ZP"; // Tikdum, J&K (state code 01)
const GSTIN_DL = "07AABCP5678B1Z3"; // a registered provider in Delhi (07)
const NOW = "2026-10-07T10:00:00.000Z";

test("GSTIN checks: shape and state code", () => {
  assert.equal(accounting.isGstin(GSTIN_JK), true);
  assert.equal(accounting.isGstin("01aaact1234a1zp"), true); // case/space tolerant
  assert.equal(accounting.isGstin("99AAACT1234A1ZP"), false); // no such state
  assert.equal(accounting.isGstin("01AAACT1234A1XP"), false); // 14th char must be Z
  assert.equal(accounting.isGstin("12345"), false);
  assert.equal(accounting.stateOfGstin(GSTIN_DL), "07");
});

test("financial year runs April to March, in IST", () => {
  assert.equal(accounting.financialYear("2026-10-07T10:00:00Z"), "26-27");
  assert.equal(accounting.financialYear("2027-03-31T10:00:00Z"), "26-27");
  assert.equal(accounting.financialYear("2027-04-01T10:00:00Z"), "27-28");
  assert.equal(accounting.financialYear("2026-03-31T19:00:00Z"), "26-27"); // 00:30 IST on 1 April
});

test("GST split: a Rs 40 fee that includes 18% GST is 33.90 + 6.10, and the parts always add up", () => {
  const intra = accounting.splitTax(40, 18, true, true);
  assert.deepEqual(intra, { taxableValue: 33.9, cgst: 3.05, sgst: 3.05, igst: 0, total: 40 });
  const inter = accounting.splitTax(40, 18, true, false);
  assert.deepEqual(inter, { taxableValue: 33.9, cgst: 0, sgst: 0, igst: 6.1, total: 40 });
  const onTop = accounting.splitTax(40, 18, false, true);
  assert.deepEqual(onTop, { taxableValue: 40, cgst: 3.6, sgst: 3.6, igst: 0, total: 47.2 });
  for (const fee of [1, 7.5, 12.34, 39.99, 100, 333.33]) {
    const t = accounting.splitTax(fee, 18, true, true);
    assert.equal(Math.round((t.taxableValue + t.cgst + t.sgst) * 100) / 100, fee, `fee ${fee}`);
  }
});

test("settings: validation, and invoicing can't be switched on without a GSTIN, name and address", () => {
  assert.equal(accounting.getSettings().enabled, false);
  assert.throws(() => accounting.setSettings({ gstin: "nope" }), /isn't valid/);
  assert.throws(() => accounting.setSettings({ pan: "123" }), /PAN/);
  assert.throws(() => accounting.setSettings({ gstRate: 40 }), /between 0 and 28/);
  assert.throws(() => accounting.setSettings({ sacCode: "ab" }), /SAC/);
  assert.throws(() => accounting.setSettings({ enabled: true }), /GSTIN/);
  accounting.setSettings({ gstin: GSTIN_JK, legalName: "Tikdum Services Pvt Ltd", address: "Jammu, J&K" }, "owner");
  assert.throws(() => accounting.setSettings({ enabled: true, address: "" }), /address/);
  assert.throws(() => accounting.setSettings({ invoicePrefix: "TKC" }), /different prefixes/);
  const on = accounting.setSettings({ enabled: true, address: "Jammu, J&K" }, "owner");
  assert.equal(on.enabled, true);
  assert.equal(on.stateCode, "01");
  assert.equal(on.stateName, "Jammu and Kashmir");
  assert.ok(on.startedAt);
});

test("invoices: serial numbers are gap-free, 16 characters at most, once per fee", () => {
  const p = { id: "p1", name: "Ravi Plumbing", gstNumber: "", serviceArea: "Gandhi Nagar, Jammu" };
  const a = accounting.recordFee({ provider: p, bookingId: "b1", bookingRef: "AB12", fee: 40, at: NOW });
  const b = accounting.recordFee({ provider: p, bookingId: "b2", bookingRef: "AB13", fee: 25, at: NOW });
  assert.equal(a.number, "TKD/26-27/000001");
  assert.equal(b.number, "TKD/26-27/000002");
  assert.ok(a.number.length <= 16);
  assert.equal(accounting.recordFee({ provider: p, bookingId: "b1", fee: 40, at: NOW }).id, a.id, "same fee is never invoiced twice");
  assert.equal(accounting.listInvoices().length, 2);
  // Unregistered provider, same state: CGST + SGST, place of supply is Tikdum's state.
  assert.equal(a.cgst, 3.05);
  assert.equal(a.igst, 0);
  assert.equal(a.placeOfSupplyCode, "01");
  assert.equal(a.recipient.gstin, "");
  // Next financial year restarts at 1.
  const c = accounting.recordFee({ provider: p, bookingId: "b3", fee: 40, at: "2027-04-02T10:00:00Z" });
  assert.equal(c.number, "TKD/27-28/000001");
});

test("a registered provider in another state is charged IGST and lands in B2B", () => {
  const inv = accounting.recordFee({ provider: { id: "p2", name: "Delhi Fixers", businessName: "Delhi Fixers LLP", gstNumber: GSTIN_DL }, bookingId: "b4", bookingRef: "AB14", fee: 40, at: NOW });
  assert.equal(inv.igst, 6.1);
  assert.equal(inv.cgst, 0);
  assert.equal(inv.placeOfSupplyCode, "07");
  assert.equal(inv.recipient.name, "Delhi Fixers LLP");
  assert.equal(inv.recipient.gstin, GSTIN_DL);
});

test("a zero fee is not invoiced", () => {
  assert.equal(accounting.recordFee({ provider: { id: "p9" }, bookingId: "z", fee: 0, at: NOW }), null);
});

test("credit note: one per invoice, own series, reduces the month's GST", () => {
  const inv = accounting.listInvoices({ q: "AB12" })[0];
  assert.throws(() => accounting.issueCreditNote(inv.id, "", "owner"), /why/);
  const note = accounting.issueCreditNote(inv.id, "Customer cancelled", "owner");
  assert.match(note.number, /^TKC\/26-27\/000001$/);
  assert.equal(note.type, "credit_note");
  assert.equal(note.originalNumber, inv.number);
  assert.equal(note.total, 40);
  assert.equal(accounting.getInvoice(inv.id).status, "credited");
  assert.throws(() => accounting.issueCreditNote(inv.id, "again", "owner"), /already has a credit note/);
  assert.throws(() => accounting.issueCreditNote(note.id, "x", "owner"), /not found/, "can't credit a credit note");
});

test("month summary: GSTR-3B totals are net of credit notes; B2B and B2C are split", () => {
  const s = accounting.monthSummary("2026-10");
  // Invoices this month: b1 (40, credited), b2 (25), b4 (40 IGST). Credit note for b1.
  assert.equal(s.counts.invoices, 3);
  assert.equal(s.counts.creditNotes, 1);
  assert.equal(s.b2b.length, 1);
  assert.equal(s.b2b[0].gstin, GSTIN_DL);
  assert.equal(s.b2c.length, 1);
  assert.equal(s.b2c[0].invoices, 2);
  // Taxable: 33.90 + 21.19 + 33.90 - 33.90 (credit) ; tax: 6.10 + 3.81 + 6.10 - 6.10
  const t = s.gstr3b;
  assert.equal(t.taxableValue, Math.round((33.9 + 21.19 + 33.9 - 33.9) * 100) / 100);
  assert.equal(t.igst, 6.1);
  assert.equal(Math.round((t.cgst + t.sgst) * 100) / 100, 3.81);
  assert.equal(t.totalTax, Math.round((6.1 + 3.81) * 100) / 100);
  assert.equal(s.sacSummary.length, 1);
  assert.equal(s.sacSummary[0].count, 2); // 3 invoices - 1 credit note
  assert.throws(() => accounting.monthSummary("2026-13"), /Month/);
});

test("fees that were charged after invoicing started but have no invoice are reported", () => {
  const started = accounting.getSettings().startedAt;
  const later = new Date(new Date(started).getTime() + 1000).toISOString();
  const missing = accounting.uninvoicedFees([
    { id: "b1", at: later }, // invoiced
    { id: "bX", at: later }, // not invoiced
    { id: "bOld", at: "2020-01-01T00:00:00Z" }, // charged before invoicing began
  ]);
  assert.deepEqual(missing.map((f) => f.id), ["bX"]);
});

test("section 9(5) exposure: only completed jobs in marked categories by providers without a GSTIN", () => {
  const bookings = [
    { id: "j1", status: "Completed", providerId: "u1", amount: 1000, service: { categoryId: "plumbing" }, statusHistory: { Completed: "2026-10-03T10:00:00Z" } },
    { id: "j2", status: "Completed", providerId: "r1", amount: 5000, service: { categoryId: "plumbing" }, statusHistory: { Completed: "2026-10-03T10:00:00Z" } }, // registered
    { id: "j3", status: "Completed", providerId: "u1", amount: 700, service: { categoryId: "ac-repair" }, statusHistory: { Completed: "2026-10-03T10:00:00Z" } }, // category not marked
    { id: "j4", status: "Accepted", providerId: "u1", amount: 900, service: { categoryId: "plumbing" } }, // not completed
    { id: "j5", status: "Completed", providerId: "u1", amount: 300, service: { categoryId: "plumbing" }, statusHistory: { Completed: "2026-09-30T10:00:00Z" } }, // other month
  ];
  const providers = [{ id: "u1", gstNumber: "" }, { id: "r1", gstNumber: GSTIN_DL }];
  const r = accounting.ecoExposure({ month: "2026-10", bookings, providers, categoryIds: ["plumbing"], rate: 18 });
  assert.equal(r.jobs, 1);
  assert.equal(r.jobValue, 1000);
  assert.equal(r.gstIfAddedOnTop, 180);
  assert.equal(r.gstIfIncluded, 152.54);
});

test("permissions: view for reading, manage for settings and credit notes, nothing for anonymous staff roles", () => {
  assert.equal(access.requiredFor("GET", "/admin/accounting/summary"), "accounting.view");
  assert.equal(access.requiredFor("GET", "/admin/accounting/invoices"), "accounting.view");
  assert.equal(access.requiredFor("PATCH", "/admin/accounting/settings", {}), "accounting.manage");
  assert.equal(access.requiredFor("POST", "/admin/accounting/invoices/abc/credit-note", {}), "accounting.manage");
  assert.equal(access.permits(["payments.manage"], "accounting.view"), false);
  assert.equal(access.permits(["accounting.manage"], "accounting.view"), true);
});
