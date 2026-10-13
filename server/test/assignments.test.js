// Run: npm test  (throwaway DATA_DIR)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-assign-"));
const a = require("../src/assignments");

const booking = (id, amount, providerId, extra = {}) => ({ id, amount, providerId, ...extra });

test("price goes up: the customer keeps the booked price; the booked provider covers the difference", () => {
  const b = booking("b1", 150, "P1");
  const r = a.priceForMove(b, 200, "P2");
  assert.deepEqual([r.amount, r.cover, r.chargedProviderId], [150, 50, "P1"]);
  assert.equal(a.coverDue("b1", "P2").cover, 50);
  assert.equal(a.coverDue("b1", "P3"), null, "only the provider who does the job is owed it");
});

test("price goes down: the customer pays less and nobody is charged", () => {
  const r = a.priceForMove(booking("b2", 150, "P1"), 100, "P2");
  assert.deepEqual([r.amount, r.cover], [100, 0]);
  assert.equal(a.coverDue("b2", "P2"), null);
});

test("through a chain, the price promise stays the first booked price and the first provider stays responsible", () => {
  const b = booking("b3", 150, "P1");
  a.priceForMove(b, 100, "P2"); // P1 rejects → P2 at ₹100 (customer would pay 100)
  const r = a.priceForMove({ ...b, amount: 100, providerId: "P2" }, 260, "P3"); // P2 misses it → P3 at ₹260
  assert.deepEqual([r.amount, r.cover, r.chargedProviderId, r.quoted], [150, 110, "P1", 150]);
});

test("a provider who accepted and then hands it back becomes responsible", () => {
  const b = booking("b4", 300, "P1");
  a.priceForMove(b, 300, "P2");
  const r = a.priceForMove({ ...b, providerId: "P2" }, 380, "P3", { chargedProviderId: "P2" });
  assert.deepEqual([r.amount, r.cover, r.chargedProviderId], [300, 80, "P2"]);
});

test("going back to the provider who let it go costs nobody anything; settled covers aren't paid twice", () => {
  const b = booking("b5", 150, "P1");
  a.priceForMove(b, 400, "P2");
  const back = a.priceForMove({ ...b, providerId: "P2" }, 150, "P1");
  assert.equal(back.cover, 0);
  assert.equal(a.coverDue("b5", "P1"), null);

  const c = booking("b6", 150, "P1");
  a.priceForMove(c, 200, "P2");
  assert.ok(a.coverDue("b6", "P2"));
  a.markSettled("b6");
  assert.equal(a.coverDue("b6", "P2"), null);
});

test("waiting queue: one entry per booking, tried providers merged, removable", () => {
  a.addToQueue("q1", ["P1"]);
  a.addToQueue("q1", ["P2", "P1"]);
  assert.deepEqual(a.queued("q1").tried.sort(), ["P1", "P2"]);
  assert.ok(a.queuedIds().has("q1"));
  a.removeFromQueue("q1");
  assert.equal(a.queued("q1"), null);
});

test("deadline: 1 hour before a timed slot (at least 15 min from now); 2 hours for 'as soon as possible'", () => {
  const since = "2026-10-14T03:00:00.000Z"; // 08:30 IST
  // 2 PM IST slot = 08:30 UTC → deadline 07:30 UTC
  assert.equal(new Date(a.deadlineFor({ date: "2026-10-14", time: "02:00 PM – 04:00 PM" }, since)).toISOString(), "2026-10-14T07:30:00.000Z");
  // slot already close: still 15 minutes to try
  assert.equal(new Date(a.deadlineFor({ date: "2026-10-14", time: "09:00 AM" }, since)).toISOString(), "2026-10-14T03:15:00.000Z");
  assert.equal(new Date(a.deadlineFor({ date: "2026-10-14", time: "ASAP" }, since)).toISOString(), "2026-10-14T05:00:00.000Z");
});
