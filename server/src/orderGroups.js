// A customer's cart becomes one booking per service, all sharing an orderId. For
// the provider that is ONE request: bookings of the same order that go to the
// same provider are handled together (one ring, one push, one accept/decline).

// Splits bookings into lists, one per provider, keeping the order they came in.
function groupByProvider(bookings) {
  const groups = new Map();
  for (const b of bookings) {
    if (!groups.has(b.providerId)) groups.set(b.providerId, []);
    groups.get(b.providerId).push(b);
  }
  return [...groups.values()];
}

// "Sofa x 10", "AC Gas Refill" ... -> a short line for a push or WhatsApp message.
function describeGroup(bookings, limit = 3) {
  const names = bookings.map((b) => b.service?.name).filter(Boolean);
  if (names.length <= 1) return names[0] || "A service";
  const shown = names.slice(0, limit).join(", ");
  return names.length > limit ? `${shown} and ${names.length - limit} more` : shown;
}

module.exports = { groupByProvider, describeGroup };
