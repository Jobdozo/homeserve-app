const { query, mutate } = require("./dataconnect");
const jsonStore = require("./jsonStore");
const push = require("./push");
const fcm = require("./fcm");
const whatsapp = require("./whatsapp");

// Short-lived in-memory cache for the catalog reads that hit almost every
// page load (categories/services/providers) — Data Connect is a remote
// service (us-central1) so every round trip carries real cross-region
// latency, and this data changes rarely enough that a short TTL, busted
// immediately on any write, makes the common case near-free without ever
// serving something stale to the person who just changed it.
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return undefined;
}

function cacheSet(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

function cacheClear(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

// Collapses genuinely concurrent identical calls into one shared query —
// unlike the TTL cache above, this isn't about repeat requests over time,
// it's for the same page load firing two requests that both need the exact
// same data at nearly the same instant (e.g. the app's own /api/bookings
// call and /api/providers/:id/earnings, which computes earnings from that
// same provider's bookings) so they don't each pay for a separate round
// trip to Data Connect for identical results.
const inFlight = new Map();
function dedupe(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Phones are compared digits-only so formatting differences (spacing, missing
// "+", etc.) between the number typed at signup and at a later login never
// cause a returning user to be treated as new.
function normalizePhone(phone) {
  return (phone || "").replace(/\D/g, "");
}

// ---- shared field selections (kept as plain strings, not GraphQL fragments,
// to avoid any uncertainty about fragment support in ad-hoc executeGraphql calls) ----

const PROVIDER_FIELDS = `
  id name avatar category rating reviews phone live verified verificationStatus
  businessName experience serviceArea email gstNumber responseRate joinedAt
`;

const SERVICE_FIELDS = `
  id name icon tagline price originalPrice rating reviewCount distanceLabel status
  category { slug }
  provider { id }
  serviceHighlights_on_service { icon label }
  serviceIncludes_on_service { text }
`;

const BOOKING_FIELDS = `
  id orderId status date time addressLabel addressLine addressLat addressLng issue amount
  createdAt cancelledAt reviewed reviewRating reviewText
  service { id }
  provider { id }
  customer { id name avatar phone email }
  bookingStatusEvents_on_booking { status at }
`;

// ---- mappers: raw GraphQL rows -> the exact shapes the rest of the app expects ----

function mapCategory(c) {
  return { id: c.slug, name: c.name, icon: c.icon };
}

function mapProvider(p) {
  if (!p) return p;
  // responseRate is never written at signup (no rejected/late responses yet
  // to compute it from) — default a brand-new provider to 100% rather than
  // showing a raw null (renders as the literal string "null%" in the UI).
  return { ...p, responseRate: p.responseRate ?? 100 };
}

function mapService(s) {
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    tagline: s.tagline,
    price: s.price,
    originalPrice: s.originalPrice,
    rating: s.rating,
    reviewCount: s.reviewCount,
    distanceLabel: s.distanceLabel,
    status: s.status,
    categoryId: s.category?.slug,
    providerId: s.provider?.id,
    highlights: (s.serviceHighlights_on_service || []).map((h) => ({ icon: h.icon, label: h.label })),
    includes: (s.serviceIncludes_on_service || []).map((i) => i.text),
  };
}

function mapBooking(b, customer, service) {
  const statusHistory = {};
  for (const e of b.bookingStatusEvents_on_booking || []) statusHistory[e.status] = e.at;
  return {
    id: b.id,
    ...(b.orderId ? { orderId: b.orderId } : {}),
    serviceId: b.service?.id,
    providerId: b.provider?.id,
    customerId: b.customer?.id,
    status: b.status,
    date: b.date,
    time: b.time,
    address: { label: b.addressLabel, line: b.addressLine, lat: b.addressLat, lng: b.addressLng },
    issue: b.issue,
    amount: b.amount,
    createdAt: b.createdAt,
    statusHistory,
    ...(b.cancelledAt ? { cancelledAt: b.cancelledAt } : {}),
    reviewed: !!b.reviewed,
    ...(b.reviewed ? { review: { rating: b.reviewRating, text: b.reviewText } } : {}),
    customer,
    service,
  };
}

function mapMessage(m) {
  return { from: m.sender, text: m.text, time: m.sentAt };
}

function mapActivity(a) {
  return { id: a.id, type: a.type, message: a.message, time: a.occurredAt };
}

function mapNotification(n) {
  return {
    id: n.id,
    recipientType: n.recipientType,
    recipientId: n.recipientId,
    type: n.type,
    title: n.title,
    message: n.message,
    bookingId: n.booking?.id || null,
    read: n.read,
    time: n.createdAt,
  };
}

// ---- categories (slug is the public id — the frontend's CategoryIcon
// component keys its palette off these exact slug strings) ----

async function getCategoryUuidBySlug(slug) {
  const { categories } = await query(`query($slug: String!) { categories(where: { slug: { eq: $slug } }) { id } }`, {
    slug,
  });
  return categories[0]?.id;
}

async function listCategories() {
  const cached = cacheGet("categories");
  if (cached) return cached;
  const { categories } = await query(`query { categories { slug name icon } }`, {});
  return cacheSet("categories", categories.map(mapCategory));
}

async function createCategory({ name, icon }) {
  const slug = slugify(name);
  await mutate(
    `mutation($slug: String!, $name: String!, $icon: String) { category_insert(data: { slug: $slug, name: $name, icon: $icon }) }`,
    { slug, name, icon: icon || null }
  );
  cacheClear("categories");
  await logActivity("category", `New category added: ${name}`);
  const { categories } = await query(`query($slug: String!) { categories(where: { slug: { eq: $slug } }) { slug name icon } }`, {
    slug,
  });
  return mapCategory(categories[0]);
}

// ---- customers ----

async function getCustomerById(id) {
  const { customer } = await query(`query($id: UUID!) { customer(id: $id) { id name avatar phone email } }`, { id });
  return customer || undefined;
}

async function getCustomerByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return undefined;
  const { customers } = await query(`query { customers { id name avatar phone email } }`, {});
  return customers.find((c) => normalizePhone(c.phone) === target);
}

async function listCustomerIds() {
  const { customers } = await query(`query { customers { id } }`, {});
  return customers.map((c) => c.id);
}

async function createCustomer({ phone, name }) {
  const { customer_insert } = await mutate(
    `mutation($name: String!, $phone: String!) { customer_insert(data: { name: $name, phone: $phone, avatar: "🧑" }) }`,
    { name: name || "New Customer", phone }
  );
  return getCustomerById(customer_insert.id);
}

// Admin-facing customer list with booking stats — totalSpent counts only
// Completed bookings, matching how revenue is computed everywhere else
// (getAdminOverview, getEarnings, getAdminReports).
async function listCustomers() {
  const cacheKey = "customers:admin";
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const [{ customers }, bookings] = await Promise.all([
    query(`query { customers { id name avatar phone email } }`, {}),
    listBookings({}),
  ]);
  const statsByCustomer = new Map();
  for (const b of bookings) {
    const stats = statsByCustomer.get(b.customerId) || { totalBookings: 0, totalSpent: 0 };
    stats.totalBookings += 1;
    if (b.status === "Completed") stats.totalSpent += b.amount;
    statsByCustomer.set(b.customerId, stats);
  }
  const result = customers.map((c) => {
    const stats = statsByCustomer.get(c.id) || { totalBookings: 0, totalSpent: 0 };
    return { id: c.id, name: c.name, phone: c.phone, email: c.email, avatar: c.avatar, ...stats };
  });
  return cacheSet(cacheKey, result);
}

// ---- providers ----

async function getProviderByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return undefined;
  const { providers } = await query(`query { providers { ${PROVIDER_FIELDS} } }`, {});
  return mapProvider(providers.find((p) => normalizePhone(p.phone) === target));
}

// Admin manually onboards a provider (no WhatsApp signup yet) — pre-verified
// since an admin is directly vetting them; `live: false` until they actually
// log in via the Provider App with this same phone number, which the login
// flow resolves to this same record (getProviderByPhone matches by phone).
async function adminCreateProvider({ name, phone, category }) {
  const { provider_insert } = await mutate(
    `mutation($name: String!, $phone: String!, $category: String) {
      provider_insert(data: {
        name: $name, phone: $phone, avatar: "🧑‍🔧", category: $category,
        live: false, verified: true, verificationStatus: "approved"
      })
    }`,
    { name, phone, category: category || "Not set" }
  );
  cacheClear("providers");
  await logActivity("provider", `Admin added a new provider: ${name}`);
  return getProvider(provider_insert.id);
}

async function createProviderSignup({ phone, name }) {
  const { provider_insert } = await mutate(
    `mutation($name: String!, $phone: String!) {
      provider_insert(data: {
        name: $name, phone: $phone, avatar: "🧑‍🔧", category: "Not set",
        live: true, verified: false, verificationStatus: "pending"
      })
    }`,
    { name: name || "New Provider", phone }
  );
  cacheClear("providers");
  await logActivity("provider", `New provider registration: ${name || "New Provider"}`);
  return getProvider(provider_insert.id);
}

async function listProviders() {
  const cached = cacheGet("providers");
  if (cached) return cached;
  const { providers } = await query(`query { providers { ${PROVIDER_FIELDS} } }`, {});
  return cacheSet("providers", providers.map(mapProvider));
}

async function getProvider(id) {
  const { provider } = await query(`query($id: UUID!) { provider(id: $id) { ${PROVIDER_FIELDS} } }`, { id });
  return mapProvider(provider);
}

async function setProviderVerification(providerId, status) {
  await mutate(
    `mutation($id: UUID!, $status: String!, $verified: Boolean!) {
      provider_update(id: $id, data: { verificationStatus: $status, verified: $verified })
    }`,
    { id: providerId, status, verified: status === "approved" }
  );
  cacheClear("providers");
  const provider = await getProvider(providerId);
  if (!provider) return undefined;
  await logActivity("provider", `Provider ${status}: ${provider.name} (${provider.category})`);
  return provider;
}

const EDITABLE_PROVIDER_FIELDS = ["name", "category", "businessName", "experience", "serviceArea", "email", "gstNumber"];

async function updateProviderProfile(providerId, patch) {
  const fields = {};
  for (const key of EDITABLE_PROVIDER_FIELDS) {
    if (patch[key] !== undefined) fields[key] = patch[key] === "" ? null : patch[key];
  }
  if (Object.keys(fields).length === 0) return getProvider(providerId);

  const varDefs = Object.keys(fields).map((k) => `$${k}: String`).join(", ");
  const dataFields = Object.keys(fields).map((k) => `${k}: $${k}`).join(", ");
  await mutate(
    `mutation($id: UUID!, ${varDefs}) { provider_update(id: $id, data: { ${dataFields} }) }`,
    { id: providerId, ...fields }
  );
  cacheClear("providers");
  return getProvider(providerId);
}

// ---- services ----

async function listServices({ activeOnly = false } = {}) {
  const cacheKey = `services:${activeOnly ? "active" : "all"}`;
  let all = cacheGet(cacheKey);
  if (!all) {
    const gql = activeOnly
      ? `query { services(where: { status: { eq: "active" } }) { ${SERVICE_FIELDS} } }`
      : `query { services { ${SERVICE_FIELDS} } }`;
    const { services } = await query(gql, {});
    all = cacheSet(cacheKey, services.map(mapService));
  }
  // Suspended providers' services stay off the public/bookable catalog, but
  // remain visible to admin (activeOnly: false) so they aren't hidden there.
  if (!activeOnly) return all;
  const suspended = new Set(listSuspendedProviderIds());
  return all.filter((s) => !suspended.has(s.providerId));
}

async function getService(id) {
  const cacheKey = `service:${id}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const { service } = await query(`query($id: UUID!) { service(id: $id) { ${SERVICE_FIELDS} } }`, { id });
  return cacheSet(cacheKey, service ? mapService(service) : undefined);
}

async function listProviderServices(providerId) {
  const { services } = await query(
    `query($providerId: UUID!) { services(where: { provider: { id: { eq: $providerId } } }) { ${SERVICE_FIELDS} } }`,
    { providerId }
  );
  return services.map(mapService);
}

async function addProviderService(providerId, data) {
  const categoryId = (await getCategoryUuidBySlug(data.categorySlug || "ac-repair")) || null;
  const { service_insert } = await mutate(
    `mutation($providerId: UUID!, $categoryId: UUID, $name: String!, $price: Int!, $originalPrice: Int, $icon: String, $distanceLabel: String) {
      service_insert(data: {
        providerId: $providerId, categoryId: $categoryId, name: $name, price: $price,
        originalPrice: $originalPrice, icon: $icon, distanceLabel: $distanceLabel, status: "active"
      })
    }`,
    {
      providerId,
      categoryId,
      name: data.name,
      price: Number(data.price) || 0,
      originalPrice: data.originalPrice || null,
      icon: "🛠️",
      distanceLabel: "3.2 km away",
    }
  );
  const serviceId = service_insert.id;
  cacheClear("service");
  const defaultHighlights = [
    { icon: "🧑‍🔧", label: "Experienced Technicians" },
    { icon: "⏱️", label: "On-time Service" },
    { icon: "✅", label: "Satisfaction Guaranteed" },
  ];
  for (const h of defaultHighlights) {
    await mutate(
      `mutation($serviceId: UUID!, $icon: String, $label: String!) {
        serviceHighlight_insert(data: { serviceId: $serviceId, icon: $icon, label: $label })
      }`,
      { serviceId, icon: h.icon, label: h.label }
    );
  }
  const provider = await getProvider(providerId);
  await logActivity("service", `${provider?.name || "A provider"} added a new service: ${data.name}`);
  return getService(serviceId);
}

// Admin adding a service on a provider's behalf — same categorySlug-based
// resolution as addProviderService above, just with the admin's own picker.
async function adminCreateService(providerId, { categorySlug, name, price, originalPrice }) {
  const categoryId = (await getCategoryUuidBySlug(categorySlug)) || null;
  const { service_insert } = await mutate(
    `mutation($providerId: UUID!, $categoryId: UUID, $name: String!, $price: Int!, $originalPrice: Int) {
      service_insert(data: {
        providerId: $providerId, categoryId: $categoryId, name: $name, price: $price,
        originalPrice: $originalPrice, icon: "🛠️", distanceLabel: "3.2 km away", status: "active"
      })
    }`,
    { providerId, categoryId, name, price: Number(price) || 0, originalPrice: originalPrice ? Number(originalPrice) : null }
  );
  cacheClear("service");
  const provider = await getProvider(providerId);
  await logActivity("service", `Admin added a new service for ${provider?.name || "a provider"}: ${name}`);
  return getService(service_insert.id);
}

async function updateProviderService(providerId, serviceId, patch) {
  const existing = await getService(serviceId);
  if (!existing || existing.providerId !== providerId) return undefined;
  const fields = {};
  const vars = { id: serviceId };
  const varDefs = [];
  for (const key of ["name", "tagline", "price", "originalPrice", "status", "distanceLabel"]) {
    if (patch[key] !== undefined) {
      fields[key] = patch[key];
      vars[key] = patch[key];
      const gqlType = key === "price" || key === "originalPrice" ? "Int" : "String";
      varDefs.push(`$${key}: ${gqlType}`);
    }
  }
  if (varDefs.length > 0) {
    await mutate(
      `mutation($id: UUID!, ${varDefs.join(", ")}) { service_update(id: $id, data: { ${Object.keys(fields)
        .map((k) => `${k}: $${k}`)
        .join(", ")} }) }`,
      vars
    );
    cacheClear("service");
  }
  return getService(serviceId);
}

async function updateServiceStatus(serviceId, status) {
  await mutate(`mutation($id: UUID!, $status: String!) { service_update(id: $id, data: { status: $status }) }`, {
    id: serviceId,
    status,
  });
  cacheClear("service");
  const service = await getService(serviceId);
  if (!service) return undefined;
  await logActivity("service", `Service "${service.name}" set to ${status} by admin`);
  return service;
}

// ---- bookings ----

async function fetchBookingWithRelations(id) {
  const { booking } = await query(
    `query($id: UUID!) {
      booking(id: $id) {
        ${BOOKING_FIELDS}
      }
    }`,
    { id }
  );
  if (!booking) return undefined;
  const service = booking.service ? await getService(booking.service.id) : null;
  return mapBooking(
    booking,
    booking.customer,
    service ? { id: service.id, name: service.name, icon: service.icon, categoryId: service.categoryId, price: service.price } : null
  );
}

async function listBookings(filter = {}) {
  const { customerId, providerId } = filter;
  return dedupe(`listBookings:${customerId || ""}:${providerId || ""}`, () => listBookingsUncached(filter));
}

async function listBookingsUncached({ customerId, providerId } = {}) {
  const hasFilter = Boolean(customerId || providerId);
  const where = customerId
    ? `where: { customer: { id: { eq: $id } } }, `
    : providerId
      ? `where: { provider: { id: { eq: $id } } }, `
      : "";
  const gql = hasFilter
    ? `query($id: UUID!) {
        bookings(${where}orderBy: { createdAt: DESC }) { ${BOOKING_FIELDS} }
      }`
    : `query {
        bookings(orderBy: { createdAt: DESC }) { ${BOOKING_FIELDS} }
      }`;
  const { bookings } = await query(gql, hasFilter ? { id: customerId || providerId } : {});
  const serviceCache = new Map();
  const results = [];
  for (const b of bookings) {
    let service = null;
    if (b.service?.id) {
      if (!serviceCache.has(b.service.id)) serviceCache.set(b.service.id, await getService(b.service.id));
      const s = serviceCache.get(b.service.id);
      service = s ? { id: s.id, name: s.name, icon: s.icon, categoryId: s.categoryId, price: s.price } : null;
    }
    results.push(mapBooking(b, b.customer, service));
  }

  // One batched query for a message preview per booking, instead of the
  // apps eagerly fetching every full thread individually on every load —
  // the Messages tab only needs the last line, not the whole conversation.
  if (results.length > 0) {
    const { messages } = await query(
      `query($ids: [UUID!]) {
        messages(where: { booking: { id: { in: $ids } } }, orderBy: { sentAt: ASC }) {
          booking { id }
          sender
          text
          sentAt
        }
      }`,
      { ids: results.map((b) => b.id) }
    );
    const lastByBooking = {};
    for (const m of messages) lastByBooking[m.booking.id] = { from: m.sender, text: m.text, time: m.sentAt };
    for (const b of results) {
      if (lastByBooking[b.id]) b.lastMessage = lastByBooking[b.id];
    }
  }

  return results;
}

async function getBooking(id) {
  return fetchBookingWithRelations(id);
}

async function getMessages(bookingId) {
  const { messages } = await query(
    `query($bookingId: UUID!) { messages(where: { booking: { id: { eq: $bookingId } } }, orderBy: { sentAt: ASC }) { sender text sentAt } }`,
    { bookingId }
  );
  return messages.map(mapMessage);
}

// `offerCode` (never a raw discount percentage) is re-validated here server-side
// on every call — a client can never supply its own discount amount directly.
async function createBooking({ serviceId, date, time, address, issue, customerId, orderId, offerCode }) {
  const service = await getService(serviceId);
  if (!service) throw new Error("Unknown service");
  if (isProviderSuspended(service.providerId)) {
    throw Object.assign(new Error("This provider isn't currently accepting new bookings"), { status: 409 });
  }
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Unknown customer");
  let amount = service.price;
  if (offerCode) {
    const result = validateOffer(offerCode);
    if (!result.valid) throw new Error(result.error);
    amount = Math.max(0, Math.round(service.price * (1 - result.offer.discountPercent / 100)));
  }

  const now = new Date().toISOString();
  const { booking_insert } = await mutate(
    `mutation($orderId: String, $serviceId: UUID!, $providerId: UUID!, $customerId: UUID!, $date: Date!, $time: String!, $addressLabel: String, $addressLine: String, $addressLat: Float, $addressLng: Float, $issue: String, $amount: Int!, $createdAt: Timestamp!) {
      booking_insert(data: {
        orderId: $orderId, serviceId: $serviceId, providerId: $providerId, customerId: $customerId,
        status: "Pending", date: $date, time: $time, addressLabel: $addressLabel, addressLine: $addressLine,
        addressLat: $addressLat, addressLng: $addressLng, issue: $issue, amount: $amount, createdAt: $createdAt
      })
    }`,
    {
      orderId: orderId || null,
      serviceId,
      providerId: service.providerId,
      customerId,
      date,
      time,
      addressLabel: address?.label || null,
      addressLine: address?.line || null,
      addressLat: address?.lat ?? null,
      addressLng: address?.lng ?? null,
      issue: issue || "",
      amount,
      createdAt: now,
    }
  );
  const bookingId = booking_insert.id;
  await mutate(
    `mutation($bookingId: UUID!, $status: String!, $at: Timestamp!) {
      bookingStatusEvent_insert(data: { bookingId: $bookingId, status: $status, at: $at })
    }`,
    { bookingId, status: "Pending", at: now }
  );

  if (!orderId) await logActivity("booking", `New booking received: #${bookingId} — ${service.name}`);
  const bookingMessage = `${customer.name} requested ${service.name} for ${date}`;
  await addNotification({
    recipientType: "provider",
    recipientId: service.providerId,
    type: "booking",
    title: "New booking request",
    message: bookingMessage,
    bookingId,
    skipPush: true, // dispatchBooking (index.js) sends this one's push
  });
  notifyProviderOfBookingByWhatsApp(
    service.providerId,
    `New Tikdum booking request!\n${bookingMessage}\nOpen the Tikdum Pro app to accept or decline.`
  ).catch((e) => console.error("WhatsApp booking alert failed", e));
  return fetchBookingWithRelations(bookingId);
}

async function createOrder({ items, address, customerId, offerCode }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Order must have at least one item");
  const orderId = `ORD-${Date.now().toString(36)}`;
  if (offerCode) {
    const result = validateOffer(offerCode);
    if (!result.valid) throw new Error(result.error);
  }
  const created = [];
  for (const item of items) {
    created.push(
      await createBooking({
        serviceId: item.serviceId,
        date: item.date,
        time: item.time,
        issue: item.issue,
        address,
        customerId,
        orderId,
        offerCode,
      })
    );
  }
  await logActivity(
    "booking",
    `New order received: #${orderId} — ${created.length} service${created.length > 1 ? "s" : ""}`
  );
  return created;
}

async function updateBookingStatus(id, status) {
  const existing = await fetchBookingWithRelations(id);
  if (!existing) return undefined;
  const now = new Date().toISOString();
  const patch = status === "Cancelled" ? { status, cancelledAt: now } : { status };
  await mutate(
    `mutation($id: UUID!, $status: String!, $cancelledAt: Timestamp) {
      booking_update(id: $id, data: { status: $status, cancelledAt: $cancelledAt })
    }`,
    { id, status, cancelledAt: patch.cancelledAt || null }
  );
  if (status !== "Cancelled") {
    await mutate(
      `mutation($bookingId: UUID!, $status: String!, $at: Timestamp!) {
        bookingStatusEvent_insert(data: { bookingId: $bookingId, status: $status, at: $at })
      }`,
      { bookingId: id, status, at: now }
    );
  }

  const provider = await getProvider(existing.providerId);
  const serviceName = existing.service?.name || "Service";
  await logActivity("booking", `Booking #${id} (${serviceName}) marked ${status}`);

  const customerMessages = {
    Accepted: `${provider?.name || "The provider"} accepted your ${serviceName} request`,
    "In Progress": `Your ${serviceName} service is now in progress`,
    Completed: `Your ${serviceName} service is complete — rate your experience`,
    Rejected: `${provider?.name || "The provider"} couldn't accept your ${serviceName} request`,
  };
  if (customerMessages[status]) {
    await addNotification({
      recipientType: "customer",
      recipientId: existing.customerId,
      type: "booking",
      title: `Booking ${status}`,
      message: customerMessages[status],
      bookingId: id,
    });
  }
  if (status === "Completed") {
    // Never let a wallet-side failure block marking the job Completed — the
    // booking status update above has already succeeded at this point.
    try {
      await deductWalletCommission(existing.providerId, existing.amount);
    } catch (e) {
      console.error(`Wallet commission deduction failed for booking ${id}:`, e);
    }
  }
  return fetchBookingWithRelations(id);
}

// ---- dispatch: ring one provider, and if they don't respond (timeout or
// explicit reject), hand the booking to another active provider in the same
// category rather than leaving the customer stuck ----

async function findAlternativeProviderService(categorySlug, excludeProviderIds) {
  const categoryUuid = await getCategoryUuidBySlug(categorySlug);
  if (!categoryUuid) return null;
  const { services } = await query(
    `query($categoryId: UUID!) {
      services(where: { category: { id: { eq: $categoryId } }, status: { eq: "active" } }) {
        id price provider { id live }
      }
    }`,
    { categoryId: categoryUuid }
  );
  const candidate = services.find(
    (s) => s.provider && !excludeProviderIds.includes(s.provider.id) && !isProviderSuspended(s.provider.id)
  );
  if (!candidate) return null;
  return { serviceId: candidate.id, providerId: candidate.provider.id, amount: candidate.price };
}

// Tries to move a still-pending booking to another provider in the same
// category. If none are left, the booking is marked Rejected for real and
// the customer is told. Returns { reassigned, booking }.
async function reassignBooking(bookingId, excludeProviderIds) {
  const booking = await fetchBookingWithRelations(bookingId);
  if (!booking || booking.status !== "Pending") return { reassigned: false, booking };

  // Always exclude the booking's current provider too — reassigning it to
  // itself is never meaningful, regardless of what the caller passed in.
  const excludeIds = [...new Set([...excludeProviderIds, booking.providerId])];
  const categorySlug = booking.service?.categoryId;
  const candidate = categorySlug ? await findAlternativeProviderService(categorySlug, excludeIds) : null;

  if (candidate) {
    await mutate(
      `mutation($id: UUID!, $serviceId: UUID!, $providerId: UUID!, $amount: Int!) {
        booking_update(id: $id, data: { serviceId: $serviceId, providerId: $providerId, amount: $amount })
      }`,
      { id: bookingId, serviceId: candidate.serviceId, providerId: candidate.providerId, amount: candidate.amount }
    );
    await logActivity("booking", `Booking #${bookingId} reassigned to another provider after no response`);
    const updated = await fetchBookingWithRelations(bookingId);
    const bookingMessage = `${updated.customer?.name || "A customer"} requested ${updated.service?.name || "a service"} for ${updated.date}`;
    await addNotification({
      recipientType: "provider",
      recipientId: candidate.providerId,
      type: "booking",
      title: "New booking request",
      message: bookingMessage,
      bookingId,
      skipPush: true, // the caller in index.js calls dispatchBooking again, which sends this one's push
    });
    notifyProviderOfBookingByWhatsApp(
      candidate.providerId,
      `New Tikdum booking request!\n${bookingMessage}\nOpen the Tikdum Pro app to accept or decline.`
    ).catch((e) => console.error("WhatsApp booking alert failed", e));
    return { reassigned: true, booking: updated };
  }

  const now = new Date().toISOString();
  await mutate(`mutation($id: UUID!, $status: String!) { booking_update(id: $id, data: { status: $status }) }`, {
    id: bookingId,
    status: "Rejected",
  });
  await mutate(
    `mutation($bookingId: UUID!, $status: String!, $at: Timestamp!) {
      bookingStatusEvent_insert(data: { bookingId: $bookingId, status: $status, at: $at })
    }`,
    { bookingId, status: "Rejected", at: now }
  );
  await logActivity("booking", `Booking #${bookingId} rejected — no providers available`);
  const updated = await fetchBookingWithRelations(bookingId);
  await addNotification({
    recipientType: "customer",
    recipientId: updated.customerId,
    type: "booking",
    title: "Booking Rejected",
    message: `No providers were available for your ${updated.service?.name || "booking"} request. Please try again later.`,
    bookingId,
  });
  return { reassigned: false, booking: updated };
}

async function addMessage(bookingId, from, text) {
  const now = new Date().toISOString();
  await mutate(
    `mutation($bookingId: UUID!, $sender: String!, $text: String!, $sentAt: Timestamp!) {
      message_insert(data: { bookingId: $bookingId, sender: $sender, text: $text, sentAt: $sentAt })
    }`,
    { bookingId, sender: from, text, sentAt: now }
  );
  const message = { from, text, time: now };

  const booking = await fetchBookingWithRelations(bookingId);
  if (booking) {
    const senderName = from === "provider" ? (await getProvider(booking.providerId))?.name : booking.customer?.name;
    await addNotification({
      recipientType: from === "provider" ? "customer" : "provider",
      recipientId: from === "provider" ? booking.customerId : booking.providerId,
      type: "message",
      title: `New message from ${senderName || "them"}`,
      message: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      bookingId,
    });
  }
  return message;
}

async function addReview(bookingId, rating, text) {
  const existing = await fetchBookingWithRelations(bookingId);
  if (!existing) return undefined;
  await mutate(
    `mutation($id: UUID!, $rating: Int!, $text: String) {
      booking_update(id: $id, data: { reviewed: true, reviewRating: $rating, reviewText: $text })
    }`,
    { id: bookingId, rating, text: text || null }
  );

  const provider = await getProvider(existing.providerId);
  const service = await getService(existing.serviceId);
  if (provider) {
    const newCount = (provider.reviews || 0) + 1;
    const newRating = Number((((provider.rating || 0) * (provider.reviews || 0) + rating) / newCount).toFixed(1));
    await mutate(
      `mutation($id: UUID!, $rating: Float!, $reviews: Int!) { provider_update(id: $id, data: { rating: $rating, reviews: $reviews }) }`,
      { id: provider.id, rating: newRating, reviews: newCount }
    );
  }
  if (service) {
    const newCount = (service.reviewCount || 0) + 1;
    const newRating = Number((((service.rating || 0) * (service.reviewCount || 0) + rating) / newCount).toFixed(1));
    await mutate(
      `mutation($id: UUID!, $rating: Float!, $reviewCount: Int!) { service_update(id: $id, data: { rating: $rating, reviewCount: $reviewCount }) }`,
      { id: service.id, rating: newRating, reviewCount: newCount }
    );
  }
  await logActivity("review", `New review received: ${rating}★ for ${service?.name || "a service"}`);
  if (provider) {
    await addNotification({
      recipientType: "provider",
      recipientId: provider.id,
      type: "review",
      title: "New review",
      message: `${existing.customer?.name || "A customer"} left a ${rating}★ review for ${service?.name || "your service"}`,
      bookingId,
    });
  }
  const booking = await fetchBookingWithRelations(bookingId);
  return { booking, provider: await getProvider(existing.providerId), service: await getService(existing.serviceId) };
}

async function getProviderReviews(providerId) {
  const { bookings } = await query(
    `query($providerId: UUID!) {
      bookings(where: { provider: { id: { eq: $providerId } }, reviewed: { eq: true } }) {
        id reviewRating reviewText createdAt
        bookingStatusEvents_on_booking { status at }
        customer { id name avatar phone email }
        service { id }
      }
    }`,
    { providerId }
  );
  const results = [];
  for (const b of bookings) {
    const service = b.service ? await getService(b.service.id) : null;
    const completedAt = (b.bookingStatusEvents_on_booking || []).find((e) => e.status === "Completed")?.at;
    results.push({
      id: b.id,
      rating: b.reviewRating,
      text: b.reviewText,
      customer: b.customer,
      serviceName: service?.name,
      serviceIcon: service?.icon,
      date: completedAt || b.createdAt,
    });
  }
  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ---- activities ----

async function logActivity(type, message) {
  const { activity_insert } = await mutate(
    `mutation($type: String!, $message: String!) { activity_insert(data: { type: $type, message: $message }) }`,
    { type, message }
  );
  return activity_insert;
}

async function listActivities(limit = 20, type) {
  const gql = type
    ? `query($limit: Int!, $type: String!) { activities(where: { type: { eq: $type } }, orderBy: { occurredAt: DESC }, limit: $limit) { id type message occurredAt } }`
    : `query($limit: Int!) { activities(orderBy: { occurredAt: DESC }, limit: $limit) { id type message occurredAt } }`;
  const { activities } = await query(gql, type ? { limit, type } : { limit });
  return activities.map(mapActivity);
}

// ---- notifications (real-time fan-out stays in-process; only storage moves to the DB) ----

const notificationListeners = [];
function onNotification(listener) {
  notificationListeners.push(listener);
}

// skipPush is for the two "new booking request" notifications (createBooking,
// reassignBooking) — those already get their own richer push straight from
// index.js's dispatchBooking (it needs bookingId+type to make the provider
// app actually ring, which this generic path doesn't do), so pushing here
// too would double-notify. Every other notification type has no push at all
// otherwise, which is exactly the bug this fixes: the socket event this
// function already fired only reaches a tab that's currently open — a
// backgrounded or closed app never learns about it without a real push.
async function addNotification({ recipientType, recipientId, type, title, message, bookingId, skipPush = false }) {
  const { notification_insert } = await mutate(
    `mutation($recipientType: String!, $recipientId: UUID!, $type: String!, $title: String!, $message: String!, $bookingId: UUID) {
      notification_insert(data: {
        recipientType: $recipientType, recipientId: $recipientId, type: $type,
        title: $title, message: $message, bookingId: $bookingId
      })
    }`,
    { recipientType, recipientId, type, title, message, bookingId: bookingId || null }
  );
  const notification = {
    id: notification_insert.id,
    recipientType,
    recipientId,
    type,
    title,
    message,
    bookingId: bookingId || null,
    read: false,
    time: new Date().toISOString(),
  };
  notificationListeners.forEach((listener) => listener(notification));
  if (!skipPush) {
    push
      .sendPush(recipientType, recipientId, { title, body: message, type, bookingId: bookingId || null })
      .catch((e) => console.error("Push send failed for notification", notification.id, e));
    // Separate channel from push.js — this is what the native customer app
    // listens on (see local-service-app/android's TikdumMessagingService).
    // Harmless for providers too: their native service only acts on
    // type "booking:created", which never comes through this generic path.
    fcm
      .sendToDevices(recipientType, recipientId, { title, body: message, type, bookingId: bookingId || null })
      .catch((e) => console.error("FCM send failed for notification", notification.id, e));
  }
  return notification;
}

async function listNotifications(recipientType, recipientId) {
  const { notifications } = await query(
    `query($recipientType: String!, $recipientId: UUID!) {
      notifications(
        where: { recipientType: { eq: $recipientType }, recipientId: { eq: $recipientId } }
        orderBy: { createdAt: DESC }
        limit: 50
      ) { id recipientType recipientId type title message read createdAt booking { id } }
    }`,
    { recipientType, recipientId }
  );
  return notifications.map(mapNotification);
}

async function markNotificationRead(id) {
  const { notification_update } = await mutate(
    `mutation($id: UUID!) { notification_update(id: $id, data: { read: true }) }`,
    { id }
  );
  if (!notification_update) return undefined;
  const { notification } = await query(
    `query($id: UUID!) { notification(id: $id) { id recipientType recipientId type title message read createdAt booking { id } } }`,
    { id }
  );
  return notification ? mapNotification(notification) : undefined;
}

async function markAllNotificationsRead(recipientType, recipientId) {
  const mine = await listNotifications(recipientType, recipientId);
  const unread = mine.filter((n) => !n.read);
  for (const n of unread) {
    await mutate(`mutation($id: UUID!) { notification_update(id: $id, data: { read: true }) }`, { id: n.id });
  }
  return mine.map((n) => ({ ...n, read: true }));
}

// ---- earnings / admin aggregates (fetched as raw rows, computed in JS —
// matches the original in-memory implementation's exact logic/output) ----

// A completed booking's earning date is when it was marked Completed; a
// cancelled one has no completion event, so its cancellation date stands in.
function earningsEventDate(b) {
  return new Date(b.statusHistory.Completed || b.cancelledAt || b.createdAt);
}

function sumInRange(bookings, start, end) {
  return bookings
    .filter((b) => {
      const d = earningsEventDate(b);
      return d >= start && (!end || d < end);
    })
    .reduce((sum, b) => sum + b.amount, 0);
}

// Builds one period's figures (e.g. "this month"), plus its % change against
// the immediately preceding period of the same length, so Daily/Weekly/
// Monthly/Yearly each reflect what actually happened in that window instead
// of a fixed ratio applied to an all-time total.
function buildEarningsPeriod({ completed, cancelled, inProgressTotal, platformFeePct, start, prevStart, prevEnd }) {
  const total = sumInRange(completed, start);
  const prevTotal = sumInRange(completed, prevStart, prevEnd);
  const changePct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : total > 0 ? 100 : 0;
  const cancelledJobs = sumInRange(cancelled, start);
  const platformFeeAmt = Math.round(total * (platformFeePct / 100));
  return {
    total,
    changePct,
    breakdown: { completedJobs: total, inProgressJobs: inProgressTotal, cancelledJobs, platformFeePct, platformFeeAmt },
  };
}

async function getEarnings(providerId) {
  const bookings = await listBookings({ providerId });
  const completed = bookings.filter((b) => b.status === "Completed");
  const inProgress = bookings.filter((b) => b.status === "In Progress");
  const cancelled = bookings.filter((b) => b.status === "Cancelled");
  const inProgressTotal = inProgress.reduce((sum, b) => sum + b.amount, 0);
  const { platformFeePct } = getSettings();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const args = { completed, cancelled, inProgressTotal, platformFeePct };

  const rollingWindow = (days) => {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - (days - 1));
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - days);
    return buildEarningsPeriod({ ...args, start, prevStart, prevEnd: start });
  };

  const daily = rollingWindow(1);
  const weekly = rollingWindow(7);
  const monthly = buildEarningsPeriod({
    ...args,
    start: startOfMonth,
    prevStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    prevEnd: startOfMonth,
  });
  const yearly = buildEarningsPeriod({
    ...args,
    start: startOfYear,
    prevStart: new Date(now.getFullYear() - 1, 0, 1),
    prevEnd: startOfYear,
  });

  const allTime = completed.reduce((sum, b) => sum + b.amount, 0);
  const transactions = [...completed]
    .sort((a, b) => earningsEventDate(b) - earningsEventDate(a))
    .map((b) => ({
      id: b.id,
      service: b.service?.name || "Service",
      icon: b.service?.icon || "🛠️",
      categoryId: b.service?.categoryId,
      date: b.statusHistory.Completed || b.createdAt,
      amount: b.amount,
      status: "Completed",
    }));

  return {
    allTime,
    thisMonth: monthly.total,
    changePct: monthly.changePct,
    breakdown: monthly.breakdown,
    periods: { Daily: daily, Weekly: weekly, Monthly: monthly, Yearly: yearly },
    transactions,
  };
}

async function getAdminOverview() {
  const [providers, services, bookings, categories] = await Promise.all([
    listProviders(),
    listServices(),
    listBookings(),
    listCategories(),
  ]);
  const { customers } = await query(`query { customers { id } }`, {});

  const completed = bookings.filter((b) => b.status === "Completed");
  const pending = bookings.filter((b) => b.status === "Pending");
  const totalRevenue = completed.reduce((sum, b) => sum + b.amount, 0);
  const ratedProviders = providers.filter((p) => p.reviews > 0);
  const avgRating = ratedProviders.length
    ? Number((ratedProviders.reduce((sum, p) => sum + p.rating, 0) / ratedProviders.length).toFixed(1))
    : 0;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const bookingsByDay = days.map((day) => ({
    day,
    bookings: bookings.filter((b) => b.createdAt.slice(0, 10) === day).length,
    completed: bookings.filter((b) => b.status === "Completed" && (b.statusHistory.Completed || "").slice(0, 10) === day)
      .length,
  }));

  const recentBookings = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);

  const verification = {
    pending: providers.filter((p) => p.verificationStatus === "pending").length,
    approved: providers.filter((p) => p.verificationStatus === "approved").length,
    rejected: providers.filter((p) => p.verificationStatus === "rejected").length,
  };

  const topServices = [...services]
    .map((s) => {
      const serviceBookings = bookings.filter((b) => b.serviceId === s.id);
      const revenue = serviceBookings.filter((b) => b.status === "Completed").reduce((sum, b) => sum + b.amount, 0);
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        categoryId: s.categoryId,
        providerName: providers.find((p) => p.id === s.providerId)?.name,
        totalBookings: serviceBookings.length,
        revenue,
        rating: s.rating,
        reviewCount: s.reviewCount,
      };
    })
    .sort((a, b) => b.totalBookings - a.totalBookings || b.revenue - a.revenue)
    .slice(0, 5);

  const totalReviews = providers.reduce((sum, p) => sum + (p.reviews || 0), 0);

  return {
    totals: {
      totalUsers: customers.length,
      totalProviders: providers.length,
      totalBookings: bookings.length,
      totalRevenue,
      pendingRequests: pending.length,
      averageRating: avgRating,
    },
    bookingsByDay,
    recentBookings,
    verification,
    topServices,
    systemOverview: {
      activeServices: services.filter((s) => s.status === "active").length,
      totalCategories: categories.length,
      totalReviews,
      totalProviders: providers.length,
    },
  };
}

async function getTransactions() {
  const [bookings, providers] = await Promise.all([listBookings(), listProviders()]);
  const { platformFeePct } = getSettings();
  return bookings
    .filter((b) => b.status === "Completed")
    .map((b) => {
      const provider = providers.find((p) => p.id === b.providerId);
      const platformFee = Math.round(b.amount * (platformFeePct / 100));
      return {
        id: b.id,
        service: b.service?.name,
        categoryId: b.service?.categoryId,
        providerId: b.providerId,
        providerName: provider?.name,
        customerName: b.customer?.name,
        amount: b.amount,
        platformFee,
        payout: b.amount - platformFee,
        date: b.statusHistory?.Completed || b.createdAt,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function getAdminReports() {
  const [bookings, categories, providers] = await Promise.all([listBookings(), listCategories(), listProviders()]);
  const completed = bookings.filter((b) => b.status === "Completed");

  const byCategory = {};
  completed.forEach((b) => {
    const catId = b.service?.categoryId || "other";
    byCategory[catId] = (byCategory[catId] || 0) + b.amount;
  });
  const revenueByCategory = Object.entries(byCategory)
    .map(([categoryId, revenue]) => ({
      categoryId,
      categoryName: categories.find((c) => c.id === categoryId)?.name || categoryId,
      revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const statusCounts = {};
  bookings.forEach((b) => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });
  const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const providerLeaderboard = providers
    .map((p) => {
      const providerBookings = bookings.filter((b) => b.providerId === p.id);
      const providerCompleted = providerBookings.filter((b) => b.status === "Completed");
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        totalBookings: providerBookings.length,
        completedBookings: providerCompleted.length,
        revenue: providerCompleted.reduce((sum, b) => sum + b.amount, 0),
        rating: p.rating,
        reviews: p.reviews,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const { platformFeePct } = getSettings();
  const platformRevenue = completed.reduce((sum, b) => sum + Math.round(b.amount * (platformFeePct / 100)), 0);

  return { revenueByCategory, statusDistribution, providerLeaderboard, platformRevenue };
}

// ---- banners (admin-managed promo carousel — small, low-volume config data,
// stored as flat JSON rather than a Postgres table; see jsonStore.js) ----

function listBanners() {
  return jsonStore.readAll("banners").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function listActiveBanners() {
  return listBanners().filter((b) => b.active !== false);
}

async function createBanner({ title, subtitle, icon, active = true }) {
  const banners = jsonStore.readAll("banners");
  const banner = jsonStore.insert("banners", {
    title,
    subtitle: subtitle || "",
    icon: icon || "📣",
    active,
    order: banners.length,
    createdAt: new Date().toISOString(),
  });
  // Best-effort only — banners are deliberately independent of Data Connect,
  // so an outage there (e.g. quota) must never block banner management.
  logActivity("banner", `New banner added: ${title}`).catch((e) => console.error("logActivity failed", e));
  return banner;
}

function updateBanner(id, patch) {
  return jsonStore.update("banners", id, patch);
}

function deleteBanner(id) {
  return jsonStore.remove("banners", id);
}

// ---- offers / discount codes (same storage approach as banners) ----

function listOffers() {
  return jsonStore.readAll("offers");
}

async function createOffer({ code, discountPercent, description, active = true, expiresAt }) {
  const offer = jsonStore.insert("offers", {
    code: code.trim().toUpperCase(),
    discountPercent: Number(discountPercent),
    description: description || "",
    active,
    expiresAt: expiresAt || null,
    createdAt: new Date().toISOString(),
  });
  // Best-effort only — see createBanner.
  logActivity("offer", `New offer created: ${offer.code} (${offer.discountPercent}% off)`).catch((e) =>
    console.error("logActivity failed", e)
  );
  return offer;
}

function updateOffer(id, patch) {
  return jsonStore.update("offers", id, patch);
}

function deleteOffer(id) {
  return jsonStore.remove("offers", id);
}

function validateOffer(code) {
  const offers = jsonStore.readAll("offers");
  const offer = offers.find((o) => o.code === String(code || "").trim().toUpperCase());
  if (!offer) return { valid: false, error: "Invalid offer code" };
  if (offer.active === false) return { valid: false, error: "This offer is no longer active" };
  if (offer.expiresAt && new Date(offer.expiresAt) < new Date()) return { valid: false, error: "This offer has expired" };
  return { valid: true, offer };
}

// ---- platform settings (single record, same jsonStore approach as banners/offers) ----

const DEFAULT_SETTINGS = { platformFeePct: 10 };

function getSettings() {
  const [existing] = jsonStore.readAll("settings");
  return { ...DEFAULT_SETTINGS, ...existing };
}

function updateSettings(patch) {
  if (patch.platformFeePct !== undefined) {
    const pct = Number(patch.platformFeePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw Object.assign(new Error("Platform fee must be a number between 0 and 100"), { status: 400 });
    }
    patch = { ...patch, platformFeePct: pct };
  }
  const [existing] = jsonStore.readAll("settings");
  const next = { ...DEFAULT_SETTINGS, ...existing, ...patch };
  if (existing) jsonStore.update("settings", existing.id, next);
  else jsonStore.insert("settings", { id: "platform", ...next });
  return getSettings();
}

// ---- per-provider notification preferences (jsonStore, one record per
// provider — not worth a schema column for a single opt-in toggle) ----

const DEFAULT_PROVIDER_NOTIFICATION_PREFS = { whatsappNotifications: false };

function getProviderNotificationPrefs(providerId) {
  const existing = jsonStore.readAll("providerNotificationPrefs").find((r) => r.id === providerId);
  return { ...DEFAULT_PROVIDER_NOTIFICATION_PREFS, ...existing };
}

function updateProviderNotificationPrefs(providerId, patch) {
  const existing = jsonStore.readAll("providerNotificationPrefs").find((r) => r.id === providerId);
  const next = { ...DEFAULT_PROVIDER_NOTIFICATION_PREFS, ...existing, ...patch, id: providerId };
  if (existing) jsonStore.update("providerNotificationPrefs", providerId, next);
  else jsonStore.insert("providerNotificationPrefs", next);
  return getProviderNotificationPrefs(providerId);
}

// Best-effort — a WhatsApp gateway hiccup should never block booking
// creation, so callers fire this and ignore the result.
async function notifyProviderOfBookingByWhatsApp(providerId, message) {
  const { whatsappNotifications } = getProviderNotificationPrefs(providerId);
  if (!whatsappNotifications) return;
  const provider = await getProvider(providerId);
  if (!provider?.phone) return;
  await whatsapp.sendWhatsAppMessage(provider.phone, message);
}

// ---- provider wallet (jsonStore-backed, one record per provider — a manual
// admin-topped-up balance that a % commission is deducted from on every
// completed job. Hitting ₹0 pauses the provider from new bookings until an
// admin recharges them. Not a schema migration since this is a simple
// balance ledger, same lightweight-entity reasoning as settings/prefs above.)

const LOW_BALANCE_WARN_FRACTION = 0.2; // warn once balance drops to <=20% of the last recharge

function getWallet(providerId) {
  const existing = jsonStore.readAll("providerWallets").find((w) => w.id === providerId);
  return existing || { id: providerId, balance: 0, recharges: [], deductions: [], lowBalanceAlertSentAt: null, suspendedAlertSentAt: null, lastReminderAt: null };
}

function saveWallet(wallet) {
  const existing = jsonStore.readAll("providerWallets").find((w) => w.id === wallet.id);
  if (existing) jsonStore.update("providerWallets", wallet.id, wallet);
  else jsonStore.insert("providerWallets", wallet);
  return wallet;
}

function isProviderSuspended(providerId) {
  return getWallet(providerId).balance <= 0;
}

// Cheap sync read used to filter the public service catalog — suspended
// providers' services shouldn't be bookable, without needing a Postgres join.
function listSuspendedProviderIds() {
  return jsonStore.readAll("providerWallets").filter((w) => w.balance <= 0).map((w) => w.id);
}

// Alerts are sent regardless of the provider's optional WhatsApp booking-
// notification toggle — account balance/suspension is not a routine
// notification the provider should be able to silence.
async function rechargeProviderWallet(providerId, amount, note) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error("Recharge amount must be a positive number"), { status: 400 });
  }
  const wallet = getWallet(providerId);
  wallet.balance = (wallet.balance || 0) + amount;
  wallet.recharges = [...(wallet.recharges || []), { amount, at: new Date().toISOString(), note: note || null }];
  // A fresh recharge clears the suspension — reset alert flags so the next
  // time the balance runs low/out, the provider is alerted again.
  wallet.lowBalanceAlertSentAt = null;
  wallet.suspendedAlertSentAt = null;
  saveWallet(wallet);

  // The recharge itself is already committed above — a WhatsApp/lookup
  // hiccup past this point must never surface as a failed recharge.
  try {
    const provider = await getProvider(providerId);
    if (provider?.phone) {
      await whatsapp.sendWhatsAppMessage(
        provider.phone,
        `Your Tikdum wallet has been recharged with ₹${amount}. New balance: ₹${wallet.balance}. You're all set to keep receiving job requests.`
      );
    }
  } catch (e) {
    console.error("Recharge WhatsApp notification failed:", e);
  }
  await logActivity("provider", `Wallet recharged for provider ${providerId}: +₹${amount}`);
  return wallet;
}

// Deducts this job's commission from the provider's wallet and fires the
// low-balance / suspended WhatsApp alert the first time each is crossed
// (tracked via the *AlertSentAt flags so a provider isn't messaged on every
// single job once they're already below the threshold).
async function deductWalletCommission(providerId, bookingAmount) {
  const { platformFeePct } = getSettings();
  const commission = Math.round(bookingAmount * (platformFeePct / 100));
  if (commission <= 0) return getWallet(providerId);

  const wallet = getWallet(providerId);
  const before = wallet.balance;
  wallet.balance = before - commission;
  wallet.deductions = [...(wallet.deductions || []), { amount: commission, at: new Date().toISOString() }];

  const justSuspended = before > 0 && wallet.balance <= 0 && !wallet.suspendedAlertSentAt;
  const justWentLow =
    !justSuspended &&
    wallet.balance > 0 &&
    !wallet.lowBalanceAlertSentAt &&
    (() => {
      const lastRecharge = [...(wallet.recharges || [])].pop();
      const warnThreshold = lastRecharge ? lastRecharge.amount * LOW_BALANCE_WARN_FRACTION : 0;
      return wallet.balance <= warnThreshold;
    })();
  if (justSuspended) wallet.suspendedAlertSentAt = new Date().toISOString();
  if (justWentLow) wallet.lowBalanceAlertSentAt = new Date().toISOString();

  // Commit the deduction (and alert-flag bookkeeping) before ever touching
  // the network — this is the source of truth for whether the provider is
  // suspended, and must never be lost to a WhatsApp/lookup failure below.
  saveWallet(wallet);

  if (justSuspended || justWentLow) {
    try {
      const provider = await getProvider(providerId);
      if (provider?.phone) {
        const message = justSuspended
          ? `Your Tikdum wallet balance has reached ₹0. Your account is paused from receiving new job requests until you recharge. Please contact Tikdum support to recharge your account.`
          : `Your Tikdum wallet balance is running low (₹${wallet.balance}). Recharge soon to keep receiving job requests without interruption.`;
        await whatsapp.sendWhatsAppMessage(provider.phone, message);
      }
    } catch (e) {
      console.error("Wallet balance WhatsApp alert failed:", e);
    }
  }

  return wallet;
}

// Called periodically (see index.js) — re-sends the recharge reminder to any
// still-suspended provider roughly once a day, so it doesn't go silent while
// they remain paused and unpaid.
async function sendSuspendedWalletReminders() {
  const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const suspended = jsonStore.readAll("providerWallets").filter((w) => w.balance <= 0);
  for (const wallet of suspended) {
    const last = wallet.lastReminderAt ? new Date(wallet.lastReminderAt).getTime() : 0;
    if (now - last < REMINDER_INTERVAL_MS) continue;
    // One provider's lookup/send failure shouldn't stop the rest from
    // getting their reminder in this sweep.
    try {
      const provider = await getProvider(wallet.id);
      if (provider?.phone) {
        await whatsapp.sendWhatsAppMessage(
          provider.phone,
          `Reminder: your Tikdum wallet balance is ₹0 and your account is still paused from receiving new job requests. Contact Tikdum support to recharge and resume.`
        );
      }
      wallet.lastReminderAt = new Date().toISOString();
      saveWallet(wallet);
    } catch (e) {
      console.error(`Suspended wallet reminder failed for provider ${wallet.id}:`, e);
    }
  }
}

// ---- KYC documents and job photos (jsonStore-backed — a provider's document
// set and a booking's before/after photos are small, low-volume, and don't
// warrant a schema migration) ----

function listKycDocuments(providerId) {
  return jsonStore.readAll("kycDocuments").filter((d) => d.providerId === providerId);
}

function addKycDocument(providerId, { docType, url }) {
  return jsonStore.insert("kycDocuments", { providerId, docType, url, uploadedAt: new Date().toISOString() });
}

function deleteKycDocument(providerId, docId) {
  const doc = jsonStore.readAll("kycDocuments").find((d) => d.id === docId && d.providerId === providerId);
  if (!doc) return false;
  return jsonStore.remove("kycDocuments", docId);
}

function listJobPhotos(bookingId) {
  return jsonStore.readAll("jobPhotos").filter((p) => p.bookingId === bookingId);
}

function addJobPhoto(bookingId, { photoType, url }) {
  return jsonStore.insert("jobPhotos", { bookingId, photoType, url, uploadedAt: new Date().toISOString() });
}

module.exports = {
  getCustomerById,
  getCustomerByPhone,
  createCustomer,
  listCustomerIds,
  listCustomers,
  getProviderByPhone,
  createProviderSignup,
  adminCreateProvider,
  listProviders,
  getProvider,
  listCategories,
  createCategory,
  listServices,
  getService,
  listProviderServices,
  listBookings,
  getBooking,
  getMessages,
  createBooking,
  createOrder,
  updateBookingStatus,
  reassignBooking,
  addMessage,
  addReview,
  addProviderService,
  adminCreateService,
  updateProviderService,
  updateServiceStatus,
  setProviderVerification,
  updateProviderProfile,
  getEarnings,
  listActivities,
  logActivity,
  getAdminOverview,
  getProviderReviews,
  addNotification,
  onNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getTransactions,
  getAdminReports,
  listBanners,
  listActiveBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  listOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  validateOffer,
  getSettings,
  updateSettings,
  getProviderNotificationPrefs,
  updateProviderNotificationPrefs,
  getWallet,
  rechargeProviderWallet,
  isProviderSuspended,
  sendSuspendedWalletReminders,
  listKycDocuments,
  addKycDocument,
  deleteKycDocument,
  listJobPhotos,
  addJobPhoto,
};
