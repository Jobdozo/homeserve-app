// Sub-categories shown as chips on a category page: only the active ones of
// this category that actually have a service customers can see. Services with
// no sub-category appear under "All" only. A category with nothing to choose
// between gets no chips at all, so it looks exactly as it did before.
export function chipsFor(subcategories, categoryId, servicesInCategory) {
  const counts = new Map();
  for (const s of servicesInCategory) if (s.subcategoryId) counts.set(s.subcategoryId, (counts.get(s.subcategoryId) || 0) + 1);
  return (subcategories || [])
    .filter((x) => x.categoryId === categoryId && x.active !== false && counts.has(x.id))
    .map((x) => ({ id: x.id, name: x.name, count: counts.get(x.id) }));
}
