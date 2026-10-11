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

// ---- look-alikes: different names that are probably the same service ----
const tokens = (v) => normName(v).replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

// Words that don't change which service it is ("Ceiling fan" = "Ceiling fan cleaning").
const FILLER = new Set(["cleaning", "clean", "service", "services", "servicing", "work", "job", "visit", "charge", "charges", "and", "the", "for", "of", "with", "a"]);

// Look-alikes: the same words once filler words are ignored ("Kitchen windows" ~ "Kitchen windows Cleaning"),
// or a small typo of at most 2 letters ("Celing fan" ~ "Ceiling fan"). Anything that adds a real word
// ("Kitchen Cleaning" / "Kitchen windows Cleaning", "Full Arms" / "Full Arms & Underarms") or differs in a
// number ("1 Seat" / "3 Seat") is a different service.
function similarNames(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  const na = ta.join(" ");
  const nb = tb.join(" ");
  if (!na || !nb || na === nb) return false;
  const numbers = (t) => t.filter((x) => /[0-9]/.test(x)).sort().join(",");
  if (numbers(ta) !== numbers(tb)) return false;
  const core = (t) => t.filter((x) => !FILLER.has(x)).sort().join(" ");
  if (core(ta) && core(ta) === core(tb)) return true;
  return ta.length === tb.length && Math.max(na.length, nb.length) >= 8 && editDistance(na, nb) <= 2;
}

// Pairs of look-alike items within the same scope (provider + category, or category).
function similarPairs(items, scopeOf, nameOf) {
  const byScope = new Map();
  for (const it of items || []) {
    const scope = scopeOf(it);
    if (!scope) continue;
    if (!byScope.has(scope)) byScope.set(scope, []);
    byScope.get(scope).push(it);
  }
  const pairs = [];
  for (const list of byScope.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) if (similarNames(nameOf(list[i]), nameOf(list[j]))) pairs.push([list[i], list[j]]);
    }
  }
  return pairs;
}

// The same pair, whichever order it comes in — used to remember "these are not duplicates".
const pairKey = (kind, a, b) => `${kind}:${[String(a), String(b)].sort().join("|")}`;

module.exports = { normName, duplicateGroups, pickKeeper, mergeRatings, similarNames, similarPairs, pairKey };
