// What the customer app downloads to show the catalogue, kept small as it grows
// (scaling step 1): only services offered at the customer's PIN, at most
// PER_CATEGORY of them per category on first load (the rest come page by page
// from /api/catalog), each trimmed to what a list card shows, and only the
// providers those services belong to. Pure functions, no I/O.
const PER_CATEGORY = 40;
const PAGE_MAX = 100;

// A list card needs these; the full service (highlights, every "included" line)
// comes from /api/services/:id when its page opens.
function slimService(s) {
  return {
    id: s.id,
    name: s.name,
    price: s.price,
    ...(s.originalPrice ? { originalPrice: s.originalPrice } : {}),
    rating: s.rating,
    reviewCount: s.reviewCount,
    ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
    ...(s.imageFromCatalog ? { imageFromCatalog: true } : {}),
    categoryId: s.categoryId,
    ...(s.subcategoryId ? { subcategoryId: s.subcategoryId } : {}),
    providerId: s.providerId,
    ...(s.isAd ? { isAd: true } : {}),
    ...(s.tagline ? { tagline: s.tagline } : {}),
    ...(s.includes?.length ? { includes: s.includes.slice(0, 2) } : {}),
    ...(s.options ? { options: s.options } : {}),
    lite: true,
  };
}

// Advertised first, then most booked, then best rated with the most reviews.
function rankServices(list, bookingCounts = {}) {
  const score = (s) => (Number(s.rating) || 0) * Math.log10((Number(s.reviewCount) || 0) + 10);
  return [...list].sort(
    (a, b) =>
      Number(!!b.isAd) - Number(!!a.isAd) ||
      (bookingCounts[b.id] || 0) - (bookingCounts[a.id] || 0) ||
      score(b) - score(a) ||
      String(a.name).localeCompare(String(b.name))
  );
}

// The first `per` services of each category (in ranked order), how many each
// category really has, and whether anything was left out.
function capPerCategory(ranked, per = PER_CATEGORY) {
  const counts = {};
  const kept = [];
  for (const s of ranked) {
    const c = s.categoryId || "";
    counts[c] = (counts[c] || 0) + 1;
    if (counts[c] <= per) kept.push(s);
  }
  return { services: kept, counts, partial: kept.length < ranked.length };
}

const norm = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ");

// Every word of the query appears in the service's name, tagline, category or type name.
function matchesQuery(s, q, names = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([s.name, s.tagline, names[s.categoryId], names[s.subcategoryId]].join(" "));
  return words.every((w) => hay.includes(w));
}

// One page of the catalogue: filtered, ranked, sliced. `names` maps category and
// type ids to their names so "ac repair" finds services in AC Repair.
function catalogPage(list, { ids, category, subcategory, providerId, q, offset = 0, limit = 40, bookingCounts = {}, names = {} } = {}) {
  const want = ids ? new Set(ids) : null;
  const filtered = list.filter(
    (s) =>
      (!want || want.has(s.id)) &&
      (!category || s.categoryId === category) &&
      (!subcategory || s.subcategoryId === subcategory) &&
      (!providerId || s.providerId === providerId) &&
      (!q || matchesQuery(s, q, names))
  );
  const ranked = rankServices(filtered, bookingCounts);
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.min(PAGE_MAX, Math.max(1, Number(limit) || 40));
  return { services: ranked.slice(start, start + size), total: ranked.length, offset: start, limit: size };
}

// Only the providers the given services belong to.
function providersFor(services, providers) {
  const ids = new Set(services.map((s) => s.providerId));
  return providers.filter((p) => ids.has(p.id));
}

module.exports = { PER_CATEGORY, PAGE_MAX, slimService, rankServices, capPerCategory, matchesQuery, catalogPage, providersFor };
