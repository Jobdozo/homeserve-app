// Formats a review/booking count the way most consumer apps do: 250, 12K, 1.2M.
export function formatCount(n) {
  if (n == null) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export function discountPct(price, originalPrice) {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round((1 - price / originalPrice) * 100);
}

// Several providers can list the exact same service name (that's what makes
// them comparable on ServiceProvidersScreen — see /find-service/:serviceId).
// A browsing list of many providers' services would otherwise show that same
// name once per provider; keeping just the first occurrence per (category,
// name) collapses that to one representative card, in whatever order the
// list was already sorted by. Tapping it still shows every vendor for that
// service, so no listing is lost, just no longer duplicated.
export function dedupeByName(services) {
  const seen = new Set();
  const out = [];
  for (const s of services) {
    const key = `${s.categoryId}|${String(s.name || "").trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
