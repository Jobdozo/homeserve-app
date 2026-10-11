const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-typedup-"));
const jsonStore = require("../src/jsonStore");
const subcategories = require("../src/subcategories");

test("duplicate types merge into one and their services move to the kept type", () => {
  const now = new Date().toISOString();
  const a = jsonStore.insert("subcategories", { categoryId: "ac-repair", name: "Split AC", sortOrder: 1, active: true, createdAt: now });
  const b = jsonStore.insert("subcategories", { categoryId: "ac-repair", name: "split  ac", sortOrder: 2, active: true, imageUrl: "/uploads/split.jpg", createdAt: now });
  jsonStore.insert("serviceSubcategories", { id: "svc1", subcategoryId: a.id });
  jsonStore.insert("serviceSubcategories", { id: "svc2", subcategoryId: b.id });

  assert.equal(subcategories.duplicateTypes().length, 1);
  const r = subcategories.mergeDuplicates();
  assert.equal(r.removed, 1);

  const left = jsonStore.readAll("subcategories").filter((t) => t.categoryId === "ac-repair");
  assert.equal(left.length, 1, "one type remains");
  const kept = left[0];
  assert.equal(kept.imageUrl, "/uploads/split.jpg", "the type with a picture is the one kept");
  assert.equal(subcategories.subcategoryOf("svc1"), kept.id);
  assert.equal(subcategories.subcategoryOf("svc2"), kept.id);
  assert.deepEqual(r.replaced, [[a.id, kept.id]]);
  assert.equal(subcategories.duplicateTypes().length, 0);
});
