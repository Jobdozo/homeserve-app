// Call desk (Admin → Provider CRM → Call bookings): staff book a service for a
// customer who phoned in, and close, reschedule or cancel their open bookings.
// A booking made here goes through the same createOrder as the app (prices,
// options, PIN-code coverage, provider notification), so nothing about it is
// special except who typed it — recorded in jsonStore "callBookings".
const jsonStore = require("./jsonStore");
const store = require("./store");
const blockedPhones = require("./blockedPhones");

const ACTIVE = ["Pending", "Accepted", "In Progress"];
const MAX_DAYS_AHEAD = 60;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// An Indian mobile number, typed any way (+91, spaces, 0 prefix) -> its 10 digits.
function cleanMobile(raw) {
  const digits = String(raw || "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) throw fail("Enter the customer's 10-digit mobile number");
  return digits;
}

// Today in India as YYYY-MM-DD.
const istToday = (now) => new Date(now + 5.5 * 3600000).toISOString().slice(0, 10);

function cleanSchedule({ date, time } = {}, now = Date.now()) {
  const d = String(date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw fail("Pick a date");
  const today = istToday(now);
  if (d < today) throw fail("That date has already passed");
  if (Date.parse(d) - Date.parse(today) > MAX_DAYS_AHEAD * 86400000) throw fail(`Pick a date within ${MAX_DAYS_AHEAD} days`);
  const t = text(time, 40);
  if (!t) throw fail("Pick a time slot");
  return { date: d, time: t };
}

// A map pin inside India, or null (the provider's directions button needs one).
function cleanPin(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  return lat != null && lng != null && la >= 6 && la <= 38 && ln >= 68 && ln <= 98 ? { lat: la, lng: ln } : null;
}

function cleanAddress(a = {}) {
  const line = text(a.line, 300);
  if (line.length < 5) throw fail("Enter the customer's full address");
  const pincode = String(a.pincode || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(pincode)) throw fail("Enter the 6-digit PIN code");
  // The pin comes with an address picked from the customer's own (knownAddresses).
  return { label: text(a.label, 30) || "Home", line, pincode, ...(cleanPin(a.lat, a.lng) || {}) };
}

const isCallBooking = (bookingId) => jsonStore.readAll("callBookings").some((r) => r.id === bookingId);

// Pure: the places a customer has used, newest first — the address of their last booking, then
// their saved Home and Office — each { source, label, line, pincode, lat, lng }, without
// repeats; lat/lng (the map pin) when the place has one. A booking keeps its PIN inside the
// address line (store.withPincodeInLine), so it's taken out again here. Exported for tests.
function knownAddresses(bookings = [], saved = null) {
  const out = [];
  const add = (source, label, line, pincode, lat, lng) => {
    let l = String(line || "").trim();
    let pin = String(pincode || "").replace(/\D/g, "");
    if (!pin) pin = (l.match(/\b\d{6}\b(?!.*\b\d{6}\b)/) || [""])[0];
    if (pin) l = l.replace(new RegExp(`[,\\s]*${pin}\\s*$`), "").trim();
    if (l.length < 5 || !/^\d{6}$/.test(pin)) return;
    const same = out.find((a) => a.line.toLowerCase() === l.toLowerCase() && a.pincode === pin);
    const mapPin = cleanPin(lat, lng);
    if (same) {
      if (!same.lat && mapPin) Object.assign(same, mapPin); // the same place, with a pin from the other record
      return;
    }
    out.push({ source, label: text(label, 30) || "Home", line: l, pincode: pin, ...(mapPin || { lat: null, lng: null }) });
  };
  const last = [...bookings].filter((b) => b.address?.line).sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")))[0];
  if (last) add("last", last.address.label, last.address.line, null, last.address.lat, last.address.lng);
  if (saved?.line) add("home", saved.label || "Home", saved.line, saved.pincode, saved.lat, saved.lng);
  if (saved?.office?.line) add("office", "Office", saved.office.line, saved.office.pincode, saved.office.lat, saved.office.lng);
  return out;
}

// Who is calling: the customer with this number (if any), their open bookings and the
// addresses they've used (the call desk fills in the first one).
async function lookup(phone) {
  const mobile = cleanMobile(phone);
  const customer = await store.getCustomerByPhone(mobile);
  const all = customer ? await store.listBookings({ customerId: customer.id }) : [];
  const bookings = all.filter((b) => ACTIVE.includes(b.status));
  const addresses = customer ? knownAddresses(all, store.getCustomerAddress(customer.id)) : [];
  return { phone: mobile, blocked: blockedPhones.isBlocked(mobile), customer: customer || null, bookings, addresses };
}

// body: { phone, name, items: [{ serviceId, options, quantity, issue }], date, time, address: { label, line, pincode }, note }
async function book(body = {}, actor = {}) {
  const mobile = cleanMobile(body.phone);
  if (blockedPhones.isBlocked(mobile)) throw fail("This number is blocked from booking", 403);
  const items = Array.isArray(body.items) ? body.items.filter((i) => i?.serviceId) : [];
  if (!items.length) throw fail("Add at least one service");
  if (items.length > 10) throw fail("At most 10 services in one booking");
  const { date, time } = cleanSchedule(body);
  const address = cleanAddress(body.address);

  let customer = await store.getCustomerByPhone(mobile);
  let newCustomer = false;
  if (!customer) {
    const name = text(body.name, 60);
    if (!name) throw fail("Enter the customer's name — this number has no Tikdum account yet");
    customer = await store.createCustomer({ phone: store.canonicalPhone(mobile), name });
    newCustomer = true;
  }
  const bookings = await store.createOrder({
    items: items.map((i) => ({ serviceId: String(i.serviceId), options: i.options || {}, quantity: i.quantity, issue: text(i.issue, 200), date, time })),
    address,
    customerId: customer.id,
    note: text(body.note, 200),
  });
  const at = new Date().toISOString();
  for (const b of bookings) jsonStore.insert("callBookings", { id: b.id, byId: actor.id || null, byName: actor.name || "Admin", at });
  return { customer, newCustomer, bookings };
}

async function reschedule(bookingId, body = {}) {
  const { date, time } = cleanSchedule(body);
  const booking = await store.rescheduleBooking(bookingId, { date, time, reason: text(body.reason, 200) });
  if (!booking) throw fail("Booking not found", 404);
  return booking;
}

// action "complete": the job was done (Accepted / In Progress → Completed).
// action "cancel": with a reason, which the customer and provider are told.
async function close(bookingId, { action, reason } = {}) {
  const existing = await store.getBooking(bookingId);
  if (!existing) throw fail("Booking not found", 404);
  if (!ACTIVE.includes(existing.status)) throw fail(`This booking is already ${existing.status.toLowerCase()}`, 409);
  if (action === "complete") {
    if (existing.status === "Pending") throw fail("No provider has accepted this booking yet — assign one or cancel it", 409);
    return store.updateBookingStatus(bookingId, "Completed");
  }
  if (action !== "cancel") throw fail('action must be "complete" or "cancel"');
  const why = text(reason, 200);
  if (!why) throw fail("Give a reason for cancelling");
  const booking = await store.updateBookingStatus(bookingId, "Cancelled");
  const serviceName = existing.service?.name || "Service";
  await store.addNotification({
    recipientType: "customer", recipientId: existing.customerId, type: "booking", title: "Booking cancelled",
    message: `Your ${serviceName} booking was cancelled: ${why}`, bookingId,
  });
  if (existing.providerId && existing.status !== "Pending") {
    await store.addNotification({
      recipientType: "provider", recipientId: existing.providerId, type: "booking", title: "Booking cancelled",
      message: `${serviceName} booking cancelled by Tikdum: ${why}`, bookingId,
    });
  }
  return booking;
}

module.exports = { lookup, book, reschedule, close, isCallBooking, cleanMobile, cleanSchedule, cleanAddress, knownAddresses, ACTIVE };
