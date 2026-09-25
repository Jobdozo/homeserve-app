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

// Categories have no status column (and the schema can't be migrated), so an
// admin's "inactive" choice lives in a small side record; no record = active.
function isCategoryActive(slug) {
  return jsonStore.readAll("categoryStatus").find((r) => r.id === slug)?.active !== false;
}

function inactiveCategorySlugs() {
  return new Set(jsonStore.readAll("categoryStatus").filter((r) => r.active === false).map((r) => r.id));
}

function mapCategory(c) {
  return { id: c.slug, name: c.name, icon: c.icon, active: isCategoryActive(c.slug) };
}

// Bump this string whenever the Service Provider Agreement's terms actually
// change — a provider who accepted an older version is treated as not
// having accepted, so they're asked again on next login.
const AGREEMENT_VERSION = "2026-01";

function hasAcceptedAgreement(providerId) {
  return jsonStore
    .readAll("providerAgreements")
    .some((a) => a.providerId === providerId && a.version === AGREEMENT_VERSION);
}

function mapProvider(p) {
  if (!p) return p;
  // responseRate is never written at signup (no rejected/late responses yet
  // to compute it from) — default a brand-new provider to 100% rather than
  // showing a raw null (renders as the literal string "null%" in the UI).
  return {
    ...p,
    responseRate: p.responseRate ?? 100,
    agreementAccepted: hasAcceptedAgreement(p.id),
    coverage: getProviderCoverage(p.id),
  };
}

// ---- PIN-code-based service visibility (jsonStore-backed — a small,
// per-provider coverage record). Deliberately shaped to grow into the
// larger "Service Provider Visibility & Coverage" system later (radius,
// city, temporary availability, online/offline, request caps,
// category-specific coverage) without a rework: those just become more
// fields on this same record and more conditions in
// isProviderVisibleForPincode, instead of a new subsystem. ----

function getProviderCoverage(providerId) {
  const existing = jsonStore.readAll("providerCoverage").find((c) => c.id === providerId);
  const base = existing || { id: providerId, pincodes: [], serveAllAreas: false };
  // Records saved before this switch existed have no flag — they're accepting.
  return { ...base, acceptingRequests: base.acceptingRequests !== false };
}

// Provider's own Enable/Disable Receiving Requests switch: off hides all of
// their services from customers and blocks new bookings, while jobs already
// in flight carry on untouched (nothing else keys off this flag).
function isProviderAcceptingRequests(providerId) {
  return getProviderCoverage(providerId).acceptingRequests;
}

// A provider with no coverage configured yet (the common case today, since
// this is a new feature) is visible everywhere — restriction is opt-in, so
// existing providers aren't silently hidden from every customer the moment
// this ships. Once they (or an admin) set specific PIN codes, only matching
// customers see them — unless an admin sets serveAllAreas to override that.
function isProviderVisibleForPincode(providerId, pincode) {
  const coverage = getProviderCoverage(providerId);
  if (coverage.serveAllAreas) return true;
  if (!coverage.pincodes || coverage.pincodes.length === 0) return true;
  return coverage.pincodes.includes(String(pincode || "").trim());
}

function updateProviderCoverage(providerId, patch, { allowServeAllAreas = true } = {}) {
  const existing = getProviderCoverage(providerId);
  const next = { ...existing };
  if (patch.pincodes !== undefined) {
    const cleaned = (Array.isArray(patch.pincodes) ? patch.pincodes : [])
      .map((p) => String(p).trim())
      .filter(Boolean);
    for (const pin of cleaned) {
      if (!/^\d{4,10}$/.test(pin)) {
        throw Object.assign(new Error(`"${pin}" is not a valid PIN code`), { status: 400 });
      }
    }
    next.pincodes = [...new Set(cleaned)];
  }
  if (allowServeAllAreas && patch.serveAllAreas !== undefined) {
    next.serveAllAreas = !!patch.serveAllAreas;
  }
  if (patch.acceptingRequests !== undefined) {
    next.acceptingRequests = !!patch.acceptingRequests;
  }
  if (patch.maxOpenRequests !== undefined) {
    if (patch.maxOpenRequests === null) {
      next.maxOpenRequests = null;
    } else {
      const max = Number(patch.maxOpenRequests);
      if (!Number.isInteger(max) || max < 0) {
        throw Object.assign(new Error("Maximum open requests must be a whole number, 0 or more"), { status: 400 });
      }
      next.maxOpenRequests = max;
    }
  }
  if (patch.capacityOverride !== undefined) {
    next.capacityOverride = patch.capacityOverride;
  }
  const hasExisting = jsonStore.readAll("providerCoverage").some((c) => c.id === providerId);
  const saved = hasExisting ? jsonStore.update("providerCoverage", providerId, next) : jsonStore.insert("providerCoverage", next);
  cacheClear("providers");
  return saved;
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
    isAd: isServiceCurrentlyAdvertised(s.id),
    ...(s.status === "rejected" ? { approvalNote: getServiceReview(s.id)?.note || null } : {}),
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

// Admin edit: rename / re-icon (the slug, which other records reference, never
// changes) and switch active on or off. An inactive category and all of its
// services disappear from the customer catalog.
async function updateCategory(slug, patch, actor) {
  const beforeCategory = (await listCategories()).find((c) => c.id === slug);
  const categoryId = await getCategoryUuidBySlug(slug);
  if (!categoryId) return undefined;
  const fields = {};
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw Object.assign(new Error("Category name can't be empty"), { status: 400 });
    if (name.length > 60) throw Object.assign(new Error("Category name is too long"), { status: 400 });
    const others = (await listCategories()).filter((c) => c.id !== slug);
    if (others.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw Object.assign(new Error("A category with this name already exists"), { status: 409 });
    }
    fields.name = name;
  }
  if (patch.icon !== undefined) fields.icon = String(patch.icon).trim() || null;
  if (Object.keys(fields).length > 0) {
    const defs = Object.keys(fields).map((k) => `${k}: String`).join(", ");
    const data = Object.keys(fields).map((k) => `${k}: ${k}`).join(", ");
    await mutate(`mutation($id: UUID!, ${defs}) { category_update(id: $id, data: { ${data} }) }`, {
      id: categoryId,
      ...fields,
    });
  }
  if (patch.active !== undefined) {
    jsonStore.remove("categoryStatus", slug);
    if (!patch.active) jsonStore.insert("categoryStatus", { id: slug, active: false });
  }
  cacheClear("categories");
  cacheClear("service");
  const updated = (await listCategories()).find((c) => c.id === slug);
  await logActivity("category", `Category "${updated?.name || slug}" updated by admin`);
  if (beforeCategory && updated) {
    const changes = diffValues(beforeCategory, updated, ["name", "icon", "active"]);
    if (changes.length > 0) {
      const onlyActive = changes.length === 1 && changes[0].field === "active";
      recordAdminChange({
        actor,
        action: onlyActive ? (updated.active ? "category.activate" : "category.deactivate") : "category.update",
        entityType: "category",
        entityId: slug,
        entityName: updated.name,
        changes,
      });
    }
  }
  return updated;
}

// Refuses while any service still uses the category — deactivate it instead.
async function deleteCategory(slug, actor) {
  const categoryId = await getCategoryUuidBySlug(slug);
  if (!categoryId) return false;
  const { services } = await query(
    `query($id: UUID!) { services(where: { categoryId: { eq: $id } }) { id } }`,
    { id: categoryId }
  );
  if (services.length > 0) {
    throw Object.assign(
      new Error(`This category has ${services.length} service${services.length > 1 ? "s" : ""} — deactivate it instead, or move/delete the services first`),
      { status: 409 }
    );
  }
  const name = (await listCategories()).find((c) => c.id === slug)?.name || slug;
  await mutate(`mutation($id: UUID!) { category_delete(id: $id) }`, { id: categoryId });
  jsonStore.remove("categoryStatus", slug);
  cacheClear("categories");
  await logActivity("category", `Category "${name}" deleted by admin`);
  recordAdminChange({
    actor,
    action: "category.delete",
    entityType: "category",
    entityId: slug,
    entityName: name,
    changes: [{ field: "status", from: "existing", to: "deleted" }],
  });
  return true;
}

async function createCategory({ name, icon }, actor) {
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
  if (actor) {
    recordAdminChange({
      actor,
      action: "category.create",
      entityType: "category",
      entityId: slug,
      entityName: name,
      changes: [{ field: "name", from: null, to: name }],
    });
  }
  return mapCategory(categories[0]);
}

// ---- customers ----

async function getCustomerById(id) {
  const { customer } = await query(`query($id: UUID!) { customer(id: $id) { id name avatar phone email } }`, { id });
  if (!customer) return undefined;
  return { ...customer, address: getCustomerAddress(id) };
}

// ---- registered customer address (jsonStore-backed — a single primary
// address per customer, entered manually; the PIN code on it drives which
// providers are visible to them, see isProviderVisibleForPincode below) ----

function getCustomerAddress(customerId) {
  return jsonStore.readAll("customerAddresses").find((a) => a.id === customerId) || null;
}

function saveCustomerAddress(customerId, { label, line, pincode, lat, lng }) {
  const trimmedPincode = String(pincode || "").trim();
  if (!/^\d{4,10}$/.test(trimmedPincode)) {
    throw Object.assign(new Error("Enter a valid PIN code"), { status: 400 });
  }
  if (!line || !String(line).trim()) {
    throw Object.assign(new Error("Address line is required"), { status: 400 });
  }
  const address = {
    id: customerId,
    label: (label || "Home").trim() || "Home",
    line: String(line).trim(),
    pincode: trimmedPincode,
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
    updatedAt: new Date().toISOString(),
  };
  const existing = jsonStore.readAll("customerAddresses").find((a) => a.id === customerId);
  if (existing) jsonStore.update("customerAddresses", customerId, address);
  else jsonStore.insert("customerAddresses", address);
  return address;
}

async function getCustomerByPhone(phone) {
  const target = normalizePhone(phone);
  if (!target) return undefined;
  const { customers } = await query(`query { customers { id name avatar phone email } }`, {});
  const match = customers.find((c) => normalizePhone(c.phone) === target);
  return match ? getCustomerById(match.id) : undefined;
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
  cacheClear("customers");
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

// Admin-triggered manual removal of a single provider — deletes everything
// that points back at it (services, bookings and their sub-rows) in FK-safe
// order, same pattern as removeSeedData below but scoped to one provider
// instead of the bundled demo set. Irreversible; the customer-facing side
// of any deleted booking disappears along with it.
async function deleteProvider(providerId) {
  const provider = await getProvider(providerId);
  if (!provider) return false;

  const { services } = await query(
    `query($id: UUID!) { services(where: { providerId: { eq: $id } }) { id } }`,
    { id: providerId }
  );
  const serviceIds = services.map((s) => s.id);

  const { bookings } = await query(
    `query($id: UUID!) { bookings(where: { providerId: { eq: $id } }) { id } }`,
    { id: providerId }
  );
  const bookingIds = bookings.map((b) => b.id);

  if (serviceIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { serviceHighlight_deleteMany(where: { serviceId: { in: $ids } }) }`, {
      ids: serviceIds,
    });
    await mutate(`mutation($ids: [UUID!]!) { serviceInclude_deleteMany(where: { serviceId: { in: $ids } }) }`, {
      ids: serviceIds,
    });
  }
  if (bookingIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { message_deleteMany(where: { bookingId: { in: $ids } }) }`, {
      ids: bookingIds,
    });
    await mutate(`mutation($ids: [UUID!]!) { bookingStatusEvent_deleteMany(where: { bookingId: { in: $ids } }) }`, {
      ids: bookingIds,
    });
    await mutate(`mutation($ids: [UUID!]!) { notification_deleteMany(where: { bookingId: { in: $ids } }) }`, {
      ids: bookingIds,
    });
  }
  await mutate(`mutation($id: UUID!) { notification_deleteMany(where: { recipientId: { eq: $id } }) }`, {
    id: providerId,
  });
  if (bookingIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { booking_deleteMany(where: { id: { in: $ids } }) }`, {
      ids: bookingIds,
    });
  }
  if (serviceIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { service_deleteMany(where: { id: { in: $ids } }) }`, {
      ids: serviceIds,
    });
  }
  // provider_delete returns a scalar Provider_KeyOutput, not an object — it
  // can't take a field selection like `{ id }`.
  await mutate(`mutation($id: UUID!) { provider_delete(id: $id) }`, { id: providerId });

  for (const bookingId of bookingIds) {
    jsonStore.readAll("jobPhotos").filter((p) => p.bookingId === bookingId).forEach((p) => jsonStore.remove("jobPhotos", p.id));
    jsonStore.readAll("jobCheckpoints").filter((c) => c.bookingId === bookingId).forEach((c) => jsonStore.remove("jobCheckpoints", c.id));
    jsonStore.readAll("bookingOtps").filter((o) => o.bookingId === bookingId).forEach((o) => jsonStore.remove("bookingOtps", o.id));
  }
  jsonStore.remove("providerWallets", providerId);
  jsonStore.remove("providerNotificationPrefs", providerId);
  jsonStore.readAll("kycDocuments").filter((d) => d.providerId === providerId).forEach((d) => jsonStore.remove("kycDocuments", d.id));
  jsonStore.readAll("providerAgreements").filter((a) => a.providerId === providerId).forEach((a) => jsonStore.remove("providerAgreements", a.id));

  cacheClear("providers");
  cacheClear("service");
  await logActivity("provider", `Provider deleted by admin: ${provider.name} (${provider.category})`);
  return true;
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

async function listServices({ activeOnly = false, pincode } = {}) {
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
  const active = listActiveWalletProviderIds();
  const restrictedIds = await getCapacityRestrictedProviderIds();
  const inactiveCategories = inactiveCategorySlugs();
  let result = all.filter(
    (s) =>
      active.has(s.providerId) &&
      isProviderAcceptingRequests(s.providerId) &&
      !restrictedIds.has(s.providerId) &&
      !inactiveCategories.has(s.categoryId)
  );
  if (pincode) {
    result = result.filter((s) => isProviderVisibleForPincode(s.providerId, pincode));
  }
  return result;
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
  if (data.categorySlug && !isCategoryActive(data.categorySlug)) {
    throw Object.assign(new Error("That category isn't available right now"), { status: 400 });
  }
  const categoryId = (await getCategoryUuidBySlug(data.categorySlug || "ac-repair")) || null;
  const { service_insert } = await mutate(
    `mutation($providerId: UUID!, $categoryId: UUID, $name: String!, $price: Int!, $originalPrice: Int, $icon: String, $distanceLabel: String) {
      service_insert(data: {
        providerId: $providerId, categoryId: $categoryId, name: $name, price: $price,
        originalPrice: $originalPrice, icon: $icon, distanceLabel: $distanceLabel, status: "pending_approval"
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
  await logActivity("service", `${provider?.name || "A provider"} submitted a new service for approval: ${data.name}`);
  return getService(serviceId);
}

// Admin adding a service on a provider's behalf — same categorySlug-based
// resolution as addProviderService above, just with the admin's own picker.
async function adminCreateService(providerId, { categorySlug, name, price, originalPrice }, actor) {
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
  if (actor) {
    recordAdminChange({
      actor,
      action: "service.create",
      entityType: "service",
      entityId: service_insert.id,
      entityName: name,
      changes: [
        { field: "provider", from: null, to: provider?.name || providerId },
        { field: "price", from: null, to: Number(price) || 0 },
      ],
    });
  }
  return getService(service_insert.id);
}

const PROVIDER_EDITABLE_SERVICE_KEYS = ["name", "tagline", "price", "originalPrice", "status", "distanceLabel"];
const ADMIN_EDITABLE_SERVICE_KEYS = ["name", "tagline", "price", "originalPrice", "distanceLabel", "icon"];

async function updateProviderService(providerId, serviceId, patch) {
  const existing = await getService(serviceId);
  if (!existing || existing.providerId !== providerId) return undefined;
  const awaitingReview = existing.status === "pending_approval" || existing.status === "rejected";
  if (patch.status !== undefined) {
    if (awaitingReview) {
      throw Object.assign(new Error("This service can only go live once an admin approves it"), { status: 409 });
    }
    if (!["active", "inactive"].includes(patch.status)) {
      throw Object.assign(new Error("status must be active or inactive"), { status: 400 });
    }
  }
  // Editing a rejected service resubmits it for another review.
  if (existing.status === "rejected" && Object.keys(patch).some((k) => k !== "status")) {
    patch = { ...patch, status: "pending_approval" };
    jsonStore.remove("serviceReviews", serviceId);
    await logActivity("service", `Service "${existing.name}" was edited and resubmitted for approval`);
  }
  // A live service (active or inactive) is never edited directly by its
  // provider: content changes become a change request for an admin to
  // approve, and the service keeps its current details until then. Turning it
  // on/off (status) is availability, not content, and stays direct.
  const contentPatch = {};
  for (const key of SERVICE_CHANGE_KEYS) if (patch[key] !== undefined) contentPatch[key] = patch[key];
  const isLive = existing.status === "active" || existing.status === "inactive";
  if (isLive && Object.keys(contentPatch).length > 0) {
    const changeRequest = await submitServiceChange(providerId, existing, contentPatch);
    const service =
      patch.status !== undefined
        ? await applyServiceFieldUpdate(serviceId, { status: patch.status }, PROVIDER_EDITABLE_SERVICE_KEYS)
        : existing;
    return { service, changeRequest };
  }
  return { service: await applyServiceFieldUpdate(serviceId, patch, PROVIDER_EDITABLE_SERVICE_KEYS), changeRequest: null };
}

// ---- service modification approval: proposed changes to a live service wait
// here (jsonStore "serviceChangeRequests") until an admin approves, rejects
// or edits them. One pending request per service — a newer submission
// replaces the older pending one. ----

const SERVICE_CHANGE_KEYS = ["name", "tagline", "price", "originalPrice", "distanceLabel"];

function listServiceChanges({ providerId, status, serviceId } = {}) {
  return jsonStore
    .readAll("serviceChangeRequests")
    .filter(
      (r) =>
        (!providerId || r.providerId === providerId) &&
        (!status || r.status === status) &&
        (!serviceId || r.serviceId === serviceId)
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function cleanServiceChange(patch) {
  const out = {};
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw Object.assign(new Error("Service name can't be empty"), { status: 400 });
    if (name.length > 120) throw Object.assign(new Error("Service name is too long"), { status: 400 });
    out.name = name;
  }
  if (patch.tagline !== undefined) {
    const tagline = String(patch.tagline || "").trim();
    if (tagline.length > 160) throw Object.assign(new Error("Tagline is too long"), { status: 400 });
    out.tagline = tagline;
  }
  for (const key of ["price", "originalPrice"]) {
    if (patch[key] === undefined) continue;
    if (patch[key] === null || patch[key] === "") {
      if (key === "price") throw Object.assign(new Error("Price is required"), { status: 400 });
      out[key] = null;
      continue;
    }
    const n = Number(patch[key]);
    if (!Number.isInteger(n) || n < 0) {
      throw Object.assign(new Error(`${key === "price" ? "Price" : "Original price"} must be a whole number of rupees`), { status: 400 });
    }
    out[key] = n;
  }
  if (patch.distanceLabel !== undefined) out.distanceLabel = String(patch.distanceLabel || "").trim() || null;
  return out;
}

async function submitServiceChange(providerId, service, rawPatch) {
  const proposed = cleanServiceChange(rawPatch);
  const changes = {};
  for (const [key, to] of Object.entries(proposed)) {
    const from = service[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to ?? null)) changes[key] = { from, to };
  }
  if (Object.keys(changes).length === 0) {
    throw Object.assign(new Error("Nothing was changed"), { status: 400 });
  }
  for (const old of listServiceChanges({ serviceId: service.id, status: "pending" })) {
    jsonStore.remove("serviceChangeRequests", old.id);
  }
  const request = jsonStore.insert("serviceChangeRequests", {
    serviceId: service.id,
    providerId,
    serviceName: service.name,
    changes,
    status: "pending",
    note: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  });
  const provider = await getProvider(providerId);
  await logActivity("service", `${provider?.name || "A provider"} requested changes to "${service.name}" (awaiting approval)`);
  return request;
}

// decision: "approved" | "rejected". On approval the admin may override any of
// the proposed values (`edits`) — what's applied is recorded in the change log.
async function reviewServiceChange(requestId, decision, { note, edits } = {}, actor) {
  if (!["approved", "rejected"].includes(decision)) {
    throw Object.assign(new Error("decision must be approved or rejected"), { status: 400 });
  }
  const request = jsonStore.readAll("serviceChangeRequests").find((r) => r.id === requestId);
  if (!request) return undefined;
  if (request.status !== "pending") {
    throw Object.assign(new Error("This request has already been reviewed"), { status: 409 });
  }
  const service = await getService(request.serviceId);
  if (!service) {
    jsonStore.remove("serviceChangeRequests", requestId);
    throw Object.assign(new Error("The service no longer exists"), { status: 404 });
  }

  let applied = null;
  if (decision === "approved") {
    const proposed = {};
    for (const [key, change] of Object.entries(request.changes)) proposed[key] = change.to;
    const merged = { ...proposed, ...cleanServiceChange(Object.fromEntries(Object.entries(edits || {}).filter(([k]) => SERVICE_CHANGE_KEYS.includes(k)))) };
    const updated = await applyServiceFieldUpdate(request.serviceId, merged, ADMIN_EDITABLE_SERVICE_KEYS);
    applied = diffValues(service, updated, SERVICE_CHANGE_KEYS);
    recordAdminChange({
      actor,
      action: "service.change_approved",
      entityType: "service",
      entityId: request.serviceId,
      entityName: updated.name,
      changes: applied,
    });
  } else {
    recordAdminChange({
      actor,
      action: "service.change_rejected",
      entityType: "service",
      entityId: request.serviceId,
      entityName: service.name,
      changes: [
        ...Object.entries(request.changes).map(([field, c]) => ({ field, from: c.from, to: c.to })),
        ...(note ? [{ field: "reason", from: null, to: note }] : []),
      ],
    });
  }
  const resolved = jsonStore.update("serviceChangeRequests", requestId, {
    status: decision,
    note: note || null,
    resolvedAt: new Date().toISOString(),
    ...(applied ? { applied } : {}),
  });
  await logActivity("service", `Change request for "${service.name}" ${decision} by admin`);
  try {
    await addNotification({
      recipientType: "provider",
      recipientId: request.providerId,
      type: "service",
      title: decision === "approved" ? "Service changes approved" : "Service changes rejected",
      message:
        decision === "approved"
          ? `Your changes to "${service.name}" were approved and are now live.`
          : `Your requested changes to "${service.name}" were rejected.${note ? ` Reason: ${note}` : ""} The service keeps its current details.`,
    });
  } catch (e) {
    console.error("Service change notification failed:", e);
  }
  return resolved;
}

async function applyServiceFieldUpdate(serviceId, patch, allowedKeys) {
  const fields = {};
  const vars = { id: serviceId };
  const varDefs = [];
  for (const key of allowedKeys) {
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

async function updateServiceStatus(serviceId, status, actor) {
  const before = await getService(serviceId);
  await mutate(`mutation($id: UUID!, $status: String!) { service_update(id: $id, data: { status: $status }) }`, {
    id: serviceId,
    status,
  });
  cacheClear("service");
  const service = await getService(serviceId);
  if (!service) return undefined;
  await logActivity("service", `Service "${service.name}" set to ${status} by admin`);
  recordAdminChange({
    actor,
    action: status === "active" ? "service.activate" : "service.deactivate",
    entityType: "service",
    entityId: serviceId,
    entityName: service.name,
    changes: [{ field: "status", from: before?.status ?? null, to: status }],
  });
  return service;
}

// ---- service approval workflow: a provider-created service starts as
// "pending_approval" and is invisible to customers (the public catalog only
// lists status "active"). An admin approves it, rejects it with a note the
// provider can read, or edits/deletes it. ----

// ---- admin change log: who changed what, with before/after values, for
// every admin edit/activation/deletion of a service or category. Kept
// separate from the activity feed (which is just readable one-liners). ----

function recordAdminChange({ actor, action, entityType, entityId, entityName, changes }) {
  jsonStore.insert("adminChangeLog", {
    at: new Date().toISOString(),
    actor: actor || "admin",
    action,
    entityType,
    entityId,
    entityName: entityName || null,
    changes: changes || [],
  });
}

function listAdminChanges({ entityType, entityId, limit = 200 } = {}) {
  return jsonStore
    .readAll("adminChangeLog")
    .filter((c) => (!entityType || c.entityType === entityType) && (!entityId || c.entityId === entityId))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

function diffValues(before, after, keys) {
  return keys
    .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((k) => ({ field: k, from: before[k] ?? null, to: after[k] ?? null }));
}

function getServiceReview(serviceId) {
  return jsonStore.readAll("serviceReviews").find((r) => r.id === serviceId) || null;
}

async function reviewService(serviceId, decision, note, actor) {
  if (!["approved", "rejected"].includes(decision)) {
    throw Object.assign(new Error("decision must be approved or rejected"), { status: 400 });
  }
  const existing = await getService(serviceId);
  if (!existing) return undefined;
  const status = decision === "approved" ? "active" : "rejected";
  await mutate(`mutation($id: UUID!, $status: String!) { service_update(id: $id, data: { status: $status }) }`, {
    id: serviceId,
    status,
  });
  jsonStore.remove("serviceReviews", serviceId);
  if (decision === "rejected") {
    jsonStore.insert("serviceReviews", { id: serviceId, note: note || null, at: new Date().toISOString() });
  }
  cacheClear("service");
  await logActivity("service", `Service "${existing.name}" ${decision} by admin`);
  try {
    await addNotification({
      recipientType: "provider",
      recipientId: existing.providerId,
      type: "service",
      title: decision === "approved" ? "Service approved" : "Service rejected",
      message:
        decision === "approved"
          ? `Your service "${existing.name}" was approved and is now visible to customers.`
          : `Your service "${existing.name}" was rejected.${note ? ` Reason: ${note}` : ""} Edit it to resubmit.`,
    });
  } catch (e) {
    console.error("Service review notification failed:", e);
  }
  recordAdminChange({
    actor,
    action: decision === "approved" ? "service.approve" : "service.reject",
    entityType: "service",
    entityId: serviceId,
    entityName: existing.name,
    changes: [
      { field: "status", from: existing.status, to: status },
      ...(decision === "rejected" && note ? [{ field: "reason", from: null, to: note }] : []),
    ],
  });
  return getService(serviceId);
}

// Beyond the basic fields, an admin can also move a service to another
// category and rewrite its "what's included" list.
async function adminUpdateService(serviceId, patch, actor) {
  const existing = await getService(serviceId);
  if (!existing) return undefined;

  if (patch.categorySlug !== undefined && patch.categorySlug !== existing.categoryId) {
    const categoryUuid = await getCategoryUuidBySlug(patch.categorySlug);
    if (!categoryUuid) throw Object.assign(new Error("Unknown category"), { status: 400 });
    await mutate(`mutation($id: UUID!, $categoryId: UUID!) { service_update(id: $id, data: { categoryId: $categoryId }) }`, {
      id: serviceId,
      categoryId: categoryUuid,
    });
  }
  if (patch.includes !== undefined) {
    const includes = (Array.isArray(patch.includes) ? patch.includes : [])
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (includes.some((t) => t.length > 100)) {
      throw Object.assign(new Error("Each included item must be 100 characters or fewer"), { status: 400 });
    }
    await mutate(`mutation($id: UUID!) { serviceInclude_deleteMany(where: { serviceId: { eq: $id } }) }`, { id: serviceId });
    for (const text of includes) {
      await mutate(`mutation($serviceId: UUID!, $text: String!) { serviceInclude_insert(data: { serviceId: $serviceId, text: $text }) }`, {
        serviceId,
        text,
      });
    }
    cacheClear("service");
  }
  cacheClear("service");
  const updated = await applyServiceFieldUpdate(serviceId, patch, ADMIN_EDITABLE_SERVICE_KEYS);
  const trackedKeys = [...ADMIN_EDITABLE_SERVICE_KEYS, "categoryId", "includes"];
  const changes = diffValues(existing, updated, trackedKeys);
  if (changes.length > 0) {
    recordAdminChange({
      actor,
      action: "service.update",
      entityType: "service",
      entityId: serviceId,
      entityName: updated.name,
      changes,
    });
  }
  return updated;
}

// Refuses if any booking references the service — deleting those would wipe
// customers' and providers' order history; deactivate the service instead.
async function adminDeleteService(serviceId, actor) {
  const existing = await getService(serviceId);
  if (!existing) return false;
  const { bookings } = await query(
    `query($id: UUID!) { bookings(where: { serviceId: { eq: $id } }) { id } }`,
    { id: serviceId }
  );
  if (bookings.length > 0) {
    throw Object.assign(
      new Error("This service has bookings and can't be deleted — set it to inactive instead"),
      { status: 409 }
    );
  }
  await mutate(`mutation($id: UUID!) { serviceHighlight_deleteMany(where: { serviceId: { eq: $id } }) }`, { id: serviceId });
  await mutate(`mutation($id: UUID!) { serviceInclude_deleteMany(where: { serviceId: { eq: $id } }) }`, { id: serviceId });
  await mutate(`mutation($id: UUID!) { service_delete(id: $id) }`, { id: serviceId });
  jsonStore.readAll("providerAds").filter((a) => a.serviceId === serviceId).forEach((a) => jsonStore.remove("providerAds", a.id));
  jsonStore.remove("serviceReviews", serviceId);
  cacheClear("service");
  await logActivity("service", `Service "${existing.name}" deleted by admin`);
  recordAdminChange({
    actor,
    action: "service.delete",
    entityType: "service",
    entityId: serviceId,
    entityName: existing.name,
    changes: [
      { field: "price", from: existing.price, to: null },
      { field: "status", from: existing.status, to: "deleted" },
    ],
  });
  return true;
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
async function createBooking({ serviceId, date, time, address, issue, customerId, orderId, offerCode, flatDiscount = 0 }) {
  const service = await getService(serviceId);
  if (!service) throw new Error("Unknown service");
  if (service.status === "pending_approval" || service.status === "rejected") {
    throw Object.assign(new Error("This service isn't available yet"), { status: 409 });
  }
  if (!isCategoryActive(service.categoryId)) {
    throw Object.assign(new Error("This service isn't available right now"), { status: 409 });
  }
  if (!isProviderAcceptingRequests(service.providerId)) {
    throw Object.assign(new Error("This provider isn't currently accepting new bookings"), { status: 409 });
  }
  if ((await getProviderCapacity(service.providerId)).restricted) {
    throw Object.assign(new Error("This provider isn't currently accepting new bookings"), { status: 409 });
  }
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
  if (flatDiscount > 0) {
    amount = Math.max(0, amount - flatDiscount);
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
  cacheClear("openBookings");
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

async function createOrder({ items, address, customerId, offerCode, referralCode, useCredits }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Order must have at least one item");
  const orderId = `ORD-${Date.now().toString(36)}`;
  if (offerCode) {
    const result = validateOffer(offerCode);
    if (!result.valid) throw new Error(result.error);
  }

  // A referral code (flat ₹ off, only on a customer's very first order) and
  // any accumulated referral credit are both applied once, to the first
  // line item, rather than split across every item in the order.
  let referrerId = null;
  let referralDiscount = 0;
  const { referralFriendDiscount, referralReward } = getSettings();
  if (referralCode) {
    referrerId = await applyReferralCode(referralCode, customerId);
    referralDiscount = referralFriendDiscount;
  }
  const creditAmount = useCredits ? getReferralCredits(customerId).balance : 0;

  const created = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
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
        flatDiscount: i === 0 ? referralDiscount + creditAmount : 0,
      })
    );
  }

  if (referrerId) {
    jsonStore.insert("referralRedemptions", {
      referrerId,
      refereeId: customerId,
      bookingId: created[0].id,
      referrerReward: referralReward,
      status: "pending",
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
  }
  if (creditAmount > 0) {
    deductReferralCredits(customerId, creditAmount, created[0].id);
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

  cacheClear("openBookings");
  const provider = await getProvider(existing.providerId);
  const serviceName = existing.service?.name || "Service";
  await logActivity("booking", `Booking #${id} (${serviceName}) marked ${status}`);

  // The customer is handed a fresh 4-digit code the moment a provider
  // accepts — the provider asks for it in person once they've actually
  // reached the customer, so "Accepted" isn't itself proof of arrival.
  if (status === "Accepted") {
    ensureBookingOtp(id, "start");
  }

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
      await deductWalletCommission(existing.providerId, existing.amount, id);
    } catch (e) {
      console.error(`Wallet commission deduction failed for booking ${id}:`, e);
    }
    try {
      const redemption = jsonStore
        .readAll("referralRedemptions")
        .find((r) => r.bookingId === id && r.status === "pending");
      if (redemption) {
        creditReferrer(redemption.referrerId, redemption.referrerReward, id);
        jsonStore.update("referralRedemptions", redemption.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        await addNotification({
          recipientType: "customer",
          recipientId: redemption.referrerId,
          type: "referral",
          title: "Referral reward earned!",
          message: `Your friend completed their first booking — ₹${redemption.referrerReward} credit added to your account.`,
        });
      }
    } catch (e) {
      console.error(`Referral reward crediting failed for booking ${id}:`, e);
    }
  }
  return fetchBookingWithRelations(id);
}

// ---- dispatch: ring one provider, and if they don't respond (timeout or
// explicit reject), hand the booking to another active provider in the same
// category rather than leaving the customer stuck ----

async function findAlternativeProviderService(categorySlug, excludeProviderIds) {
  const restrictedIds = await getCapacityRestrictedProviderIds();
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
    (s) =>
      s.provider &&
      !excludeProviderIds.includes(s.provider.id) &&
      !isProviderSuspended(s.provider.id) &&
      isProviderAcceptingRequests(s.provider.id) &&
      !restrictedIds.has(s.provider.id)
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
    cacheClear("openBookings");
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
  cacheClear("openBookings");
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

const DEFAULT_SETTINGS = { platformFeePct: 10, referralFriendDiscount: 50, referralReward: 50, cpcRate: 2, defaultMaxOpenRequests: 5, staleRequestDays: 5 };

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
  for (const key of ["referralFriendDiscount", "referralReward", "cpcRate", "defaultMaxOpenRequests", "staleRequestDays"]) {
    if (patch[key] !== undefined) {
      const amount = Number(patch[key]);
      if (!Number.isFinite(amount) || amount < 0) {
        throw Object.assign(new Error(`${key} must be a non-negative number`), { status: 400 });
      }
      patch = { ...patch, [key]: amount };
    }
  }
  const [existing] = jsonStore.readAll("settings");
  const next = { ...DEFAULT_SETTINGS, ...existing, ...patch };
  if (existing) jsonStore.update("settings", existing.id, next);
  else jsonStore.insert("settings", { id: "platform", ...next });
  return getSettings();
}

// ---- referral program (jsonStore-backed: a per-customer code, a redeemable
// credit ledger, and one redemption record per successful "friend's first
// booking" — the referral discount/reward amounts come from settings above) ----

function generateReferralCode(name) {
  const prefix = (name || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "TIK";
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${prefix}${digits}`;
}

function getOrCreateReferralCode(customerId, customerName) {
  const codes = jsonStore.readAll("referralCodes");
  const existing = codes.find((r) => r.id === customerId);
  if (existing) return existing.code;
  let code = generateReferralCode(customerName);
  while (codes.some((r) => r.code === code)) code = generateReferralCode(customerName);
  jsonStore.insert("referralCodes", { id: customerId, code });
  return code;
}

function findReferrerByCode(code) {
  const norm = String(code || "").trim().toUpperCase();
  if (!norm) return null;
  const entry = jsonStore.readAll("referralCodes").find((r) => r.code === norm);
  return entry ? entry.id : null;
}

function getReferralCredits(customerId) {
  const existing = jsonStore.readAll("referralCredits").find((c) => c.id === customerId);
  return existing || { id: customerId, balance: 0, history: [] };
}

function saveReferralCredits(credits) {
  const existing = jsonStore.readAll("referralCredits").find((c) => c.id === credits.id);
  if (existing) jsonStore.update("referralCredits", credits.id, credits);
  else jsonStore.insert("referralCredits", credits);
  return credits;
}

function creditReferrer(referrerId, amount, bookingId) {
  const credits = getReferralCredits(referrerId);
  credits.balance += amount;
  credits.history = [...credits.history, { amount, bookingId, at: new Date().toISOString() }];
  saveReferralCredits(credits);
}

function deductReferralCredits(customerId, amount, bookingId) {
  const credits = getReferralCredits(customerId);
  credits.balance = Math.max(0, credits.balance - amount);
  credits.history = [...credits.history, { amount: -amount, bookingId, at: new Date().toISOString() }];
  saveReferralCredits(credits);
}

async function getCustomerReferralInfo(customerId) {
  const customer = await getCustomerById(customerId);
  const code = getOrCreateReferralCode(customerId, customer?.name);
  const credits = getReferralCredits(customerId);
  const { referralFriendDiscount, referralReward } = getSettings();
  return {
    code,
    balance: credits.balance,
    history: credits.history,
    friendDiscount: referralFriendDiscount,
    reward: referralReward,
  };
}

// A code can only ever be applied to the referee's first order ever — checked
// both against any prior redemption and against real booking history, so it
// can't be reused across accounts or retried after a cancelled first order.
async function applyReferralCode(code, refereeId) {
  const referrerId = findReferrerByCode(code);
  if (!referrerId) {
    throw Object.assign(new Error("Invalid referral code"), { status: 400 });
  }
  if (referrerId === refereeId) {
    throw Object.assign(new Error("You can't use your own referral code"), { status: 400 });
  }
  if (jsonStore.readAll("referralRedemptions").some((r) => r.refereeId === refereeId)) {
    throw Object.assign(new Error("Referral codes can only be used on your first booking"), { status: 400 });
  }
  const { bookings } = await query(
    `query($id: UUID!) { bookings(where: { customerId: { eq: $id } }) { id } }`,
    { id: refereeId }
  );
  if (bookings.length > 0) {
    throw Object.assign(new Error("Referral codes can only be used on your first booking"), { status: 400 });
  }
  return referrerId;
}

// ---- refund claims (jsonStore-backed — a customer-submitted claim that an
// admin reviews and approves/rejects; the actual refund payment happens
// outside the app, same as every other customer-provider payment) ----

async function createRefundClaim(customerId, bookingId, reason) {
  const claim = jsonStore.insert("refundClaims", {
    customerId,
    bookingId,
    reason,
    status: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    adminNote: null,
  });
  await logActivity("booking", `Refund claim submitted for booking #${bookingId}`);
  return claim;
}

function listRefundClaims() {
  return jsonStore.readAll("refundClaims").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function resolveRefundClaim(id, status, adminNote) {
  if (!["approved", "rejected"].includes(status)) {
    throw Object.assign(new Error("status must be approved or rejected"), { status: 400 });
  }
  const claim = jsonStore.update("refundClaims", id, {
    status,
    adminNote: adminNote || null,
    resolvedAt: new Date().toISOString(),
  });
  if (!claim) return undefined;
  await addNotification({
    recipientType: "customer",
    recipientId: claim.customerId,
    type: "refund",
    title: `Refund claim ${status}`,
    message:
      status === "approved"
        ? "Your refund claim has been approved. Our team will process it shortly."
        : `Your refund claim was reviewed and could not be approved.${adminNote ? ` ${adminNote}` : ""}`,
  });
  return claim;
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
// Returns providers with balance > 0, i.e. NOT suspended. A provider with no
// wallet record at all (never recharged) has no row here, so it's correctly
// excluded by default — same "no record = ₹0 = suspended" rule as
// isProviderSuspended, instead of listing suspended IDs (which would only
// ever contain providers who'd already touched their wallet).
function listActiveWalletProviderIds() {
  return new Set(jsonStore.readAll("providerWallets").filter((w) => w.balance > 0).map((w) => w.id));
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
  const rechargeMessage = `Your Tikdum wallet has been recharged with ₹${amount}. New balance: ₹${wallet.balance}. You're all set to keep receiving job requests.`;
  try {
    const provider = await getProvider(providerId);
    if (provider?.phone) {
      await whatsapp.sendWhatsAppMessage(provider.phone, rechargeMessage);
    }
  } catch (e) {
    console.error("Recharge WhatsApp notification failed:", e);
  }
  try {
    await addNotification({
      recipientType: "provider",
      recipientId: providerId,
      type: "wallet",
      title: "Wallet recharged",
      message: rechargeMessage,
    });
  } catch (e) {
    console.error("Recharge in-app notification failed:", e);
  }
  await logActivity("provider", `Wallet recharged for provider ${providerId}: +₹${amount}`);
  return wallet;
}

// Shared by every wallet charge (job commission, ad clicks, ...): deducts
// `amount`, and fires the low-balance / suspended-or-negative-balance alert
// the first time each is crossed (tracked via the *AlertSentAt flags so a
// provider isn't messaged on every single charge once they're already below
// the threshold). Every alert goes out both in-app (bell icon + push) and
// via WhatsApp, since a provider may not have WhatsApp connected or may miss it.
async function applyWalletDeduction(providerId, amount, { bookingId, reason } = {}) {
  if (amount <= 0) return getWallet(providerId);

  const wallet = getWallet(providerId);
  const before = wallet.balance;
  wallet.balance = before - amount;
  wallet.deductions = [
    ...(wallet.deductions || []),
    { amount, at: new Date().toISOString(), reason: reason || "commission" },
  ];

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
  // suspended, and must never be lost to a WhatsApp/push failure below.
  saveWallet(wallet);

  if (justSuspended || justWentLow) {
    const message = justSuspended
      ? `Your Tikdum wallet balance is now ₹${wallet.balance}. Your account is paused from receiving new job requests until you recharge. Please contact Tikdum support to recharge your account.`
      : `Your Tikdum wallet balance is running low (₹${wallet.balance}). Recharge soon to keep receiving job requests without interruption.`;
    const title = justSuspended
      ? wallet.balance < 0
        ? "Wallet balance is negative — account paused"
        : "Wallet balance reached ₹0 — account paused"
      : "Wallet balance running low";
    try {
      const provider = await getProvider(providerId);
      if (provider?.phone) {
        await whatsapp.sendWhatsAppMessage(provider.phone, message);
      }
    } catch (e) {
      console.error("Wallet balance WhatsApp alert failed:", e);
    }
    try {
      await addNotification({
        recipientType: "provider",
        recipientId: providerId,
        type: "wallet",
        title,
        message,
        bookingId: bookingId || undefined,
      });
    } catch (e) {
      console.error("Wallet balance in-app notification failed:", e);
    }
  }

  return wallet;
}

async function deductWalletCommission(providerId, bookingAmount, bookingId) {
  const { platformFeePct } = getSettings();
  const commission = Math.round(bookingAmount * (platformFeePct / 100));
  return applyWalletDeduction(providerId, commission, { bookingId, reason: "commission" });
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
      const reminderMessage = `Reminder: your Tikdum wallet balance is ₹${wallet.balance} and your account is still paused from receiving new job requests. Contact Tikdum support to recharge and resume.`;
      const provider = await getProvider(wallet.id);
      if (provider?.phone) {
        await whatsapp.sendWhatsAppMessage(provider.phone, reminderMessage);
      }
      await addNotification({
        recipientType: "provider",
        recipientId: wallet.id,
        type: "wallet",
        title: "Still paused — recharge to resume",
        message: reminderMessage,
      });
      wallet.lastReminderAt = new Date().toISOString();
      saveWallet(wallet);
    } catch (e) {
      console.error(`Suspended wallet reminder failed for provider ${wallet.id}:`, e);
    }
  }
}

// ---- open-request capacity & visibility. A provider stops appearing to new
// customers when (a) they hold at least their maximum number of open
// requests, or (b) any open request has been waiting longer than the stale
// threshold; they reappear on their own as requests are completed/resolved.
// "Open" = not yet resolved: Pending, Accepted or In Progress. An admin can
// change a provider's limit, or override the restriction (for a set time or
// indefinitely) — the reason is always available to show them. ----

const OPEN_REQUEST_STATUSES = ["Pending", "Accepted", "In Progress"];

async function getOpenRequestRows() {
  const cached = cacheGet("openBookings");
  if (cached) return cached;
  const { bookings } = await query(
    `query($statuses: [String!]) { bookings(where: { status: { in: $statuses } }) { id providerId createdAt } }`,
    { statuses: OPEN_REQUEST_STATUSES }
  );
  return cacheSet("openBookings", bookings);
}

function capacityFor(providerId, rows, settings) {
  const coverage = getProviderCoverage(providerId);
  const maxOpen = coverage.maxOpenRequests ?? settings.defaultMaxOpenRequests;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const times = rows.map((r) => new Date(r.createdAt).getTime());
  const oldest = times.length ? Math.min(...times) : null;
  const staleCount = times.filter((t) => now - t > settings.staleRequestDays * dayMs).length;
  const oldestOpenDays = oldest === null ? 0 : Math.floor((now - oldest) / dayMs);

  const reasons = [];
  if (rows.length >= maxOpen) {
    reasons.push(`Reached the maximum of ${maxOpen} open requests (${rows.length}/${maxOpen})`);
  }
  if (staleCount > 0) {
    reasons.push(
      `${staleCount} request${staleCount > 1 ? "s have" : " has"} been open for more than ${settings.staleRequestDays} days (oldest: ${oldestOpenDays} days)`
    );
  }
  const ov = coverage.capacityOverride;
  const overrideActive = !!ov && (!ov.until || new Date(ov.until).getTime() > now);
  return {
    providerId,
    openCount: rows.length,
    maxOpen,
    customMax: coverage.maxOpenRequests ?? null,
    oldestOpenDays,
    staleCount,
    reasons,
    override: overrideActive ? ov : null,
    restricted: reasons.length > 0 && !overrideActive,
  };
}

async function getProviderCapacity(providerId) {
  const settings = getSettings();
  const rows = (await getOpenRequestRows()).filter((r) => r.providerId === providerId);
  return capacityFor(providerId, rows, settings);
}

async function getAllProviderCapacities() {
  const settings = getSettings();
  const rows = await getOpenRequestRows();
  const byProvider = new Map();
  for (const r of rows) {
    if (!byProvider.has(r.providerId)) byProvider.set(r.providerId, []);
    byProvider.get(r.providerId).push(r);
  }
  // Providers with a custom limit but no open requests still matter (a limit
  // of 0 hides them outright), so include every coverage record too.
  for (const c of jsonStore.readAll("providerCoverage")) {
    if (!byProvider.has(c.id)) byProvider.set(c.id, []);
  }
  const result = {};
  for (const [id, providerRows] of byProvider) result[id] = capacityFor(id, providerRows, settings);
  return result;
}

async function getCapacityRestrictedProviderIds() {
  const all = await getAllProviderCapacities();
  return new Set(Object.values(all).filter((c) => c.restricted).map((c) => c.providerId));
}

// overrideHours: a positive number = visible for that long; "indefinite" =
// until removed; null = clear any override.
async function updateProviderCapacity(providerId, { maxOpenRequests, overrideHours }) {
  const patch = {};
  if (maxOpenRequests !== undefined) patch.maxOpenRequests = maxOpenRequests;
  if (overrideHours !== undefined) {
    if (overrideHours === null) {
      patch.capacityOverride = null;
    } else if (overrideHours === "indefinite") {
      patch.capacityOverride = { until: null, at: new Date().toISOString() };
    } else {
      const hours = Number(overrideHours);
      if (!Number.isFinite(hours) || hours <= 0) {
        throw Object.assign(new Error("overrideHours must be a positive number, \"indefinite\" or null"), { status: 400 });
      }
      patch.capacityOverride = {
        until: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
        at: new Date().toISOString(),
      };
    }
  }
  updateProviderCoverage(providerId, patch);
  const provider = await getProvider(providerId);
  await logActivity("provider", `Capacity settings changed for ${provider?.name || "a provider"}`);
  return getProviderCapacity(providerId);
}

async function sendProviderWarning(providerId, message) {
  const text = String(message || "").trim();
  if (!text) throw Object.assign(new Error("A warning message is required"), { status: 400 });
  const provider = await getProvider(providerId);
  if (!provider) return false;
  await addNotification({
    recipientType: "provider",
    recipientId: providerId,
    type: "warning",
    title: "Warning from Tikdum",
    message: text,
  });
  try {
    if (provider.phone) await whatsapp.sendWhatsAppMessage(provider.phone, `Tikdum notice: ${text}`);
  } catch (e) {
    console.error("Provider warning WhatsApp failed:", e);
  }
  await logActivity("provider", `Warning sent to ${provider.name}`);
  return true;
}

// ---- CPC advertising (jsonStore-backed). A provider "advertises" one of
// their services; every time a customer opens that service's details, the
// current CPC rate (admin-configurable, see settings) is deducted from the
// same wallet used for job commissions — so a click that empties the wallet
// also suspends new bookings, same as any other deduction. An ad is only
// ever shown as running (mapService's `isAd`) while its status is "active"
// AND the wallet can cover at least one more click; the moment a click drops
// the balance below the rate, it's auto-paused so it never runs on an
// insufficient balance. ----

function listProviderAds(providerId) {
  return jsonStore.readAll("providerAds").filter((a) => a.providerId === providerId);
}

function getAd(adId) {
  return jsonStore.readAll("providerAds").find((a) => a.id === adId) || null;
}

async function createAd(providerId, serviceId) {
  const service = await getService(serviceId);
  if (!service || service.providerId !== providerId) {
    throw Object.assign(new Error("Service not found"), { status: 404 });
  }
  if (service.status !== "active") {
    throw Object.assign(new Error("Only approved, active services can be advertised"), { status: 400 });
  }
  const existing = listProviderAds(providerId).find((a) => a.serviceId === serviceId && a.status !== "stopped");
  if (existing) {
    throw Object.assign(new Error("This service is already being advertised"), { status: 400 });
  }
  return jsonStore.insert("providerAds", {
    providerId,
    serviceId,
    status: "active", // "active" | "paused" | "paused_low_balance" | "stopped"
    clicks: 0,
    amountSpent: 0,
    createdAt: new Date().toISOString(),
  });
}

function setAdStatus(providerId, adId, status) {
  if (!["active", "paused", "stopped"].includes(status)) {
    throw Object.assign(new Error("status must be active, paused or stopped"), { status: 400 });
  }
  const ad = getAd(adId);
  if (!ad || ad.providerId !== providerId) {
    throw Object.assign(new Error("Ad not found"), { status: 404 });
  }
  return jsonStore.update("providerAds", adId, { status });
}

async function listProviderAdsWithStats(providerId) {
  const wallet = getWallet(providerId);
  const ads = listProviderAds(providerId);
  const result = [];
  for (const ad of ads) {
    const service = await getService(ad.serviceId);
    result.push({
      ...ad,
      serviceName: service?.name || "Service",
      serviceIcon: service?.icon || null,
      walletBalance: wallet.balance,
    });
  }
  return result;
}

// A service is "advertised" to customers only while some ad for it is
// active and its provider's wallet can afford at least one more click.
function isServiceCurrentlyAdvertised(serviceId) {
  const ad = jsonStore.readAll("providerAds").find((a) => a.serviceId === serviceId && a.status === "active");
  if (!ad) return false;
  const { cpcRate } = getSettings();
  return getWallet(ad.providerId).balance >= cpcRate;
}

// Called when a customer opens an advertised service's details. Returns
// { charged, ad } — charged is false when there was nothing to bill (no
// running ad, or the wallet already couldn't cover this click).
async function registerAdClick(serviceId) {
  const ad = jsonStore.readAll("providerAds").find((a) => a.serviceId === serviceId && a.status === "active");
  if (!ad) return { charged: false, ad: null };
  // Hidden services can't legitimately be clicked; never bill a provider
  // who has switched requests off (e.g. a stale link).
  if (!isProviderAcceptingRequests(ad.providerId)) return { charged: false, ad };

  const { cpcRate } = getSettings();
  const wallet = getWallet(ad.providerId);
  if (wallet.balance < cpcRate) {
    // Already can't afford this click — stop the ad instead of charging
    // into it or letting it keep running unpaid.
    const stopped = jsonStore.update("providerAds", ad.id, { status: "paused_low_balance" });
    return { charged: false, ad: stopped };
  }

  await applyWalletDeduction(ad.providerId, cpcRate, { reason: "ad_click" });
  const remaining = getWallet(ad.providerId).balance;
  const updated = jsonStore.update("providerAds", ad.id, {
    clicks: (ad.clicks || 0) + 1,
    amountSpent: (ad.amountSpent || 0) + cpcRate,
    status: remaining < cpcRate ? "paused_low_balance" : "active",
  });
  return { charged: true, ad: updated };
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

// Finer-grained on-the-job checkpoints a provider taps through (reached the
// customer's location, started the job, left the location) — sit alongside
// the booking's real status (Accepted/In Progress/Completed) rather than
// replacing it, so nothing else keyed off booking.status has to change.
const JOB_CHECKPOINT_TYPES = ["reached_location", "started_job", "left_location"];

function listJobCheckpoints(bookingId) {
  return jsonStore.readAll("jobCheckpoints").filter((c) => c.bookingId === bookingId);
}

function addJobCheckpoint(bookingId, type) {
  if (!JOB_CHECKPOINT_TYPES.includes(type)) {
    throw Object.assign(new Error("Invalid checkpoint type"), { status: 400 });
  }
  const existing = listJobCheckpoints(bookingId).find((c) => c.type === type);
  if (existing) return existing;
  return jsonStore.insert("jobCheckpoints", { bookingId, type, at: new Date().toISOString() });
}

// ---- work start / job completion OTPs. The customer is the only one who
// ever sees the code (fetched via their own auth) — the provider has to ask
// for it in person and submit a guess, which is what actually proves they
// were physically there to start, and later finish, the job. ----
function generateOtpCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function getBookingOtp(bookingId, type) {
  return jsonStore.readAll("bookingOtps").find((o) => o.bookingId === bookingId && o.type === type);
}

function ensureBookingOtp(bookingId, type) {
  const existing = getBookingOtp(bookingId, type);
  if (existing) return existing;
  return jsonStore.insert("bookingOtps", {
    bookingId,
    type,
    code: generateOtpCode(),
    verifiedAt: null,
    createdAt: new Date().toISOString(),
  });
}

function getBookingOtpsForCustomer(bookingId) {
  const start = getBookingOtp(bookingId, "start");
  const complete = getBookingOtp(bookingId, "complete");
  return {
    start: start ? { code: start.code, verified: !!start.verifiedAt } : null,
    complete: complete ? { code: complete.code, verified: !!complete.verifiedAt } : null,
  };
}

async function verifyBookingOtp(bookingId, type, code) {
  if (type !== "start" && type !== "complete") {
    throw Object.assign(new Error("Invalid OTP type"), { status: 400 });
  }
  const otp = getBookingOtp(bookingId, type);
  if (!otp) {
    throw Object.assign(new Error("No OTP has been generated for this step yet"), { status: 400 });
  }
  if (otp.verifiedAt) {
    throw Object.assign(new Error("This OTP has already been used"), { status: 400 });
  }
  if (String(code || "").trim() !== otp.code) {
    throw Object.assign(new Error("Incorrect OTP"), { status: 400 });
  }
  jsonStore.update("bookingOtps", otp.id, { verifiedAt: new Date().toISOString() });

  if (type === "start") {
    const booking = await updateBookingStatus(bookingId, "In Progress");
    // The completion code only appears once the job has actually started —
    // generating both up front would let it leak to the customer too early.
    ensureBookingOtp(bookingId, "complete");
    return booking;
  }
  return updateBookingStatus(bookingId, "Completed");
}

// ---- Service Provider Agreement acceptance (jsonStore-backed — a signed
// timestamp/IP record per provider per version, not a Postgres entity) ----
function getProviderAgreement(providerId) {
  return (
    jsonStore
      .readAll("providerAgreements")
      .find((a) => a.providerId === providerId && a.version === AGREEMENT_VERSION) || null
  );
}

function acceptProviderAgreement(providerId, { ip, userAgent } = {}) {
  const existing = getProviderAgreement(providerId);
  if (existing) return existing;
  return jsonStore.insert("providerAgreements", {
    providerId,
    version: AGREEMENT_VERSION,
    acceptedAt: new Date().toISOString(),
    ip: ip || null,
    userAgent: userAgent || null,
  });
}

// ---- one-time production cleanup: server/src/seedData.js was inserted
// once via scripts/seed.js to prototype the catalog before real sign-ups
// existed. These are the exact phones/messages that data used, so this only
// ever matches the bundled demo rows — never a real provider or customer —
// and is safe to call more than once (matches nothing once it's been run).
const SEED_PROVIDER_PHONES = ["+91 98765 43210", "+91 98765 11223", "+91 98765 99887", "+91 98765 44556"];
const SEED_CUSTOMER_PHONE = "+91 98765 43210";
const SEED_ACTIVITY_MESSAGES = [
  "New provider registration: Meena Kapoor (Painting)",
  "New review received: 5★ for Plumbing Service",
  "New booking received: #BK12344 — Home Cleaning",
  "Provider approved: Amit Sharma (AC Repair & Service)",
];

async function removeSeedData() {
  const [{ providers }, { customers }] = await Promise.all([
    query(`query($phones: [String!]) { providers(where: { phone: { in: $phones } }) { id } }`, {
      phones: SEED_PROVIDER_PHONES,
    }),
    query(`query($phone: String!) { customers(where: { phone: { eq: $phone } }) { id } }`, {
      phone: SEED_CUSTOMER_PHONE,
    }),
  ]);
  const providerIds = providers.map((p) => p.id);
  const customerIds = customers.map((c) => c.id);
  const result = { providers: 0, services: 0, bookings: 0, customers: 0, activities: 0 };

  const { services } = providerIds.length
    ? await query(`query($ids: [UUID!]!) { services(where: { providerId: { in: $ids } }) { id } }`, {
        ids: providerIds,
      })
    : { services: [] };
  const serviceIds = services.map((s) => s.id);

  // Data Connect's generated API only accepts scalar (or list-of-scalar)
  // GraphQL variables — a compound filter object like `_or` can't be passed
  // as one, so the two conditions are queried separately and merged here.
  const bookingIds = new Set();
  if (providerIds.length) {
    const { bookings } = await query(
      `query($ids: [UUID!]!) { bookings(where: { providerId: { in: $ids } }) { id } }`,
      { ids: providerIds }
    );
    bookings.forEach((b) => bookingIds.add(b.id));
  }
  if (customerIds.length) {
    const { bookings } = await query(
      `query($ids: [UUID!]!) { bookings(where: { customerId: { in: $ids } }) { id } }`,
      { ids: customerIds }
    );
    bookings.forEach((b) => bookingIds.add(b.id));
  }
  const bookingIdList = [...bookingIds];

  if (serviceIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { serviceHighlight_deleteMany(where: { serviceId: { in: $ids } }) }`, {
      ids: serviceIds,
    });
    await mutate(`mutation($ids: [UUID!]!) { serviceInclude_deleteMany(where: { serviceId: { in: $ids } }) }`, {
      ids: serviceIds,
    });
  }
  if (bookingIdList.length) {
    await mutate(`mutation($ids: [UUID!]!) { message_deleteMany(where: { bookingId: { in: $ids } }) }`, {
      ids: bookingIdList,
    });
    await mutate(`mutation($ids: [UUID!]!) { bookingStatusEvent_deleteMany(where: { bookingId: { in: $ids } }) }`, {
      ids: bookingIdList,
    });
    await mutate(`mutation($ids: [UUID!]!) { notification_deleteMany(where: { bookingId: { in: $ids } }) }`, {
      ids: bookingIdList,
    });
  }
  const recipientIds = [...providerIds, ...customerIds];
  if (recipientIds.length) {
    await mutate(`mutation($ids: [UUID!]!) { notification_deleteMany(where: { recipientId: { in: $ids } }) }`, {
      ids: recipientIds,
    });
  }
  if (bookingIdList.length) {
    const r = await mutate(`mutation($ids: [UUID!]!) { booking_deleteMany(where: { id: { in: $ids } }) }`, {
      ids: bookingIdList,
    });
    result.bookings = r.booking_deleteMany;
  }
  if (serviceIds.length) {
    const r = await mutate(`mutation($ids: [UUID!]!) { service_deleteMany(where: { id: { in: $ids } }) }`, {
      ids: serviceIds,
    });
    result.services = r.service_deleteMany;
  }
  if (providerIds.length) {
    const r = await mutate(`mutation($ids: [UUID!]!) { provider_deleteMany(where: { id: { in: $ids } }) }`, {
      ids: providerIds,
    });
    result.providers = r.provider_deleteMany;
  }
  if (customerIds.length) {
    const r = await mutate(`mutation($ids: [UUID!]!) { customer_deleteMany(where: { id: { in: $ids } }) }`, {
      ids: customerIds,
    });
    result.customers = r.customer_deleteMany;
  }
  const activityResult = await mutate(
    `mutation($messages: [String!]!) { activity_deleteMany(where: { message: { in: $messages } }) }`,
    { messages: SEED_ACTIVITY_MESSAGES }
  );
  result.activities = activityResult.activity_deleteMany;

  cacheClear("providers");
  cacheClear("service");
  return result;
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
  updateCategory,
  deleteCategory,
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
  reviewService,
  listServiceChanges,
  reviewServiceChange,
  listAdminChanges,
  adminUpdateService,
  adminDeleteService,
  setProviderVerification,
  deleteProvider,
  updateProviderProfile,
  getCustomerAddress,
  saveCustomerAddress,
  getProviderCoverage,
  updateProviderCoverage,
  getProviderCapacity,
  getAllProviderCapacities,
  updateProviderCapacity,
  sendProviderWarning,
  listProviderAdsWithStats,
  createAd,
  setAdStatus,
  registerAdClick,
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
  listJobCheckpoints,
  addJobCheckpoint,
  getBookingOtpsForCustomer,
  verifyBookingOtp,
  getCustomerReferralInfo,
  applyReferralCode,
  createRefundClaim,
  listRefundClaims,
  resolveRefundClaim,
  AGREEMENT_VERSION,
  getProviderAgreement,
  acceptProviderAgreement,
  removeSeedData,
};
