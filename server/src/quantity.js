// How many of a service a customer is booking in one line ("Sofa Cleaning x 10").
// The booking table can't take a new column, so the number is kept beside it
// (store.js: bookingQuantities) and the booking amount already includes it.
const MAX_QUANTITY = 50;

// Missing means 1. Anything else must be a whole number from 1 to MAX_QUANTITY.
function normalizeQuantity(value) {
  if (value === undefined || value === null || value === "") return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QUANTITY) {
    throw Object.assign(new Error(`Quantity must be a whole number from 1 to ${MAX_QUANTITY}`), { status: 400 });
  }
  return n;
}

module.exports = { MAX_QUANTITY, normalizeQuantity };
