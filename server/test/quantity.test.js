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
