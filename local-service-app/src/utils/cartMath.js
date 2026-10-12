// Price of one cart line. Kept in one place so the cart bar, cart screen and
// checkout always agree (service options add to it — see ServiceOptionsSheet).
export function unitPrice(service, item) {
  const extra = (item?.optionLines || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  return (Number(service?.price) || 0) + extra;
}

export function lineTotal(service, item) {
  return unitPrice(service, item) * (item?.quantity || 1);
}

// What an offer takes off. lines = [{ providerId, total }]. Tikdum's offers are a
// percentage of the whole cart; a provider's own offer counts only that
// provider's services (a % with an optional cap, or a flat amount), after its minimum.
export function offerBase(offer, lines) {
  const all = lines.reduce((n, l) => n + l.total, 0);
  return offer?.providerId ? lines.filter((l) => l.providerId === offer.providerId).reduce((n, l) => n + l.total, 0) : all;
}
export function offerSaving(offer, lines) {
  if (!offer) return 0;
  const base = offerBase(offer, lines);
  if (base <= 0 || (offer.minOrder > 0 && base < offer.minOrder)) return 0;
  if (!offer.providerId) return Math.round((base * (offer.discountPercent || 0)) / 100);
  const raw = offer.kind === "flat" ? offer.value : (base * offer.value) / 100;
  const capped = offer.kind !== "flat" && offer.maxDiscount > 0 ? Math.min(raw, offer.maxDiscount) : raw;
  return Math.min(base, Math.round(capped));
}

export function cartTotals(cart, getService) {
  let count = 0;
  let total = 0;
  for (const item of cart) {
    const s = getService(item.serviceId);
    if (!s) continue;
    count += item.quantity || 1;
    total += lineTotal(s, item);
  }
  return { count, total };
}
