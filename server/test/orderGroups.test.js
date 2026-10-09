const test = require("node:test");
const assert = require("node:assert/strict");
const { groupByProvider, describeGroup, sameServiceName, pincodeFromLine } = require("../src/orderGroups");

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

test("the same service is matched by name, ignoring case and spacing — never a different service", () => {
  assert.equal(sameServiceName("Sofa Cleaning (1 Seat)", "  sofa  cleaning (1 seat) "), true);
  assert.equal(sameServiceName("Sofa Cleaning (1 Seat)", "Home Deep Cleaning"), false);
  assert.equal(sameServiceName("", ""), false);
  assert.equal(sameServiceName(null, undefined), false);
});

test("the customer's PIN is read from the end of the address line", () => {
  assert.equal(pincodeFromLine("B-12, Sector 21, Noida, 201301"), "201301");
  assert.equal(pincodeFromLine("House 110001, Lane 4, Delhi 110017"), "110017");
  assert.equal(pincodeFromLine("No pin here, call 98765"), "");
  assert.equal(pincodeFromLine(undefined), "");
});
