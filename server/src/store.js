const fs = require("fs");
const path = require("path");
const seed = require("./seedData");

const DB_FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data.json");

function loadState() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch (e) {
      console.warn("Failed to read data.json, reseeding.", e.message);
    }
  }
  const fresh = {
    customer: seed.customer,
    providers: seed.providers,
    categories: seed.categories,
    services: seed.services,
    bookings: seed.bookings,
    messages: seed.messages,
    activities: seed.activities,
    notifications: [],
    counters: seed.counters,
  };
  persist(fresh);
  return fresh;
}

function persist(state) {
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

const state = loadState();

function save() {
  persist(state);
}

function nextBookingId() {
  const id = `BK${state.counters.booking++}`;
  save();
  return id;
}

function nextServiceId() {
  const id = `svc-custom-${state.counters.service++}`;
  save();
  return id;
}

function nextOrderId() {
  const id = `ORD${state.counters.order++}`;
  save();
  return id;
}

function logActivity(type, message) {
  if (!state.activities) state.activities = [];
  const activity = {
    id: `act-${state.counters.activity++}`,
    type,
    message,
    time: new Date().toISOString(),
  };
  state.activities.unshift(activity);
  state.activities = state.activities.slice(0, 50);
  save();
  return activity;
}

function listActivities(limit = 20) {
  return (state.activities || []).slice(0, limit);
}

// ---- notifications (per-recipient, unlike the admin-wide activity log) ----

const notificationListeners = [];
function onNotification(listener) {
  notificationListeners.push(listener);
}

function addNotification({ recipientType, recipientId, type, title, message, bookingId }) {
  if (!state.notifications) state.notifications = [];
  const notification = {
    id: `notif-${state.counters.notification++}`,
    recipientType,
    recipientId,
    type,
    title,
    message,
    bookingId: bookingId || null,
    read: false,
    time: new Date().toISOString(),
  };
  state.notifications.unshift(notification);
  state.notifications = state.notifications.slice(0, 300);
  save();
  notificationListeners.forEach((listener) => listener(notification));
  return notification;
}

function listNotifications(recipientType, recipientId) {
  return (state.notifications || [])
    .filter((n) => n.recipientType === recipientType && n.recipientId === recipientId)
    .slice(0, 50);
}

function markNotificationRead(id) {
  const notification = (state.notifications || []).find((n) => n.id === id);
  if (!notification) return undefined;
  notification.read = true;
  save();
  return notification;
}

function markAllNotificationsRead(recipientType, recipientId) {
  const mine = (state.notifications || []).filter(
    (n) => n.recipientType === recipientType && n.recipientId === recipientId
  );
  mine.forEach((n) => (n.read = true));
  save();
  return mine;
}

// ---- reads ----

function getCustomer() {
  return state.customer;
}

function listProviders() {
  return Object.values(state.providers);
}

function getProvider(id) {
  return state.providers[id];
}

function listCategories() {
  return state.categories;
}

function listServices({ activeOnly = false } = {}) {
  return activeOnly ? state.services.filter((s) => s.status === "active") : state.services;
}

function getService(id) {
  return state.services.find((s) => s.id === id);
}

function listProviderServices(providerId) {
  return state.services.filter((s) => s.providerId === providerId);
}

function enrichBooking(booking) {
  const service = getService(booking.serviceId);
  return {
    ...booking,
    customer: state.customer,
    service: service
      ? { id: service.id, name: service.name, icon: service.icon, categoryId: service.categoryId, price: service.price }
      : null,
  };
}

function getProviderReviews(providerId) {
  return state.bookings
    .filter((b) => b.providerId === providerId && b.reviewed && b.review)
    .map((b) => {
      const service = getService(b.serviceId);
      return {
        id: b.id,
        rating: b.review.rating,
        text: b.review.text,
        customer: state.customer,
        serviceName: service?.name,
        serviceIcon: service?.icon,
        date: b.statusHistory?.Completed || b.createdAt,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function listBookings({ customerId, providerId } = {}) {
  let list = state.bookings;
  if (customerId) list = list.filter((b) => b.customerId === customerId);
  if (providerId) list = list.filter((b) => b.providerId === providerId);
  return list.map(enrichBooking);
}

function getBooking(id) {
  const b = state.bookings.find((b) => b.id === id);
  return b ? enrichBooking(b) : undefined;
}

function getMessages(bookingId) {
  return state.messages[bookingId] || [];
}

// ---- writes ----

function createBooking({ serviceId, date, time, address, issue, customerId, orderId }) {
  const service = getService(serviceId);
  if (!service) throw new Error("Unknown service");

  const id = nextBookingId();
  const now = new Date().toISOString();
  const booking = {
    id,
    ...(orderId ? { orderId } : {}),
    serviceId,
    providerId: service.providerId,
    customerId: customerId || state.customer.id,
    status: "Pending",
    date,
    time,
    address: address || seed.defaultAddress,
    issue: issue || "",
    amount: service.price,
    createdAt: now,
    statusHistory: { Pending: now },
    reviewed: false,
  };
  state.bookings.unshift(booking);
  save();
  if (!orderId) logActivity("booking", `New booking received: #${booking.id} — ${service.name}`);
  addNotification({
    recipientType: "provider",
    recipientId: service.providerId,
    type: "booking",
    title: "New booking request",
    message: `${state.customer.name} requested ${service.name} for ${date}`,
    bookingId: booking.id,
  });
  return enrichBooking(booking);
}

// A cart checkout: one order, one booking per line item (each may belong to
// a different provider — bookings stay the unit of fulfillment, orderId just
// groups them for display).
function createOrder({ items, address, customerId }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Order must have at least one item");
  const orderId = nextOrderId();
  const created = items.map((item) =>
    createBooking({
      serviceId: item.serviceId,
      date: item.date,
      time: item.time,
      issue: item.issue,
      address,
      customerId,
      orderId,
    })
  );
  logActivity(
    "booking",
    `New order received: #${orderId} — ${created.length} service${created.length > 1 ? "s" : ""}`
  );
  return created;
}

function updateBookingStatus(id, status) {
  const booking = state.bookings.find((b) => b.id === id);
  if (!booking) return undefined;
  booking.status = status;
  if (status !== "Cancelled") {
    booking.statusHistory[status] = new Date().toISOString();
  } else {
    booking.cancelledAt = new Date().toISOString();
  }
  save();
  const service = getService(booking.serviceId);
  const provider = state.providers[booking.providerId];
  logActivity("booking", `Booking #${booking.id} (${service?.name || "Service"}) marked ${status}`);

  const customerMessages = {
    Accepted: `${provider?.name || "The provider"} accepted your ${service?.name || "booking"} request`,
    "In Progress": `Your ${service?.name || "booking"} service is now in progress`,
    Completed: `Your ${service?.name || "booking"} service is complete — rate your experience`,
    Rejected: `${provider?.name || "The provider"} couldn't accept your ${service?.name || "booking"} request`,
  };
  if (customerMessages[status]) {
    addNotification({
      recipientType: "customer",
      recipientId: booking.customerId,
      type: "booking",
      title: `Booking ${status}`,
      message: customerMessages[status],
      bookingId: booking.id,
    });
  }
  return enrichBooking(booking);
}

function addMessage(bookingId, from, text) {
  const now = new Date().toISOString();
  const message = { from, text, time: now };
  if (!state.messages[bookingId]) state.messages[bookingId] = [];
  state.messages[bookingId].push(message);
  save();

  const booking = state.bookings.find((b) => b.id === bookingId);
  if (booking) {
    const service = getService(booking.serviceId);
    const senderName = from === "provider" ? state.providers[booking.providerId]?.name : state.customer.name;
    addNotification({
      recipientType: from === "provider" ? "customer" : "provider",
      recipientId: from === "provider" ? booking.customerId : booking.providerId,
      type: "message",
      title: `New message from ${senderName || "them"}`,
      message: text.length > 80 ? `${text.slice(0, 80)}…` : text,
      bookingId: booking.id,
    });
  }
  return message;
}

function addReview(bookingId, rating, text) {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return undefined;
  booking.reviewed = true;
  booking.review = { rating, text };
  save();

  const provider = state.providers[booking.providerId];
  const service = getService(booking.serviceId);
  if (provider) {
    const newCount = (provider.reviews || 0) + 1;
    provider.rating = Number((((provider.rating || 0) * (provider.reviews || 0) + rating) / newCount).toFixed(1));
    provider.reviews = newCount;
  }
  if (service) {
    const newCount = (service.reviewCount || 0) + 1;
    service.rating = Number((((service.rating || 0) * (service.reviewCount || 0) + rating) / newCount).toFixed(1));
    service.reviewCount = newCount;
  }
  save();
  logActivity("review", `New review received: ${rating}★ for ${service?.name || "a service"}`);
  if (provider) {
    addNotification({
      recipientType: "provider",
      recipientId: provider.id,
      type: "review",
      title: "New review",
      message: `${state.customer.name} left a ${rating}★ review for ${service?.name || "your service"}`,
      bookingId: booking.id,
    });
  }
  return { booking: enrichBooking(booking), provider, service };
}

function addProviderService(providerId, data) {
  const id = nextServiceId();
  const service = {
    id,
    categoryId: "ac-repair",
    providerId,
    status: "active",
    rating: 0,
    reviewCount: 0,
    icon: "🛠️",
    distanceLabel: "3.2 km away",
    highlights: [
      { icon: "🧑‍🔧", label: "Experienced Technicians" },
      { icon: "⏱️", label: "On-time Service" },
      { icon: "✅", label: "Satisfaction Guaranteed" },
    ],
    includes: [],
    ...data,
  };
  state.services.unshift(service);
  save();
  const provider = state.providers[providerId];
  logActivity("service", `${provider?.name || "A provider"} added a new service: ${service.name}`);
  return service;
}

function updateProviderService(providerId, serviceId, patch) {
  const service = state.services.find((s) => s.id === serviceId && s.providerId === providerId);
  if (!service) return undefined;
  Object.assign(service, patch);
  save();
  return service;
}

function updateServiceStatus(serviceId, status) {
  const service = state.services.find((s) => s.id === serviceId);
  if (!service) return undefined;
  service.status = status;
  save();
  logActivity("service", `Service "${service.name}" set to ${status} by admin`);
  return service;
}

function setProviderVerification(providerId, status) {
  const provider = state.providers[providerId];
  if (!provider) return undefined;
  provider.verificationStatus = status;
  if (status === "approved") provider.verified = true;
  save();
  logActivity("provider", `Provider ${status}: ${provider.name} (${provider.category})`);
  return provider;
}

function getEarnings(providerId) {
  const completed = state.bookings.filter((b) => b.providerId === providerId && b.status === "Completed");
  const inProgress = state.bookings.filter((b) => b.providerId === providerId && b.status === "In Progress");
  const total = completed.reduce((sum, b) => sum + b.amount, 0);
  const inProgressTotal = inProgress.reduce((sum, b) => sum + b.amount, 0);
  const platformFeePct = 10;
  const platformFeeAmt = Math.round(total * (platformFeePct / 100));
  const transactions = [...completed]
    .sort((a, b) => new Date(b.statusHistory.Completed || b.createdAt) - new Date(a.statusHistory.Completed || a.createdAt))
    .map((b) => {
      const service = getService(b.serviceId);
      return {
        id: b.id,
        service: service?.name || "Service",
        icon: service?.icon || "🛠️",
        categoryId: service?.categoryId,
        date: b.statusHistory.Completed || b.createdAt,
        amount: b.amount,
        status: "Completed",
      };
    });
  return {
    thisMonth: total,
    changePct: 12,
    breakdown: {
      completedJobs: total,
      inProgressJobs: inProgressTotal,
      cancelledJobs: 0,
      platformFeePct,
      platformFeeAmt,
    },
    transactions,
  };
}

function getAdminOverview() {
  const providers = Object.values(state.providers);
  const bookings = state.bookings;
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
    completed: bookings.filter(
      (b) => b.status === "Completed" && (b.statusHistory.Completed || "").slice(0, 10) === day
    ).length,
  }));

  const recentBookings = [...bookings]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6)
    .map(enrichBooking);

  const verification = {
    pending: providers.filter((p) => p.verificationStatus === "pending").length,
    approved: providers.filter((p) => p.verificationStatus === "approved").length,
    rejected: providers.filter((p) => p.verificationStatus === "rejected").length,
  };

  const topServices = [...state.services]
    .map((s) => {
      const serviceBookings = bookings.filter((b) => b.serviceId === s.id);
      const revenue = serviceBookings
        .filter((b) => b.status === "Completed")
        .reduce((sum, b) => sum + b.amount, 0);
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        categoryId: s.categoryId,
        providerName: state.providers[s.providerId]?.name,
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
      totalUsers: 1,
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
      activeServices: state.services.filter((s) => s.status === "active").length,
      totalCategories: state.categories.length,
      totalReviews,
      totalProviders: providers.length,
    },
  };
}

const PLATFORM_FEE_PCT = 10;

function getTransactions() {
  return state.bookings
    .filter((b) => b.status === "Completed")
    .map((b) => {
      const service = getService(b.serviceId);
      const provider = state.providers[b.providerId];
      const platformFee = Math.round(b.amount * (PLATFORM_FEE_PCT / 100));
      return {
        id: b.id,
        service: service?.name,
        categoryId: service?.categoryId,
        providerId: b.providerId,
        providerName: provider?.name,
        customerName: state.customer.name,
        amount: b.amount,
        platformFee,
        payout: b.amount - platformFee,
        date: b.statusHistory?.Completed || b.createdAt,
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getAdminReports() {
  const completed = state.bookings.filter((b) => b.status === "Completed");

  const byCategory = {};
  completed.forEach((b) => {
    const service = getService(b.serviceId);
    const catId = service?.categoryId || "other";
    byCategory[catId] = (byCategory[catId] || 0) + b.amount;
  });
  const revenueByCategory = Object.entries(byCategory)
    .map(([categoryId, revenue]) => ({
      categoryId,
      categoryName: state.categories.find((c) => c.id === categoryId)?.name || categoryId,
      revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const statusCounts = {};
  state.bookings.forEach((b) => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });
  const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  const providerLeaderboard = Object.values(state.providers)
    .map((p) => {
      const providerBookings = state.bookings.filter((b) => b.providerId === p.id);
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
  getCustomer,
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
  addMessage,
  addReview,
  addProviderService,
  updateProviderService,
  updateServiceStatus,
  setProviderVerification,
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
