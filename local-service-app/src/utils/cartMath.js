// Price of one cart line. Kept in one place so the cart bar, cart screen and
// checkout always agree (service options add to it — see ServiceOptionsSheet).
export function unitPrice(service, item) {
  const extra = (item?.optionLines || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  return (Number(service?.price) || 0) + extra;
}

export function lineTotal(service, item) {
  return unitPrice(service, item) * (item?.quantity || 1);
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
