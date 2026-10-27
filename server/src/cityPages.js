// City pages for search: tikdum.com/jammu (every service in the city),
// tikdum.com/jammu/ac-repair (one service category in the city) and
// tikdum.com/jammu/home-cleaning/sofa-cleaning (one kind of service in the city). Built only from real data:
// the cities, areas and PIN codes switched on in Super Admin → Locations, the providers whose
// service area (PIN codes, or "all areas") reaches the city, and their live services, prices
// and reviews. A page exists only when at least one approved provider serves it, so there are
// no empty or invented pages. Areas inside a city are a section of the page, not pages of
// their own: today almost every provider covers the whole city, and near-identical area pages
// would count against the site in Google.
//
// Everything here is a plain function of its inputs (tested in test/cityPages.test.js).

// First parts of website addresses that are already app screens; a city can't use them.
const RESERVED = new Set([
  "home", "categories", "category", "service", "services", "find-service", "provider", "search", "cart", "bookings", "booking",
  "booking-protection", "messages", "chat", "review", "rate", "notifications", "refer", "address", "profile", "login", "assets", "uploads",
  "category-photos", "illustrations", "api", "sitemap.xml", "robots.txt",
]);

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const listText = (items, max = 4) => (items.length <= max ? items.join(", ").replace(/, ([^,]*)$/, " and $1") : `${items.slice(0, max).join(", ")} and ${items.length - max} more`);

// Active cities from Super Admin → Locations, with their active areas and PIN codes.
function citiesFrom(tree = []) {
  return tree
    .filter((c) => c.active !== false)
    .map((c) => ({
      name: c.name,
      slug: slugify(c.name),
      areas: (c.areas || [])
        .filter((a) => a.active !== false)
        .map((a) => ({ name: a.name, pincodes: (a.pincodes || []).filter((p) => p.active !== false).map((p) => String(p.pincode)) }))
        .filter((a) => a.pincodes.length),
    }))
    .filter((c) => c.slug && !RESERVED.has(c.slug) && c.areas.length);
}

// A provider's service area is a list of PIN codes or prefixes ("180" = every 180xxx), or all areas.
function servesPin(provider, pin) {
  const cov = provider.coverage || {};
  if (cov.serveAllAreas) return true;
  return (cov.pincodes || []).some((x) => String(pin).startsWith(String(x)) || String(x).startsWith(String(pin)));
}

// Everything a city needs: which providers serve it, and per category what they offer.
// data = { tree, categories, services, providers } with services already limited to the ones
// that have pages (seoPages.searchCatalog: active, live category, approved provider).
function cityIndex(data = {}) {
  const cities = citiesFrom(data.tree);
  const categories = data.categories || [];
  const services = data.services || [];
  const providers = new Map((data.providers || []).map((p) => [p.id, p]));
  return cities.map((city) => {
    const pins = city.areas.flatMap((a) => a.pincodes);
    const serving = new Set([...providers.values()].filter((p) => pins.some((pin) => servesPin(p, pin))).map((p) => p.id));
    const inCity = services.filter((s) => serving.has(s.providerId));
    const byCategory = categories
      .filter((c) => c.active)
      .map((c) => {
        const list = inCity.filter((s) => s.categoryId === c.id);
        return { category: c, services: list, providerIds: [...new Set(list.map((s) => s.providerId))] };
      })
      .filter((x) => x.services.length)
      .sort((a, b) => b.providerIds.length - a.providerIds.length || b.services.length - a.services.length || a.category.name.localeCompare(b.category.name));
    return { city, providerIds: [...serving].filter((id) => inCity.some((s) => s.providerId === id)), services: inCity, byCategory };
  }).filter((x) => x.byCategory.length);
}

function ratingOf(list) {
  const rated = list.filter((s) => Number(s.reviewCount) > 0 && Number(s.rating) > 0);
  const count = rated.reduce((n, s) => n + Number(s.reviewCount), 0);
  if (!count) return null;
  return { rating: Math.round((rated.reduce((n, s) => n + Number(s.rating) * Number(s.reviewCount), 0) / count) * 10) / 10, reviews: count };
}
const prices = (list) => list.map((s) => Number(s.price)).filter((p) => Number.isFinite(p) && p > 0);
// The "from" price people see: a job's price, not a per-unit rate. Services priced under ₹50 are
// per square foot or per litre (floor scrubbing ₹4, carpet ₹15, tank ₹1), and "from ₹4" for a
// whole category reads as a mistake. Falls back to every price when there's nothing else.
const MIN_JOB_PRICE = 50;
function jobPrices(list) {
  const all = prices(list);
  const jobs = all.filter((p) => p >= MIN_JOB_PRICE);
  return jobs.length ? jobs : all;
}
const fromPrice = (list) => (jobPrices(list).length ? Math.min(...jobPrices(list)) : null);

// One kind of service, whatever the provider added in brackets: "Sofa Cleaning (1 Seat)" and
// "Sofa Cleaning" are both tikdum.com/<city>/home-cleaning/sofa-cleaning.
const serviceKey = (name) => slugify(String(name || "").replace(/\([^)]*\)/g, " "));
const serviceTitle = (name) => String(name || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

// One card per kind of service (same name), cheapest first in each, most offered first overall.
function serviceGroups(list) {
  const groups = new Map();
  for (const s of list) {
    const key = serviceKey(s.name);
    const g = groups.get(key) || { items: [] };
    g.items.push(s);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ items }) => {
      const cheapest = [...items].sort((a, b) => Number(a.price) - Number(b.price))[0];
      const r = ratingOf(items);
      return {
        id: cheapest.id, slug: serviceKey(cheapest.name), name: cheapest.name, categoryId: cheapest.categoryId, price: Number(cheapest.price), originalPrice: cheapest.originalPrice || null,
        imageUrl: items.find((x) => x.imageUrl)?.imageUrl || null, include: cheapest.includes?.[0] || null,
        providers: new Set(items.map((x) => x.providerId)).size, rating: r?.rating || null, reviews: r?.reviews || 0,
      };
    })
    .sort((a, b) => b.providers - a.providers || (b.reviews || 0) - (a.reviews || 0) || a.price - b.price);
}

const areaList = (city, providerList) =>
  city.areas
    .map((a) => ({ name: a.name, pincodes: a.pincodes, providers: providerList.filter((p) => a.pincodes.some((pin) => servesPin(p, pin))).length }))
    .filter((a) => a.providers > 0);

const providerCard = (p, list) => {
  const theirs = list.filter((s) => s.providerId === p.id);
  return {
    id: p.id, name: p.businessName || p.name, photoUrl: p.photoUrl || null, rating: Number(p.reviews) > 0 ? Number(p.rating) : null, reviews: Number(p.reviews) || 0,
    services: theirs.length, from: fromPrice(theirs),
  };
};

// Questions people ask before booking, answered with this page's own numbers.
function faqsFor({ city, category, providers, services, areas, rating }) {
  const p = jobPrices(services);
  const what = category ? category.name : "home services";
  const out = [];
  // Prices only for one kind of service; across all of them the range says nothing.
  if (category && p.length) {
    out.push({
      q: `How much does ${what} cost in ${city.name}?`,
      a: `On Tikdum, ${what} in ${city.name} starts at ${inr(Math.min(...p))}${Math.max(...p) > Math.min(...p) ? ` and goes up to ${inr(Math.max(...p))} depending on the service` : ""}. You see the price before you book, across ${plural(services.length, "service")} from ${plural(providers.length, "verified provider")}.`,
    });
  }
  out.push({
    q: `Which areas of ${city.name} do you cover?`,
    a: `${category ? `${category.name} providers` : "Providers"} on Tikdum serve ${listText(areas.map((a) => `${a.name} (${a.pincodes.join(", ")})`), 6)}. Enter your PIN code in the app to see who serves your address.`,
  });
  out.push({
    q: `Are the ${category ? `${category.name.toLowerCase()} ` : ""}providers verified?`,
    a: `Yes. Every provider on Tikdum is reviewed and approved by the Tikdum team before they can take bookings, and customers rate them after each job${rating ? ` — ${category ? category.name : "providers"} in ${city.name} average ${rating.rating}★ from ${plural(rating.reviews, "review")}` : ""}.`,
  });
  out.push({
    q: `How do I book ${what} in ${city.name}?`,
    a: `Choose the service, pick a date and time, and confirm in a few taps on tikdum.com or the Tikdum app. A verified provider accepts the request, and every booking is covered by Tikdum Booking Protection.`,
  });
  return out;
}

// tikdum.com/<city>
function cityPage(slug, data) {
  const entry = cityIndex(data).find((x) => x.city.slug === slug);
  if (!entry) return null;
  const { city, services, byCategory } = entry;
  const providerList = entry.providerIds.map((id) => (data.providers || []).find((p) => p.id === id)).filter(Boolean);
  const areas = areaList(city, providerList);
  const rating = ratingOf(services);
  return {
    kind: "city",
    city: { name: city.name, slug: city.slug },
    providers: providerList.length,
    services: services.length,
    from: fromPrice(services),
    rating,
    reviews: reviewsFor(data, (r) => entry.providerIds.includes(r.providerId), providerList),
    categories: byCategory.map(({ category, services: list, providerIds }) => ({
      id: category.id, name: category.name, slug: category.id, imageUrl: category.imageUrl || null, providers: providerIds.length,
      services: list.length, from: fromPrice(list), rating: ratingOf(list),
    })),
    areas,
    faqs: faqsFor({ city, providers: providerList, services, areas, rating }),
  };
}

// tikdum.com/<city>/<category>
function cityCategoryPage(slug, categoryId, data) {
  const entry = cityIndex(data).find((x) => x.city.slug === slug);
  const hit = entry?.byCategory.find((x) => x.category.id === categoryId);
  if (!hit) return null;
  const { city } = entry;
  const providerList = hit.providerIds.map((id) => (data.providers || []).find((p) => p.id === id)).filter(Boolean);
  const areas = areaList(city, providerList);
  const rating = ratingOf(hit.services);
  const p = prices(hit.services);
  return {
    kind: "city-category",
    city: { name: city.name, slug: city.slug },
    category: { id: hit.category.id, name: hit.category.name, imageUrl: hit.category.imageUrl || null, about: hit.category.about || "" },
    providers: providerList.map((x) => providerCard(x, hit.services)).sort((a, b) => (b.reviews || 0) - (a.reviews || 0) || b.services - a.services),
    reviews: reviewsFor(data, (r) => r.categoryId === categoryId && hit.providerIds.includes(r.providerId), providerList),
    services: serviceGroups(hit.services),
    serviceCount: hit.services.length,
    from: fromPrice(hit.services),
    to: p.length ? Math.max(...p) : null,
    rating,
    areas,
    others: entry.byCategory.filter((x) => x.category.id !== categoryId).map((x) => ({ id: x.category.id, name: x.category.name, providers: x.providerIds.length })),
    faqs: faqsFor({ city, category: hit.category, providers: providerList, services: hit.services, areas, rating }),
  };
}

// Questions for one kind of service, answered with its own live numbers.
function serviceFaqsFor({ city, name, items, providers, areas, rating, includes }) {
  const p = jobPrices(items);
  const out = [];
  if (p.length) {
    out.push({
      q: `How much does ${name.toLowerCase()} cost in ${city.name}?`,
      a: `On Tikdum, ${name.toLowerCase()} in ${city.name} starts at ${inr(Math.min(...p))}${Math.max(...p) > Math.min(...p) ? ` and goes up to ${inr(Math.max(...p))}, depending on the provider and the job` : ""}. You see the price before you book.`,
    });
  }
  if (includes.length) out.push({ q: `What's included in ${name.toLowerCase()}?`, a: `${listText(includes, 6)}. Each provider lists exactly what their service includes before you book.` });
  out.push({
    q: `Who does ${name.toLowerCase()} in ${city.name}?`,
    a: `${listText(providers.map((x) => x.businessName || x.name), 5)} — ${providers.length === 1 ? "a provider" : "providers"} approved by the Tikdum team${rating ? `, rated ${rating.rating}★ from ${plural(rating.reviews, "review")}` : ""}.`,
  });
  out.push({
    q: `Which areas of ${city.name} do you cover?`,
    a: `${listText(areas.map((a) => `${a.name} (${a.pincodes.join(", ")})`), 6)}. Enter your PIN code in the app to see who serves your address.`,
  });
  out.push({
    q: `How do I book ${name.toLowerCase()}?`,
    a: `Pick a provider below, choose a date and time, and confirm on tikdum.com or the Tikdum app. The work starts only with your one-time code, and every booking has Tikdum Booking Protection.`,
  });
  return out;
}

// tikdum.com/<city>/<category>/<service>: one kind of service in the city, every provider who offers it.
function cityServicePage(slug, categoryId, service, data) {
  const entry = cityIndex(data).find((x) => x.city.slug === slug);
  const hit = entry?.byCategory.find((x) => x.category.id === categoryId);
  if (!hit) return null;
  const items = hit.services.filter((s) => serviceKey(s.name) === service);
  if (!items.length) return null;
  const { city } = entry;
  const byId = new Map((data.providers || []).map((p) => [p.id, p]));
  const providerList = [...new Set(items.map((s) => s.providerId))].map((id) => byId.get(id)).filter(Boolean);
  const areas = areaList(city, providerList);
  const rating = ratingOf(items);
  const name = serviceTitle(items[0].name) || items[0].name;
  const includes = [...new Set(items.flatMap((s) => s.includes || []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 8);
  return {
    kind: "city-service",
    city: { name: city.name, slug: city.slug },
    category: { id: hit.category.id, name: hit.category.name, imageUrl: hit.category.imageUrl || null },
    service: { slug: service, name },
    offers: [...items]
      .sort((a, b) => Number(a.price) - Number(b.price))
      .map((s) => {
        const p = byId.get(s.providerId);
        return {
          id: s.id, name: s.name, price: Number(s.price), originalPrice: s.originalPrice || null, imageUrl: s.imageUrl || null, categoryId: s.categoryId,
          include: s.includes?.[0] || null, rating: Number(s.reviewCount) > 0 ? Number(s.rating) : null, reviews: Number(s.reviewCount) || 0,
          provider: p ? { id: p.id, name: p.businessName || p.name, photoUrl: p.photoUrl || null } : null,
        };
      }),
    from: fromPrice(items),
    to: prices(items).length ? Math.max(...prices(items)) : null,
    rating,
    includes,
    areas,
    reviews: reviewsFor(data, (r) => items.some((s) => s.providerId === r.providerId) && r.categoryId === categoryId, providerList),
    others: serviceGroups(hit.services).filter((g) => g.slug !== service).slice(0, 12).map((g) => ({ slug: g.slug, name: serviceTitle(g.name) || g.name })),
    faqs: serviceFaqsFor({ city, name, items, providers: providerList, areas, rating, includes }),
  };
}

// Up to 6 real customer reviews (newest first, with words), each with who did the job.
function reviewsFor(data, keep, providerList) {
  const names = new Map(providerList.map((p) => [p.id, p.businessName || p.name]));
  return (data.reviews || [])
    .filter(keep)
    .slice(0, 6)
    .map((r) => ({ name: r.name, rating: r.rating, text: r.text, at: r.at, service: r.service, provider: names.get(r.providerId) || null, providerId: r.providerId }));
}

// Every city page that exists, for the sitemap.
function allPaths(data) {
  return cityIndex(data).flatMap(({ city, byCategory }) => [
    `/${city.slug}`,
    ...byCategory.flatMap((x) => [`/${city.slug}/${x.category.id}`, ...serviceGroups(x.services).map((g) => `/${city.slug}/${x.category.id}/${g.slug}`)]),
  ]);
}

module.exports = { slugify, citiesFrom, servesPin, cityIndex, cityPage, cityCategoryPage, cityServicePage, allPaths, faqsFor, serviceKey, fromPrice, RESERVED };
