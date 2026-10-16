const { test } = require("node:test");
const assert = require("node:assert");
const city = require("../src/cityPages");
const seo = require("../src/seoPages");

const tree = [
  {
    name: "Jammu", active: true,
    areas: [
      { name: "Gandhi Nagar", active: true, pincodes: [{ pincode: "180004", active: true }] },
      { name: "Janipur", active: true, pincodes: [{ pincode: "180007", active: true }] },
      { name: "Closed Area", active: false, pincodes: [{ pincode: "180099", active: true }] },
    ],
  },
  { name: "Srinagar", active: true, areas: [{ name: "Lal Chowk", active: true, pincodes: [{ pincode: "190001", active: true }] }] },
  { name: "Services", active: true, areas: [{ name: "X", active: true, pincodes: [{ pincode: "111111", active: true }] }] },
  { name: "Leh", active: false, areas: [{ name: "Main", active: true, pincodes: [{ pincode: "194101", active: true }] }] },
];
const data = {
  tree,
  categories: [
    { id: "ac-repair", name: "AC Repair", active: true },
    { id: "electrician", name: "Electrician", active: true },
    { id: "painting", name: "Painting", active: true },
  ],
  providers: [
    { id: "p1", name: "Ravi", businessName: "Ravi Cooling", rating: 4.8, reviews: 10, coverage: { pincodes: ["180"] } },
    { id: "p2", name: "Amit", coverage: { pincodes: ["180004"] } },
    { id: "p3", name: "Sameer", coverage: { serveAllAreas: true } },
    { id: "p4", name: "Far Away", coverage: { pincodes: ["190001"] } },
  ],
  services: [
    { id: "s1", name: "AC Service", categoryId: "ac-repair", providerId: "p1", price: 499, rating: 4.8, reviewCount: 10, includes: ["Filter wash"] },
    { id: "s2", name: "AC Service", categoryId: "ac-repair", providerId: "p2", price: 450 },
    { id: "s3", name: "AC Gas Refill", categoryId: "ac-repair", providerId: "p2", price: 2200 },
    { id: "s4", name: "Fan Repair", categoryId: "electrician", providerId: "p3", price: 199 },
    { id: "s5", name: "Wall Painting", categoryId: "painting", providerId: "p4", price: 9000 },
  ],
};

test("cities: active ones from Locations, never an address the app already uses", () => {
  assert.deepEqual(city.citiesFrom(tree).map((c) => c.slug), ["jammu", "srinagar"]);
  assert.deepEqual(city.citiesFrom(tree)[0].areas.map((a) => a.name), ["Gandhi Nagar", "Janipur"], "switched-off areas are left out");
  assert.equal(city.slugify("Jammu & Kashmir"), "jammu-and-kashmir");
});

test("a provider serves a PIN by exact code, by prefix, or by serving all areas", () => {
  assert.ok(city.servesPin(data.providers[0], "180007"), "prefix 180");
  assert.ok(city.servesPin(data.providers[1], "180004"));
  assert.ok(!city.servesPin(data.providers[1], "180007"));
  assert.ok(city.servesPin(data.providers[2], "190001"));
  assert.ok(!city.servesPin({ coverage: {} }, "180004"));
});

test("city page: only categories someone in the city offers, with real counts", () => {
  const page = city.cityPage("jammu", data);
  assert.equal(page.providers, 3, "p4 only serves Srinagar");
  assert.deepEqual(page.categories.map((c) => c.id), ["ac-repair", "electrician"], "painting is only offered in Srinagar");
  assert.equal(page.categories[0].providers, 2);
  assert.equal(page.from, 199);
  assert.deepEqual(page.areas.map((a) => [a.name, a.providers]), [["Gandhi Nagar", 3], ["Janipur", 2]]);
  assert.ok(page.faqs.length >= 3);
  assert.equal(city.cityPage("services", data), null);
  assert.equal(city.cityPage("leh", data), null, "switched-off city");
});

test("city × category page: grouped services, providers, areas and FAQs from the data", () => {
  const page = city.cityCategoryPage("jammu", "ac-repair", data);
  assert.equal(page.category.name, "AC Repair");
  assert.deepEqual(page.services.map((s) => [s.name, s.price, s.providers]), [["AC Service", 450, 2], ["AC Gas Refill", 2200, 1]]);
  assert.equal(page.services[0].include, null, "the cheapest offer's own details");
  assert.deepEqual([page.from, page.to, page.serviceCount], [450, 2200, 3]);
  assert.deepEqual(page.providers.map((p) => p.name), ["Ravi Cooling", "Amit"]);
  assert.deepEqual(page.rating, { rating: 4.8, reviews: 10 });
  assert.deepEqual(page.others.map((o) => o.id), ["electrician"]);
  assert.match(page.faqs[0].a, /starts at ₹450 and goes up to ₹2,200/);
  assert.match(page.faqs[1].a, /Gandhi Nagar \(180004\) and Janipur \(180007\)/);
  assert.equal(city.cityCategoryPage("jammu", "painting", data), null, "nobody in Jammu offers it");
  assert.deepEqual(city.allPaths(data), ["/jammu", "/jammu/ac-repair", "/jammu/electrician", "/srinagar", "/srinagar/electrician", "/srinagar/painting"], "p3 serves all areas, Srinagar included");
});

test("search head for city pages: title with price, FAQ and service structured data, 404 otherwise", () => {
  const p = seo.pageFor("/jammu/ac-repair", data);
  assert.equal(p.status, 200);
  assert.equal(p.title, "AC Repair in Jammu — from ₹450 | Tikdum");
  assert.match(p.description, /2 verified local providers, 3 services from ₹450, rated 4.8★/);
  assert.equal(p.canonical, "/jammu/ac-repair");
  const types = p.jsonLd.map((x) => x["@type"]);
  assert.deepEqual(types, ["BreadcrumbList", "Service", "ItemList", "FAQPage"]);
  assert.equal(p.jsonLd[1].areaServed.name, "Jammu");
  const hub = seo.pageFor("/jammu", data);
  assert.equal(hub.title, "Home Services in Jammu | Tikdum");
  assert.equal(seo.pageFor("/jammu/painting", data).status, 404);
  assert.equal(seo.pageFor("/nowhere", data).status, 404);
  assert.equal(seo.pageFor("/home", data).canonical, "/home", "app screens are never taken for cities");
});
