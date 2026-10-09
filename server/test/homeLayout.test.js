const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-homelayout-"));
process.env.JWT_SECRET = "test-secret";
const jsonStore = require("../src/jsonStore");
const store = require("../src/store");

test("a fresh layout includes the lowest-price row, right after the categories", () => {
  const sections = store.listHomeSections();
  assert.equal(sections[0].type, "categories");
  assert.equal(sections[1].type, "lowest_per_category");
  assert.equal(sections.filter((s) => s.type === "lowest_per_category").length, 1);
});

test("a layout saved earlier gets the row once, after the categories; deleting it keeps it deleted", () => {
  jsonStore.writeAll("homeSections", [
    { id: "a", type: "categories", title: "Cats", enabled: true, order: 0 },
    { id: "b", type: "most_booked", title: "Most", enabled: true, order: 1 },
    { id: "c", type: "services", title: "For you", enabled: true, order: 2 },
  ]);
  jsonStore.writeAll("homeLayoutMigrations", []);
  const first = store.listHomeSections();
  assert.deepEqual(first.map((s) => s.type), ["categories", "lowest_per_category", "most_booked", "services"]);
  assert.deepEqual(first.map((s) => s.order), [0, 1, 2, 3]);
  // The team removes it: it must not come back on the next read.
  jsonStore.remove("homeSections", first[1].id);
  assert.deepEqual(store.listHomeSections().map((s) => s.type), ["categories", "most_booked", "services"]);
  assert.deepEqual(store.listHomeSections().map((s) => s.type), ["categories", "most_booked", "services"]);
});

test("an admin can add the new section type; an unknown type is refused", () => {
  const s = store.createHomeSection({ type: "lowest_per_category", title: "Best prices" }, "tester");
  assert.equal(s.type, "lowest_per_category");
  assert.throws(() => store.createHomeSection({ type: "nonsense", title: "x" }, "tester"), /Invalid section type/);
});
