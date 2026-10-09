const test = require("node:test");
const assert = require("node:assert/strict");
const { groupByProvider, describeGroup } = require("../src/orderGroups");

const b = (id, providerId, name) => ({ id, providerId, service: { name } });

test("bookings of one order are grouped per provider, in order", () => {
  const groups = groupByProvider([b(1, "A", "Sofa"), b(2, "B", "AC"), b(3, "A", "Fridge")]);
  assert.deepEqual(groups.map((g) => g.map((x) => x.id)), [[1, 3], [2]]);
});

test("no bookings gives no groups", () => {
  assert.deepEqual(groupByProvider([]), []);
});

test("a group is described by its service names, shortened when long", () => {
  assert.equal(describeGroup([b(1, "A", "Sofa")]), "Sofa");
  assert.equal(describeGroup([b(1, "A", "Sofa"), b(2, "A", "AC")]), "Sofa, AC");
  const many = ["a", "b", "c", "d", "e"].map((n, i) => b(i, "A", n));
  assert.equal(describeGroup(many), "a, b, c and 2 more");
  assert.equal(describeGroup([]), "A service");
});
