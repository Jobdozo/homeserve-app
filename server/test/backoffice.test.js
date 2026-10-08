const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-backoffice-"));
process.env.JWT_SECRET = "test-secret";
const { providerChecklist, reconcileData } = require("../src/backoffice");
const access = require("../src/access");

const complete = {
  id: "p1", name: "Ravi Kumar", category: "plumbing", phone: "+919811100000", serviceArea: "Gandhi Nagar",
  coverage: { pincodes: ["180004"] }, agreementAccepted: true, experience: "5 years", joinedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
};

test("checklist: complete application is ready", () => {
  const r = providerChecklist(complete, { docs: [{ docType: "id_proof" }], services: [{ id: "s1" }], others: [complete] });
  assert.equal(r.ready, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.waitingDays, 3);
});

test("checklist: missing items, bad GST and duplicates block readiness", () => {
  const p = { ...complete, id: "p2", agreementAccepted: false, gstNumber: "12ABC" };
  const dupe = { id: "p3", name: "ravi kumar", category: "Plumbing", verificationStatus: "approved" };
  const r = providerChecklist(p, { docs: [], services: [], others: [p, dupe] });
  assert.equal(r.ready, false);
  for (const k of ["services", "id_proof", "agreement", "gst_format", "gst_doc", "duplicate"]) assert.ok(r.missing.includes(k), k);
  assert.match(r.checks.find((c) => c.key === "duplicate").detail, /ravi kumar \(approved\)/);
  assert.equal(providerChecklist({ ...complete, gstNumber: "27AAPFU0939F1ZV" }, { docs: [{ docType: "id_proof" }, { docType: "gst_certificate" }], services: [{}] }).ready, true);
  assert.equal(providerChecklist({ ...complete, name: "New Provider" }, { docs: [{ docType: "id_proof" }], services: [{}] }).missing[0], "name");
});

test("reconciliation finds each kind of mismatch and nothing on clean data", () => {
  const t0 = "2026-10-01T00:00:00.000Z";
  const clean = reconcileData({
    wallets: [{ id: "p1", balance: 450, recharges: [{ amount: 500 }], deductions: [{ amount: 50, reason: "commission" }] }],
    fees: [{ id: "b1", fee: 50, at: t0 }],
    bookings: [{ id: "b1", providerId: "p1", status: "Completed", statusHistory: { Completed: t0 } }],
    providers: [{ id: "p1", name: "Ravi" }],
    expectedFee: () => 50,
  });
  assert.equal(clean.issueCount, 0);
  assert.equal(clean.totals.totalCommissionInr, 50);

  const r = reconcileData({
    wallets: [
      { id: "p1", balance: 999, recharges: [{ amount: 500 }], deductions: [{ amount: 50, reason: "commission" }, { amount: 50, reason: "commission" }] },
      { id: "p2", balance: -20, recharges: [], deductions: [{ amount: 20, reason: "ad_click" }] },
    ],
    fees: [{ id: "b1", fee: 50, at: t0 }, { id: "b9", fee: 30, at: t0 }, { id: "b3", fee: 40, at: t0 }],
    bookings: [
      { id: "b1", providerId: "p1", status: "Completed", statusHistory: { Completed: t0 } },
      { id: "b2", ref: "TK2", providerId: "p1", status: "Completed", statusHistory: { Completed: "2026-10-02T00:00:00Z" } },
      { id: "b0", providerId: "p1", status: "Completed", statusHistory: { Completed: "2026-09-01T00:00:00Z" } }, // before fees existed
      { id: "b3", providerId: "p1", status: "Cancelled" },
    ],
    providers: [{ id: "p1", name: "Ravi" }, { id: "p2", name: "Sita" }],
    expectedFee: () => 25,
  });
  const types = r.issues.map((i) => i.type).sort();
  assert.deepEqual(types, ["commission_mismatch", "fee_on_unfinished_job", "fee_without_booking", "negative_balance", "uncharged_job", "wallet_mismatch"]);
  assert.equal(r.issues[0].severity, "critical");
  assert.equal(r.issues.find((i) => i.type === "uncharged_job").bookingId, "b2");
});

test("permission rules for the new endpoints", () => {
  assert.equal(access.requiredFor("GET", "/admin/verification/precheck"), "providers.view");
  assert.equal(access.requiredFor("GET", "/admin/payments/reconciliation"), "payments.view");
});

test("a fee on an Accepted or In Progress job is normal (charged on acceptance); on a job handed back or cancelled it is flagged", () => {
  const t0 = "2026-10-01T00:00:00.000Z";
  const r = reconcileData({
    wallets: [{ id: "p1", balance: 400, recharges: [{ amount: 500 }], deductions: [{ amount: 25, reason: "commission" }, { amount: 25, reason: "commission" }, { amount: 25, reason: "commission" }, { amount: 25, reason: "commission" }] }],
    fees: [
      { id: "a1", fee: 25, at: t0 }, // Accepted
      { id: "a2", fee: 25, at: t0 }, // In Progress
      { id: "a3", fee: 25, at: t0 }, // handed back to Pending
      { id: "a4", fee: 25, at: t0 }, // Rejected after acceptance
    ],
    bookings: [
      { id: "a1", providerId: "p1", status: "Accepted" },
      { id: "a2", providerId: "p1", status: "In Progress" },
      { id: "a3", providerId: "p1", status: "Pending" },
      { id: "a4", providerId: "p1", status: "Rejected" },
    ],
    providers: [{ id: "p1", name: "Ravi" }],
    expectedFee: () => 25,
  });
  const flagged = r.issues.filter((i) => i.type === "fee_on_unfinished_job").map((i) => i.bookingId).sort();
  assert.deepEqual(flagged, ["a3", "a4"]);
  assert.equal(r.issues.length, 2);
});
