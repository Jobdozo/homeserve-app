// Types (sub-categories) of a category as the customer sees them: only the
// active ones of this category that actually have a service customers can see.
// Services with no type appear under "All" only. A category with nothing to
// choose between gets no types at all, so it looks exactly as it always did.
//
// Each type carries a picture: the one the team uploaded, else the photo of its
// first service, else (in the tile) the category's own picture.
export function chipsFor(subcategories, categoryId, servicesInCategory) {
  const byType = new Map();
  for (const s of servicesInCategory) {
    if (!s.subcategoryId) continue;
    const t = byType.get(s.subcategoryId) || { count: 0, minPrice: Infinity, imageUrl: null };
    t.count += 1;
    t.minPrice = Math.min(t.minPrice, s.price);
    t.imageUrl = t.imageUrl || s.imageUrl || null;
    byType.set(s.subcategoryId, t);
  }
  return (subcategories || [])
    .filter((x) => x.categoryId === categoryId && x.active !== false && byType.has(x.id))
    .map((x) => {
      const t = byType.get(x.id);
      return { id: x.id, name: x.name, count: t.count, minPrice: t.minPrice, imageUrl: x.imageUrl || t.imageUrl };
    });
}
