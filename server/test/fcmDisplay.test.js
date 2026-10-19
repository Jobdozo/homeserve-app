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

test("a picture: customers get a big-picture notification on their app channel; providers get it on theirs", () => {
  const img = "https://tikdum.com/push-banners/home-cleaning.jpg";
  const c = fcm.displayFor("customer", { title: "Clean home, happy you", body: "Book home cleaning", type: "announcement", image: img });
  assert.deepEqual(c.notification, { title: "Clean home, happy you", body: "Book home cleaning", imageUrl: img });
  assert.equal(c.android.notification.channelId, "tikdum_customer_updates");
  assert.equal(c.android.notification.icon, "ic_stat_tikdum");
  assert.equal(c.android.notification.imageUrl, img);
  const p = fcm.displayFor("provider", { title: "Offer", body: "x", type: "announcement", image: img });
  assert.equal(p.notification.imageUrl, img);
  assert.equal(p.android.notification.channelId, "tikdum_updates");
  // No picture: customers stay data-only (their app shows it), and the booking ring never gets a notification block.
  assert.equal(fcm.displayFor("customer", { title: "Booked", type: "booking:accepted" }), null);
  assert.equal(fcm.displayFor("provider", { title: "New booking request", type: "booking:created", image: img }), null);
});
