const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-catalogauto-"));
process.env.JWT_SECRET = "test-secret";
const store = require("../src/store");
const catalog = require("../src/serviceCatalog");

const svc = (over = {}) => ({ id: "s", name: "Full Arms Waxing", categoryId: "salon-spa", price: 349, originalPrice: 698, tagline: "", includes: [], subcategoryId: "t1", status: "active", providerId: "p1", ...over });

test("a service creates its catalog entry once; same category + name is the same entry", () => {
  const a = catalog.ensureForService(svc());
  assert.equal(a.source, "auto");
  assert.equal(a.price, 349);
  assert.equal(a.originalPrice, 698);
  assert.equal(a.subcategoryId, "t1");
  const again = catalog.ensureForService(svc({ name: "  full   arms waxing ", price: 100 }));
  assert.equal(again.id, a.id, "spacing and case don't make a new entry");
  assert.equal(catalog.list().length, 1);
  const other = catalog.ensureForService(svc({ categoryId: "ac-repair" }));
  assert.notEqual(other.id, a.id, "same name in another category is a different entry");
  assert.equal(catalog.ensureForService({ name: "", categoryId: "x" }), null);
});

test("an automatic entry picks up tagline and what's included from later edits; a hand-made one is never touched", () => {
  const a = catalog.ensureForService(svc({ name: "Hair Spa", tagline: "", includes: [] }));
  const filled = catalog.ensureForService(svc({ name: "Hair Spa", tagline: "Deep nourishment", includes: ["Wash", "Mask"] }));
  assert.equal(filled.id, a.id);
  assert.equal(filled.tagline, "Deep nourishment");
  assert.deepEqual(filled.includes, ["Wash", "Mask"]);
  const manual = catalog.create({ categorySlug: "salon-spa", name: "Bridal Package", price: 9999, includes: ["x"] }, "tester");
  const same = catalog.ensureForService(svc({ name: "Bridal Package", price: 1, tagline: "auto", includes: ["y"] }));
  assert.equal(same.id, manual.id);
  assert.equal(same.price, 9999);
  assert.equal(same.tagline, "");
  assert.deepEqual(same.includes, ["x"]);
});

test("prices: a bad original price is dropped, the catalog never stores a negative price", () => {
  const e = catalog.ensureForService(svc({ name: "Odd Price", price: 200, originalPrice: 150 }));
  assert.equal(e.originalPrice, null);
});

test("sync adds one entry per unique service, cheapest price wins, existing ones are left alone", () => {
  const before = catalog.list().length;
  const result = catalog.syncFromServices([
    svc({ name: "Sofa Cleaning", categoryId: "cleaning", price: 900, providerId: "p1" }),
    svc({ name: "Sofa Cleaning", categoryId: "cleaning", price: 700, providerId: "p2" }),
    svc({ name: "Sofa Cleaning", categoryId: "cleaning", price: 800, providerId: "p3" }),
    svc({ name: "Full Arms Waxing", categoryId: "salon-spa", price: 5 }), // already in the catalog
    svc({ name: "Rejected One", categoryId: "cleaning", status: "rejected" }),
  ]);
  assert.equal(result.unique, 2);
  assert.equal(result.added, 1);
  assert.equal(result.already, 1);
  assert.equal(catalog.list().length, before + 1);
  assert.equal(catalog.list().find((r) => r.name === "Sofa Cleaning").price, 700);
  assert.equal(catalog.syncFromServices([svc({ name: "Sofa Cleaning", categoryId: "cleaning" })]).added, 0, "running it again adds nothing");
});

test("bulk add: gives a provider many items, skips ones they already have, isolates failures, caps the batch", async () => {
  const created = [];
  const existing = [{ id: "e1", providerId: "prov", categoryId: "salon-spa", name: "Hair Spa" }];
  store.getProvider = async (id) => (id === "prov" ? { id, name: "Glam" } : null);
  store.listServices = async () => [...existing, ...created];
  store.adminCreateService = async (providerId, data) => {
    if (data.name === "Boom") throw new Error("database said no");
    const s = { id: `n${created.length}`, providerId, categoryId: data.categorySlug, name: data.name };
    created.push(s);
    return s;
  };
  store.adminUpdateService = async (id) => ({ id });
  // An entry with the same category + name already exists from the test above, so it is reused (a second one is refused).
  const entry = (name) => catalog.list().find((r) => r.categorySlug === "salon-spa" && r.name === name) || catalog.create({ categorySlug: "salon-spa", name, price: 100 }, "t");
  const items = ["Hair Spa", "Face Clean Up", "Boom", "Threading"].map(entry);
  const off = catalog.create({ categorySlug: "salon-spa", name: "Off Item", price: 100, active: false }, "t");
  const ids = [...items.map((i) => i.id), off.id, "nope"];

  const r = await catalog.applyMany(ids, "prov", "tester");
  assert.deepEqual(r.added.map((x) => x.name).sort(), ["Face Clean Up", "Threading"]);
  assert.deepEqual(r.skipped.map((x) => `${x.name}:${x.reason}`).sort(), ["Hair Spa:already has it", "Off Item:inactive"]);
  assert.equal(r.failed.length, 2);
  assert.match(r.failed.find((f) => f.name === "Boom").error, /database said no/);

  const again = await catalog.applyMany(ids, "prov", "tester"); // a retry must not duplicate anything
  assert.equal(again.added.length, 0);
  assert.equal(created.length, 2);

  await assert.rejects(() => catalog.applyMany([], "prov", "t"), /at least one/);
  await assert.rejects(() => catalog.applyMany(Array.from({ length: 26 }, (_, i) => "x" + i), "prov", "t"), /at most 25/);
  await assert.rejects(() => catalog.applyMany([items[0].id], "ghost", "t"), /Provider not found/);
});

test("the catalog refuses a second entry with the same category and name, also on rename", () => {
  const a = catalog.create({ categorySlug: "plumbing", name: "Tap Repair", price: 199 }, "t");
  assert.throws(() => catalog.create({ categorySlug: "plumbing", name: "  tap   REPAIR ", price: 150 }, "t"), (e) => e.status === 409);
  const b = catalog.create({ categorySlug: "plumbing", name: "Pipe Fix", price: 299 }, "t");
  assert.throws(() => catalog.update(b.id, { name: "Tap repair" }, "t"), (e) => e.status === 409);
  assert.ok(catalog.create({ categorySlug: "electrician", name: "Tap Repair", price: 199 }, "t"), "same name in another category is fine");
  assert.equal(catalog.update(a.id, { name: "Tap Repair", price: 249 }, "t").price, 249, "an entry keeps its own name");
});

test("duplicate catalog entries merge into one, keeping a photo and filling gaps", () => {
  const jsonStore = require("../src/jsonStore");
  const now = new Date().toISOString();
  jsonStore.insert("serviceCatalog", { categorySlug: "painting", name: "Wall Paint", price: 900, includes: [], tagline: "", source: "auto", createdAt: now });
  jsonStore.insert("serviceCatalog", { categorySlug: "painting", name: "wall  paint", price: 950, includes: ["Primer"], tagline: "Smooth finish", imageUrl: null, source: "auto", createdAt: now });
  assert.equal(catalog.duplicateEntries().filter((g) => g[0].categorySlug === "painting").length, 1);
  const r = catalog.mergeDuplicates("t");
  assert.ok(r.removed >= 1);
  const left = catalog.list().filter((x) => x.categorySlug === "painting");
  assert.equal(left.length, 1);
  assert.deepEqual(left[0].includes, ["Primer"]);
  assert.equal(catalog.duplicateEntries().length, 0);
});
