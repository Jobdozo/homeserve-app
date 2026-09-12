const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const store = require("./store");

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

// ---- bootstrap ----
app.get("/api/bootstrap", ah((req, res) => {
  res.json({
    customer: store.getCustomer(),
    providers: store.listProviders(),
    categories: store.listCategories(),
    services: store.listServices({ activeOnly: true }),
  });
}));

// ---- customer ----
app.get("/api/customer", ah((req, res) => res.json(store.getCustomer())));

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

app.post("/api/providers/:id/services", ah((req, res) => {
  if (!req.body || !req.body.name || req.body.price == null) {
    return res.status(400).json({ error: "name and price are required" });
  }
  const service = store.addProviderService(req.params.id, req.body);
  io.emit("service:created", service);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.status(201).json(service);
}));

app.patch("/api/providers/:id/verification", ah((req, res) => {
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

app.patch("/api/providers/:id/services/:serviceId", ah((req, res) => {
  const service = store.updateProviderService(req.params.id, req.params.serviceId, req.body || {});
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  res.json(service);
}));

app.get("/api/providers/:id/earnings", ah((req, res) => {
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

app.patch("/api/services/:id", ah((req, res) => {
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
app.get("/api/bookings", ah((req, res) => {
  const { customerId, providerId } = req.query;
  res.json(store.listBookings({ customerId, providerId }));
}));

app.get("/api/bookings/:id", ah((req, res) => {
  const booking = store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json(booking);
}));

app.post("/api/bookings", ah((req, res) => {
  const booking = store.createBooking(req.body || {});
  io.emit("booking:created", booking);
  io.emit("activity:created", store.listActivities(1)[0]);
  simulateProviderIfNeeded(booking);
  res.status(201).json(booking);
}));

// A cart checkout: creates one booking per line item, all sharing an orderId.
app.post("/api/orders", ah((req, res) => {
  const bookings = store.createOrder(req.body || {});
  bookings.forEach((b) => {
    io.emit("booking:created", b);
    simulateProviderIfNeeded(b);
  });
  io.emit("activity:created", store.listActivities(1)[0]);
  res.status(201).json(bookings);
}));

app.patch("/api/bookings/:id", ah((req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status is required" });
  const booking = store.updateBookingStatus(req.params.id, status);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  io.emit("booking:updated", booking);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.json(booking);
}));

app.post("/api/bookings/:id/review", ah((req, res) => {
  const { rating, text } = req.body || {};
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be a number between 1 and 5" });
  }
  const result = store.addReview(req.params.id, rating, text);
  if (!result) return res.status(404).json({ error: "Booking not found" });
  io.emit("booking:updated", result.booking);
  if (result.provider) io.emit("provider:updated", result.provider);
  if (result.service) io.emit("service:updated", result.service);
  io.emit("activity:created", store.listActivities(1)[0]);
  res.json(result.booking);
}));

// ---- messages ----
app.get("/api/messages/:bookingId", ah((req, res) => {
  res.json(store.getMessages(req.params.bookingId));
}));

app.post("/api/messages/:bookingId", ah((req, res) => {
  const { from, text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text required" });
  if (!["user", "provider"].includes(from)) return res.status(400).json({ error: "from must be user or provider" });
  const message = store.addMessage(req.params.bookingId, from, text.trim());
  io.emit("message:created", { bookingId: req.params.bookingId, message });
  simulateReplyIfNeeded(req.params.bookingId, from);
  res.status(201).json(message);
}));

// ---- notifications ----
app.get("/api/notifications", ah((req, res) => {
  const { recipientType, recipientId } = req.query;
  if (!recipientType || !recipientId) return res.status(400).json({ error: "recipientType and recipientId required" });
  res.json(store.listNotifications(recipientType, recipientId));
}));

app.patch("/api/notifications/:id/read", ah((req, res) => {
  const notification = store.markNotificationRead(req.params.id);
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json(notification);
}));

app.post("/api/notifications/read-all", ah((req, res) => {
  const { recipientType, recipientId } = req.body || {};
  if (!recipientType || !recipientId) return res.status(400).json({ error: "recipientType and recipientId required" });
  res.json(store.markAllNotificationsRead(recipientType, recipientId));
}));

// ---- activities & admin ----
app.get("/api/activities", ah((req, res) => {
  const limit = Number(req.query.limit) || 20;
  res.json(store.listActivities(limit));
}));

app.get("/api/admin/overview", ah((req, res) => {
  res.json(store.getAdminOverview());
}));

app.get("/api/admin/transactions", ah((req, res) => {
  res.json(store.getTransactions());
}));

app.get("/api/admin/reports", ah((req, res) => {
  res.json(store.getAdminReports());
}));

// ---- 404 + global error handler ----
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.message === "Unknown service" ? 400 : 500);
  res.status(status).json({ error: err.message || "Internal server error" });
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

server.listen(PORT, () => {
  console.log(`HomeServe API + realtime server listening on http://localhost:${PORT}`);
});
