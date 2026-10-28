const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-quick-cancel-"));
process.env.JWT_SECRET = "test-secret";
const jsonStore = require("../src/jsonStore");
const store = require("../src/store");
const accounting = require("../src/accounting");

const charged = (id, providerId, fee, atMs) => jsonStore.insert("bookingFees", { id, providerId, fee, at: new Date(atMs).toISOString() });
const iso = (ms) => new Date(ms).toISOString();

test("a booking cancelled within 90 seconds of acceptance gets its fee back, once", async () => {
  const t0 = Date.parse("2026-10-29T10:00:00Z");
  charged("b-quick", "p1", 40, t0);
  const before = store.getWallet("p1").balance;

  const out = await store._refundQuickCancelFee({ id: "b-quick", providerId: "p1" }, "b-quick", iso(t0 + 89000));
  assert.deepEqual(out, { fee: 40, providerId: "p1" });
  assert.equal(store.getWallet("p1").balance, before + 40);
  assert.equal(store.getWallet("p1").recharges.at(-1).kind, "credit", "not counted as a paid recharge");
  assert.ok(jsonStore.readAll("bookingFees").find((r) => r.id === "b-quick").refundedAt);

  assert.equal(await store._refundQuickCancelFee({ id: "b-quick", providerId: "p1" }, "b-quick", iso(t0 + 90000)), null, "never twice");
  assert.equal(store.getWallet("p1").balance, before + 40);
});

test("after 90 seconds, or with no fee charged, the fee stands", async () => {
  const t0 = Date.parse("2026-10-29T11:00:00Z");
  charged("b-late", "p2", 40, t0);
  assert.equal(await store._refundQuickCancelFee({ id: "b-late", providerId: "p2" }, "b-late", iso(t0 + 91000)), null);
  assert.equal(store.getWallet("p2").balance, 0);
  assert.equal(await store._refundQuickCancelFee({ id: "b-none", providerId: "p2" }, "b-none", iso(t0)), null, "cancelled before anyone accepted");
});

test("the refunded fee pays the provider who paid it and gets a GST credit note", async () => {
  accounting.setSettings({ gstin: "01AAACT1234A1ZP", legalName: "Tikdum Services Pvt Ltd", address: "Jammu, J&K" }, "test");
  accounting.setSettings({ enabled: true }, "test");
  const t0 = Date.now();
  charged("b-inv", "p-paid", 30, t0);
  accounting.recordFee({ provider: { id: "p-paid", name: "Ravi" }, bookingId: "b-inv", bookingRef: "ABC", fee: 30, at: iso(t0) });
  // The booking has since moved to another provider: the one who paid gets it back.
  await store._refundQuickCancelFee({ id: "b-inv", providerId: "p-other" }, "b-inv", iso(t0 + 30000));
  assert.equal(store.getWallet("p-paid").balance, 30);
  assert.equal(store.getWallet("p-other").balance, 0);
  const inv = accounting.listInvoices({ type: "invoice" }).find((i) => i.sourceId === "b-inv");
  assert.equal(inv.status, "credited");
  assert.ok(accounting.listInvoices({ type: "credit_note" }).some((n) => n.originalInvoiceId === inv.id));
});
