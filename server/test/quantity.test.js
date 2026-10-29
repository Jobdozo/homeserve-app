const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeQuantity, MAX_QUANTITY } = require("../src/quantity");

test("a missing quantity means one", () => {
  assert.equal(normalizeQuantity(undefined), 1);
  assert.equal(normalizeQuantity(null), 1);
  assert.equal(normalizeQuantity(""), 1);
});

test("whole numbers from 1 to the maximum are accepted, strings included", () => {
  assert.equal(normalizeQuantity(10), 10);
  assert.equal(normalizeQuantity("3"), 3);
  assert.equal(normalizeQuantity(MAX_QUANTITY), MAX_QUANTITY);
});

test("zero, negatives, fractions, junk and too many are refused with a 400", () => {
  for (const bad of [0, -1, 2.5, "abc", MAX_QUANTITY + 1, NaN]) {
    assert.throws(() => normalizeQuantity(bad), (e) => e.status === 400 && /whole number/.test(e.message), String(bad));
  }
});

test("per-unit services: priced under ₹50, the quantity is sq ft (litres for tanks) up to 20,000", () => {
  const { unitOf, quantityText, MAX_UNITS } = require("../src/quantity");
  const porch = { name: "Porch and outdoor tile cleaning", price: 15 };
  const tank = { name: "Commercial Water Tank Cleaning", price: 1 };
  const sofa = { name: "Sofa Cleaning (1 Seat)", price: 249 };
  const onInspection = { name: "D-Tan", price: 0 };
  assert.equal(unitOf(porch), "sq ft");
  assert.equal(unitOf(tank), "litres");
  assert.equal(unitOf(sofa), null);
  assert.equal(unitOf(onInspection), null, "price on inspection isn't per unit");
  assert.equal(normalizeQuantity(500, porch), 500);
  assert.equal(normalizeQuantity(MAX_UNITS, tank), MAX_UNITS);
  assert.throws(() => normalizeQuantity(MAX_UNITS + 1, porch), /area in sq ft, from 1 to 20000/);
  assert.throws(() => normalizeQuantity(51, sofa), /whole number from 1 to 50/, "pieces still stop at 50");
  assert.equal(quantityText(500, porch), "× 500 sq ft");
  assert.equal(quantityText(3, sofa), "× 3");
});

test("an area in the booking name doesn't stop repeat-booking checks matching the service", () => {
  const repeat = require("../src/repeatBookings");
  const now = Date.parse("2026-10-29T10:00:00Z");
  const booked = { id: "b1", ref: "AB12", status: "Pending", createdAt: new Date(now - 60000).toISOString(), serviceId: "other", service: { name: "Carpet Cleaning × 300 sq ft", categoryId: "cleaning" } };
  const { matches } = repeat.find([{ serviceId: "s1", name: "Carpet Cleaning", categoryId: "cleaning" }], [booked], now);
  assert.equal(matches[0]?.id, "b1");
  assert.match(repeat.describe(matches).question || repeat.describe(matches).error || "", /Carpet Cleaning(?! ×)/);
});
