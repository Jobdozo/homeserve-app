// Service options: choices a customer makes when adding a service, each with a
// price added to the service's own price. E.g. "AC type" (required, pick 1:
// Split +₹50 / Window +₹0) and "Make it better" (up to 3: Jet-pump wash +₹299,
// Outdoor unit wash +₹149). A group marked fullPrice is priced the other way:
// its choices ARE the price ("Home size": 1 BHK ₹4,500 / 2 BHK ₹6,500; waxing
// "Underarms" ₹80 + "Full arms" ₹200), so the service's own price is only a
// "from" price: the customer pays the full-price choices they pick (plus any
// extras), and must pick at least one.
// Set by Super Admin per service (optionally copied
// to every service with the same name). The server prices every booking from
// these, never from what the app sends.
//
// jsonStore "serviceOptions": { id: serviceId, groups: [...] }
// jsonStore "bookingOptions": { id: bookingId, lines: [{ group, choice, price }] }
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const MAX_GROUPS = 20; // waxing alone has a group per body area
const MAX_CHOICES = 12;
const MAX_PRICE = 100000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const newId = () => crypto.randomBytes(5).toString("hex");
const text = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

let byService = null; // serviceId -> groups
let byBooking = null; // bookingId -> lines
const loadServices = () => {
  if (!byService) byService = new Map(jsonStore.readAll("serviceOptions").map((r) => [r.id, r.groups || []]));
  return byService;
};
const loadBookings = () => {
  if (!byBooking) byBooking = new Map(jsonStore.readAll("bookingOptions").map((r) => [r.id, r.lines || []]));
  return byBooking;
};

// Cleans what Super Admin sent. Keeps ids that already exist so carts made
// earlier still match; gives new groups/choices fresh ids.
function normalizeGroups(input) {
  if (!Array.isArray(input)) throw fail("Options must be a list of groups");
  if (input.length > MAX_GROUPS) throw fail(`At most ${MAX_GROUPS} option groups`);
  return input.map((g, gi) => {
    const name = text(g?.name, 60);
    if (!name) throw fail(`Group ${gi + 1} needs a name`);
    const choicesIn = Array.isArray(g?.choices) ? g.choices : [];
    if (choicesIn.length === 0) throw fail(`"${name}" needs at least one choice`);
    if (choicesIn.length > MAX_CHOICES) throw fail(`"${name}" can have at most ${MAX_CHOICES} choices`);
    const seen = new Set();
    const choices = choicesIn.map((c, ci) => {
      const cname = text(c?.name, 60);
      if (!cname) throw fail(`Choice ${ci + 1} in "${name}" needs a name`);
      if (seen.has(cname.toLowerCase())) throw fail(`"${cname}" appears twice in "${name}"`);
      seen.add(cname.toLowerCase());
      const price = Math.round(Number(c?.price) || 0);
      if (price < 0 || price > MAX_PRICE) throw fail(`The price of "${cname}" must be between ₹0 and ₹${MAX_PRICE}`);
      return { id: /^[a-z0-9]{4,20}$/.test(String(c?.id || "")) ? c.id : newId(), name: cname, price };
    });
    const max = Math.min(choices.length, Math.max(1, Math.round(Number(g?.max) || 1)));
    return {
      id: /^[a-z0-9]{4,20}$/.test(String(g?.id || "")) ? g.id : newId(),
      name,
      required: Boolean(g?.required),
      max,
      ...(g?.fullPrice ? { fullPrice: true } : {}),
      choices,
    };
  });
}

function getOptions(serviceId) {
  return loadServices().get(serviceId) || [];
}

// Saves the groups for these services (one, or every service sharing its name).
function setOptions(serviceIds, groups) {
  const clean = normalizeGroups(groups);
  const all = jsonStore.readAll("serviceOptions").filter((r) => !serviceIds.includes(r.id));
  if (clean.length > 0) for (const id of serviceIds) all.push({ id, groups: clean, updatedAt: new Date().toISOString() });
  jsonStore.writeAll("serviceOptions", all);
  byService = null;
  return clean;
}

// What a selection costs and what to show for it. selection: { groupId: [choiceId, ...] }.
// Throws a 400 a customer can read when a required group is empty or too many are picked.
function priceSelection(service, selection) {
  const groups = getOptions(service.id);
  const lines = [];
  let extra = 0;
  let fullPicks = 0;
  const sel = selection && typeof selection === "object" ? selection : {};
  for (const g of groups) {
    const raw = Array.isArray(sel[g.id]) ? sel[g.id] : sel[g.id] ? [sel[g.id]] : [];
    const picked = [...new Set(raw.map(String))].map((id) => g.choices.find((c) => c.id === id)).filter(Boolean);
    if (g.required && picked.length === 0) throw fail(`Choose ${g.name.toLowerCase()} for ${service.name}`);
    if (picked.length > g.max) throw fail(`Choose at most ${g.max} for ${g.name.toLowerCase()} (${service.name})`);
    for (const c of picked) {
      // Callers price a line as service.price + extra, and apps receive full-price choices as
      // their difference from the service price (store.js withOptions). So the first full-price
      // pick counts as that difference (it takes the service price's place) and any further
      // ones at their own price; the lines always add up to what the customer pays.
      const price = g.fullPrice && fullPicks++ === 0 ? c.price - service.price : c.price;
      lines.push({ group: g.name, choice: c.name, price });
      extra += price;
    }
  }
  if (!fullPicks && groups.some((g) => g.fullPrice)) throw fail(`Choose at least one option for ${service.name}`);
  return { extra, lines };
}

function saveBookingLines(bookingId, lines) {
  if (!lines || lines.length === 0) return;
  jsonStore.insert("bookingOptions", { id: bookingId, lines });
  if (byBooking) byBooking.set(bookingId, lines);
}

function bookingLines(bookingId) {
  return loadBookings().get(bookingId) || null;
}

module.exports = { normalizeGroups, getOptions, setOptions, priceSelection, saveBookingLines, bookingLines, MAX_GROUPS, MAX_CHOICES };
