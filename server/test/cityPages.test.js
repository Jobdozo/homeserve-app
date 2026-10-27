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
  assert.deepEqual(
    city.allPaths(data),
    ["/jammu", "/jammu/ac-repair", "/jammu/ac-repair/ac-service", "/jammu/ac-repair/ac-gas-refill", "/jammu/electrician", "/jammu/electrician/fan-repair", "/srinagar", "/srinagar/electrician", "/srinagar/electrician/fan-repair", "/srinagar/painting", "/srinagar/painting/wall-painting"],
    "p3 serves all areas, Srinagar included; every kind of service has its own page"
  );
});

test("service × city page (Sofa Cleaning in Jammu): every provider who offers it, cheapest first, its own FAQs", () => {
  const more = {
    ...data,
    categories: [...data.categories, { id: "home-cleaning", name: "Home Cleaning", active: true }],
    services: [
      ...data.services,
      { id: "c1", name: "Sofa Cleaning (1 Seat)", categoryId: "home-cleaning", providerId: "p1", price: 249, rating: 5, reviewCount: 4, includes: ["Vacuuming", "Shampoo wash"] },
      { id: "c2", name: "Sofa Cleaning", categoryId: "home-cleaning", providerId: "p2", price: 299, includes: ["Shampoo wash", "Stain treatment"] },
      { id: "c3", name: "Floor Scrubbing / Polishing", categoryId: "home-cleaning", providerId: "p2", price: 4 },
    ],
  };
  const page = city.cityServicePage("jammu", "home-cleaning", "sofa-cleaning", more);
  assert.equal(page.service.name, "Sofa Cleaning", "the brackets go: one page for both names");
  assert.deepEqual(page.offers.map((o) => [o.provider.name, o.price]), [["Ravi Cooling", 249], ["Amit", 299]]);
  assert.deepEqual([page.from, page.to], [249, 299]);
  assert.deepEqual(page.includes, ["Vacuuming", "Shampoo wash", "Stain treatment"]);
  assert.deepEqual(page.others.map((o) => o.slug), ["floor-scrubbing-polishing"]);
  assert.match(page.faqs[0].a, /starts at ₹249 and goes up to ₹299/);
  assert.match(page.faqs.find((f) => /included/.test(f.q)).a, /Vacuuming, Shampoo wash and Stain treatment/);
  assert.equal(city.cityServicePage("jammu", "home-cleaning", "carpet-cleaning", more), null);
  assert.equal(city.cityServicePage("leh", "home-cleaning", "sofa-cleaning", more), null);

  // "from ₹4" (a per-sq-ft rate) never stands for the whole category.
  const cat = city.cityCategoryPage("jammu", "home-cleaning", more);
  assert.equal(cat.from, 249);
  assert.equal(city.fromPrice([{ price: 4 }, { price: 15 }]), 4, "only per-unit prices: they're all there is");

  // The page's head and its words in the HTML (for search engines and AI assistants).
  const p = seo.pageFor("/jammu/home-cleaning/sofa-cleaning", more);
  assert.equal(p.status, 200);
  assert.equal(p.title, "Sofa Cleaning in Jammu — from ₹249 | Tikdum");
  assert.equal(p.canonical, "/jammu/home-cleaning/sofa-cleaning");
  assert.ok(p.jsonLd.some((j) => j["@type"] === "Service" && j.offers?.lowPrice === 249 && j.aggregateRating?.ratingValue === 5));
  assert.ok(p.jsonLd.some((j) => j["@type"] === "FAQPage"));
  assert.match(p.bodyHtml, /<h1>Sofa Cleaning in Jammu<\/h1>/);
  assert.match(p.bodyHtml, /href="\/service\/c1">Sofa Cleaning \(1 Seat\)<\/a> with Ravi Cooling — ₹249/);
  assert.equal(seo.pageFor("/jammu/home-cleaning", more).title, "Home Cleaning in Jammu — from ₹249 | Tikdum");
  assert.match(seo.pageFor("/jammu/home-cleaning", more).bodyHtml, /href="\/jammu\/home-cleaning\/sofa-cleaning">Sofa Cleaning \(1 Seat\)<\/a> — from ₹249/);
  assert.match(seo.pageFor("/jammu", more).bodyHtml, /<h1>Home services in Jammu<\/h1>/);
  assert.equal(seo.pageFor("/jammu/home-cleaning/nope", more).status, 404);
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
