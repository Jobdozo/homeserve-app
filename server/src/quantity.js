// How many of a service a customer is booking in one line ("Sofa Cleaning x 10").
// The booking table can't take a new column, so the number is kept beside it
// (store.js: bookingQuantities) and the booking amount already includes it.
const MAX_QUANTITY = 50;

// Services priced under ₹50 are a rate per square foot (carpet ₹15, floor scrubbing ₹4,
// tiling ₹25) or, for water tanks, per litre — the same rule cityPages.js uses for its "from"
// prices. Their quantity is the area or volume: up to MAX_UNITS, shown with its unit
// ("Porch tile cleaning × 500 sq ft"). Everything else is counted in pieces, up to MAX_QUANTITY.
const PER_UNIT_BELOW = 50;
const MAX_UNITS = 20000;
function unitOf(service) {
  const price = Number(service?.price);
  if (!(price > 0 && price < PER_UNIT_BELOW)) return null;
  return /tank/i.test(String(service?.name || "")) ? "litres" : "sq ft";
}
const maxFor = (service) => (unitOf(service) ? MAX_UNITS : MAX_QUANTITY);

// Missing means 1. Anything else must be a whole number from 1 to the service's maximum.
function normalizeQuantity(value, service = null) {
  if (value === undefined || value === null || value === "") return 1;
  const n = Number(value);
  const max = maxFor(service);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    const unit = unitOf(service);
    throw Object.assign(new Error(unit ? `Enter the ${unit === "sq ft" ? "area" : "volume"} in ${unit}, from 1 to ${max}` : `Quantity must be a whole number from 1 to ${max}`), { status: 400 });
  }
  return n;
}

// "× 10" for pieces, "× 500 sq ft" for a per-unit service.
const quantityText = (quantity, service) => `× ${quantity}${unitOf(service) ? ` ${unitOf(service)}` : ""}`;

module.exports = { MAX_QUANTITY, MAX_UNITS, normalizeQuantity, unitOf, maxFor, quantityText };
