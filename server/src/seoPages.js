// Search engines and link previews: every page of tikdum.com leaves here with its own title,
// description, canonical address, preview (Open Graph) tags and structured data already in the
// HTML, and with the right status — 404 for a page that doesn't exist.
//
// The website (local-service-app) is a single-page app: before this, every address arrived with
// the same generic head and only got its real title once the JavaScript ran, which Bing,
// WhatsApp/Facebook previews and most AI crawlers never do. Its nginx now sends page requests
// (not files) here as /__page with the real address in X-Original-URI; this fills in the head of
// the app's own index.html (fetched from the website and cached) and returns it. Nothing in the
// page body changes. The tags carry data-static-seo, which the app's Seo component removes when
// it takes over, so they are never duplicated in the browser. If anything here fails, nginx falls
// back to the plain index.html, so the site never depends on this.
//
// pageFor and injectHead are plain functions of their inputs (tested in test/seoPages.test.js).
const cityPages = require("./cityPages");

const SITE = "https://tikdum.com";
const SITE_NAME = "Tikdum";
const DEFAULT_TITLE = `${SITE_NAME} — Book Trusted Home Services Near You`;
const DEFAULT_DESCRIPTION =
  "Book trusted home services near you on Tikdum — cleaning, pest control, AC repair, and more. Compare verified local providers and book instantly over WhatsApp.";
const DEFAULT_IMAGE = `${SITE}/pwa-512.png`;
const AREA = { "@type": "AdministrativeArea", name: "Jammu and Kashmir, India" };
const ORG_ID = `${SITE}/#organization`;

// Screens that only make sense signed in: served normally, kept out of search.
const PRIVATE = [/^\/(bookings|messages|profile|cart|notifications|refer|address|login|search)(\/.*)?$/, /^\/(booking|chat|review|rate)\/[^/]+$/];

// Uploaded photos (/uploads/…) are served by the API host, not the website (which answers 404);
// built-in pictures (/category-photos/…, icons) are on the website.
const UPLOADS_BASE = (process.env.UPLOADS_PUBLIC_BASE || "https://api.tikdum.com").replace(/\/$/, "");
const absUrl = (u) => {
  const s = String(u);
  if (/^https?:\/\//.test(s)) return s;
  const p = s.startsWith("/") ? s : `/${s}`;
  return `${p.startsWith("/uploads/") ? UPLOADS_BASE : SITE}${p}`;
};
const abs = (u) => (!u ? DEFAULT_IMAGE : absUrl(u));
const titleOf = (t) => (t ? `${t} | ${SITE_NAME}` : DEFAULT_TITLE);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
// The website's own category photos (local-service-app/public/category-photos, used by
// CategoryPhoto.jsx) for categories without an uploaded one.
const BUILT_IN_PHOTOS = new Set(["ac-repair", "appliance-repair", "carpentry", "computer-repair", "electrician", "home-cleaning", "packers-movers", "painting", "pest-control", "plumbing", "salon-spa"]);
const categoryImage = (c) => (!c ? null : c.imageUrl || c.bannerUrl || (BUILT_IN_PHOTOS.has(c.id) ? `/category-photos/${c.id}.jpg` : null));

// A search-result description from the real details: the service, its starting price, who
// does it, where, and the provider's own note when it says more than the name.
function serviceDescription(s, providerName) {
  const name = String(s.name || "").trim();
  const note = String(s.tagline || "").trim().replace(/[.\s]+$/, "");
  const useful = note && !name.toLowerCase().startsWith(note.toLowerCase()) && note.toLowerCase() !== name.toLowerCase();
  const price = Number(s.price) > 0 ? ` from ${inr(s.price)}` : "";
  const text = `${name}${price}${providerName ? ` with ${providerName}` : ""} in Jammu & Kashmir.${useful ? ` ${note}.` : ""} Verified local professionals — book instantly on Tikdum over WhatsApp.`;
  return text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text;
}

// "AC Repair services", but "Masonry Services" stays as it is.
const asServices = (name) => (/\bservices?$/i.test(String(name).trim()) ? name : `${name} services`);

function breadcrumbs(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${SITE}${path}` })),
  };
}

const organization = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_NAME,
  url: SITE,
  logo: `${SITE}/pwa-512.png`,
  description: DEFAULT_DESCRIPTION,
  areaServed: AREA,
});

// Prices of a set of services as one AggregateOffer (lowest, highest, how many).
function priceRange(list) {
  const prices = list.map((s) => Number(s.price)).filter((p) => Number.isFinite(p) && p > 0);
  if (!prices.length) return null;
  return { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length };
}

// Ratings from real reviews only (never invented): a weighted average over the services' reviews.
function ratingOf(list) {
  const rated = list.filter((s) => Number(s.reviewCount) > 0 && Number(s.rating) > 0);
  const count = rated.reduce((n, s) => n + Number(s.reviewCount), 0);
  if (!count) return null;
  const value = rated.reduce((n, s) => n + Number(s.rating) * Number(s.reviewCount), 0) / count;
  return { "@type": "AggregateRating", ratingValue: Math.round(value * 10) / 10, reviewCount: count, bestRating: 5, worstRating: 1 };
}

// What has a page for search engines: lasting facts only — an active service in a live category
// from an approved provider. Not "bookable this minute" (working hours, online, wallet, request
// limits): those change through the day, and a page that keeps flipping to 404 drops out of Google.
// hidden: providers a Super Admin set to "always hide" (a lasting decision, e.g. a test account).
function searchCatalog({ categories = [], services = [], providers = [], hidden = new Set() } = {}) {
  const liveCategories = new Set(categories.filter((c) => c.active).map((c) => c.id));
  const approved = new Set(
    providers.filter((p) => (p.verificationStatus || "pending") === "approved" && p.verified !== false && !hidden.has(p.id)).map((p) => p.id)
  );
  return {
    categories,
    providers: providers.filter((p) => !hidden.has(p.id)),
    services: services.filter((s) => s.status === "active" && liveCategories.has(s.categoryId) && approved.has(s.providerId)),
  };
}

// Providers currently set to "always hide" in Super Admin (store.setVisibilityOverride).
function hiddenProviderIds(now = Date.now()) {
  const rows = require("./jsonStore").readAll("providerVisibilityOverrides");
  return new Set(rows.filter((o) => o.mode === "hide" && (!o.until || Date.parse(o.until) > now)).map((o) => o.id));
}

const notFound = (path) => ({ status: 404, title: titleOf("Page not found"), description: DEFAULT_DESCRIPTION, canonical: null, noindex: true, jsonLd: [], path });

// What one address should say. data = searchCatalog(...): categories, providers, and the services that have pages.
function pageFor(rawPath, data = {}) {
  let path;
  try {
    path = decodeURI(String(rawPath || "/").split("?")[0].split("#")[0]).replace(/\/+$/, "") || "/";
  } catch {
    return notFound(String(rawPath || "/")); // a broken %-escape is not a page
  }
  const categories = data.categories || [];
  const services = data.services || [];
  const providers = data.providers || [];
  const page = (p) => ({ status: 200, description: DEFAULT_DESCRIPTION, image: DEFAULT_IMAGE, noindex: false, jsonLd: [], path: p.canonical || path, ...p });

  if (path === "/" || path === "/home") {
    const live = categories.filter((c) => c.active);
    return page({
      title: DEFAULT_TITLE,
      canonical: "/home",
      jsonLd: [
        organization(),
        { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE}/#website`, name: SITE_NAME, url: SITE, publisher: { "@id": ORG_ID }, inLanguage: "en-IN" },
        ...(live.length
          ? [{
              "@context": "https://schema.org", "@type": "ItemList", name: "Home service categories",
              itemListElement: live.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${SITE}/category/${encodeURIComponent(c.id)}` })),
            }]
          : []),
      ],
    });
  }
  if (path === "/categories") {
    const live = categories.filter((c) => c.active);
    return page({
      title: titleOf("Service Categories"),
      description: "Browse every home service category on Tikdum — cleaning, pest control, AC repair, and more — and find trusted local providers near you.",
      canonical: "/categories",
      jsonLd: [
        breadcrumbs([["Home", "/home"], ["Categories", "/categories"]]),
        { "@context": "https://schema.org", "@type": "ItemList", itemListElement: live.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${SITE}/category/${encodeURIComponent(c.id)}` })) },
      ],
    });
  }
  if (path === "/services") {
    return page({
      title: titleOf("All Services"),
      description: `Browse all ${services.length} home services available on Tikdum, from top-rated local providers near you.`,
      canonical: "/services",
      jsonLd: [breadcrumbs([["Home", "/home"], ["All services", "/services"]])],
    });
  }
  if (path === "/booking-protection") {
    return page({
      title: titleOf("Booking Protection"),
      description: "Every booking on Tikdum is covered by our genuine service guarantee, damage protection up to ₹1,000, fair price guarantee, and SOS emergency help.",
      canonical: "/booking-protection",
    });
  }

  let m = /^\/category\/([^/]+)$/.exec(path);
  if (m) {
    const category = categories.find((c) => c.id === m[1]);
    if (!category) return notFound(path);
    const inCat = services.filter((s) => s.categoryId === category.id);
    const providerCount = new Set(inCat.map((s) => s.providerId)).size;
    const offers = priceRange(inCat);
    const rating = ratingOf(inCat);
    const description = inCat.length
      ? `Book ${asServices(category.name)} near you on Tikdum — compare ${plural(providerCount, "trusted local provider")}${offers ? `, from ${inr(offers.lowPrice)}` : ""}, and book instantly over WhatsApp.`
      : `${category.name} on Tikdum is coming soon in your area. Book other trusted home services near you.`;
    return page({
      title: titleOf(category.name),
      description,
      canonical: `/category/${category.id}`,
      image: abs(categoryImage(category)),
      // A category with nothing bookable yet stays out of search until it has services.
      noindex: !category.active || inCat.length === 0,
      jsonLd: [
        breadcrumbs([["Home", "/home"], ["Categories", "/categories"], [category.name, `/category/${category.id}`]]),
        ...(inCat.length
          ? [{
              "@context": "https://schema.org",
              "@type": "Service",
              name: asServices(category.name),
              serviceType: category.name,
              url: `${SITE}/category/${encodeURIComponent(category.id)}`,
              provider: { "@id": ORG_ID },
              areaServed: AREA,
              ...(offers ? { offers } : {}),
              ...(rating ? { aggregateRating: rating } : {}),
              hasOfferCatalog: {
                "@type": "OfferCatalog",
                name: category.name,
                itemListElement: inCat.slice(0, 30).map((s) => ({
                  "@type": "Offer", price: Number(s.price) || undefined, priceCurrency: "INR", url: `${SITE}/service/${encodeURIComponent(s.id)}`,
                  itemOffered: { "@type": "Service", name: s.name },
                })),
              },
            }]
          : []),
      ],
    });
  }

  m = /^\/service\/([^/]+)$/.exec(path);
  if (m) {
    const s = services.find((x) => x.id === m[1]);
    if (!s) return notFound(path);
    const provider = providers.find((p) => p.id === s.providerId);
    const category = categories.find((c) => c.id === s.categoryId);
    const providerName = provider?.businessName || provider?.name;
    const image = abs(s.imageUrl || categoryImage(category));
    return page({
      title: titleOf(s.name),
      description: serviceDescription(s, providerName),
      canonical: `/service/${s.id}`,
      image,
      jsonLd: [
        breadcrumbs([["Home", "/home"], ...(category ? [[category.name, `/category/${category.id}`]] : []), [s.name, `/service/${s.id}`]]),
        {
          "@context": "https://schema.org",
          "@type": "Service",
          name: s.name,
          description: s.includes?.length ? `${serviceDescription(s, providerName)} Includes: ${s.includes.slice(0, 8).join(", ")}.` : serviceDescription(s, providerName),
          ...(category ? { serviceType: category.name } : {}),
          image,
          url: `${SITE}/service/${encodeURIComponent(s.id)}`,
          areaServed: AREA,
          offers: { "@type": "Offer", price: Number(s.price), priceCurrency: "INR", url: `${SITE}/service/${encodeURIComponent(s.id)}`, availability: "https://schema.org/InStock" },
          ...(providerName ? { provider: { "@type": "LocalBusiness", name: providerName, url: `${SITE}/provider/${encodeURIComponent(provider.id)}`, areaServed: AREA } } : {}),
          ...(Number(s.reviewCount) > 0 && Number(s.rating) > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(s.rating), reviewCount: Number(s.reviewCount), bestRating: 5, worstRating: 1 } } : {}),
        },
      ],
    });
  }

  m = /^\/find-service\/([^/]+)$/.exec(path);
  if (m) {
    const anchor = services.find((x) => x.id === m[1]);
    if (!anchor) return notFound(path);
    const category = categories.find((c) => c.id === anchor.categoryId);
    const same = services.filter((x) => x.categoryId === anchor.categoryId && String(x.name).trim().toLowerCase() === String(anchor.name).trim().toLowerCase());
    return page({
      title: titleOf(`${anchor.name} Providers`),
      description: `Compare ${plural(same.length, "trusted provider")} for ${anchor.name}${category ? ` in ${category.name}` : ""} on Tikdum. Book instantly over WhatsApp.`,
      canonical: `/find-service/${anchor.id}`,
      image: abs(anchor.imageUrl || categoryImage(category)),
      jsonLd: [breadcrumbs([["Home", "/home"], ...(category ? [[category.name, `/category/${category.id}`]] : []), [`${anchor.name} providers`, `/find-service/${anchor.id}`]])],
    });
  }

  m = /^\/provider\/([^/]+)$/.exec(path);
  if (m) {
    const p = providers.find((x) => x.id === m[1]);
    const theirs = services.filter((s) => s.providerId === m[1]);
    // Only approved providers with something bookable have a public page.
    if (!p || (p.verificationStatus || "pending") !== "approved" || theirs.length === 0) return notFound(path);
    const name = p.businessName || p.name;
    const rating = Number(p.reviews) > 0 && Number(p.rating) > 0 ? { "@type": "AggregateRating", ratingValue: Number(p.rating), reviewCount: Number(p.reviews), bestRating: 5, worstRating: 1 } : null;
    return page({
      title: titleOf(p.name),
      description: `${p.name} on Tikdum — rated ${p.reviews ? p.rating : "new"} with ${plural(theirs.length, "service")} available. Book trusted home services near you.`,
      canonical: `/provider/${p.id}`,
      image: abs(p.photoUrl || theirs.find((s) => s.imageUrl)?.imageUrl || categoryImage(categories.find((c) => c.id === theirs[0]?.categoryId))),
      jsonLd: [
        breadcrumbs([["Home", "/home"], [name, `/provider/${p.id}`]]),
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name,
          url: `${SITE}/provider/${encodeURIComponent(p.id)}`,
          ...(p.photoUrl ? { image: abs(p.photoUrl) } : {}),
          areaServed: p.serviceArea ? { "@type": "Place", name: p.serviceArea } : AREA,
          ...(rating ? { aggregateRating: rating } : {}),
          ...(priceRange(theirs) ? { priceRange: `${inr(priceRange(theirs).lowPrice)}–${inr(priceRange(theirs).highPrice)}` } : {}),
          makesOffer: theirs.slice(0, 20).map((s) => ({ "@type": "Offer", price: Number(s.price) || undefined, priceCurrency: "INR", itemOffered: { "@type": "Service", name: s.name, url: `${SITE}/service/${encodeURIComponent(s.id)}` } })),
          // Customers' own words (first name and initial), newest first — reviewRequests.publicReviews.
          ...((data.reviews || []).some((r) => r.providerId === p.id)
            ? {
                review: data.reviews
                  .filter((r) => r.providerId === p.id)
                  .slice(0, 5)
                  .map((r) => ({
                    "@type": "Review",
                    author: { "@type": "Person", name: r.name },
                    reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
                    reviewBody: r.text,
                    ...(r.at ? { datePublished: String(r.at).slice(0, 10) } : {}),
                  })),
              }
            : {}),
        },
      ],
    });
  }

  if (path === "/blog") {
    const list = data.blog || [];
    return page({
      title: titleOf("Home Care Tips & Guides"),
      description: "Tips and guides for your home in Jammu & Kashmir — seasonal maintenance, cleaning checklists, repairs and what to ask before you book — from Tikdum.",
      canonical: "/blog",
      ads: true, // Google AdSense, on the blog only (blogAds.js)
      jsonLd: [
        breadcrumbs([["Home", "/home"], ["Blog", "/blog"]]),
        { "@context": "https://schema.org", "@type": "Blog", name: "Tikdum Blog", url: `${SITE}/blog`, publisher: { "@id": ORG_ID }, blogPost: list.slice(0, 20).map((a) => ({ "@type": "BlogPosting", headline: a.title, url: `${SITE}/blog/${encodeURIComponent(a.slug)}`, datePublished: a.publishedAt })) },
      ],
      bodyHtml: `<main><h1>Tikdum Blog — home care tips &amp; guides</h1><ul>${list.map((a) => `<li><a href="/blog/${esc(a.slug)}">${esc(a.title)}</a> — ${esc(a.description || "")}</li>`).join("")}</ul></main>`,
    });
  }
  m = /^\/blog\/([^/]+)$/.exec(path);
  if (m) {
    const a = (data.blog || []).find((x) => x.slug === m[1]);
    if (!a) return notFound(path);
    const cat = categories.find((c) => c.id === a.category || String(c.name).toLowerCase() === String(a.category || "").toLowerCase());
    return page({
      title: titleOf(a.title),
      description: a.description,
      canonical: `/blog/${a.slug}`,
      ads: true,
      image: abs(a.coverUrl),
      ogType: "article",
      jsonLd: [
        breadcrumbs([["Home", "/home"], ["Blog", "/blog"], [a.title, `/blog/${a.slug}`]]),
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: a.title,
          description: a.description,
          image: abs(a.coverUrl),
          datePublished: a.publishedAt,
          dateModified: a.updatedAt || a.publishedAt,
          author: { "@type": "Organization", name: SITE_NAME, url: SITE },
          publisher: { "@id": ORG_ID },
          mainEntityOfPage: `${SITE}/blog/${a.slug}`,
          inLanguage: "en-IN",
          ...(cat ? { about: { "@type": "Service", name: cat.name, url: `${SITE}/category/${encodeURIComponent(cat.id)}` } } : {}),
        },
        ...(a.faqs?.length ? [faqLd(a.faqs)] : []),
      ],
      bodyHtml: `<main><article><h1>${esc(a.title)}</h1>${require("./blog").render(a.body)}${(a.faqs || []).map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}${cat ? `<p><a href="/category/${esc(cat.id)}">Book ${esc(cat.name)} on Tikdum</a></p>` : ""}</article></main>`,
    });
  }

  if (PRIVATE.some((re) => re.test(path))) return page({ title: DEFAULT_TITLE, canonical: null, noindex: true });

  // City pages: /jammu and /jammu/ac-repair (cityPages.js), only where providers really serve.
  m = /^\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (m && data.tree) {
    const c = m[2] ? cityPages.cityCategoryPage(m[1], m[2], data) : cityPages.cityPage(m[1], data);
    if (c) return page(m[2] ? cityCategoryHead(c, categories) : cityHead(c));
  }
  return notFound(path);
}

const cityPlace = (c) => ({ "@type": "City", name: c.city.name, containedInPlace: AREA });
const faqLd = (faqs) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

function cityHead(c) {
  const top = c.categories.slice(0, 4).map((x) => x.name);
  const path = `/${c.city.slug}`;
  return {
    title: titleOf(`Home Services in ${c.city.name}`),
    // No "from ₹…" here: the lowest price across every kind of service says nothing useful.
    description: `Book trusted home services in ${c.city.name} on Tikdum — ${top.join(", ")}${c.categories.length > top.length ? " and more" : ""}. ${plural(c.providers, "verified provider")} serving ${plural(c.areas.length, "area")}, with prices shown before you book.`,
    canonical: path,
    image: abs(categoryImage(c.categories.find((x) => categoryImage(x)))),
    jsonLd: [
      breadcrumbs([["Home", "/home"], [c.city.name, path]]),
      {
        "@context": "https://schema.org", "@type": "ItemList", name: `Home services in ${c.city.name}`,
        itemListElement: c.categories.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: `${x.name} in ${c.city.name}`, url: `${SITE}${path}/${encodeURIComponent(x.id)}` })),
      },
      {
        "@context": "https://schema.org", "@type": "Service", name: `Home services in ${c.city.name}`, provider: { "@id": ORG_ID }, areaServed: cityPlace(c),
        ...(c.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: c.rating.rating, reviewCount: c.rating.reviews, bestRating: 5, worstRating: 1 } } : {}),
      },
      faqLd(c.faqs),
    ],
  };
}

function cityCategoryHead(c, categories) {
  const path = `/${c.city.slug}/${c.category.id}`;
  const name = `${c.category.name} in ${c.city.name}`;
  const areaNames = c.areas.map((a) => a.name);
  return {
    title: titleOf(`${name}${c.from ? ` — from ${inr(c.from)}` : ""}`),
    description: `Book ${asServices(c.category.name)} in ${c.city.name} on Tikdum: ${plural(c.providers.length, "verified local provider")}, ${plural(c.serviceCount, "service")}${c.from ? ` from ${inr(c.from)}` : ""}${c.rating ? `, rated ${c.rating.rating}★` : ""}. Serving ${areaNames.slice(0, 3).join(", ")}${areaNames.length > 3 ? " and more" : ""}.`,
    canonical: path,
    image: abs(categoryImage(categories.find((x) => x.id === c.category.id)) || c.services.find((s) => s.imageUrl)?.imageUrl),
    jsonLd: [
      breadcrumbs([["Home", "/home"], [c.city.name, `/${c.city.slug}`], [c.category.name, path]]),
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name,
        serviceType: c.category.name,
        url: `${SITE}${path}`,
        provider: { "@id": ORG_ID },
        areaServed: cityPlace(c),
        ...(c.from ? { offers: { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: c.from, highPrice: c.to, offerCount: c.serviceCount } } : {}),
        ...(c.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: c.rating.rating, reviewCount: c.rating.reviews, bestRating: 5, worstRating: 1 } } : {}),
      },
      {
        "@context": "https://schema.org", "@type": "ItemList", name: `${c.category.name} providers in ${c.city.name}`,
        itemListElement: c.providers.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${SITE}/provider/${encodeURIComponent(p.id)}` })),
      },
      faqLd(c.faqs),
    ],
  };
}

// Everything the pages and the sitemap read, from the same caches the apps use.
async function loadSearchData(store) {
  const [categories, services, providers, reviews] = await Promise.all([
    store.listCategories(),
    store.listServices({}),
    store.listProviders(),
    require("./reviewRequests").recentReviews(store),
  ]);
  const hidden = hiddenProviderIds();
  return {
    ...searchCatalog({ categories, services, providers, hidden }),
    tree: require("./locations").tree(),
    blog: require("./blog").listPublished(),
    reviews: (reviews || []).filter((r) => !hidden.has(r.providerId)),
  };
}

// ---------------------------------------------------------------- HTML

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// JSON inside <script> must not be able to close the tag.
const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function headFor(p) {
  const url = p.canonical ? `${SITE}${p.canonical}` : null;
  const tags = [
    `<meta data-static-seo name="description" content="${esc(p.description)}" />`,
    url ? `<link data-static-seo rel="canonical" href="${esc(url)}" />` : "",
    p.noindex ? `<meta data-static-seo name="robots" content="noindex, nofollow" />` : "",
    `<meta data-static-seo property="og:type" content="${p.ogType || "website"}" />`,
    `<meta data-static-seo property="og:site_name" content="${SITE_NAME}" />`,
    `<meta data-static-seo property="og:locale" content="en_IN" />`,
    `<meta data-static-seo property="og:title" content="${esc(p.title)}" />`,
    `<meta data-static-seo property="og:description" content="${esc(p.description)}" />`,
    url ? `<meta data-static-seo property="og:url" content="${esc(url)}" />` : "",
    `<meta data-static-seo property="og:image" content="${esc(p.image || DEFAULT_IMAGE)}" />`,
    `<meta data-static-seo name="twitter:card" content="summary_large_image" />`,
    `<meta data-static-seo name="twitter:title" content="${esc(p.title)}" />`,
    `<meta data-static-seo name="twitter:description" content="${esc(p.description)}" />`,
    `<meta data-static-seo name="twitter:image" content="${esc(p.image || DEFAULT_IMAGE)}" />`,
    ...(p.jsonLd || []).map((o) => `<script type="application/ld+json" data-seo-path="${esc(p.path)}">${safeJson(o)}</script>`),
    ...(p.ads ? require("./blogAds").headTags() : []),
  ];
  return tags.filter(Boolean).join("\n    ");
}

// The app's index.html with this page's head: its own title and generic tags replaced.
function injectHead(shell, p) {
  let html = String(shell);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(p.title)}</title>`);
  html = html.replace(/\s*<meta\s+data-static-seo[\s\S]*?\/?>/gi, "");
  html = html.replace(/\s*<link\s+data-static-seo[\s\S]*?\/?>/gi, "");
  html = html.replace(/<\/head>/i, `    ${headFor(p)}\n  </head>`);
  // A page whose words matter to search engines (the blog) also carries them in the body, under
  // the loading screen; the app replaces it all when it starts.
  if (p.bodyHtml) html = html.replace(/(<div id="root">)/i, `$1\n      ${p.bodyHtml}`);
  return html;
}

// ---------------------------------------------------------------- serving

// The copy is checked with the website on every page (If-None-Match: a 304 on the same machine,
// a millisecond or two), so a deploy shows at once. It used to be kept for a minute, and for that
// minute after each deploy pages pointed at the old build's script, which no longer exists: a
// blank page. If the website doesn't answer, the last good copy is used and asked again in 10 s.
const SHELL_URL = process.env.SEO_SHELL_URL || "http://127.0.0.1:5175/__shell";
const SHELL_RETRY_MS = 10 * 1000;
let shell = { html: null, etag: null, lastModified: null, retryAt: 0 };
async function getShell(fetchImpl = fetch, now = Date.now()) {
  if (shell.html && now < shell.retryAt) return shell.html;
  try {
    const headers = {};
    if (shell.html && shell.etag) headers["If-None-Match"] = shell.etag;
    if (shell.html && shell.lastModified) headers["If-Modified-Since"] = shell.lastModified;
    const res = await fetchImpl(SHELL_URL, { headers, signal: AbortSignal.timeout(shell.html ? 1000 : 2000) });
    if (res.status === 304 && shell.html) return shell.html;
    if (!res.ok) throw new Error(`shell ${res.status}`);
    const html = await res.text();
    if (!/<\/head>/i.test(html)) throw new Error("shell has no head");
    shell = { html, etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), retryAt: 0 };
  } catch (e) {
    if (!shell.html) throw e; // nothing to fall back on: nginx serves the plain page
    shell.retryAt = now + SHELL_RETRY_MS; // keep the last good copy, try again in 10 s
  }
  return shell.html;
}
getShell.reset = () => {
  shell = { html: null, etag: null, lastModified: null, retryAt: 0 };
};

// GET /__page (from the website's nginx). Data comes from the same caches the apps use;
// if it's slow, the page goes out with the generic head rather than keeping anyone waiting.
function route(store) {
  return async (req, res) => {
    // Only the website's nginx sends this header; anyone else asking gets nothing.
    if (!req.get("x-original-uri")) return res.status(404).end();
    const original = String(req.get("x-original-uri"));
    // tikdum.com/ads.txt: who may sell ads on the site (AdSense checks it).
    if (original.split("?")[0] === "/ads.txt") {
      const txt = require("./blogAds").adsTxt();
      return txt ? res.type("text/plain").set("Cache-Control", "public, max-age=3600").send(txt) : res.status(404).type("text/plain").send("Not found");
    }
    let html;
    try {
      html = await getShell();
    } catch {
      return res.status(502).end();
    }
    let p;
    try {
      const data = await Promise.race([
        loadSearchData(store),
        new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 2500)),
      ]);
      p = pageFor(original, data);
    } catch {
      p = { status: 200, title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, canonical: null, noindex: false, jsonLd: [], path: "/" };
    }
    res.status(p.status).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
    if (p.noindex) res.set("X-Robots-Tag", "noindex");
    res.send(injectHead(html, p));
  };
}

module.exports = { pageFor, injectHead, headFor, route, getShell, searchCatalog, loadSearchData, absUrl, DEFAULT_TITLE };
