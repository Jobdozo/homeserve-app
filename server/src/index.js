const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const store = require("./store");
const auth = require("./auth");
const { sendOtpViaWhatsApp } = require("./whatsapp");

const PORT = process.env.PORT || 4000;

const DEFAULT_DEV_ORIGINS = ["http://localhost:5174", "http://localhost:5175", "http://localhost:5177"];
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : DEFAULT_DEV_ORIGINS;

if (!process.env.ALLOWED_ORIGINS) {
  console.warn(
    "ALLOWED_ORIGINS not set — defaulting to local dev origins. Set ALLOWED_ORIGINS (comma-separated) in production."
  );
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS } });

io.on("connection", (socket) => {
  socket.on("disconnect", () => {});
});

store.onNotification((notification) => {
  io.emit("notification:created", notification);
});

const AUTO_ACCEPT_DELAY = 3500;
const AUTO_REPLY_DELAY = 1600;
const CANNED_ACCEPT = "Hi, I have accepted your request. I will reach your location on time.";
const CANNED_REPLY = "Got it, thank you for letting me know!";

function simulateProviderIfNeeded(booking) {
  const provider = store.getProvider(booking.providerId);
  if (!provider || provider.live) return;

  setTimeout(() => {
    const updated = store.updateBookingStatus(booking.id, "Accepted");
    if (!updated) return;
    io.emit("booking:updated", updated);

    const message = store.addMessage(booking.id, "provider", CANNED_ACCEPT);
    io.emit("message:created", { bookingId: booking.id, message });
  }, AUTO_ACCEPT_DELAY);
}

function simulateReplyIfNeeded(bookingId, from) {
  if (from !== "user") return;
  const booking = store.getBooking(bookingId);
  if (!booking) return;
  const provider = store.getProvider(booking.providerId);
  if (!provider || provider.live) return;

  setTimeout(() => {
    const message = store.addMessage(bookingId, "provider", CANNED_REPLY);
    io.emit("message:created", { bookingId, message });
  }, AUTO_REPLY_DELAY);
}

// Wraps a route handler so thrown errors and rejected promises reach the
// global error handler instead of crashing the process or hanging the request.
function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ---- auth (WhatsApp OTP login/signup) ----
const OTP_ROLES = ["customer", "provider", "admin"];

app.post("/api/auth/otp/request", ah(async (req, res) => {
  const { phone, role } = req.body || {};
  if (!phone || !OTP_ROLES.includes(role)) {
    return res.status(400).json({ error: "phone and a valid role are required" });
  }
  if (role === "admin" && !auth.isAdminPhone(phone)) {
    return res.status(403).json({ error: "This number is not registered as an admin" });
  }
  const code = auth.requestOtp(role, phone);
  const delivered = await sendOtpViaWhatsApp(phone, code);
  // Only echo the code back when it wasn't actually delivered (no provider
  // configured, or the send failed) — otherwise it stays WhatsApp-only.
  res.json({ sent: true, ...(delivered ? {} : { devOtp: code }) });
}));

app.post("/api/auth/otp/verify", ah((req, res) => {
  const { phone, code, role, name } = req.body || {};
  if (!phone || !code || !OTP_ROLES.includes(role)) {
    return res.status(400).json({ error: "phone, code and a valid role are required" });
  }
  const result = auth.verifyOtp(role, phone, code);
  if (!result.ok) return res.status(400).json({ error: result.error });

  if (role === "admin") {
    if (!auth.isAdminPhone(phone)) return res.status(403).json({ error: "This number is not registered as an admin" });
    const id = `admin:${auth.normalizePhone(phone)}`;
    const token = auth.signToken({ id, role: "admin", phone });
    return res.json({ token, user: { id, phone, name: "Admin" } });
  }

  if (role === "customer") {
    const customer = store.getCustomerByPhone(phone) || store.createCustomer({ phone, name });
    const token = auth.signToken({ id: customer.id, role: "customer", phone });
    return res.json({ token, user: customer });
  }

  const provider = store.getProviderByPhone(phone) || store.createProviderSignup({ phone, name });
  const token = auth.signToken({ id: provider.id, role: "provider", phone });
  res.json({ token, user: provider });
}));

app.get("/api/auth/me", auth.requireAuth(), ah((req, res) => {
  if (req.user.role === "customer") {
    const customer = store.getCustomerById(req.user.id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    return res.json({ role: "customer", user: customer });
  }
  if (req.user.role === "provider") {
    const provider = store.getProvider(req.user.id);
    if (!provider) return res.status(404).json({ error: "Not found" });
    return res.json({ role: "provider", user: provider });
  }
  res.json({ role: "admin", user: { id: req.user.id, phone: req.user.phone, name: "Admin" } });
}));

// ---- bootstrap (public catalog only — per-user data comes from auth) ----
app.get("/api/bootstrap", ah((req, res) => {
  res.json({
    providers: store.listProviders(),
    categories: store.listCategories(),
    services: store.listServices({ activeOnly: true }),
  });
}));

// ---- providers ----
app.get("/api/providers", ah((req, res) => res.json(store.listProviders())));

app.get("/api/providers/:id", ah((req, res) => {
  const provider = store.getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  res.json(provider);
}));

app.get("/api/providers/:id/services", ah((req, res) => {
  res.json(store.listProviderServices(req.params.id));
}));

app.post("/api/providers/:id/services", auth.requireAuth("provider"), ah((req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Not your provider account" });
  if (!req.body || !req.body.name || req.body.price == null) {
    return res.status(400).json({ error: "name and price are required" });
  }
  const service = store.addProviderService(req.params.id, req.body);
  io.emit("service:created", service);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.status(201).json(service);
}));

app.patch("/api/providers/:id/verification", auth.requireAuth("admin"), ah((req, res) => {
  const { status } = req.body || {};
  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be one of pending, approved, rejected" });
  }
  const provider = store.setProviderVerification(req.params.id, status);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:updated", provider);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.json(provider);
}));

app.patch("/api/providers/:id/services/:serviceId", auth.requireAuth("provider"), ah((req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Not your provider account" });
  const service = store.updateProviderService(req.params.id, req.params.serviceId, req.body || {});
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  res.json(service);
}));

app.get("/api/providers/:id/earnings", auth.requireAuth("provider", "admin"), ah((req, res) => {
  if (req.user.role === "provider" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Not your earnings" });
  }
  res.json(store.getEarnings(req.params.id));
}));

app.get("/api/providers/:id/reviews", ah((req, res) => {
  res.json(store.getProviderReviews(req.params.id));
}));

// ---- categories ----
app.get("/api/categories", ah((req, res) => res.json(store.listCategories())));

// ---- services (catalog) ----
app.get("/api/services", ah((req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  res.json(store.listServices({ activeOnly }));
}));

app.get("/api/services/:id", ah((req, res) => {
  const service = store.getService(req.params.id);
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json(service);
}));

app.patch("/api/services/:id", auth.requireAuth("admin"), ah((req, res) => {
  const { status } = req.body || {};
  if (!["active", "inactive"].includes(status)) {
    return res.status(400).json({ error: "status must be one of active, inactive" });
  }
  const service = store.updateServiceStatus(req.params.id, status);
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.json(service);
}));

// ---- bookings ----
app.get("/api/bookings", auth.requireAuth(), ah((req, res) => {
  if (req.user.role === "admin") return res.json(store.listBookings({}));
  if (req.user.role === "customer") return res.json(store.listBookings({ customerId: req.user.id }));
  res.json(store.listBookings({ providerId: req.user.id }));
}));

app.get("/api/bookings/:id", auth.requireAuth(), ah((req, res) => {
  const booking = store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "customer" && booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "provider" && booking.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  res.json(booking);
}));

app.post("/api/bookings", auth.requireAuth("customer"), ah((req, res) => {
  const booking = store.createBooking({ ...req.body, customerId: req.user.id });
  io.emit("booking:created", booking);
  io.emit("activity:created", store.listActivities(1)[0]);
  simulateProviderIfNeeded(booking);
  res.status(201).json(booking);
}));

// A cart checkout: creates one booking per line item, all sharing an orderId.
app.post("/api/orders", auth.requireAuth("customer"), ah((req, res) => {
  const bookings = store.createOrder({ ...req.body, customerId: req.user.id });
  bookings.forEach((b) => {
    io.emit("booking:created", b);
    simulateProviderIfNeeded(b);
  });
  io.emit("activity:created", store.listActivities(1)[0]);
  res.status(201).json(bookings);
}));

app.patch("/api/bookings/:id", auth.requireAuth(), ah((req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status is required" });
  const existing = store.getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "provider" && existing.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "customer") {
    if (existing.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
    if (status !== "Cancelled") return res.status(403).json({ error: "Customers can only cancel bookings" });
  }
  const booking = store.updateBookingStatus(req.params.id, status);
  io.emit("booking:updated", booking);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.json(booking);
}));

app.post("/api/bookings/:id/review", auth.requireAuth("customer"), ah((req, res) => {
  const { rating, text } = req.body || {};
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be a number between 1 and 5" });
  }
  const existing = store.getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found" });
  if (existing.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const result = store.addReview(req.params.id, rating, text);
  io.emit("booking:updated", result.booking);
  if (result.provider) io.emit("provider:updated", result.provider);
  if (result.service) io.emit("service:updated", result.service);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.json(result.booking);
}));

// ---- messages ----
app.get("/api/messages/:bookingId", auth.requireAuth(), ah((req, res) => {
  const booking = store.getBooking(req.params.bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "customer" && booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "provider" && booking.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  res.json(store.getMessages(req.params.bookingId));
}));

app.post("/api/messages/:bookingId", auth.requireAuth("customer", "provider"), ah((req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text required" });
  const booking = store.getBooking(req.params.bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const from = req.user.role === "provider" ? "provider" : "user";
  if (from === "provider" && booking.providerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  if (from === "user" && booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const message = store.addMessage(req.params.bookingId, from, text.trim());
  io.emit("message:created", { bookingId: req.params.bookingId, message });
  simulateReplyIfNeeded(req.params.bookingId, from);
  res.status(201).json(message);
}));

// ---- notifications ----
app.get("/api/notifications", auth.requireAuth("customer", "provider"), ah((req, res) => {
  res.json(store.listNotifications(req.user.role, req.user.id));
}));

app.patch("/api/notifications/:id/read", auth.requireAuth("customer", "provider"), ah((req, res) => {
  const notification = store.markNotificationRead(req.params.id);
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json(notification);
}));

app.post("/api/notifications/read-all", auth.requireAuth("customer", "provider"), ah((req, res) => {
  res.json(store.markAllNotificationsRead(req.user.role, req.user.id));
}));

// ---- activities & admin ----
app.get("/api/activities", auth.requireAuth("admin"), ah((req, res) => {
  const limit = Number(req.query.limit) || 20;
  res.json(store.listActivities(limit));
}));

app.get("/api/admin/overview", auth.requireAuth("admin"), ah((req, res) => {
  res.json(store.getAdminOverview());
}));

app.get("/api/admin/transactions", auth.requireAuth("admin"), ah((req, res) => {
  res.json(store.getTransactions());
}));

app.get("/api/admin/reports", auth.requireAuth("admin"), ah((req, res) => {
  res.json(store.getAdminReports());
}));

// ---- 404 + global error handler ----
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (["Unknown service", "Unknown customer"].includes(err.message) ? 400 : 500);
  res.status(status).json({ error: err.message || "Internal server error" });
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

server.listen(PORT, () => {
  console.log(`Tikdum API + realtime server listening on http://localhost:${PORT}`);
});
