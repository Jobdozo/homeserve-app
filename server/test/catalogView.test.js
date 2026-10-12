// Run: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const cv = require("../src/catalogView");

const svc = (id, categoryId, extra = {}) => ({
  id, name: `Service ${id}`, price: 100, rating: 4, reviewCount: 10, categoryId, providerId: `p-${id}`,
  includes: ["a", "b", "c"], highlights: [{ icon: "x", label: "y" }], distanceLabel: "2 km", status: "active", icon: "🧹", ...extra,
});

test("slim: keeps what a card shows, drops the rest, two 'included' lines", () => {
  const s = cv.slimService(svc("1", "cleaning", { tagline: "Shiny", isAd: true, options: [{ name: "Size" }] }));
  assert.deepEqual(Object.keys(s).sort(), ["categoryId", "id", "includes", "isAd", "lite", "name", "options", "price", "providerId", "rating", "reviewCount", "tagline"].sort());
  assert.deepEqual(s.includes, ["a", "b"]);
  assert.equal(s.highlights, undefined);
});

test("rank: ads, then most booked, then rating weighted by reviews", () => {
  const list = [svc("a", "c", { rating: 5, reviewCount: 1 }), svc("b", "c", { rating: 4, reviewCount: 500 }), svc("c", "c"), svc("d", "c", { isAd: true })];
  const ranked = cv.rankServices(list, { c: 9 }).map((s) => s.id);
  assert.deepEqual(ranked, ["d", "c", "b", "a"]);
});

test("cap: at most `per` a category, true totals, partial flag", () => {
  const list = [svc("1", "x"), svc("2", "x"), svc("3", "x"), svc("4", "y")];
  const r = cv.capPerCategory(list, 2);
  assert.deepEqual(r.services.map((s) => s.id), ["1", "2", "4"]);
  assert.deepEqual(r.counts, { x: 3, y: 1 });
  assert.equal(r.partial, true);
  assert.equal(cv.capPerCategory(list, 5).partial, false);
});

test("page: filters by category, provider and words (incl. category name), slices", () => {
  const list = [svc("1", "ac", { name: "Split AC service" }), svc("2", "ac", { name: "Window AC repair" }), svc("3", "clean", { name: "Sofa shampoo" })];
  const names = { ac: "AC Repair", clean: "Home Cleaning" };
  assert.equal(cv.catalogPage(list, { category: "ac" }).total, 2);
  assert.deepEqual(cv.catalogPage(list, { q: "ac service" , names }).services.map((s) => s.id), ["1"]);
  assert.deepEqual(cv.catalogPage(list, { q: "cleaning", names }).services.map((s) => s.id), ["3"]);
  assert.deepEqual(cv.catalogPage(list, { providerId: "p-2" }).services.map((s) => s.id), ["2"]);
  assert.deepEqual(cv.catalogPage(list, { ids: ["3", "1", "zz"] }).services.map((s) => s.id).sort(), ["1", "3"]);
  const p = cv.catalogPage(list, { offset: 1, limit: 1 });
  assert.equal(p.total, 3);
  assert.equal(p.services.length, 1);
  assert.equal(cv.catalogPage(list, { limit: 5000 }).limit, cv.PAGE_MAX);
});

test("providersFor: only the services' providers", () => {
  const providers = [{ id: "p-1" }, { id: "p-2" }, { id: "p-9" }];
  assert.deepEqual(cv.providersFor([svc("1", "x"), svc("2", "x")], providers).map((p) => p.id), ["p-1", "p-2"]);
});
