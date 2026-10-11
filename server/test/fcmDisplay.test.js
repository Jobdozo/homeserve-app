// Run: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const fcm = require("../src/fcm");

test("provider updates carry a visible notification; the booking ring and customers don't", () => {
  const d = fcm.displayFor("provider", { title: "Holiday notice", body: "Office closed Monday", type: "announcement" });
  assert.deepEqual(d.notification, { title: "Holiday notice", body: "Office closed Monday" });
  assert.equal(d.android.notification.channelId, "tikdum_updates");
  assert.equal(fcm.displayFor("provider", { title: "New booking request", type: "booking:created", bookingId: "b1" }), null);
  assert.equal(fcm.displayFor("customer", { title: "Booked", type: "booking:accepted" }), null);
  assert.equal(fcm.displayFor("provider", { type: "announcement" }), null);
});
