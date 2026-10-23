const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-live-"));
process.env.JWT_SECRET = "test-secret";
const live = require("../src/liveLocation");
const staff = require("../src/staff");

const b = { id: "b1", providerId: "p1", customerId: "c1", status: "Accepted" };

test("a trip runs only while the booking is Accepted with the same provider", () => {
  live.startTrip(b);
  assert.equal(live.tripsOf("p1").length, 1);
  assert.deepEqual(live.bookingChanged({ ...b }), []); // still on the way
  assert.deepEqual(live.bookingChanged({ ...b, status: "In Progress" }), ["trip"]); // start code entered
  assert.equal(live.getTrip("b1"), null);
  live.startTrip(b);
  assert.deepEqual(live.bookingChanged({ ...b, providerId: "p2" }), ["trip"]); // handed to someone else
  live.startTrip(b);
  live.stopTrip("b1");
  assert.equal(live.allTrips().length, 0);
});

test("a customer's share lasts through the job and stops when it ends", () => {
  live.startShare(b);
  assert.equal(live.sharesOf("c1").length, 1);
  assert.deepEqual(live.bookingChanged({ ...b, status: "In Progress" }), []);
  assert.deepEqual(live.bookingChanged({ ...b, status: "Completed" }), ["share"]);
  assert.equal(live.getShare("b1"), null);
});

test("starting a trip is acting on the order for staff; seeing the customer is viewing it", () => {
  const rule = (m, p) => staff._ruleFor(m, p);
  assert.deepEqual(rule("POST", "/bookings/b1/trip"), { needs: "orders.act", scope: true });
  assert.deepEqual(rule("GET", "/bookings/b1/live-location"), { needs: ["orders.view_all", "orders.view_assigned"], scope: true });
});
