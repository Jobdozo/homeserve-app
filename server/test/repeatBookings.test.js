const { test } = require("node:test");
const assert = require("node:assert");
const repeat = require("../src/repeatBookings");

const now = Date.parse("2026-10-19T05:00:00Z"); // 10:30 AM IST
const ago = (min) => new Date(now - min * 60000).toISOString();
const booking = (over) => ({
  id: "b1",
  ref: "BC66CD79",
  serviceId: "s-bath",
  status: "Pending",
  createdAt: ago(15),
  service: { id: "s-bath", name: "Bathroom Cleaning", categoryId: "cleaning" },
  ...over,
});
const bath = { serviceId: "s-bath", name: "Bathroom Cleaning", categoryId: "cleaning" };
const sofa = { serviceId: "s-sofa", name: "Sofa Cleaning (1 Seat)", categoryId: "cleaning" };

test("no earlier booking: nothing to ask", () => {
  const r = repeat.find([bath], [], now);
  assert.deepEqual(r.matches, [null]);
  assert.equal(r.doubleTap, false);
});

test("same service within 2 minutes is a double tap", () => {
  const r = repeat.find([bath], [booking({ createdAt: ago(1) })], now);
  assert.equal(r.doubleTap, true);
  assert.equal(r.matches[0].id, "b1");
});

test("same service within the hour is a repeat to ask about, not a double tap", () => {
  const r = repeat.find([bath], [booking()], now);
  assert.equal(r.doubleTap, false);
  assert.equal(r.matches[0].id, "b1");
});

test("older than an hour, cancelled or rejected bookings don't count", () => {
  assert.deepEqual(repeat.find([bath], [booking({ createdAt: ago(61) })], now).matches, [null]);
  assert.deepEqual(repeat.find([bath], [booking({ status: "Cancelled" })], now).matches, [null]);
  assert.deepEqual(repeat.find([bath], [booking({ status: "Rejected" })], now).matches, [null]);
});

test("a different service doesn't count; the same-named service from another provider does", () => {
  assert.deepEqual(repeat.find([sofa], [booking()], now).matches, [null]);
  const other = booking({ serviceId: "s-bath-2", service: { id: "s-bath-2", name: "Bathroom Cleaning × 2", categoryId: "cleaning" } });
  assert.equal(repeat.find([bath], [other], now).matches[0].id, "b1");
});

test("a cart is a double tap only when every line was just booked", () => {
  const justNow = [booking({ createdAt: ago(1) }), booking({ id: "b2", serviceId: "s-sofa", createdAt: ago(1), service: { id: "s-sofa", name: "Sofa Cleaning (1 Seat)", categoryId: "cleaning" } })];
  assert.equal(repeat.find([bath, sofa], justNow, now).doubleTap, true);
  const r = repeat.find([bath, sofa], [booking({ createdAt: ago(1) })], now);
  assert.equal(r.doubleTap, false);
  assert.equal(r.matches[0].id, "b1");
  assert.equal(r.matches[1], null);
});

test("the newest earlier booking is the match", () => {
  const r = repeat.find([bath], [booking({ id: "old", createdAt: ago(40) }), booking({ id: "new", createdAt: ago(10) })], now);
  assert.equal(r.matches[0].id, "new");
});

test("describe: a question for the website, a stand-alone message for older apps", () => {
  const one = repeat.describe([booking()]);
  assert.equal(one.question, "You already booked Bathroom Cleaning at 10:15 AM (#BC66CD79). Book it again?");
  assert.match(one.error, /^You already booked Bathroom Cleaning at 10:15 AM \(#BC66CD79\)\. It's in My Bookings\. To book it again, try after 11:15 AM/);
  const sameOrder = repeat.describe([booking(), booking({ id: "b2", service: { name: "Sofa Cleaning (1 Seat) × 2" } })]);
  assert.equal(sameOrder.question, "You already booked Bathroom Cleaning and Sofa Cleaning (1 Seat) at 10:15 AM (#BC66CD79). Book them again?");
  const twoOrders = repeat.describe([booking(), booking({ id: "b2", ref: "WC55XP15", createdAt: ago(5), service: { name: "Sofa Cleaning (1 Seat)" } })]);
  assert.match(twoOrders.question, /Bathroom Cleaning at 10:15 AM \(#BC66CD79\) and Sofa Cleaning \(1 Seat\) at 10:25 AM \(#WC55XP15\)\. Book them again\?/);
  assert.match(twoOrders.error, /try after 11:25 AM/);
});

test("oneAtATime: a customer's requests run in turn; other customers aren't held up", async () => {
  const order = [];
  const slow = (tag, ms) => () => new Promise((r) => setTimeout(() => { order.push(tag); r(tag); }, ms));
  const a1 = repeat.oneAtATime("c1", slow("c1-first", 30));
  const a2 = repeat.oneAtATime("c1", slow("c1-second", 1));
  const b1 = repeat.oneAtATime("c2", slow("c2", 5));
  await Promise.all([a1, a2, b1]);
  assert.deepEqual(order, ["c2", "c1-first", "c1-second"]);
  // A failed request doesn't block the next one.
  await assert.rejects(repeat.oneAtATime("c3", async () => { throw new Error("boom"); }));
  assert.equal(await repeat.oneAtATime("c3", async () => "ok"), "ok");
});
