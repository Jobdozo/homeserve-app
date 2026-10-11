const test = require("node:test");
const assert = require("node:assert/strict");
const { normName, duplicateGroups, pickKeeper, mergeRatings, similarNames, similarPairs, pairKey } = require("../src/duplicates");

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

test("look-alike names are caught, but different services are not", () => {
  assert.equal(similarNames("Ceiling fan", "Ceiling fan cleaning"), true);
  assert.equal(similarNames("Kitchen windows", "Kitchen windows Cleaning"), true);
  assert.equal(similarNames("Celing fan cleaning", "Ceiling fan cleaning"), true, "a typo");
  assert.equal(similarNames("AC Gas Refill", "AC Installation"), false);
  assert.equal(similarNames("Split AC", "Window AC"), false);
  assert.equal(similarNames("Sofa Cleaning (1 Seat)", "Sofa Cleaning (3 Seat)"), false, "a different number is a different service");
  assert.equal(similarNames("1 Ton AC", "1.5 Ton AC"), false);
  assert.equal(similarNames("Chimney cleaning", "chimney  CLEANING"), false, "exact duplicates are handled separately");
  assert.equal(similarNames("Fan", "Fan repair"), false, "a real extra word makes it a different service");
  assert.equal(similarNames("Kitchen Cleaning", "Kitchen windows Cleaning"), false);
  assert.equal(similarNames("Water Tank Cleaning", "Underground Water Tank Cleaning"), false);
  assert.equal(similarNames("Rica Waxing – Full Arms", "Rica Waxing – Full Arms & Underarms"), false);
  assert.equal(similarNames("Rica Waxing – Half Back", "Rica Waxing – Full Back"), false);
  assert.equal(similarNames("Aroma Magic Pedicure", "Aroma Magic Manicure"), false);
  assert.equal(similarNames("AC Service", "AC"), true, "only a filler word differs");
});

test("look-alike pairs are only compared inside the same scope; pair keys ignore order", () => {
  const items = [
    { id: 1, scope: "p1|cleaning", name: "Ceiling fan" },
    { id: 2, scope: "p1|cleaning", name: "Ceiling fan cleaning" },
    { id: 3, scope: "p2|cleaning", name: "Ceiling fan cleaning" },
  ];
  const pairs = similarPairs(items, (x) => x.scope, (x) => x.name);
  assert.deepEqual(pairs.map(([a, b]) => [a.id, b.id]), [[1, 2]]);
  assert.equal(pairKey("service", "b", "a"), pairKey("service", "a", "b"));
});
