require("dotenv").config({ override: true });
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const compression = require("compression");
const http = require("http");
const { Server } = require("socket.io");
const store = require("./store");
const monitoring = require("./monitoring");
const csvImport = require("./csvImport");
const auth = require("./auth");
const { sendOtpViaWhatsApp } = require("./whatsapp");
const liveLocation = require("./liveLocation");
const push = require("./push");
const fcm = require("./fcm");
const { upload, UPLOADS_DIR } = require("./uploads");

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
app.use(compression());
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));

// Every authenticated provider request doubles as a presence heartbeat for
// Live Service Provider Monitoring (the app polls every ~30s while open).
app.use((req, res, next) => {
  const user = optionalUser(req);
  if (user?.role === "provider") monitoring.touchProvider(user.id);
  next();
});

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
      io.emit("booking:updated", maskCompleted(updated));

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
  // The socket event only reaches a provider whose app is open right now —
  // the push notification is what actually wakes a backgrounded/closed app,
  // so it has to fire here too, not just rely on io.emit.
  push
    .sendPush("provider", provider.id, {
      title: "New booking request",
      body: `${booking.service?.name || "A service"} request nearby`,
      bookingId: booking.id,
      type: "booking:created",
    })
    .catch((e) => console.error("push send failed", e));
  // Separate channel, separate failure mode: FCM is what lets the native
  // provider app ring like an incoming call (see TikdumMessagingService) —
  // web push alone can't do that even when it's delivered successfully.
  fcm
    .sendToDevices("provider", provider.id, {
      title: "New booking request",
      body: `${booking.service?.name || "A service"} request nearby`,
      bookingId: booking.id,
      type: "booking:created",
    })
    .catch((e) => console.error("fcm send failed", e));
  setTimeout(async () => {
    try {
      const current = await store.getBooking(booking.id);
      if (!current || current.status !== "Pending") return; // already accepted/rejected/cancelled
      const result = await store.reassignBooking(booking.id, triedProviderIds);
      io.emit("booking:updated", maskCompleted(result.booking));
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
// Once an order is Completed the provider may no longer contact the customer,
// so the customer's phone/email are stripped from any completed booking that
// leaves the server (REST responses and the shared socket broadcast) — the
// number simply isn't there to call, not just hidden in the UI.
function maskCompleted(booking) {
  if (!booking || booking.status !== "Completed" || !booking.customer) return booking;
  return hideCompletedChat({ ...booking, customer: { ...booking.customer, phone: null, email: null } });
}

// A completed order's conversation is closed to the customer and provider, so
// its preview text is dropped from their booking lists too (admins keep it,
// for dispute handling).
function hideCompletedChat(booking) {
  if (!booking || booking.status !== "Completed" || !booking.lastMessage) return booking;
  const { lastMessage, ...rest } = booking;
  return rest;
}

// After an order swap, the previous provider's conversation isn't carried
// over: drop the list preview if it predates the latest swap.
function dropStaleLastMessage(booking, cutoffs) {
  const cutoff = cutoffs.get(booking.id);
  if (!cutoff || !booking.lastMessage || new Date(booking.lastMessage.time) >= new Date(cutoff)) return booking;
  const { lastMessage, ...rest } = booking;
  return rest;
}

// A provider's phone/email are never part of the public catalog: customers
// get a provider's number only through their own booking (see
// /api/bookings/:id/provider-contact), and only while the order is live —
// so it can't be used to call them after the order is Completed.
function publicProvider(provider) {
  if (!provider) return provider;
  const { phone, email, ...rest } = provider;
  return rest;
}

function optionalUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return (token && auth.verifyToken(token)) || null;
}

// Admin ids look like "admin:<phone>"; that's what the change log records.
const actorOf = (req) => String(req.user?.id || "admin").replace(/^admin:/, "");

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

// One-time production cleanup — see store.removeSeedData for exactly what
// it matches. Safe to call more than once; a second call deletes nothing.
app.post("/api/admin/remove-seed-data", auth.requireAuth("admin"), ah(async (req, res) => {
  const result = await store.removeSeedData();
  res.json(result);
}));

app.post("/api/provider/agreement/accept", auth.requireAuth("provider"), ah(async (req, res) => {
  store.acceptProviderAgreement(req.user.id, { ip: req.ip, userAgent: req.headers["user-agent"] });
  const provider = await store.getProvider(req.user.id);
  io.emit("provider:updated", publicProvider(provider));
  res.status(201).json(provider);
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
  const pincode = typeof req.query.pincode === "string" ? req.query.pincode.trim() : undefined;
  const [providers, categories, services] = await Promise.all([
    store.listProviders(),
    store.listCategories(),
    store.listServices({ activeOnly: true, pincode }),
  ]);
  res.json({ providers: providers.map(publicProvider), categories: categories.filter((c) => c.active), services });
}));

// ---- customer's registered address (drives PIN-code catalog visibility) ----
app.get("/api/customer/address", auth.requireAuth("customer"), ah(async (req, res) => {
  res.json(store.getCustomerAddress(req.user.id));
}));

app.put("/api/customer/address", auth.requireAuth("customer"), ah(async (req, res) => {
  const address = store.saveCustomerAddress(req.user.id, req.body || {});
  res.json(address);
}));

// ---- provider service-area coverage (PIN codes; serveAllAreas is admin-only) ----
app.patch("/api/providers/:id/coverage", auth.requireAuth("provider"), ah(async (req, res) => {
  if (req.params.id !== req.user.id) return res.status(403).json({ error: "Not your profile" });
  const coverage = store.updateProviderCoverage(
    req.params.id,
    { pincodes: req.body?.pincodes, acceptingRequests: req.body?.acceptingRequests },
    { allowServeAllAreas: false }
  );
  res.json(coverage);
}));

app.patch("/api/admin/providers/:id/coverage", auth.requireAuth("admin"), ah(async (req, res) => {
  const coverage = store.updateProviderCoverage(req.params.id, {
    pincodes: req.body?.pincodes,
    serveAllAreas: req.body?.serveAllAreas,
    acceptingRequests: req.body?.acceptingRequests,
  });
  res.json(coverage);
}));

app.get("/api/admin/change-log", auth.requireAuth("admin"), ah(async (req, res) => {
  const { entityType, entityId } = req.query;
  res.json(store.listAdminChanges({ entityType, entityId, limit: Number(req.query.limit) || 200 }));
}));

// ---- CSV import (validates every row and reports errors by line number;
// ?dryRun=1 validates without saving) ----
app.post(
  "/api/admin/import/:module",
  auth.requireAuth("admin"),
  express.text({ type: "text/csv", limit: "3mb" }),
  ah(async (req, res) => {
    const csv = typeof req.body === "string" ? req.body : "";
    if (!csv.trim()) return res.status(400).json({ error: "No CSV data received." });
    const result = await csvImport.run(req.params.module, csv, req.query.dryRun === "1");
    if (result.fatal) return res.status(400).json({ error: result.fatal });
    if (!result.dryRun && result.imported > 0) {
      await store.logActivity("import", `Admin imported ${result.imported} ${result.module} from CSV`);
      io.emit("activity:created", (await store.listActivities(1))[0]);
    }
    res.json(result);
  })
);

// ---- open-request capacity & visibility (Provider Verification module) ----
app.get("/api/admin/provider-capacity", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.getAllProviderCapacities());
}));

app.get("/api/admin/providers/:id/capacity", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.getProviderCapacity(req.params.id));
}));

app.patch("/api/admin/providers/:id/capacity", auth.requireAuth("admin"), ah(async (req, res) => {
  const { maxOpenRequests, overrideHours } = req.body || {};
  res.json(await store.updateProviderCapacity(req.params.id, { maxOpenRequests, overrideHours }));
}));

app.post("/api/admin/providers/:id/warn", auth.requireAuth("admin"), ah(async (req, res) => {
  const sent = await store.sendProviderWarning(req.params.id, req.body?.message);
  if (!sent) return res.status(404).json({ error: "Provider not found" });
  res.json({ sent: true });
}));

app.get("/api/provider/capacity", auth.requireAuth("provider"), ah(async (req, res) => {
  res.json(await store.getProviderCapacity(req.user.id));
}));

// ---- providers ----
app.get("/api/providers", ah(async (req, res) => {
  const providers = await store.listProviders();
  res.json(optionalUser(req)?.role === "admin" ? providers : providers.map(publicProvider));
}));

app.get("/api/providers/:id", ah(async (req, res) => {
  const provider = await store.getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  const viewer = optionalUser(req);
  const fullAccess = viewer && (viewer.role === "admin" || (viewer.role === "provider" && viewer.id === provider.id));
  res.json(fullAccess ? provider : publicProvider(provider));
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
  const existing = await store.getProvider(req.params.id);
  if (!existing) return res.status(404).json({ error: "Provider not found" });
  if (existing.verificationStatus === "approved") {
    return res.status(403).json({ error: "Your account is verified — contact support to change account information" });
  }
  const provider = await store.updateProviderProfile(req.params.id, req.body || {});
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:updated", publicProvider(provider));
  res.json(provider);
}));

app.patch("/api/providers/:id/verification", auth.requireAuth("admin"), ah(async (req, res) => {
  const { status } = req.body || {};
  if (!["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be one of pending, approved, rejected" });
  }
  const provider = await store.setProviderVerification(req.params.id, status);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:updated", publicProvider(provider));
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(provider);
}));

app.delete("/api/admin/providers/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const deleted = await store.deleteProvider(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:deleted", req.params.id);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json({ deleted: true });
}));

app.get("/api/admin/providers/:id/wallet", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.getWallet(req.params.id));
}));

app.post("/api/admin/providers/:id/wallet/recharge", auth.requireAuth("admin"), ah(async (req, res) => {
  const amount = Number(req.body?.amount);
  const wallet = await store.rechargeProviderWallet(req.params.id, amount, req.body?.note);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(wallet);
}));

app.get("/api/provider/wallet", auth.requireAuth("provider"), ah(async (req, res) => {
  const wallet = store.getWallet(req.user.id);
  res.json({ balance: wallet.balance, suspended: wallet.balance <= 0 });
}));

// ---- CPC advertising ----
app.get("/api/provider/ads", auth.requireAuth("provider"), ah(async (req, res) => {
  res.json(await store.listProviderAdsWithStats(req.user.id));
}));

app.post("/api/provider/ads", auth.requireAuth("provider"), ah(async (req, res) => {
  const ad = await store.createAd(req.user.id, req.body?.serviceId);
  res.status(201).json(ad);
}));

app.patch("/api/provider/ads/:id", auth.requireAuth("provider"), ah(async (req, res) => {
  const ad = store.setAdStatus(req.user.id, req.params.id, req.body?.status);
  res.json(ad);
}));

app.post("/api/services/:id/ad-click", auth.requireAuth("customer"), ah(async (req, res) => {
  const result = await store.registerAdClick(req.params.id);
  res.json(result);
}));

app.patch("/api/providers/:id/services/:serviceId", auth.requireAuth("provider"), ah(async (req, res) => {
  if (req.user.id !== req.params.id) return res.status(403).json({ error: "Not your provider account" });
  const result = await store.updateProviderService(req.params.id, req.params.serviceId, req.body || {});
  if (!result) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", result.service);
  if (result.changeRequest) io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json({ ...result.service, changeRequest: result.changeRequest });
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
// Customers and providers only ever see active categories; admins see all
// (each carries an `active` flag).
app.get("/api/categories", ah(async (req, res) => {
  const categories = await store.listCategories();
  res.json(optionalUser(req)?.role === "admin" ? categories : categories.filter((c) => c.active));
}));

app.patch("/api/admin/categories/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const { name, icon, active } = req.body || {};
  const category = await store.updateCategory(req.params.id, { name, icon, active }, actorOf(req));
  if (!category) return res.status(404).json({ error: "Category not found" });
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(category);
}));

app.delete("/api/admin/categories/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const deleted = await store.deleteCategory(req.params.id, actorOf(req));
  if (deleted) store.dropFeeOverride("category", req.params.id);
  if (!deleted) return res.status(404).json({ error: "Category not found" });
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json({ deleted: true });
}));

app.post("/api/admin/categories", auth.requireAuth("admin"), ah(async (req, res) => {
  const { name, icon } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  const existing = await store.listCategories();
  if (existing.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(409).json({ error: "A category with this name already exists" });
  }
  const category = await store.createCategory({ name: name.trim(), icon }, actorOf(req));
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.status(201).json(category);
}));

// ---- admin: onboard a provider directly (skips WhatsApp self-signup) ----
app.post("/api/admin/providers", auth.requireAuth("admin"), ah(async (req, res) => {
  const { name, phone, category } = req.body || {};
  if (!name || !name.trim() || !phone || !phone.trim()) {
    return res.status(400).json({ error: "name and phone are required" });
  }
  const existing = await store.getProviderByPhone(phone);
  if (existing) return res.status(409).json({ error: "A provider with this phone number already exists" });
  const provider = await store.adminCreateProvider({ name: name.trim(), phone: phone.trim(), category });
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.status(201).json(provider);
}));

// ---- admin: add a service on behalf of a provider ----
app.post("/api/admin/services", auth.requireAuth("admin"), ah(async (req, res) => {
  const { providerId, categorySlug, name, price, originalPrice } = req.body || {};
  if (!providerId || !categorySlug || !name || price == null) {
    return res.status(400).json({ error: "providerId, categorySlug, name and price are required" });
  }
  const provider = await store.getProvider(providerId);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  const service = await store.adminCreateService(providerId, { categorySlug, name, price, originalPrice }, actorOf(req));
  io.emit("service:created", service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.status(201).json(service);
}));

// ---- admin: broadcast a notification ----
app.post("/api/admin/notifications/broadcast", auth.requireAuth("admin"), ah(async (req, res) => {
  const { audience, recipientId, title, message } = req.body || {};
  if (!["customers", "providers", "single"].includes(audience) || !title || !message) {
    return res.status(400).json({ error: "audience (customers|providers|single), title and message are required" });
  }
  let recipientIds = [];
  let recipientType;
  if (audience === "customers") {
    recipientType = "customer";
    recipientIds = await store.listCustomerIds();
  } else if (audience === "providers") {
    recipientType = "provider";
    recipientIds = (await store.listProviders()).map((p) => p.id);
  } else {
    if (!recipientId) return res.status(400).json({ error: "recipientId is required for a single recipient" });
    const [type, id] = recipientId.split(":");
    if (!["customer", "provider"].includes(type) || !id) {
      return res.status(400).json({ error: 'recipientId must be formatted as "customer:<id>" or "provider:<id>"' });
    }
    recipientType = type;
    recipientIds = [id];
  }
  for (const id of recipientIds) {
    await store.addNotification({ recipientType, recipientId: id, type: "announcement", title, message });
  }
  await store.logActivity("notification", `Admin broadcast "${title}" to ${recipientIds.length} ${recipientType}(s)`);
  res.status(201).json({ sent: recipientIds.length });
}));

// ---- banners (admin-managed promo carousel on the customer app home screen) ----
app.get("/api/banners", ah(async (req, res) => res.json(store.listActiveBanners())));

app.get("/api/admin/banners", auth.requireAuth("admin"), ah(async (req, res) => res.json(store.listBanners())));

app.post("/api/admin/banners", auth.requireAuth("admin"), ah(async (req, res) => {
  const { title } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });
  try {
    const banner = await store.createBanner({ ...req.body, title: title.trim() });
    res.status(201).json(banner);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

app.patch("/api/admin/banners/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  let banner;
  try {
    banner = store.updateBanner(req.params.id, req.body || {});
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!banner) return res.status(404).json({ error: "Banner not found" });
  res.json(banner);
}));

// Tap tracking for banner click/CPC reporting. Anyone can tap, so the
// counting is deduplicated per customer/device in the store.
app.post("/api/banners/:id/click", ah(async (req, res) => {
  const user = await optionalUser(req);
  res.json(store.registerBannerClick(req.params.id, user?.id || req.ip || "anon"));
}));

// ---- customer home layout (CMS): sections, banners, booking counts ----
app.get("/api/home-layout", ah(async (req, res) => res.json(await store.getHomeLayout())));

app.get("/api/admin/home-sections", auth.requireAuth("admin"), ah(async (req, res) => res.json(store.listHomeSections())));

app.post("/api/admin/home-sections", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    res.status(201).json(store.createHomeSection(req.body || {}, actorOf(req)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}));

app.post("/api/admin/home-sections/reorder", auth.requireAuth("admin"), ah(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  res.json(store.reorderHomeSections(ids));
}));

app.patch("/api/admin/home-sections/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  let section;
  try {
    section = store.updateHomeSection(req.params.id, req.body || {}, actorOf(req));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!section) return res.status(404).json({ error: "Section not found" });
  res.json(section);
}));

app.delete("/api/admin/home-sections/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  if (!store.deleteHomeSection(req.params.id, actorOf(req))) return res.status(404).json({ error: "Section not found" });
  res.status(204).end();
}));

app.delete("/api/admin/banners/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const ok = store.deleteBanner(req.params.id);
  if (!ok) return res.status(404).json({ error: "Banner not found" });
  res.status(204).end();
}));

// ---- offers / discount codes ----
app.post("/api/offers/validate", ah(async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code is required" });
  const result = store.validateOffer(code);
  if (!result.valid) return res.status(400).json({ error: result.error });
  res.json({ code: result.offer.code, discountPercent: result.offer.discountPercent, description: result.offer.description });
}));

app.get("/api/admin/offers", auth.requireAuth("admin"), ah(async (req, res) => res.json(store.listOffers())));

app.post("/api/admin/offers", auth.requireAuth("admin"), ah(async (req, res) => {
  const { code, discountPercent, description, active, expiresAt } = req.body || {};
  if (!code || !code.trim() || !discountPercent) {
    return res.status(400).json({ error: "code and discountPercent are required" });
  }
  const offer = await store.createOffer({ code: code.trim(), discountPercent, description, active, expiresAt });
  res.status(201).json(offer);
}));

app.patch("/api/admin/offers/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const offer = store.updateOffer(req.params.id, req.body || {});
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  res.json(offer);
}));

app.delete("/api/admin/offers/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const ok = store.deleteOffer(req.params.id);
  if (!ok) return res.status(404).json({ error: "Offer not found" });
  res.status(204).end();
}));

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
  const service = await store.updateServiceStatus(req.params.id, status, actorOf(req));
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(service);
}));

// ---- service modification approval ----
app.get("/api/provider/service-changes", auth.requireAuth("provider"), ah(async (req, res) => {
  res.json(store.listServiceChanges({ providerId: req.user.id }));
}));

app.get("/api/admin/service-changes", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.listServiceChanges({ status: req.query.status }));
}));

app.post("/api/admin/service-changes/:id/review", auth.requireAuth("admin"), ah(async (req, res) => {
  const { decision, note, edits } = req.body || {};
  const result = await store.reviewServiceChange(req.params.id, decision, { note, edits }, actorOf(req));
  if (!result) return res.status(404).json({ error: "Change request not found" });
  if (decision === "approved") io.emit("service:updated", await store.getService(result.serviceId));
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(result);
}));

// ---- service approval workflow (admin) ----
app.post("/api/admin/services/:id/review", auth.requireAuth("admin"), ah(async (req, res) => {
  const service = await store.reviewService(req.params.id, req.body?.decision, req.body?.note, actorOf(req));
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(service);
}));

app.patch("/api/admin/services/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const service = await store.adminUpdateService(req.params.id, req.body || {}, actorOf(req));
  if (!service) return res.status(404).json({ error: "Service not found" });
  io.emit("service:updated", service);
  res.json(service);
}));

app.delete("/api/admin/services/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const deleted = await store.adminDeleteService(req.params.id, actorOf(req));
  if (deleted) store.dropFeeOverride("service", req.params.id);
  if (!deleted) return res.status(404).json({ error: "Service not found" });
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json({ deleted: true });
}));

// ---- bookings ----
app.get("/api/bookings", auth.requireAuth(), ah(async (req, res) => {
  if (req.user.role === "admin") return res.json(await store.listBookings({}));
  if (req.user.role === "customer") {
    const cutoffs = store.swapCutoffs();
    return res.json((await store.listBookings({ customerId: req.user.id })).map((b) => dropStaleLastMessage(hideCompletedChat(b), cutoffs)));
  }
  const cutoffs = store.swapCutoffs();
  const own = (await store.listBookings({ providerId: req.user.id })).map((b) => dropStaleLastMessage(maskCompleted(b), cutoffs));
  // Orders this provider handed back stay in their history as "Swapped".
  res.json([...own, ...store.listSwappedOutBookings(req.user.id)]);
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
  const cutoffs = store.swapCutoffs();
  res.json(
    req.user.role === "provider"
      ? dropStaleLastMessage(maskCompleted(booking), cutoffs)
      : req.user.role === "customer"
        ? dropStaleLastMessage(hideCompletedChat(booking), cutoffs)
        : booking
  );
}));

// Provider hands an accepted order back; it goes to another eligible provider
// as a new request through the normal ring/notification flow.
app.post("/api/bookings/:id/swap", auth.requireAuth("provider"), ah(async (req, res) => {
  let result;
  try {
    result = await store.swapBooking(req.params.id, req.user.id, req.body || {});
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
  io.emit("booking:updated", maskCompleted(result.booking));
  io.emit("booking:created", result.booking);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  dispatchBooking(result.booking, result.excluded);
  res.json({ booking: result.swappedOut });
}));

app.get("/api/admin/bookings/:id/swaps", auth.requireAuth("admin"), ah(async (req, res) => {
  const providers = await store.listProviders();
  const name = (id) => providers.find((p) => p.id === id)?.name || "—";
  res.json(
    store.listOrderSwaps({ bookingId: req.params.id }).map(({ snapshot, ...s }) => ({
      ...s,
      fromProviderName: name(s.fromProviderId),
      toProviderName: name(s.toProviderId),
    }))
  );
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
  if (req.user.role === "provider" && ["In Progress", "Completed"].includes(status)) {
    return res.status(400).json({ error: "Starting and completing a job requires the customer's OTP" });
  }
  // A provider declining doesn't fail the booking outright — try handing it
  // to another provider in the same category first, same as a ring timeout.
  if (req.user.role === "provider" && status === "Rejected" && existing.status === "Pending") {
    const result = await store.reassignBooking(req.params.id, [req.user.id]);
    io.emit("booking:updated", maskCompleted(result.booking));
    io.emit("activity:created", (await store.listActivities(1))[0]);
    if (result.reassigned) {
      io.emit("booking:created", result.booking);
      dispatchBooking(result.booking, [req.user.id, result.booking.providerId]);
    }
    return res.json(result.booking);
  }

  const booking = await store.updateBookingStatus(req.params.id, status);
  io.emit("booking:updated", maskCompleted(booking));
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(booking);
}));

// The customer's only way to get the provider's number: their own booking,
// while it's Accepted or In Progress.
app.get("/api/bookings/:id/provider-contact", auth.requireAuth("customer"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  if (!["Accepted", "In Progress"].includes(booking.status)) {
    return res.status(403).json({ error: "You can only call the service provider while the order is active" });
  }
  const provider = await store.getProvider(booking.providerId);
  if (!provider?.phone) return res.status(404).json({ error: "No phone number available" });
  res.json({ phone: provider.phone });
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
  io.emit("booking:updated", maskCompleted(result.booking));
  if (result.provider) io.emit("provider:updated", publicProvider(result.provider));
  if (result.service) io.emit("service:updated", result.service);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(result.booking);
}));

// ---- push notifications (wake a backgrounded/closed provider app for new
// booking requests — see server/src/push.js) ----
app.get("/api/push/vapid-public-key", (req, res) => {
  res.json({ publicKey: push.VAPID_PUBLIC_KEY, configured: push.configured });
});

app.post("/api/push/subscribe", auth.requireAuth("provider", "customer"), ah(async (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "subscription is required" });
  }
  push.saveSubscription(req.user.role, req.user.id, subscription);
  res.status(201).json({ ok: true });
}));

app.post("/api/push/unsubscribe", auth.requireAuth("provider", "customer"), ah(async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
  push.removeSubscriptionByEndpoint(endpoint);
  res.json({ ok: true });
}));

// ---- provider notification preferences (WhatsApp opt-in for new booking
// alerts, a second channel alongside push in case a device's push delivery
// is unreliable) ----
app.get("/api/provider/notification-prefs", auth.requireAuth("provider"), ah(async (req, res) => {
  res.json(store.getProviderNotificationPrefs(req.user.id));
}));

app.patch("/api/provider/notification-prefs", auth.requireAuth("provider"), ah(async (req, res) => {
  res.json(store.updateProviderNotificationPrefs(req.user.id, req.body || {}));
}));

// ---- FCM device tokens (native apps only — see fcm.js) ----
app.post("/api/provider/fcm-token", auth.requireAuth("provider"), ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });
  fcm.saveToken("provider", req.user.id, token);
  res.status(201).json({ ok: true });
}));

app.post("/api/provider/fcm-token/remove", auth.requireAuth("provider"), ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });
  fcm.removeToken(token);
  res.json({ ok: true });
}));

app.post("/api/customer/fcm-token", auth.requireAuth("customer"), ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });
  fcm.saveToken("customer", req.user.id, token);
  res.status(201).json({ ok: true });
}));

app.post("/api/customer/fcm-token/remove", auth.requireAuth("customer"), ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });
  fcm.removeToken(token);
  res.json({ ok: true });
}));

// ---- referral program ----
app.get("/api/customer/referral", auth.requireAuth("customer"), ah(async (req, res) => {
  res.json(await store.getCustomerReferralInfo(req.user.id));
}));

app.post("/api/customer/referral/validate", auth.requireAuth("customer"), ah(async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "code is required" });
  await store.applyReferralCode(code, req.user.id);
  const { referralFriendDiscount } = await store.getCustomerReferralInfo(req.user.id);
  res.json({ code: String(code).trim().toUpperCase(), discount: referralFriendDiscount });
}));

// ---- refund claims ----
app.post("/api/bookings/:id/refund-claim", auth.requireAuth("customer"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const reason = (req.body?.reason || "").trim();
  if (!reason) return res.status(400).json({ error: "reason is required" });
  const claim = await store.createRefundClaim(req.user.id, req.params.id, reason);
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.status(201).json(claim);
}));

app.get("/api/admin/refund-claims", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.listRefundClaims());
}));

app.patch("/api/admin/refund-claims/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const { status, adminNote } = req.body || {};
  const claim = await store.resolveRefundClaim(req.params.id, status, adminNote);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(claim);
}));

// ---- KYC documents (camera or file upload from Documents & KYC screen) ----
app.get("/api/provider/kyc-documents", auth.requireAuth("provider"), ah(async (req, res) => {
  res.json(store.listKycDocuments(req.user.id));
}));

app.post(
  "/api/provider/kyc-documents",
  auth.requireAuth("provider"),
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const provider = await store.getProvider(req.user.id);
    if (provider?.verificationStatus === "approved") {
      return res.status(403).json({ error: "Your account is verified — contact support to change documents" });
    }
    const docType = req.body?.docType || "other";
    const doc = store.addKycDocument(req.user.id, { docType, url: `/uploads/${req.file.filename}` });
    await store.logActivity("provider", `${req.user.id} uploaded a KYC document (${docType})`);
    res.status(201).json(doc);
  })
);

app.delete("/api/provider/kyc-documents/:id", auth.requireAuth("provider"), ah(async (req, res) => {
  const provider = await store.getProvider(req.user.id);
  if (provider?.verificationStatus === "approved") {
    return res.status(403).json({ error: "Your account is verified — contact support to change documents" });
  }
  const removed = store.deleteKycDocument(req.user.id, req.params.id);
  if (!removed) return res.status(404).json({ error: "Document not found" });
  res.status(204).end();
}));

app.get("/api/admin/providers/:id/kyc-documents", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.listKycDocuments(req.params.id));
}));

// ---- job before/after photos (attached to a specific booking, provider must own it) ----
app.get("/api/bookings/:id/photos", auth.requireAuth("provider", "customer", "admin"), ah(async (req, res) => {
  res.json(store.listJobPhotos(req.params.id, { includeSuperseded: req.user.role === "admin" }));
}));

app.post(
  "/api/bookings/:id/photos",
  auth.requireAuth("provider"),
  upload.single("file"),
  ah(async (req, res) => {
    const booking = await store.getBooking(req.params.id);
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.providerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const photoType = req.body?.photoType === "after" ? "after" : "before";
    const photo = store.addJobPhoto(req.params.id, { photoType, url: `/uploads/${req.file.filename}` });
    res.status(201).json(photo);
  })
);

// ---- on-the-job checkpoints (reached location / started job / left location) ----
app.get("/api/bookings/:id/checkpoints", auth.requireAuth("provider", "customer", "admin"), ah(async (req, res) => {
  res.json(store.listJobCheckpoints(req.params.id, { includeSuperseded: req.user.role === "admin" }));
}));

app.post("/api/bookings/:id/checkpoints", auth.requireAuth("provider"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.providerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const checkpoint = store.addJobCheckpoint(req.params.id, req.body?.type);
  io.emit("booking:checkpoint", checkpoint);
  res.status(201).json(checkpoint);
}));

// ---- work start / job completion OTPs — only the customer can ever see the
// codes; the provider asks for them in person and submits a guess ----
app.get("/api/bookings/:id/otp", auth.requireAuth("customer"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  res.json(store.getBookingOtpsForCustomer(req.params.id));
}));

app.post("/api/bookings/:id/otp/verify", auth.requireAuth("provider"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.providerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  const updated = await store.verifyBookingOtp(req.params.id, req.body?.type, req.body?.code);
  io.emit("booking:updated", maskCompleted(updated));
  io.emit("activity:created", (await store.listActivities(1))[0]);
  res.json(maskCompleted(updated));
}));

// ---- live location (self-reported every ~30s by the customer/provider apps
// while a booking is active, so "Get Directions" can target where someone
// actually is instead of the address captured at booking time) ----
app.post("/api/location", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const { lat, lng, accuracy } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng (numbers) are required" });
  }
  res.json(liveLocation.setLocation(req.user.role, req.user.id, lat, lng, accuracy));
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
  // Once the order is Completed the conversation is closed to both sides; it
  // stays on record for admin/CRM dispute handling.
  if (booking.status === "Completed" && req.user.role !== "admin") {
    return res.status(403).json({ error: "This conversation is no longer available" });
  }
  const messages = await store.getMessages(req.params.bookingId);
  // Nothing from before an order swap is shown to the customer or new provider.
  const cutoff = req.user.role === "admin" ? null : store.swapCutoffs().get(req.params.bookingId);
  res.json(cutoff ? messages.filter((m) => new Date(m.time) >= new Date(cutoff)) : messages);
}));

app.post("/api/messages/:bookingId", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message text required" });
  const booking = await store.getBooking(req.params.bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const from = req.user.role === "provider" ? "provider" : "user";
  if (from === "provider" && booking.providerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  if (from === "user" && booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  if (from === "provider" && booking.status === "Completed") {
    return res.status(403).json({ error: "This order is completed — you can no longer message the customer" });
  }
  if (from === "user" && booking.status === "Completed") {
    return res.status(403).json({ error: "This order is completed — you can no longer message the service provider" });
  }
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
  res.json(await store.listActivities(limit, req.query.type));
}));

app.get("/api/admin/overview", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.getAdminOverview());
}));

app.get("/api/admin/customers", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.listCustomers());
}));

app.get("/api/admin/settings", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.getSettings());
}));

app.patch("/api/admin/settings", auth.requireAuth("admin"), ah(async (req, res) => {
  const settings = store.updateSettings(req.body || {});
  const changedFee = Object.keys(req.body || {}).some((k) => k.startsWith("communicationFee") || k === "platformFeePct");
  if (changedFee) {
    await store.logActivity(
      "settings",
      settings.communicationFeeEnabled
        ? `Communication fee updated: ${settings.communicationFeePct}%${settings.communicationFeeMax > 0 ? ` (max ₹${settings.communicationFeeMax})` : ""}`
        : "Communication fee switched off"
    );
  }
  res.json(settings);
}));

// Communication charges per service / category (priority: service > category > global).
app.get("/api/admin/communication-fees", auth.requireAuth("admin"), ah(async (req, res) => {
  const s = store.getSettings();
  res.json({
    defaults: {
      enabled: s.communicationFeeEnabled,
      pct: s.communicationFeePct,
      max: s.communicationFeeMax,
      min: s.communicationFeeMin,
    },
    overrides: store.listFeeOverrides(),
  });
}));

app.put("/api/admin/communication-fees/:type/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const record = await store.setFeeOverride(req.params.type, req.params.id, req.body || {}, actorOf(req));
  if (!record) return res.status(404).json({ error: "Not found" });
  res.json(record);
}));

app.delete("/api/admin/communication-fees/:type/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  if (!["service", "category"].includes(req.params.type)) return res.status(400).json({ error: "Invalid type" });
  if (!(await store.clearFeeOverride(req.params.type, req.params.id, actorOf(req)))) {
    return res.status(404).json({ error: "No custom charge set" });
  }
  res.status(204).end();
}));

// ---- Live Service Provider Monitoring ----
app.get("/api/admin/monitoring", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await monitoring.snapshot(req.query));
}));

app.get("/api/admin/monitoring/report", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await monitoring.report(String(req.query.type || ""), req.query));
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
  if (err instanceof multer.MulterError || /^Only image uploads/.test(err.message || "")) {
    return res.status(400).json({ error: err.message });
  }
  const status = err.status || (["Unknown service", "Unknown customer"].includes(err.message) ? 400 : 500);
  res.status(status).json({ error: err.message || "Internal server error" });
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

server.listen(PORT, () => {
  console.log(`Tikdum API + realtime server listening on http://localhost:${PORT}`);
});

// Re-sends a recharge reminder to any still-suspended provider roughly once
// a day — checked hourly so a restart never leaves it waiting a full day.
setInterval(() => {
  store.sendSuspendedWalletReminders().catch((e) => console.error("Suspended wallet reminders failed:", e));
}, 60 * 60 * 1000);
