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

test("trips and shares survive a restart (positions don't), and know where they're heading", () => {
  live.startTrip({ ...b, id: "b9", address: { lat: 32.71, lng: 74.86 } });
  live.startShare({ ...b, id: "b9" });
  live.setLocation("provider", "p1", 32.7, 74.8, 10);
  delete require.cache[require.resolve("../src/liveLocation")];
  const again = require("../src/liveLocation");
  assert.deepEqual(again.getTrip("b9").to, { lat: 32.71, lng: 74.86 });
  assert.ok(again.getShare("b9"));
  assert.equal(again.getLocation("provider", "p1"), undefined);
  again.stopTrip("b9");
  again.stopShare("b9");
  delete require.cache[require.resolve("../src/liveLocation")];
  assert.equal(require("../src/liveLocation").getTrip("b9"), null);
});

test("route: drawn once, reused, redrawn when old or far off; two-wheeler first, car if that fails", async () => {
  process.env.GOOGLE_MAPS_BROWSER_KEY = "AIzaTEST";
  const routes = require("../src/tripRoutes");
  const from = { lat: 32.70, lng: 74.85 };
  const to = { lat: 32.73, lng: 74.86 };
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ mode: body.travelMode, referer: opts.headers.Referer, key: opts.headers["X-Goog-Api-Key"] });
    if (body.travelMode === "TWO_WHEELER" && calls.length === 1) return { ok: false, status: 400, json: async () => ({ error: { message: "not here" } }) };
    return { ok: true, status: 200, json: async () => ({ routes: [{ distanceMeters: 4200, duration: "780s", polyline: { encodedPolyline: "abc" } }] }) };
  };
  const t0 = 1_000_000;
  const first = await routes.routeFor("r1", from, to, { now: t0, fetchImpl });
  assert.equal(first.fresh, true);
  assert.deepEqual(routes.view(first.route).durationSeconds, 780);
  assert.deepEqual(calls.map((c) => c.mode), ["TWO_WHEELER", "DRIVE"]);
  assert.equal(calls[0].referer, "https://tikdum.com/");
  assert.equal((await routes.routeFor("r1", { lat: 32.701, lng: 74.851 }, to, { now: t0 + 60000, fetchImpl })).fresh, false); // close by, 1 min old
  assert.equal(calls.length, 2);
  assert.equal((await routes.routeFor("r1", { lat: 32.705, lng: 74.851 }, to, { now: t0 + 60000, fetchImpl })).fresh, true); // ~550 m off
  assert.equal((await routes.routeFor("r1", { lat: 32.705, lng: 74.851 }, to, { now: t0 + 60000 + 3 * 60000, fetchImpl })).fresh, true); // 3 min old
  assert.equal(routes.needsRoute({ from, to, at: t0 }, { lat: 32.73, lng: 74.85 }, to, t0 + 10000), false); // never twice in 30 s
});
