// Finding duplicates: two things are "the same" when they share a scope (provider + category for a
// service, category for a catalog entry or a type) and their names match ignoring case and spacing.

const normName = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();

// Groups of 2+ items with the same key. keyOf returns null for items that can't be compared.
function duplicateGroups(items, keyOf) {
  const byKey = new Map();
  for (const item of items || []) {
    const key = keyOf(item);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }
  return [...byKey.values()].filter((g) => g.length > 1);
}

// The item to keep from a group: highest score wins; ties go to the smaller tieBreak value (e.g. older).
function pickKeeper(group, score, tieBreak = (x) => String(x.id)) {
  return [...group].sort((a, b) => score(b) - score(a) || (tieBreak(a) < tieBreak(b) ? -1 : tieBreak(a) > tieBreak(b) ? 1 : 0))[0];
}

// Rating of two merged services: weighted by how many reviews each had.
function mergeRatings(a, b) {
  const count = (a.reviewCount || 0) + (b.reviewCount || 0);
  if (!count) return { rating: a.rating || b.rating || 0, reviewCount: 0 };
  const rating = ((a.rating || 0) * (a.reviewCount || 0) + (b.rating || 0) * (b.reviewCount || 0)) / count;
  return { rating: Math.round(rating * 10) / 10, reviewCount: count };
}

module.exports = { normName, duplicateGroups, pickKeeper, mergeRatings };
