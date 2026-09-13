const { query, mutate } = require("./dataconnect");

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
  return { ...p };
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
  const { categories } = await query(`query { categories { slug name icon } }`, {});
  return categories.map(mapCategory);
}

// ---- customers ----

async function getCustomerById(id) {
  const { customer } = await query(`query($id: UUID!) { customer(id: $id) { id name avatar phone email } }`, { id });
  return customer || undefined;
}

async function getCustomerByPhone(phone) {
  const { customers } = await query(
    `query($phone: String!) { customers(where: { phone: { eq: $phone } }) { id name avatar phone email } }`,
    { phone }
  );
  return customers[0];
}

async function createCustomer({ phone, name }) {
  const { customer_insert } = await mutate(
    `mutation($name: String!, $phone: String!) { customer_insert(data: { name: $name, phone: $phone, avatar: "🧑" }) }`,
    { name: name || "New Customer", phone }
  );
  return getCustomerById(customer_insert.id);
}

// ---- providers ----

async function getProviderByPhone(phone) {
  const { providers } = await query(
    `query($phone: String!) { providers(where: { phone: { eq: $phone } }) { ${PROVIDER_FIELDS} } }`,
    { phone }
  );
  return mapProvider(providers[0]);
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
  await logActivity("provider", `New provider registration: ${name || "New Provider"}`);
  return getProvider(provider_insert.id);
}

async function listProviders() {
  const { providers } = await query(`query { providers { ${PROVIDER_FIELDS} } }`, {});
  return providers.map(mapProvider);
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
  return getProvider(providerId);
}

// ---- services ----

async function listServices({ activeOnly = false } = {}) {
  const gql = activeOnly
    ? `query { services(where: { status: { eq: "active" } }) { ${SERVICE_FIELDS} } }`
    : `query { services { ${SERVICE_FIELDS} } }`;
  const { services } = await query(gql, {});
  return services.map(mapService);
}

async function getService(id) {
  const { service } = await query(`query($id: UUID!) { service(id: $id) { ${SERVICE_FIELDS} } }`, { id });
  return service ? mapService(service) : undefined;
}

async function listProviderServices(providerId) {
  const { services } = await query(
    `query($providerId: UUID!) { services(where: { provider: { id: { eq: $providerId } } }) { ${SERVICE_FIELDS} } }`,
    { providerId }
  );
  return services.map(mapService);
}

async function addProviderService(providerId, data) {
  const categoryId = (await getCategoryUuidBySlug("ac-repair")) || null;
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
  }
  return getService(serviceId);
}

async function updateServiceStatus(serviceId, status) {
  await mutate(`mutation($id: UUID!, $status: String!) { service_update(id: $id, data: { status: $status }) }`, {
    id: serviceId,
    status,
  });
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

async function listBookings({ customerId, providerId } = {}) {
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

async function createBooking({ serviceId, date, time, address, issue, customerId, orderId }) {
  const service = await getService(serviceId);
  if (!service) throw new Error("Unknown service");
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Unknown customer");

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
      amount: service.price,
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
  await addNotification({
    recipientType: "provider",
    recipientId: service.providerId,
    type: "booking",
    title: "New booking request",
    message: `${customer.name} requested ${service.name} for ${date}`,
    bookingId,
  });
  return fetchBookingWithRelations(bookingId);
}

async function createOrder({ items, address, customerId }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Order must have at least one item");
  const orderId = `ORD-${Date.now().toString(36)}`;
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
  const candidate = services.find((s) => s.provider && !excludeProviderIds.includes(s.provider.id));
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
    await addNotification({
      recipientType: "provider",
      recipientId: candidate.providerId,
      type: "booking",
      title: "New booking request",
      message: `${updated.customer?.name || "A customer"} requested ${updated.service?.name || "a service"} for ${updated.date}`,
      bookingId,
    });
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

async function listActivities(limit = 20) {
  const { activities } = await query(
    `query($limit: Int!) { activities(orderBy: { occurredAt: DESC }, limit: $limit) { id type message occurredAt } }`,
    { limit }
  );
  return activities.map(mapActivity);
}

// ---- notifications (real-time fan-out stays in-process; only storage moves to the DB) ----

const notificationListeners = [];
function onNotification(listener) {
  notificationListeners.push(listener);
}

async function addNotification({ recipientType, recipientId, type, title, message, bookingId }) {
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

async function getEarnings(providerId) {
  const bookings = await listBookings({ providerId });
  const completed = bookings.filter((b) => b.status === "Completed");
  const inProgress = bookings.filter((b) => b.status === "In Progress");
  const total = completed.reduce((sum, b) => sum + b.amount, 0);
  const inProgressTotal = inProgress.reduce((sum, b) => sum + b.amount, 0);
  const platformFeePct = 10;
  const platformFeeAmt = Math.round(total * (platformFeePct / 100));
  const transactions = [...completed]
    .sort((a, b) => new Date(b.statusHistory.Completed || b.createdAt) - new Date(a.statusHistory.Completed || a.createdAt))
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
    thisMonth: total,
    changePct: 12,
    breakdown: { completedJobs: total, inProgressJobs: inProgressTotal, cancelledJobs: 0, platformFeePct, platformFeeAmt },
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

const PLATFORM_FEE_PCT = 10;

async function getTransactions() {
  const [bookings, providers] = await Promise.all([listBookings(), listProviders()]);
  return bookings
    .filter((b) => b.status === "Completed")
    .map((b) => {
      const provider = providers.find((p) => p.id === b.providerId);
      const platformFee = Math.round(b.amount * (PLATFORM_FEE_PCT / 100));
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

  const platformRevenue = completed.reduce((sum, b) => sum + Math.round(b.amount * (PLATFORM_FEE_PCT / 100)), 0);

  return { revenueByCategory, statusDistribution, providerLeaderboard, platformRevenue };
}

module.exports = {
  getCustomerById,
  getCustomerByPhone,
  createCustomer,
  getProviderByPhone,
  createProviderSignup,
  listProviders,
  getProvider,
  listCategories,
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
  updateProviderService,
  updateServiceStatus,
  setProviderVerification,
  updateProviderProfile,
  getEarnings,
  listActivities,
  getAdminOverview,
  getProviderReviews,
  addNotification,
  onNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getTransactions,
  getAdminReports,
};
