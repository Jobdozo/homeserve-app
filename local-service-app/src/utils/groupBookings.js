// The bookings of one order that go to one provider are ONE request to the customer (one Request ID, one code).
// Bookings in the same status collapse into a single entry; anything without an orderId stays on its own.
export function groupBookings(list) {
  const entries = [];
  const byKey = new Map();
  for (const b of list) {
    if (!b.orderId) {
      entries.push({ key: b.id, items: [b] });
      continue;
    }
    const key = `${b.orderId}|${b.providerId}|${b.status}`;
    const found = byKey.get(key);
    if (found) found.items.push(b);
    else {
      const entry = { key, items: [b] };
      byKey.set(key, entry);
      entries.push(entry);
    }
  }
  return entries.map((e) => ({
    ...e,
    first: e.items[0],
    count: e.items.length,
    total: e.items.reduce((sum, b) => sum + (b.amount || 0), 0),
  }));
}
