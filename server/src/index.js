require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const store = require("./store");
const auth = require("./auth");
const { sendOtpViaWhatsApp } = require("./whatsapp");
const liveLocation = require("./liveLocation");

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
  setTimeout(async () => {
    try {
      const provider = await store.getProvider(booking.providerId);
      if (!provider || provider.live) return;

      const updated = await store.updateBookingStatus(booking.id, "Accepted");
      if (!updated) return;
      io.emit("booking:updated", updated);

      const message = await store.addMessage(booking.id, "provider", CANNED_ACCEPT);
      io.emit("message:created", { bookingId: booking.id, message });
    } catch (e) {
      console.error("simulateProviderIfNeeded failed:", e);
    }
  }, AUTO_ACCEPT_DELAY);
}

// A "live" provider (a real Provider App instance, not a simulated demo one)
// gets 90 seconds to accept a booking before it's automatically handed to
// another active provider in the same category — same idea as ride-hailing
// dispatch, so a customer never gets stuck waiting on one unresponsive provider.
const RING_TIMEOUT_MS = 90 * 1000;

async function dispatchBooking(booking, triedProviderIds = [booking.providerId]) {
  const provider = await store.getProvider(booking.providerId);
  if (!provider || !provider.live) {
    simulateProviderIfNeeded(booking);
    return;
  }
  setTimeout(async () => {
    try {
      const current = await store.getBooking(booking.id);
      if (!current || current.status !== "Pending") return; // already accepted/rejected/cancelled
      const result = await store.reassignBooking(booking.id, triedProviderIds);
      io.emit("booking:updated", result.booking);
      io.emit("activity:created", (await store.listActivities(1))[0]);
      if (result.reassigned) {
        io.emit("booking:created", result.booking);
        await dispatchBooking(result.booking, [...triedProviderIds, result.booking.providerId]);
      }
    } catch (e) {
      console.error("dispatchBooking timeout failed:", e);
    }
  }, RING_TIMEOUT_MS);
}

function simulateReplyIfNeeded(bookingId, from) {
  if (from !== "user") return;
  setTimeout(async () => {
    try {
      const booking = await store.getBooking(bookingId);
      if (!booking) return;
      const provider = await store.getProvider(booking.providerId);
      if (!provider || provider.live) return;

      const message = await store.addMessage(bookingId, "provider", CANNED_REPLY);
      io.emit("message:created", { bookingId, message });
    } catch (e) {
      console.error("simulateReplyIfNeeded failed:", e);
    }
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

app.post("/api/auth/otp/verify", ah(async (req, res) => {
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
    const customer = (await store.getCustomerByPhone(phone)) || (await store.createCustomer({ phone, name }));
    const token = auth.signToken({ id: customer.id, role: "customer", phone });
    return res.json({ token, user: customer });
  }

  const provider = (await store.getProviderByPhone(phone)) || (await store.createProviderSignup({ phone, name }));
  const token = auth.signToken({ id: provider.id, role: "provider", phone });
  res.json({ token, user: provider });
}));

app.get("/api/auth/me", auth.requireAuth(), ah(async (req, res) => {
  if (req.user.role === "customer") {
    const customer = await store.getCustomerById(req.user.id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    return res.json({ role: "customer", user: customer });
  }
  if (req.user.role === "provider") {
    const provider = await store.getProvider(req.user.id);
    if (!provider) return res.status(404).json({ error: "Not found" });
    return res.json({ role: "provider", user: provider });
  }
  res.json({ role: "admin", user: { id: req.user.id, phone: req.user.phone, name: "Admin" } });
}));

// ---- bootstrap (public catalog only — per-user data comes from auth) ----
app.get("/api/bootstrap", ah(async (req, res) => {
  const [providers, categories, services] = await Promise.all([
    store.listProviders(),
    store.listCategories(),
    store.listServices({ activeOnly: true }),
  ]);
  res.json({ providers, categories, services });
}));

// ---- providers ----
app.get("/api/providers", ah(async (req, res) => res.json(await store.listProviders())));

app.get("/api/providers/:id", ah(async (req, res) => {
  const provider = await store.getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  res.json(provider);
}));

app.get("/api/providers/:id/services", ah(async (req, res) => {
  res.json(await store.listProviderServices(req.params.id));
}));

app.post("/api/providers/:id/services", auth.requireAuth("provider"), ah(async (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Not your provider account" });
  if (!req.body || !req.body.name || req.body.price == null) {
    return res.status(400).json({ error: "name and price are required" });
  }
  const service = await store.addProviderService(req.params.id, req.body);
  io.emit("service:created", service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.status(201).json(service);
}));

app.patch("/api/providers/:id/profile", auth.requireAuth("provider"), ah(async (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Not your provider account" });
  const provider = await store.updateProviderProfile(req.params.id, req.body || {});
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:updated", provider);
  res.json(provider);
}));

app.patch("/api/providers/:id/verification", auth.requireAuth("admin"), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be one of pending, approved, rejected" });
  }
  const provider = await store.setProviderVerification(req.params.id, status);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:updated", provider);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(provider);
}));

app.patch("/api/providers/:id/services/:serviceId", auth.requireAuth("provider"), ah(async (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Not your provider account" });
  const service = await store.updateProviderService(req.params.id, req.params.serviceId, req.body || {});
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  res.json(service);
}));

app.get("/api/providers/:id/earnings", auth.requireAuth("provider", "admin"), ah(async (req, res) => {
  if (req.user.role === "provider" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Not your earnings" });
  }
  res.json(await store.getEarnings(req.params.id));
}));

app.get("/api/providers/:id/reviews", ah(async (req, res) => {
  res.json(await store.getProviderReviews(req.params.id));
}));

// ---- categories ----
app.get("/api/categories", ah(async (req, res) => res.json(await store.listCategories())));

// ---- services (catalog) ----
app.get("/api/services", ah(async (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  res.json(await store.listServices({ activeOnly }));
}));

app.get("/api/services/:id", ah(async (req, res) => {
  const service = await store.getService(req.params.id);
  if (!service) return res.status(404).json({ error: "Service not found" });
  res.json(service);
}));

app.patch("/api/services/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!["active", "inactive"].includes(status)) {
    return res.status(400).json({ error: "status must be one of active, inactive" });
  }
  const service = await store.updateServiceStatus(req.params.id, status);
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(service);
}));

// ---- bookings ----
app.get("/api/bookings", auth.requireAuth(), ah(async (req, res) => {
  if (req.user.role === "admin") return res.json(await store.listBookings({}));
  if (req.user.role === "customer") return res.json(await store.listBookings({ customerId: req.user.id }));
  res.json(await store.listBookings({ providerId: req.user.id }));
}));

app.get("/api/bookings/:id", auth.requireAuth(), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "customer" && booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "provider" && booking.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  res.json(booking);
}));

app.post("/api/bookings", auth.requireAuth("customer"), ah(async (req, res) => {
  const booking = await store.createBooking({ ...req.body, customerId: req.user.id });
  io.emit("booking:created", booking);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  dispatchBooking(booking);
  res.status(201).json(booking);
}));

// A cart checkout: creates one booking per line item, all sharing an orderId.
app.post("/api/orders", auth.requireAuth("customer"), ah(async (req, res) => {
  const bookings = await store.createOrder({ ...req.body, customerId: req.user.id });
  bookings.forEach((b) => {
    io.emit("booking:created", b);
    dispatchBooking(b);
  });
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.status(201).json(bookings);
}));

app.patch("/api/bookings/:id", auth.requireAuth(), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status is required" });
  const existing = await store.getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "provider" && existing.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "customer") {
    if (existing.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
    if (status !== "Cancelled") return res.status(403).json({ error: "Customers can only cancel bookings" });
  }
  // A provider declining doesn't fail the booking outright — try handing it
  // to another provider in the same category first, same as a ring timeout.
  if (req.user.role === "provider" && status === "Rejected" && existing.status === "Pending") {
    const result = await store.reassignBooking(req.params.id, [req.user.id]);
    io.emit("booking:updated", result.booking);
    io.emit("activity:created", (await store.listActivities(1))[0]);
    if (result.reassigned) {
      io.emit("booking:created", result.booking);
      dispatchBooking(result.booking, [req.user.id, result.booking.providerId]);
    }
    return res.json(result.booking);
  }

  const booking = await store.updateBookingStatus(req.params.id, status);
  io.emit("booking:updated", booking);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(booking);
}));

app.post("/api/bookings/:id/review", auth.requireAuth("customer"), ah(async (req, res) => {
  const { rating, text } = req.body || {};
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be a number between 1 and 5" });
  }
  const existing = await store.getBooking(req.params.id);
  if (!existing) return res.status(404).json({ error: "Booking not found" });
  if (existing.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const result = await store.addReview(req.params.id, rating, text);
  io.emit("booking:updated", result.booking);
  if (result.provider) io.emit("provider:updated", result.provider);
  if (result.service) io.emit("service:updated", result.service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(result.booking);
}));

// ---- live location (self-reported every ~30s by the customer/provider apps
// while a booking is active, so "Get Directions" can target where someone
// actually is instead of the address captured at booking time) ----
app.post("/api/location", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng (numbers) are required" });
  }
  res.json(liveLocation.setLocation(req.user.role, req.user.id, lat, lng));
}));

// Scoped to a specific booking (not a free lookup by id) so a provider can
// only ever see the location of their own booking's customer, and vice versa.
app.get("/api/bookings/:id/live-location", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "customer" && booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "provider" && booking.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  const counterpart = req.user.role === "provider"
    ? { role: "customer", id: booking.customerId }
    : { role: "provider", id: booking.providerId };
  const entry = liveLocation.getLocation(counterpart.role, counterpart.id);
  if (!entry) return res.status(404).json({ error: "Live location not available yet" });
  res.json(entry);
}));

// ---- messages ----
app.get("/api/messages/:bookingId", auth.requireAuth(), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (req.user.role === "customer" && booking.customerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  if (req.user.role === "provider" && booking.providerId !== req.user.id) {
    return res.status(403).json({ error: "Not your booking" });
  }
  res.json(await store.getMessages(req.params.bookingId));
}));

app.post("/api/messages/:bookingId", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text required" });
  const booking = await store.getBooking(req.params.bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const from = req.user.role === "provider" ? "provider" : "user";
  if (from === "provider" && booking.providerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  if (from === "user" && booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const message = await store.addMessage(req.params.bookingId, from, text.trim());
  io.emit("message:created", { bookingId: req.params.bookingId, message });
  simulateReplyIfNeeded(req.params.bookingId, from);
  res.status(201).json(message);
}));

// ---- notifications ----
app.get("/api/notifications", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  res.json(await store.listNotifications(req.user.role, req.user.id));
}));

app.patch("/api/notifications/:id/read", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const notification = await store.markNotificationRead(req.params.id);
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json(notification);
}));

app.post("/api/notifications/read-all", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  res.json(await store.markAllNotificationsRead(req.user.role, req.user.id));
}));

// ---- activities & admin ----
app.get("/api/activities", auth.requireAuth("admin"), ah(async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  res.json(await store.listActivities(limit));
}));

app.get("/api/admin/overview", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.getAdminOverview());
}));

app.get("/api/admin/transactions", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.getTransactions());
}));

app.get("/api/admin/reports", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.getAdminReports());
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
