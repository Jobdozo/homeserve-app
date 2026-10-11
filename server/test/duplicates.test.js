const test = require("node:test");
const assert = require("node:assert/strict");
const { normName, duplicateGroups, pickKeeper, mergeRatings } = require("../src/duplicates");

test("names match ignoring case and spacing", () => {
  assert.equal(normName("  Chimney   Cleaning "), "chimney cleaning");
  assert.equal(normName(null), "");
});

test("only groups with two or more of the same key are duplicates", () => {
  const items = [
    { id: 1, p: "A", name: "Chimney cleaning" },
    { id: 2, p: "A", name: "chimney  Cleaning" },
    { id: 3, p: "B", name: "Chimney cleaning" },
    { id: 4, p: "A", name: "Sofa" },
    { id: 5, p: "A", name: "" },
    { id: 6, p: "A", name: "" },
  ];
  const groups = duplicateGroups(items, (x) => (x.name ? `${x.p}|${normName(x.name)}` : null));
  assert.deepEqual(groups.map((g) => g.map((x) => x.id)), [[1, 2]]);
});

test("the keeper is the best-scoring item, ties to the smaller tie-break", () => {
  const group = [
    { id: "b", active: false, bookings: 9 },
    { id: "a", active: true, bookings: 1 },
    { id: "c", active: true, bookings: 1 },
  ];
  const keep = pickKeeper(group, (s) => (s.active ? 1000 : 0) + s.bookings);
  assert.equal(keep.id, "a");
});

test("ratings merge weighted by review count", () => {
  assert.deepEqual(mergeRatings({ rating: 5, reviewCount: 3 }, { rating: 4, reviewCount: 1 }), { rating: 4.8, reviewCount: 4 });
  assert.deepEqual(mergeRatings({ rating: 0, reviewCount: 0 }, { rating: 0, reviewCount: 0 }), { rating: 0, reviewCount: 0 });
});
