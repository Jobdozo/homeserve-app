// A customer's cart reaches the provider as one booking per service, all with the
// same orderId. Show those as ONE order: bookings of the same order that are in
// the same status collapse into a single entry. A booking without an orderId is
// its own entry. Entry order follows the order of the list given.
export function groupByOrder(list) {
  const entries = [];
  const byKey = new Map();
  for (const r of list) {
    if (!r.orderId) {
      entries.push({ key: r.id, items: [r] });
      continue;
    }
    const key = `${r.orderId}|${r.status}`;
    const found = byKey.get(key);
    if (found) found.items.push(r);
    else {
      const entry = { key, orderId: r.orderId, items: [r] };
      byKey.set(key, entry);
      entries.push(entry);
    }
  }
  return entries.map((e) => ({
    ...e,
    first: e.items[0],
    count: e.items.length,
    total: e.items.reduce((sum, r) => sum + (r.amount || 0), 0),
  }));
}
