const { test } = require("node:test");
const assert = require("node:assert");
const seo = require("../src/seoPages");

const data = {
  categories: [
    { id: "ac-repair", name: "AC Repair", active: true, imageUrl: "/uploads/ac.webp" },
    { id: "masonry", name: "Masonry Services", active: true },
    { id: "gardening", name: "Gardening", active: false },
  ],
  services: [
    { id: "s1", name: "AC Gas Refill", categoryId: "ac-repair", providerId: "p1", price: 1499, rating: 4.6, reviewCount: 10, tagline: "Full gas top-up", includes: ["Leak check", "Gas refill"], imageUrl: "/uploads/s1.webp" },
    { id: "s2", name: "AC Gas Refill", categoryId: "ac-repair", providerId: "p2", price: 1299, rating: 0, reviewCount: 0 },
    { id: "s3", name: "AC Service", categoryId: "ac-repair", providerId: "p1", price: 499, rating: 5, reviewCount: 2 },
  ],
  providers: [
    { id: "p1", name: "Ravi", businessName: "Ravi Cooling", verificationStatus: "approved", rating: 4.7, reviews: 12, serviceArea: "Jammu" },
    { id: "p2", name: "Amit", verificationStatus: "approved", rating: 0, reviews: 0 },
    { id: "p3", name: "Pending Pro", verificationStatus: "pending" },
  ],
};
test("pages follow lasting rules, not whether a provider can take a booking this minute", () => {
  const all = {
    categories: [{ id: "a", active: true }, { id: "b", active: false }],
    providers: [{ id: "ok", verificationStatus: "approved" }, { id: "new", verificationStatus: "pending" }, { id: "unverified", verificationStatus: "approved", verified: false }],
    services: [
      { id: "1", status: "active", categoryId: "a", providerId: "ok" },
      { id: "2", status: "inactive", categoryId: "a", providerId: "ok" },
      { id: "3", status: "active", categoryId: "b", providerId: "ok" },
      { id: "4", status: "active", categoryId: "a", providerId: "new" },
      { id: "5", status: "active", categoryId: "a", providerId: "unverified" },
    ],
  };
  assert.deepEqual(seo.searchCatalog(all).services.map((s) => s.id), ["1"]);
});

const ld = (p, type) => p.jsonLd.find((x) => x["@type"] === type);

test("home and fixed pages: their own title, canonical and structured data", () => {
  const home = seo.pageFor("/", data);
  assert.equal(home.status, 200);
  assert.equal(home.canonical, "/home", "/ and /home are one page");
  assert.ok(ld(home, "Organization") && ld(home, "WebSite"));
  assert.deepEqual(ld(home, "ItemList").itemListElement.map((i) => i.name), ["AC Repair", "Masonry Services"], "only live categories");
  assert.equal(seo.pageFor("/categories", data).title, "Service Categories | Tikdum");
  assert.match(seo.pageFor("/services", data).description, /all 3 home services/);
  assert.equal(seo.pageFor("/home/", data).canonical, "/home", "a trailing slash is the same page");
});

test("category: real numbers, price range and rating from real reviews; empty or missing categories", () => {
  const p = seo.pageFor("/category/ac-repair", data);
  assert.equal(p.status, 200);
  assert.equal(p.title, "AC Repair | Tikdum");
  assert.match(p.description, /2 trusted local providers, from ₹499/);
  assert.equal(p.image, "https://api.tikdum.com/uploads/ac.webp");
  const service = ld(p, "Service");
  assert.deepEqual([service.offers.lowPrice, service.offers.highPrice, service.offers.offerCount], [499, 1499, 3]);
  assert.equal(service.aggregateRating.reviewCount, 12);
  assert.equal(service.aggregateRating.ratingValue, 4.7, "(4.6×10 + 5×2) / 12");
  assert.deepEqual(ld(p, "BreadcrumbList").itemListElement.map((i) => i.name), ["Home", "Categories", "AC Repair"]);

  const empty = seo.pageFor("/category/masonry", data);
  assert.equal(empty.status, 200);
  assert.equal(empty.noindex, true, "nothing bookable yet → kept out of search");
  assert.equal(seo.pageFor("/category/gardening", data).noindex, true);
  const missing = seo.pageFor("/category/carpentrygardening", data);
  assert.equal(missing.status, 404);
  assert.equal(missing.noindex, true);
});

test("service, providers list and provider pages; 404 for anything not bookable", () => {
  const s = seo.pageFor("/service/s1", data);
  assert.equal(s.status, 200);
  assert.equal(s.description, "AC Gas Refill from ₹1,499 with Ravi Cooling in Jammu & Kashmir. Full gas top-up. Verified local professionals — book instantly on Tikdum over WhatsApp.");
  assert.equal(s.image, "https://api.tikdum.com/uploads/s1.webp");
  const plain = seo.pageFor("/service/s3", data);
  assert.ok(!/\. \./.test(plain.description) && !plain.description.includes("AC Service. AC Service"), "no note → no repeat");
  assert.equal(plain.image, "https://api.tikdum.com/uploads/ac.webp", "no photo of its own → the category's");
  const sameAsName = seo.pageFor("/service/s3", { ...data, services: data.services.map((x) => (x.id === "s3" ? { ...x, tagline: "AC Service" } : x)) });
  assert.equal(sameAsName.description, "AC Service from ₹499 with Ravi Cooling in Jammu & Kashmir. Verified local professionals — book instantly on Tikdum over WhatsApp.");
  const service = ld(s, "Service");
  assert.equal(service.offers.price, 1499);
  assert.equal(service.provider.name, "Ravi Cooling");
  assert.equal(service.aggregateRating.ratingValue, 4.6);
  assert.match(service.description, /Includes: Leak check, Gas refill/);
  assert.deepEqual(ld(s, "BreadcrumbList").itemListElement.map((i) => i.name), ["Home", "AC Repair", "AC Gas Refill"]);
  assert.equal(ld(seo.pageFor("/service/s2", data), "Service").aggregateRating, undefined, "no reviews → no rating");
  assert.equal(seo.pageFor("/service/nope", data).status, 404);

  const list = seo.pageFor("/find-service/s2", data);
  assert.match(list.description, /2 trusted providers for AC Gas Refill in AC Repair/);

  const pro = seo.pageFor("/provider/p1", data);
  assert.equal(pro.status, 200);
  assert.equal(ld(pro, "LocalBusiness").aggregateRating.reviewCount, 12);
  assert.equal(ld(pro, "LocalBusiness").makesOffer.length, 2);
  assert.equal(seo.pageFor("/provider/p3", data).status, 404, "not approved");
});

test("signed-in screens are served but kept out of search; unknown addresses are 404", () => {
  for (const path of ["/bookings", "/cart", "/login", "/profile/help", "/booking/abc", "/chat/abc"]) {
    const p = seo.pageFor(path, data);
    assert.equal(p.status, 200, path);
    assert.equal(p.noindex, true, path);
  }
  assert.equal(seo.pageFor("/wp-content/themes/x/error.php", data).status, 404);
  assert.equal(seo.pageFor("/index.php", data).status, 404);
  assert.equal(seo.pageFor("/%E0%A4%A", data).status, 404, "a broken %-escape is not a page");
});

test("the app's own head is replaced, values are escaped, and structured data can't break out of its script", () => {
  const shell = `<!doctype html><html><head>
    <title>Tikdum — Book Trusted Home Services Near You</title>
    <meta
      data-static-seo
      name="description"
      content="generic"
    />
    <meta data-static-seo property="og:title" content="generic" />
    <meta name="theme-color" content="#2A1A7A" />
  </head><body><div id="root"></div></body></html>`;
  const page = seo.pageFor("/service/s1", {
    ...data,
    services: data.services.map((s) => (s.id === "s1" ? { ...s, name: 'AC "Gas" <Refill>', tagline: "</script><script>alert(1)</script>" } : s)),
  });
  const html = seo.injectHead(shell, page);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<title>AC &quot;Gas&quot; &lt;Refill&gt; \| Tikdum<\/title>/);
  assert.ok(!html.includes('content="generic"'), "the generic tags are gone");
  assert.ok(html.includes('name="theme-color"'), "other head tags stay");
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.ok(html.includes('<link data-static-seo rel="canonical" href="https://tikdum.com/service/s1" />'));
  assert.ok(!/<\/script><script>alert/.test(html), "a tagline can't close the script tag");
  const json = html.match(/<script type="application\/ld\+json" data-seo-path="\/service\/s1">(.*?)<\/script>/g);
  assert.ok(json && json.length === 2);
  for (const block of json) JSON.parse(block.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
  assert.ok(html.indexOf("</head>") > html.indexOf("application/ld+json"), "everything goes inside the head");
  assert.ok(seo.injectHead(shell, seo.pageFor("/nowhere", data)).includes('name="robots" content="noindex, nofollow"'));
});

test("searchCatalog: a provider set to always-hide in Super Admin has no pages and no services", () => {
  const { searchCatalog } = require("../src/seoPages");
  const data = searchCatalog({
    categories: [{ id: "home-cleaning", active: true }],
    providers: [{ id: "real", verificationStatus: "approved" }, { id: "test", verificationStatus: "approved" }],
    services: [{ id: "s1", providerId: "real", categoryId: "home-cleaning", status: "active" }, { id: "s2", providerId: "test", categoryId: "home-cleaning", status: "active" }],
    hidden: new Set(["test"]),
  });
  assert.deepEqual(data.services.map((s) => s.id), ["s1"]);
  assert.deepEqual(data.providers.map((p) => p.id), ["real"]);
});
