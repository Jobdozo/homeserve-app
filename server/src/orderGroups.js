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

// Two providers' services are "the same service" when their names match, ignoring case and spacing —
// what a request may be handed to when its provider declines or doesn't answer.
const normName = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
function sameServiceName(a, b) {
  return Boolean(normName(a)) && normName(a) === normName(b);
}

// The customer's PIN from a booking's address line ("..., Sector 21, Noida 201301" -> "201301").
function pincodeFromLine(line) {
  const all = String(line || "").match(/\b\d{6}\b/g);
  return all ? all[all.length - 1] : "";
}

module.exports = { groupByProvider, describeGroup, sameServiceName, pincodeFromLine };
