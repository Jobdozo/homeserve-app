require("dotenv").config({ override: true });
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const compression = require("compression");
const http = require("http");
const { Server } = require("socket.io");
const store = require("./store");
const monitoring = require("./monitoring");
const complaints = require("./complaints");
const access = require("./access");
const staff = require("./staff");
const rulesConfig = require("./rules");
const locations = require("./locations");
const serviceCatalog = require("./serviceCatalog");
const accountDeletion = require("./accountDeletion");
const rt = require("./realtime");
const csvImport = require("./csvImport");
const auth = require("./auth");
const agents = require("./agents");
const inbox = require("./inbox");
const backoffice = require("./backoffice");
const office = require("./office");
access.setAgentHooks({ resolve: agents.resolveAgent, policy: agents.policy });
// Per-request permission checks for staff sign-ins (admin roles, provider staff).
auth.setAdminGuard(access.guard);
auth.setProviderGuard(staff.guard);
auth.setRevocationCheck(accountDeletion.isDeleted);
const { sendOtpViaWhatsApp, isConfigured: whatsappConfigured } = require("./whatsapp");
const otpGuard = require("./otpGuard");
const loginAttempts = require("./loginAttempts");
const blockedPhones = require("./blockedPhones");
const accounting = require("./accounting");
const subcategories = require("./subcategories");
auth.setBlockCheck(blockedPhones.isBlocked);
const liveLocation = require("./liveLocation");
const push = require("./push");
const fcm = require("./fcm");
const { upload, uploadEvidence, UPLOADS_DIR } = require("./uploads");

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

// Sockets are authenticated and put in rooms by who they are (see realtime.js),
// so booking, chat and notification events reach only the people involved.
// Each side sees the booking with its own privacy masking applied.
rt.attach(io, { forProvider: (b) => maskCompleted(b), forCustomer: (b) => hideCompletedChat(b) });

store.onNotification((notification) => {
  rt.notification(notification);
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
      rt.booking("booking:updated", updated);

      const message = await store.addMessage(booking.id, "provider", CANNED_ACCEPT);
      await rt.message(booking.id, message);
    } catch (e) {
      console.error("simulateProviderIfNeeded failed:", e);
    }
  }, AUTO_ACCEPT_DELAY);
}

// A "live" provider (a real Provider App instance, not a simulated demo one)
// gets 90 seconds to accept a booking before it's automatically handed to
// another active provider in the same category — same idea as ride-hailing
// dispatch, so a customer never gets stuck waiting on one unresponsive provider.
// How long a provider has to accept is a Business Rule (Settings → Requests).
const ringTimeoutMs = () => store.getSettings().ringTimeoutSeconds * 1000;

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
  const newBookingPush = {
    title: "New booking request",
    body: `${booking.service?.name || "A service"} request nearby`,
    bookingId: booking.id,
    type: "booking:created",
  };
  fcm.sendToDevices("provider", provider.id, newBookingPush).catch((e) => console.error("fcm send failed", e));
  // A brand-new, not-yet-assigned request only rings staff who can actually
  // do something with it (see it and/or assign it) — a Field Staff member
  // who can only see orders already assigned to them has nothing to act on
  // here yet, and shouldn't have their phone ring for someone else's job.
  for (const s of staff.eligibleForNewBookingPing(provider.id)) {
    fcm.sendToDevices("provider", `${provider.id}:staff:${s.id}`, newBookingPush).catch((e) => console.error("fcm send failed (staff)", e));
  }
  setTimeout(async () => {
    try {
      const current = await store.getBooking(booking.id);
      if (!current || current.status !== "Pending") return; // already accepted/rejected/cancelled
      const result = await store.reassignBooking(booking.id, triedProviderIds);
      rt.booking("booking:updated", result.booking, { previous: triedProviderIds });
      rt.activity((await store.listActivities(1))[0]);
      if (result.reassigned) {
        rt.booking("booking:created", result.booking);
        await dispatchBooking(result.booking, [...triedProviderIds, result.booking.providerId]);
      }
    } catch (e) {
      console.error("dispatchBooking timeout failed:", e);
    }
  }, ringTimeoutMs());
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
      await rt.message(bookingId, message);
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
// Whether chat / calls are open for an order is a Business Rule (Settings →
// Communication): on/off, which order statuses allow it, and an optional
// window after completion. Defaults keep the original behaviour.
function commsWindowOpen(booking) {
  const hours = store.getSettings().commsAfterCompletionHours;
  const at = booking.statusHistory?.Completed;
  return Boolean(hours && booking.status === "Completed" && at && Date.now() < new Date(at).getTime() + hours * 3600 * 1000);
}
function commsOpen(booking, kind) {
  const s = store.getSettings();
  if (!(kind === "chat" ? s.commsChatEnabled : s.commsCallEnabled)) return false;
  return (kind === "chat" ? s.commsChatStatuses : s.commsCallStatuses).includes(booking.status) || commsWindowOpen(booking);
}

function maskCompleted(booking) {
  if (!booking || booking.status !== "Completed" || !booking.customer || commsOpen(booking, "call")) return booking;
  return hideCompletedChat({ ...booking, customer: { ...booking.customer, phone: null, email: null } });
}

// A completed order's conversation is closed to the customer and provider, so
// its preview text is dropped from their booking lists too (admins keep it,
// for dispute handling).
function hideCompletedChat(booking) {
  if (!booking || booking.status !== "Completed" || !booking.lastMessage || commsOpen(booking, "chat")) return booking;
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
const actorOf = (req) =>
  req.admin?.agent ? `${req.admin.name} [AI agent]` : req.admin ? `${req.admin.name} (${req.admin.phone})` : String(req.user?.id || "admin").replace(/^admin:/, "");

// The signed-in admin/staff account for a request, if any (permissions resolved live).
function viewerAdmin(req) {
  const u = optionalUser(req);
  return u?.role === "admin" ? access.resolveToken(u) : null;
}

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
  if (role === "admin" && !access.resolveByPhone(phone)) {
    loginAttempts.recordRequest({ phone, role, ip: otpGuard.clientIp(req), outcome: "not-admin" });
    return res.status(403).json({ error: "This number is not registered as an admin" });
  }
  if (role !== "admin" && blockedPhones.isBlocked(phone)) {
    loginAttempts.recordRequest({ phone, role, ip: otpGuard.clientIp(req), outcome: "blocked" });
    return res.status(403).json({ error: "This number can't be used to sign in. Contact support if you think this is a mistake." });
  }
  const ip = otpGuard.clientIp(req);
  const gate = otpGuard.check(phone, ip);
  if (!gate.ok) {
    otpGuard.log({ phone, role, ip, result: "blocked" });
    res.set("Retry-After", String(gate.retryAfterSec));
    return res.status(429).json({ error: gate.error, retryAfterSec: gate.retryAfterSec });
  }
  otpGuard.record(phone, ip);

  const code = auth.requestOtp(role, phone);
  const delivered = await sendOtpViaWhatsApp(phone, code).catch((e) => {
    console.error("OTP send threw:", e);
    return false;
  });
  if (delivered) {
    otpGuard.log({ phone, role, ip, result: "sent" });
    loginAttempts.recordRequest({ phone, role, ip, outcome: "sent" });
    return res.json({ sent: true });
  }
  // The code is only ever shown on screen when no WhatsApp provider is set up
  // at all (local development). With a provider configured, a failed send must
  // not hand the code to whoever asked — that would let anyone log in as a
  // number whose delivery fails.
  if (!whatsappConfigured) {
    otpGuard.log({ phone, role, ip, result: "dev-code" });
    loginAttempts.recordRequest({ phone, role, ip, outcome: "dev-code" });
    return res.json({ sent: true, devOtp: code });
  }
  auth.clearOtp(role, phone);
  otpGuard.log({ phone, role, ip, result: "send-failed" });
  loginAttempts.recordRequest({ phone, role, ip, outcome: "send-failed" });
  res.status(502).json({
    error: "We couldn't send the code on WhatsApp. Make sure this number has WhatsApp, then try again in a minute.",
  });
}));

app.get("/api/admin/otp-requests", auth.requireAuth("admin"), (req, res) => {
  res.json(otpGuard.recentRequests());
});

app.post("/api/auth/otp/verify", ah(async (req, res) => {
  const { phone, code, role, name } = req.body || {};
  if (!phone || !code || !OTP_ROLES.includes(role)) {
    return res.status(400).json({ error: "phone, code and a valid role are required" });
  }
  if (role !== "admin" && blockedPhones.isBlocked(phone)) {
    return res.status(403).json({ error: "This number can't be used to sign in. Contact support if you think this is a mistake." });
  }
  const result = auth.verifyOtp(role, phone, code);
  if (!result.ok) {
    loginAttempts.recordWrongCode(role, phone);
    return res.status(400).json({ error: result.error });
  }
  loginAttempts.recordVerified(role, phone);

  if (role === "admin") {
    const admin = access.resolveByPhone(phone);
    if (!admin) return res.status(403).json({ error: "This number is not registered as an admin" });
    access.recordLogin(phone);
    const token = auth.signToken({ id: admin.id, role: "admin", phone: admin.phone });
    return res.json({ token, user: adminProfile(admin) });
  }

  if (role === "customer") {
    const customer = (await store.getCustomerByPhone(phone)) || (await store.createCustomer({ phone, name }));
    const token = auth.signToken({ id: customer.id, role: "customer", phone });
    return res.json({ token, user: customer });
  }

  // A number that isn't a provider account but is an active staff member of
  // one signs in as that company, with the staff member's own permissions.
  let provider = await store.getProviderByPhone(phone);
  let staffMember = null;
  if (!provider) {
    staffMember = staff.activeStaffByPhone(phone);
    if (staffMember) provider = await store.getProvider(staffMember.providerId);
    if (staffMember && !provider) staffMember = null;
  }
  if (!provider) provider = await store.createProviderSignup({ phone, name });
  if (staffMember) {
    staff.recordLogin(staffMember);
    const token = auth.signToken({ id: provider.id, role: "provider", phone, staffId: staffMember.id });
    return res.json({ token, user: provider, staff: staff.loginProfile(staffMember) });
  }
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

function adminProfile(a) {
  return { id: a.id, phone: a.phone, name: a.name, roleId: a.roleId, roleName: a.roleName, permissions: a.permissions, owner: Boolean(a.owner) };
}

app.get("/api/auth/me", auth.requireAuth(), ah(async (req, res) => {
  if (req.user.role === "customer") {
    const customer = await store.getCustomerById(req.user.id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    return res.json({ role: "customer", user: customer });
  }
  if (req.user.role === "provider") {
    const provider = await store.getProvider(req.user.id);
    if (!provider) return res.status(404).json({ error: "Not found" });
    return res.json({ role: "provider", user: provider, ...(req.staff ? { staff: staff.loginProfile(req.staff) } : {}) });
  }
  res.json({ role: "admin", user: adminProfile(req.admin) });
}));

// ---- forced app updates: the Android apps ask this on open and when resumed ----
app.get("/api/app-version", (req, res) => {
  const s = store.getSettings();
  const min =
    req.query.app === "provider" ? s.minVersionCodeProvider : req.query.app === "admin" ? s.minVersionCodeAdmin : s.minVersionCodeCustomer;
  res.set("Cache-Control", "no-store");
  res.json({ minVersionCode: Number(min) || 0, message: s.updateMessage || "" });
});

// ---- bootstrap (public catalog only — per-user data comes from auth) ----
app.get("/api/bootstrap", ah(async (req, res) => {
  const pincode = typeof req.query.pincode === "string" ? req.query.pincode.trim() : undefined;
  const [providers, categories, services] = await Promise.all([
    store.listProviders(),
    store.listCategories(),
    store.listServices({ activeOnly: true, pincode }),
  ]);
  res.json({ providers: providers.map(publicProvider), categories: categories.filter((c) => c.active), subcategories: subcategories.list(), services });
}));

// ---- customer's registered address (drives PIN-code catalog visibility) ----
app.get("/api/customer/address", auth.requireAuth("customer"), ah(async (req, res) => {
  res.json(store.getCustomerAddress(req.user.id));
}));

app.patch("/api/customer/profile", auth.requireAuth("customer"), ah(async (req, res) => {
  const { name, avatar } = req.body || {};
  const customer = await store.updateCustomerProfile(req.user.id, { name, avatar });
  if (!customer) return res.status(404).json({ error: "Account not found" });
  res.json(customer);
}));

app.put("/api/customer/address", auth.requireAuth("customer"), ah(async (req, res) => {
  const address = store.saveCustomerAddress(req.user.id, req.body || {});
  res.json(address);
}));

app.delete("/api/customer/address/office", auth.requireAuth("customer"), ah(async (req, res) => {
  res.json(store.deleteCustomerOffice(req.user.id));
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
      rt.activity((await store.listActivities(1))[0]);
    }
    res.json(result);
  })
);

// ---- open-request capacity & visibility (Provider Verification module) ----
// Why is (or isn't) this provider shown to customers? Full checklist of the
// visibility rules, optionally against a customer PIN code.
app.get("/api/admin/providers/:id/visibility", auth.requireAuth("admin"), ah(async (req, res) => {
  const pin = typeof req.query.pincode === "string" ? req.query.pincode.trim() : "";
  const result = await store.explainProviderVisibility(req.params.id, pin);
  if (!result) return res.status(404).json({ error: "Provider not found" });
  res.json(result);
}));

// Super Admin override: always show / always hide (optionally for N hours), or clear it.
app.put("/api/admin/providers/:id/visibility-override", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    const { mode, hours, note } = req.body || {};
    await store.setVisibilityOverride(req.params.id, { mode: mode || null, hours, note }, actorOf(req));
    const explained = await store.explainProviderVisibility(req.params.id, "");
    if (!explained) return res.status(404).json({ error: "Provider not found" });
    res.json(explained);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    throw e;
  }
}));

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
  res.json(access.adminCan(viewerAdmin(req), "providers.view") ? providers : providers.map(publicProvider));
}));

app.get("/api/providers/:id", ah(async (req, res) => {
  const provider = await store.getProvider(req.params.id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });
  const viewer = optionalUser(req);
  const fullAccess = (viewer && viewer.role === "provider" && viewer.id === provider.id) || access.adminCan(viewerAdmin(req), "providers.view");
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
  rt.service("service:created", service);
  rt.activity((await store.listActivities(1))[0]);
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

// Super Admin edit: same fields a provider can change, but not locked once the
// account is verified (that lock sends providers to "contact support" — this is
// the support side of it).
app.patch("/api/admin/providers/:id/profile", auth.requireAuth("admin"), ah(async (req, res) => {
  const existing = await store.getProvider(req.params.id);
  if (!existing) return res.status(404).json({ error: "Provider not found" });
  const body = req.body || {};
  if (body.email && !/^\S+@\S+\.\S+$/.test(String(body.email).trim())) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (body.name !== undefined && !String(body.name).trim()) {
    return res.status(400).json({ error: "Name can't be empty" });
  }
  const trimmed = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
  const provider = await store.updateProviderProfile(req.params.id, trimmed);
  const changes = ["name", "category", "businessName", "experience", "serviceArea", "email", "gstNumber"]
    .filter((f) => trimmed[f] !== undefined && (existing[f] ?? "") !== (provider[f] ?? ""))
    .map((f) => ({ field: f, from: existing[f] ?? null, to: provider[f] ?? null }));
  if (changes.length) {
    store.recordAdminChange({
      actor: actorOf(req),
      action: "provider.profile.update",
      entityType: "provider",
      entityId: req.params.id,
      entityName: provider.name,
      changes,
    });
  }
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
  rt.activity((await store.listActivities(1))[0]);
  res.json(provider);
}));

app.delete("/api/admin/providers/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const deleted = await store.deleteProvider(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Provider not found" });
  io.emit("provider:deleted", req.params.id);
  rt.activity((await store.listActivities(1))[0]);
  res.json({ deleted: true });
}));

app.get("/api/admin/providers/:id/wallet", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.getWallet(req.params.id));
}));

app.post("/api/admin/providers/:id/wallet/recharge", auth.requireAuth("admin"), ah(async (req, res) => {
  const amount = Number(req.body?.amount);
  const wallet = await store.rechargeProviderWallet(req.params.id, amount, req.body?.note);
  rt.activity((await store.listActivities(1))[0]);
  res.json(wallet);
}));

app.get("/api/provider/wallet", auth.requireAuth("provider"), ah(async (req, res) => {
  if (req.staff && !req.staff.permissions.includes("earnings.view")) return res.json({ balance: 0, suspended: false, restricted: true });
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
  rt.service("service:updated", result.service);
  if (result.changeRequest) rt.activity((await store.listActivities(1))[0]);
  res.json({ ...result.service, changeRequest: result.changeRequest });
}));

app.get("/api/providers/:id/earnings", auth.requireAuth("provider", "admin"), ah(async (req, res) => {
  if (req.user.role === "provider" && req.user.id !== req.params.id) {
    return res.status(403).json({ error: "Not your earnings" });
  }
  if (req.staff && !req.staff.permissions.includes("earnings.view")) return res.json(staff.emptyEarnings());
  res.json(await store.getEarnings(req.params.id));
}));

app.get("/api/providers/:id/reviews", ah(async (req, res) => {
  res.json(await store.getProviderReviews(req.params.id));
}));

// ---- categories ----
// Customers and providers only ever see active categories; admins see all
// (each carries an `active` flag).
// Served at the site root (not under /api) since that's where crawlers and
// robots.txt's Sitemap: directive expect it — local-service-app's nginx
// proxies /sitemap.xml here (see local-service-app/nginx.conf). Lists only
// what an anonymous visitor can actually browse to, matching the public
// /api/categories and /api/services({activeOnly:true}) filtering exactly.
app.get("/sitemap.xml", ah(async (req, res) => {
  const SITE_URL = "https://tikdum.com";
  const [categories, services] = await Promise.all([
    store.listCategories(),
    store.listServices({ activeOnly: true }),
  ]);
  const escapeXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
  const urls = [
    { loc: `${SITE_URL}/home`, priority: "1.0" },
    { loc: `${SITE_URL}/categories`, priority: "0.8" },
    { loc: `${SITE_URL}/services`, priority: "0.8" },
    { loc: `${SITE_URL}/booking-protection`, priority: "0.3" },
    ...categories.filter((c) => c.active).map((c) => ({ loc: `${SITE_URL}/category/${encodeURIComponent(c.id)}`, priority: "0.7" })),
    ...services.map((s) => ({ loc: `${SITE_URL}/service/${encodeURIComponent(s.id)}`, priority: "0.6" })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n")}\n</urlset>\n`;
  res.set("Content-Type", "application/xml").send(body);
}));

app.get("/api/categories", ah(async (req, res) => {
  const categories = await store.listCategories();
  res.json(access.adminCan(viewerAdmin(req), ["services.view", "customers.view", "providers.view", "bookings.view", "dashboard.view"]) ? categories : categories.filter((c) => c.active));
}));

// ---- sub-categories (optional level between a category and its services) ----
app.get("/api/subcategories", ah(async (req, res) => {
  const isStaff = access.adminCan(viewerAdmin(req), ["services.view", "providers.view", "dashboard.view"]);
  res.json(subcategories.list({ includeInactive: isStaff }));
}));

app.post("/api/admin/subcategories", auth.requireAuth("admin"), ah(async (req, res) => {
  const cats = await store.listCategories();
  if (!cats.some((c) => c.id === req.body?.categoryId)) return res.status(400).json({ error: "Choose a category" });
  const sub = subcategories.create({ categoryId: req.body.categoryId, name: req.body.name });
  audit(req, "subcategory.create", "subcategory", sub.id, sub.name, [{ field: "category", from: null, to: sub.categoryId }]);
  store.invalidateServices();
  res.status(201).json(sub);
}));

app.patch("/api/admin/subcategories/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const before = subcategories.get(req.params.id);
  const sub = subcategories.update(req.params.id, req.body || {});
  if (!sub) return res.status(404).json({ error: "Sub-category not found" });
  const changes = store.diffValues(before, sub, ["name", "active", "sortOrder"]);
  if (changes.length) audit(req, "subcategory.update", "subcategory", sub.id, sub.name, changes);
  res.json(sub);
}));

app.post("/api/admin/subcategories/:id/image", auth.requireAuth("admin"), upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image" });
  const sub = subcategories.setImage(req.params.id, `/uploads/${req.file.filename}`);
  if (!sub) return res.status(404).json({ error: "Sub-category not found" });
  audit(req, "subcategory.update", "subcategory", sub.id, sub.name, [{ field: "picture", from: null, to: "uploaded" }]);
  res.json(sub);
}));

app.delete("/api/admin/subcategories/:id/image", auth.requireAuth("admin"), ah(async (req, res) => {
  const sub = subcategories.setImage(req.params.id, null);
  if (!sub) return res.status(404).json({ error: "Sub-category not found" });
  audit(req, "subcategory.update", "subcategory", sub.id, sub.name, [{ field: "picture", from: "uploaded", to: "removed" }]);
  res.json(sub);
}));

app.delete("/api/admin/subcategories/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const before = subcategories.get(req.params.id);
  if (!before || !subcategories.remove(req.params.id)) return res.status(404).json({ error: "Sub-category not found" });
  audit(req, "subcategory.delete", "subcategory", before.id, before.name, [{ field: "deleted", from: false, to: true }]);
  store.invalidateServices();
  res.status(204).end();
}));

app.patch("/api/admin/categories/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const { name, icon, active } = req.body || {};
  const category = await store.updateCategory(req.params.id, { name, icon, active }, actorOf(req));
  if (!category) return res.status(404).json({ error: "Category not found" });
  rt.activity((await store.listActivities(1))[0]);
  res.json(category);
}));

// Category banner: upload replaces any previous one; DELETE goes back to the default picture.
app.post("/api/admin/categories/:id/banner", auth.requireAuth("admin"), upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo to upload" });
  const category = await store.setCategoryBanner(req.params.id, `/uploads/${req.file.filename}`, actorOf(req));
  if (!category) {
    require("fs").unlink(req.file.path, () => {});
    return res.status(404).json({ error: "Category not found" });
  }
  res.json(category);
}));

app.delete("/api/admin/categories/:id/banner", auth.requireAuth("admin"), ah(async (req, res) => {
  const category = await store.setCategoryBanner(req.params.id, null, actorOf(req));
  if (!category) return res.status(404).json({ error: "Category not found" });
  res.json(category);
}));

app.delete("/api/admin/categories/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const deleted = await store.deleteCategory(req.params.id, actorOf(req));
  if (deleted) store.dropFeeOverride("category", req.params.id);
  if (!deleted) return res.status(404).json({ error: "Category not found" });
  rt.activity((await store.listActivities(1))[0]);
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
  rt.activity((await store.listActivities(1))[0]);
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
  rt.activity((await store.listActivities(1))[0]);
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
  rt.service("service:created", service);
  rt.activity((await store.listActivities(1))[0]);
  res.status(201).json(service);
}));

// ---- service catalog: ready-made services a Super Admin can push onto any
// provider in one click, instead of typing every field from scratch ----
app.get("/api/admin/service-catalog", auth.requireAuth("admin"), ah(async (req, res) => res.json(serviceCatalog.list())));

// One click: a catalog entry for every service that exists but has none yet.
app.post("/api/admin/service-catalog/sync", auth.requireAuth("admin"), ah(async (req, res) => {
  const result = serviceCatalog.syncFromServices(await store.listServices({}));
  if (result.added) audit(req, "service_catalog.sync", "service_catalog", "all", "Catalog sync", [{ field: "entries added", from: 0, to: result.added }]);
  res.json(result);
}));

// Give one provider many catalog items in one go (the admin page sends big selections in batches).
app.post("/api/admin/service-catalog/apply-many", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    const out = await serviceCatalog.applyMany(req.body?.itemIds, req.body?.providerId, actorOf(req));
    if (out.added.length) rt.activity((await store.listActivities(1))[0]);
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
}));

app.post("/api/admin/service-catalog", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    res.status(201).json(serviceCatalog.create(req.body || {}, actorOf(req)));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
}));

app.patch("/api/admin/service-catalog/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  let item;
  try {
    item = serviceCatalog.update(req.params.id, req.body || {}, actorOf(req));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  if (!item) return res.status(404).json({ error: "Catalog item not found" });
  res.json(item);
}));

app.delete("/api/admin/service-catalog/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  if (!serviceCatalog.remove(req.params.id, actorOf(req))) return res.status(404).json({ error: "Catalog item not found" });
  res.status(204).end();
}));

// The one-click action: create a real service on a provider from a catalog item.
app.post("/api/admin/service-catalog/:id/apply", auth.requireAuth("admin"), ah(async (req, res) => {
  const { providerId, ...overrides } = req.body || {};
  if (!providerId) return res.status(400).json({ error: "providerId is required" });
  let service;
  try {
    service = await serviceCatalog.applyToProvider(req.params.id, providerId, overrides, actorOf(req));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  rt.service("service:created", service);
  rt.activity((await store.listActivities(1))[0]);
  res.status(201).json(service);
}));

app.post("/api/admin/service-catalog/:id/image", auth.requireAuth("admin"), upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo to upload" });
  const item = serviceCatalog.setImage(req.params.id, `/uploads/${req.file.filename}`, actorOf(req));
  if (!item) {
    require("fs").unlink(req.file.path, () => {});
    return res.status(404).json({ error: "Catalog item not found" });
  }
  res.json(item);
}));

app.delete("/api/admin/service-catalog/:id/image", auth.requireAuth("admin"), ah(async (req, res) => {
  const item = serviceCatalog.setImage(req.params.id, null, actorOf(req));
  if (!item) return res.status(404).json({ error: "Catalog item not found" });
  res.json(item);
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

// ---- locations: the serviceable Cities / Areas / PIN codes list ----
app.get("/api/admin/locations", auth.requireAuth("admin"), ah(async (req, res) => res.json(locations.tree())));

app.post("/api/admin/locations/cities", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    res.status(201).json(locations.createCity(req.body || {}, actorOf(req)));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
}));

app.patch("/api/admin/locations/cities/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  let city;
  try {
    city = locations.updateCity(req.params.id, req.body || {}, actorOf(req));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  if (!city) return res.status(404).json({ error: "City not found" });
  res.json(city);
}));

app.delete("/api/admin/locations/cities/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  if (!locations.deleteCity(req.params.id, actorOf(req))) return res.status(404).json({ error: "City not found" });
  res.status(204).end();
}));

app.post("/api/admin/locations/areas", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    res.status(201).json(locations.createArea(req.body || {}, actorOf(req)));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
}));

app.patch("/api/admin/locations/areas/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  let area;
  try {
    area = locations.updateArea(req.params.id, req.body || {}, actorOf(req));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  if (!area) return res.status(404).json({ error: "Area not found" });
  res.json(area);
}));

app.delete("/api/admin/locations/areas/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  if (!locations.deleteArea(req.params.id, actorOf(req))) return res.status(404).json({ error: "Area not found" });
  res.status(204).end();
}));

app.post("/api/admin/locations/pincodes", auth.requireAuth("admin"), ah(async (req, res) => {
  try {
    res.status(201).json(locations.createPincode(req.body || {}, actorOf(req)));
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
}));

app.patch("/api/admin/locations/pincodes/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  let pincode;
  try {
    pincode = locations.updatePincode(req.params.id, req.body || {}, actorOf(req));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  if (!pincode) return res.status(404).json({ error: "PIN code not found" });
  res.json(pincode);
}));

app.delete("/api/admin/locations/pincodes/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  if (!locations.deletePincode(req.params.id, actorOf(req))) return res.status(404).json({ error: "PIN code not found" });
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
  rt.service("service:updated", service);
  rt.activity((await store.listActivities(1))[0]);
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
  if (decision === "approved") rt.service("service:updated", await store.getService(result.serviceId));
  rt.activity((await store.listActivities(1))[0]);
  res.json(result);
}));

// ---- service approval workflow (admin) ----
app.post("/api/admin/services/:id/review", auth.requireAuth("admin"), ah(async (req, res) => {
  const service = await store.reviewService(req.params.id, req.body?.decision, req.body?.note, actorOf(req));
  if (!service) return res.status(404).json({ error: "Service not found" });
  rt.service("service:updated", service);
  rt.activity((await store.listActivities(1))[0]);
  res.json(service);
}));

app.patch("/api/admin/services/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const service = await store.adminUpdateService(req.params.id, req.body || {}, actorOf(req));
  if (!service) return res.status(404).json({ error: "Service not found" });
  rt.service("service:updated", service);
  res.json(service);
}));

// Service photo: upload replaces any previous one; DELETE goes back to the category picture.
app.post("/api/admin/services/:id/image", auth.requireAuth("admin"), upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a photo to upload" });
  const service = await store.setServiceImage(req.params.id, `/uploads/${req.file.filename}`, actorOf(req));
  if (!service) {
    require("fs").unlink(req.file.path, () => {});
    return res.status(404).json({ error: "Service not found" });
  }
  rt.service("service:updated", service);
  res.json(service);
}));

app.delete("/api/admin/services/:id/image", auth.requireAuth("admin"), ah(async (req, res) => {
  const service = await store.setServiceImage(req.params.id, null, actorOf(req));
  if (!service) return res.status(404).json({ error: "Service not found" });
  rt.service("service:updated", service);
  res.json(service);
}));

app.delete("/api/admin/services/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const deleted = await store.adminDeleteService(req.params.id, actorOf(req));
  if (deleted) store.dropFeeOverride("service", req.params.id);
  if (!deleted) return res.status(404).json({ error: "Service not found" });
  rt.activity((await store.listActivities(1))[0]);
  res.json({ deleted: true });
}));

// ---- bookings ----
const staffList = (providerId) => require("./jsonStore").readAll("providerStaff").filter((s) => s.providerId === providerId);

app.get("/api/bookings", auth.requireAuth(), ah(async (req, res) => {
  if (req.user.role === "admin") return res.json(await store.listBookings({}));
  if (req.user.role === "customer") {
    const cutoffs = store.swapCutoffs();
    return res.json((await store.listBookings({ customerId: req.user.id })).map((b) => dropStaleLastMessage(hideCompletedChat(b), cutoffs)));
  }
  const cutoffs = store.swapCutoffs();
  let own = (await store.listBookings({ providerId: req.user.id })).map((b) => dropStaleLastMessage(maskCompleted(b), cutoffs));
  const asg = staff.assignments();
  // Staff only see what their permissions allow: everything, just the orders
  // assigned to them, or nothing.
  const scope = staff.ordersScope(req.staff);
  if (scope === "none") return res.json([]);
  if (scope === "assigned") own = own.filter((b) => asg.get(b.id)?.staffId === req.staff.id);
  const names = new Map(staffList(req.user.id).map((s) => [s.id, s.name]));
  own = own.map((b) => (asg.has(b.id) ? { ...b, assignedStaff: { id: asg.get(b.id).staffId, name: names.get(asg.get(b.id).staffId) || "Staff" } } : b));
  // Orders this provider handed back stay in their history as "Swapped".
  res.json([...own, ...(scope === "all" ? store.listSwappedOutBookings(req.user.id) : [])]);
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
  const assignee = req.user.role === "provider" ? staff.assignmentFor(booking.id) : null;
  res.json(
    req.user.role === "provider"
      ? {
          ...dropStaleLastMessage(maskCompleted(booking), cutoffs),
          ...(assignee ? { assignedStaff: { id: assignee.staffId, name: staff.getStaff(assignee.staffId)?.name || "Staff" } } : {}),
        }
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
  staff.clearAssignment(req.params.id);
  rt.booking("booking:updated", result.booking, { previous: [req.user.id] });
  rt.booking("booking:created", result.booking);
  rt.activity((await store.listActivities(1))[0]);
  dispatchBooking(result.booking, result.excluded).catch((e) => console.error("dispatchBooking failed", e));
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
  rt.booking("booking:created", booking);
  rt.activity((await store.listActivities(1))[0]);
  dispatchBooking(booking).catch((e) => console.error("dispatchBooking failed", e));
  res.status(201).json(booking);
}));

// A cart checkout: creates one booking per line item, all sharing an orderId.
app.post("/api/orders", auth.requireAuth("customer"), ah(async (req, res) => {
  const bookings = await store.createOrder({ ...req.body, customerId: req.user.id });
  bookings.forEach((b) => {
    rt.booking("booking:created", b);
    dispatchBooking(b).catch((e) => console.error("dispatchBooking failed", e));
  });
  rt.activity((await store.listActivities(1))[0]);
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
    rt.booking("booking:updated", result.booking, { previous: [req.user.id] });
    rt.activity((await store.listActivities(1))[0]);
    if (result.reassigned) {
      rt.booking("booking:created", result.booking);
      dispatchBooking(result.booking, [req.user.id, result.booking.providerId]).catch((e) =>
        console.error("dispatchBooking failed", e)
      );
    }
    return res.json(result.booking);
  }

  const booking = await store.updateBookingStatus(req.params.id, status);
  // A staff member who accepts an unassigned order takes it on.
  if (req.staff && status === "Accepted" && !staff.assignmentFor(req.params.id)) {
    await staff.assignOrder(req.user.id, booking, req.staff.id, { name: req.staff.name });
  }
  rt.booking("booking:updated", booking);
  rt.activity((await store.listActivities(1))[0]);
  res.json(booking);
}));

// The customer's only way to get the provider's number: their own booking,
// while it's Accepted or In Progress.
app.get("/api/bookings/:id/provider-contact", auth.requireAuth("customer"), ah(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.customerId !== req.user.id) return res.status(403).json({ error: "Not your booking" });
  if (!commsOpen(booking, "call")) {
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
  rt.booking("booking:updated", result.booking);
  if (result.provider) io.emit("provider:updated", publicProvider(result.provider));
  if (result.service) rt.service("service:updated", result.service);
  rt.activity((await store.listActivities(1))[0]);
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
// A staff member's token carries the SAME provider id as the owner's (that's
// how they act on the company's data) — without this, whichever of them
// (owner or any staff) last opened the app would silently overwrite the
// other's registered token under the shared key, and only that one device
// would ever ring for a new job. Each person gets their own key instead.
const fcmIdFor = (user) => (user.staffId ? `${user.id}:staff:${user.staffId}` : user.id);

app.post("/api/provider/fcm-token", auth.requireAuth("provider"), ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });
  fcm.saveToken("provider", fcmIdFor(req.user), token);
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
  rt.activity((await store.listActivities(1))[0]);
  res.status(201).json(claim);
}));

app.get("/api/admin/refund-claims", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.listRefundClaims());
}));

app.patch("/api/admin/refund-claims/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const { status, adminNote } = req.body || {};
  const claim = await store.resolveRefundClaim(req.params.id, status, adminNote);
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  rt.activity((await store.listActivities(1))[0]);
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

// Super Admin can add or replace documents on a provider's behalf, including
// after the account is verified (providers themselves are locked out then).
app.post(
  "/api/admin/providers/:id/kyc-documents",
  auth.requireAuth("admin"),
  upload.single("file"),
  ah(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Choose a photo of the document" });
    const provider = await store.getProvider(req.params.id);
    if (!provider) return res.status(404).json({ error: "Provider not found" });
    const docType = ["id_proof", "gst_certificate", "other"].includes(req.body?.docType) ? req.body.docType : "other";
    const doc = store.addKycDocument(req.params.id, { docType, url: `/uploads/${req.file.filename}` });
    store.recordAdminChange({
      actor: actorOf(req),
      action: "provider.document.add",
      entityType: "provider",
      entityId: req.params.id,
      entityName: provider.name,
      changes: [{ field: "document", from: null, to: docType }],
    });
    await store.logActivity("provider", `Admin uploaded a KYC document (${docType}) for ${provider.name}`);
    res.status(201).json(doc);
  })
);

app.delete("/api/admin/providers/:id/kyc-documents/:docId", auth.requireAuth("admin"), ah(async (req, res) => {
  const doc = store.listKycDocuments(req.params.id).find((d) => d.id === req.params.docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  store.deleteKycDocument(req.params.id, req.params.docId);
  const provider = await store.getProvider(req.params.id);
  store.recordAdminChange({
    actor: actorOf(req),
    action: "provider.document.delete",
    entityType: "provider",
    entityId: req.params.id,
    entityName: provider?.name || req.params.id,
    changes: [{ field: "document", from: doc.docType, to: null }],
  });
  res.status(204).end();
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
  rt.checkpoint(booking, checkpoint);
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
  rt.booking("booking:updated", updated);
  rt.activity((await store.listActivities(1))[0]);
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
  if (req.user.role !== "admin" && !commsOpen(booking, "chat")) {
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
  if (!commsOpen(booking, "chat")) {
    const closed = booking.status === "Completed";
    return res.status(403).json({
      error: closed
        ? from === "provider"
          ? "This order is completed — you can no longer message the customer"
          : "This order is completed — you can no longer message the service provider"
        : "Messaging isn't available for this order right now",
    });
  }
  const message = await store.addMessage(req.params.bookingId, from, text.trim());
  await rt.message(req.params.bookingId, message);
  simulateReplyIfNeeded(req.params.bookingId, from);
  res.status(201).json(message);
}));

// ---- notifications ----
app.get("/api/notifications", auth.requireAuth("customer", "provider"), ah(async (req, res) => {
  const list = await store.listNotifications(req.user.role, req.user.id);
  if (!req.staff) return res.json(list);
  // Staff only get alerts for what they're allowed to see.
  const scope = staff.ordersScope(req.staff);
  const mine = staff.assignedBookingIds(req.staff.id);
  res.json(
    list.filter((n) => {
      if (n.type === "wallet") return req.staff.permissions.includes("earnings.view");
      if (scope === "all") return true;
      return scope === "assigned" && n.bookingId && mine.has(n.bookingId);
    })
  );
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

// People who asked for a login code but never got an account (and numbers poking
// at the admin login), so the team can follow up.
app.get("/api/admin/customers/login-attempts", auth.requireAuth("admin"), ah(async (req, res) => {
  const hasAccount = async (role, phone) => {
    if (role === "admin") return Boolean(access.resolveByPhone(phone));
    if (role === "provider") return Boolean(await store.getProviderByPhone(phone));
    return Boolean(await store.getCustomerByPhone(phone));
  };
  res.json(await loginAttempts.listUnregistered(hasAccount));
}));

app.patch("/api/admin/customers/login-attempts/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const row = loginAttempts.update(req.params.id, { status: req.body?.status, note: req.body?.note }, actorOf(req));
  if (!row) return res.status(404).json({ error: "Record not found" });
  res.json(row);
}));

// Accounts people deleted: why they left, and — only if they agreed — how to reach them.
app.get("/api/admin/customers/deleted-accounts", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(accountDeletion.listFeedback());
}));

app.patch("/api/admin/customers/deleted-accounts/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const row = accountDeletion.updateFeedback(req.params.id, { status: req.body?.status, followUpNote: req.body?.followUpNote }, actorOf(req));
  if (!row) return res.status(404).json({ error: "Record not found" });
  res.json(row);
}));

// ---- Accounting & GST (see accounting.js) ----
app.get("/api/admin/accounting/settings", auth.requireAuth("admin"), (req, res) => {
  res.json({ ...accounting.getSettings(), states: accounting.STATES });
});

app.patch("/api/admin/accounting/settings", auth.requireAuth("admin"), ah(async (req, res) => {
  const before = accounting.getSettings();
  const after = accounting.setSettings(req.body || {}, actorOf(req));
  const changes = store.diffValues(before, after, ["enabled", "legalName", "gstin", "pan", "address", "sacCode", "gstRate", "feeIncludesGst", "invoicePrefix", "creditNotePrefix"]);
  if (changes.length) audit(req, "accounting.settings", "accounting", "settings", "Accounting settings", changes);
  res.json({ ...after, states: accounting.STATES });
}));

app.get("/api/admin/accounting/invoices", auth.requireAuth("admin"), (req, res) => {
  const { from, to, type, q, providerId, limit } = req.query;
  res.json(accounting.listInvoices({ from, to, type, q, providerId, limit }));
});

app.get("/api/admin/accounting/invoices/:id", auth.requireAuth("admin"), (req, res) => {
  const inv = accounting.getInvoice(req.params.id);
  if (!inv) return res.status(404).json({ error: "Invoice not found" });
  res.json(inv);
});

app.post("/api/admin/accounting/invoices/:id/credit-note", auth.requireAuth("admin"), ah(async (req, res) => {
  const note = accounting.issueCreditNote(req.params.id, req.body?.reason, actorOf(req));
  audit(req, "accounting.credit_note", "taxInvoice", note.id, note.number, [{ field: "creditNoteFor", from: null, to: note.originalNumber }]);
  res.status(201).json(note);
}));

app.get("/api/admin/accounting/summary", auth.requireAuth("admin"), ah(async (req, res) => {
  const summary = accounting.monthSummary(req.query.month);
  const fees = require("./jsonStore").readAll("bookingFees");
  res.json({ ...summary, uninvoicedFees: accounting.uninvoicedFees(fees).length, settings: { enabled: accounting.getSettings().enabled, startedAt: accounting.getSettings().startedAt } });
}));

app.get("/api/admin/accounting/eco-exposure", auth.requireAuth("admin"), ah(async (req, res) => {
  const s = accounting.getSettings();
  const [bookings, providers] = await Promise.all([store.listBookings(), store.listProviders()]);
  res.json(accounting.ecoExposure({ month: req.query.month, bookings, providers, categoryIds: s.ecoCategoryIds, rate: s.gstRate }));
}));

// Numbers that may not sign in or use the app.
app.get("/api/admin/customers/blocked-numbers", auth.requireAuth("admin"), (req, res) => {
  res.json(blockedPhones.list());
});

app.post("/api/admin/customers/blocked-numbers", auth.requireAuth("admin"), ah(async (req, res) => {
  const phone = req.body?.phone;
  if (phone && access.resolveByPhone(phone)) return res.status(400).json({ error: "That number belongs to a staff account — remove it in User management instead" });
  const row = blockedPhones.add(phone, req.body?.reason, actorOf(req));
  audit(req, "customer.block", "blockedNumber", row.id, row.phone, [{ field: "blocked", from: false, to: true }]);
  res.status(201).json(row);
}));

app.delete("/api/admin/customers/blocked-numbers/:id", auth.requireAuth("admin"), ah(async (req, res) => {
  const row = blockedPhones.list().find((r) => r.id === req.params.id);
  if (!row || !blockedPhones.remove(req.params.id)) return res.status(404).json({ error: "Number not found" });
  audit(req, "customer.unblock", "blockedNumber", row.id, row.phone, [{ field: "blocked", from: true, to: false }]);
  res.status(204).end();
}));

app.get("/api/admin/customers", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(await store.listCustomers());
}));

app.get("/api/admin/settings", auth.requireAuth("admin"), ah(async (req, res) => {
  res.json(store.getSettings());
}));

app.patch("/api/admin/settings", auth.requireAuth("admin"), ah(async (req, res) => {
  const before = store.getSettings();
  if (req.body?.providerStaffRoleTemplates !== undefined) {
    try {
      req.body.providerStaffRoleTemplates = staff.validateTemplates(req.body.providerStaffRoleTemplates);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }
  }
  const settings = store.updateSettings(req.body || {});
  // Record every business-rule change (who, what, before → after).
  const flat = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? x.label || JSON.stringify(x) : x)) : v && typeof v === "object" ? JSON.stringify(v) : v);
  const changes = Object.keys(req.body || {})
    .filter((k) => k in settings && JSON.stringify(before[k] ?? null) !== JSON.stringify(settings[k] ?? null))
    .map((k) => ({ field: k, from: flat(before[k]) ?? null, to: flat(settings[k]) ?? null }));
  if (changes.length) {
    store.recordAdminChange({ actor: actorOf(req), action: "settings.update", entityType: "settings", entityId: "platform", entityName: "Business rules", changes });
  }
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

// Central Business Rules: current values plus what the editor needs (option
// lists, built-in staff role defaults, active visibility overrides).
app.get("/api/admin/business-rules", auth.requireAuth("admin"), ah(async (req, res) => {
  const providers = await store.listProviders();
  const nameOf = (id) => providers.find((p) => p.id === id)?.name || id;
  const overrides = require("./jsonStore")
    .readAll("providerVisibilityOverrides")
    .filter((o) => !o.until || new Date(o.until).getTime() > Date.now())
    .map((o) => ({ providerId: o.id, providerName: nameOf(o.id), mode: o.mode, until: o.until, note: o.note, by: o.by, at: o.at }));
  res.json({
    settings: store.getSettings(),
    options: {
      bookingStatuses: rulesConfig.BOOKING_STATUSES,
      serviceChangeFields: rulesConfig.SERVICE_CHANGE_FIELDS,
      visibilityRuleKeys: rulesConfig.VISIBILITY_RULE_KEYS,
      staffPermissionGroups: staff.PERMISSION_GROUPS.map((g) => ({ key: g.key, label: g.label, permissions: g.permissions.map(([key, label]) => ({ key, label })) })),
      staffRoleTemplates: staff.roleTemplates(),
      defaultStaffRoleTemplates: staff.ROLE_TEMPLATES,
      defaults: rulesConfig.DEFAULTS,
    },
    overrides,
  });
}));

// The order-swap rules the provider app needs (on/off and the reason list).
app.get("/api/provider/swap-rules", auth.requireAuth("provider"), ah(async (req, res) => res.json(store.getSwapRules())));

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

// ---- Complaints & Disputes CRM ----
// Service errors thrown with a status (validation, not-found, conflicts) are
// returned as-is; anything else falls through to the generic 500 handler.
const crm = (fn) =>
  ah(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
const notFound = (res) => res.status(404).json({ error: "Complaint not found" });
const adminOnly = auth.requireAuth("admin");

app.get("/api/admin/complaints", adminOnly, crm(async (req, res) => res.json({ ...complaints.listComplaints(req.query), meta: complaints.meta() })));
app.get("/api/admin/complaints/lookup", adminOnly, crm(async (req, res) => res.json(await complaints.lookup(req.query.q))));
app.post("/api/admin/complaints", adminOnly, crm(async (req, res) => res.status(201).json(await complaints.createComplaint(req.body || {}, actorOf(req)))));
app.get("/api/admin/complaints/:id", adminOnly, crm(async (req, res) => {
  const found = complaints.getComplaint(req.params.id);
  if (!found) return notFound(res);
  res.json(found);
}));
app.patch("/api/admin/complaints/:id", adminOnly, crm(async (req, res) => {
  const c = complaints.updateComplaint(req.params.id, req.body || {}, actorOf(req));
  if (!c) return notFound(res);
  res.json(c);
}));
app.post("/api/admin/complaints/:id/assign", adminOnly, crm(async (req, res) => {
  const c = await complaints.assign(req.params.id, req.body?.assigneeId || null, actorOf(req));
  if (!c) return notFound(res);
  res.json(c);
}));
app.post("/api/admin/complaints/:id/status", adminOnly, crm(async (req, res) => {
  const c = complaints.changeStatus(req.params.id, req.body?.status, req.body || {}, actorOf(req));
  if (!c) return notFound(res);
  res.json(c);
}));
app.post("/api/admin/complaints/:id/reopen", adminOnly, crm(async (req, res) => {
  const c = complaints.reopen(req.params.id, req.body?.reason, actorOf(req));
  if (!c) return notFound(res);
  res.json(c);
}));
app.post("/api/admin/complaints/:id/entries", adminOnly, crm(async (req, res) => {
  const e = await complaints.addComm(req.params.id, req.body || {}, actorOf(req));
  if (!e) return notFound(res);
  res.status(201).json(e);
}));
app.post("/api/admin/complaints/:id/evidence", adminOnly, uploadEvidence.single("file"), crm(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const e = complaints.addEvidence(req.params.id, req.file, req.body?.note, actorOf(req));
  if (!e) return notFound(res);
  res.status(201).json(e);
}));

app.get("/api/admin/complaint-stages", adminOnly, crm(async (req, res) => res.json(complaints.listStages())));
app.post("/api/admin/complaint-stages", adminOnly, crm(async (req, res) => res.status(201).json(complaints.createStage(req.body || {}))));
app.post("/api/admin/complaint-stages/reorder", adminOnly, crm(async (req, res) => res.json(complaints.reorderStages(Array.isArray(req.body?.keys) ? req.body.keys.map(String) : []))));
app.patch("/api/admin/complaint-stages/:key", adminOnly, crm(async (req, res) => {
  const s = complaints.updateStage(req.params.key, req.body || {});
  if (!s) return res.status(404).json({ error: "Stage not found" });
  res.json(s);
}));
app.delete("/api/admin/complaint-stages/:key", adminOnly, crm(async (req, res) => {
  if (!complaints.deleteStage(req.params.key)) return res.status(404).json({ error: "Stage not found" });
  res.status(204).end();
}));

app.get("/api/admin/staff", adminOnly, crm(async (req, res) => res.json(await complaints.listStaff())));

// ---- Delete my account (Play Store requirement). The person must confirm
// by sending confirm: "DELETE"; open orders block it. ----
const deleteAccountRoute = (fn) =>
  ah(async (req, res) => {
    if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: 'Send confirm: "DELETE" to delete your account' });
    try {
      await fn(req.user.id, {
        reason: req.body?.reason,
        note: req.body?.note,
        contactOk: req.body?.contactOk === true,
      });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
    res.status(204).end();
  });
app.delete("/api/customer/account", auth.requireAuth("customer"), deleteAccountRoute(async (id, fb) => { await accountDeletion.deleteCustomerAccount(id, fb); rt.kick(`customer:${id}`); }));
app.delete("/api/provider/account", auth.requireAuth("provider"), deleteAccountRoute(async (id, fb) => { await accountDeletion.deleteProviderAccount(id, fb); rt.kick(`provider:${id}`); }));

// ---- Service provider staff management (the company's own employees) ----
const staffActor = (req) => (req.staff ? { staff: req.staff, name: req.staff.name } : { owner: true, name: "Owner" });
const staffRoute = (fn) =>
  ah(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
const providerOnly = auth.requireAuth("provider");

app.get("/api/provider/staff/catalogue", providerOnly, staffRoute(async (req, res) => res.json(await staff.catalogue(req.user.id))));
app.get("/api/provider/staff/activity", providerOnly, staffRoute(async (req, res) => res.json(staff.listActivity(req.user.id, { limit: 200 }))));
app.get("/api/provider/staff", providerOnly, staffRoute(async (req, res) => res.json(await staff.listWithStats(req.user.id))));
app.post("/api/provider/staff", providerOnly, staffRoute(async (req, res) => res.status(201).json(await staff.createStaff(req.user.id, req.body || {}, staffActor(req)))));
app.get("/api/provider/staff/:id", providerOnly, staffRoute(async (req, res) => {
  const d = await staff.detail(req.user.id, req.params.id);
  if (!d) return res.status(404).json({ error: "Staff member not found" });
  res.json(d);
}));
app.patch("/api/provider/staff/:id", providerOnly, staffRoute(async (req, res) => {
  const s = await staff.updateStaff(req.user.id, req.params.id, req.body || {}, staffActor(req));
  if (!s) return res.status(404).json({ error: "Staff member not found" });
  rt.kick(`staff:${req.params.id}`); // reconnects with their new access (or none)
  res.json(s);
}));
// The people an order can be assigned to (for staff who can assign but not manage staff).
app.get("/api/provider/assignable-staff", providerOnly, staffRoute(async (req, res) => {
  const list = await staff.listWithStats(req.user.id);
  res.json(list.filter((s) => s.active !== false).map((s) => ({ id: s.id, name: s.name, role: s.role, serviceIds: s.serviceIds, pincodes: s.pincodes, pending: s.pending })));
}));
app.post("/api/provider/orders/:id/assign", providerOnly, staffRoute(async (req, res) => {
  const booking = await store.getBooking(req.params.id);
  if (!booking || booking.providerId !== req.user.id) return res.status(404).json({ error: "Order not found" });
  const assignedStaff = await staff.assignOrder(req.user.id, booking, req.body?.staffId || null, staffActor(req));
  // Live-app equivalent of the FCM ring in assignOrder(): a staff-limited
  // session only ever joins the booking's room once it's assigned to them
  // (see realtime.js), so this is the only way their open app finds out —
  // without it they'd only learn of it via a push or the next manual refresh.
  if (assignedStaff) rt.booking("booking:created", booking);
  res.json({ assignedStaff });
}));

// ---- User management: internal staff accounts, roles, permissions ----
const audit = (req, action, entityType, entityId, entityName, changes = []) =>
  store.recordAdminChange({ actor: actorOf(req), action, entityType, entityId, entityName, changes });

app.get("/api/admin/permissions/catalogue", adminOnly, crm(async (req, res) => res.json(access.catalogue())));

app.get("/api/admin/users", adminOnly, crm(async (req, res) => res.json(access.listUsers())));
app.post("/api/admin/users", adminOnly, crm(async (req, res) => {
  const user = access.createUser(req.body || {}, actorOf(req));
  audit(req, "user.create", "user", user.id, user.name, [{ field: "role", from: null, to: user.roleId }]);
  res.status(201).json(user);
}));
app.patch("/api/admin/users/:id", adminOnly, crm(async (req, res) => {
  const before = access.listUsers().find((u) => u.id === req.params.id);
  const user = access.updateUser(req.params.id, req.body || {}, req.admin.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const changes = store.diffValues(before || {}, user, ["name", "phone", "email", "roleId", "active"]);
  if (changes.length) audit(req, "user.update", "user", user.id, user.name, changes);
  rt.kick(`adminuser:admin:${user.phone}`);
  res.json(user);
}));
app.delete("/api/admin/users/:id", adminOnly, crm(async (req, res) => {
  const before = access.listUsers().find((u) => u.id === req.params.id);
  if (!access.deleteUser(req.params.id, req.admin.id)) return res.status(404).json({ error: "User not found" });
  if (before?.phone) rt.kick(`adminuser:admin:${before.phone}`);
  audit(req, "user.delete", "user", req.params.id, before?.name);
  res.status(204).end();
}));

app.get("/api/admin/roles", adminOnly, crm(async (req, res) => res.json(access.listRoles())));
app.post("/api/admin/roles", adminOnly, crm(async (req, res) => {
  const role = access.createRole(req.body || {});
  audit(req, "role.create", "role", role.id, role.name);
  res.status(201).json(role);
}));
app.patch("/api/admin/roles/:id", adminOnly, crm(async (req, res) => {
  const before = access.listRoles().find((r) => r.id === req.params.id);
  const role = access.updateRole(req.params.id, req.body || {});
  if (!role) return res.status(404).json({ error: "Role not found" });
  const changes = store.diffValues(before || {}, role, ["name", "description"]);
  const added = role.permissions.filter((p) => !(before?.permissions || []).includes(p));
  const removed = (before?.permissions || []).filter((p) => !role.permissions.includes(p));
  if (added.length) changes.push({ field: "permissions added", from: null, to: added.join(", ") });
  if (removed.length) changes.push({ field: "permissions removed", from: removed.join(", "), to: null });
  if (changes.length) audit(req, "role.update", "role", role.id, role.name, changes);
  rt.kick("admin:any"); // every admin socket re-checks its permissions
  res.json(role);
}));
app.delete("/api/admin/roles/:id", adminOnly, crm(async (req, res) => {
  const before = access.listRoles().find((r) => r.id === req.params.id);
  if (!access.deleteRole(req.params.id)) return res.status(404).json({ error: "Role not found" });
  audit(req, "role.delete", "role", req.params.id, before?.name);
  res.status(204).end();
}));

// ---- AI agents (see agents.js for the safety model) ----
// Agents swap their API key for a 15-minute token, then use the normal admin
// API under their role. These /api/agents/* routes are for agents only;
// /api/admin/ai/* is the human side (approvals, alerts, agent accounts).
const tokenHits = new Map(); // ip -> [timestamps], brute-force brake on /agents/token
app.post("/api/agents/token", (req, res) => {
  const ip = otpGuard.clientIp(req) || req.socket.remoteAddress || "?";
  const now = Date.now();
  const hits = (tokenHits.get(ip) || []).filter((t) => now - t < 60 * 1000);
  if (hits.length >= 30) return res.status(429).json({ error: "Too many requests" });
  hits.push(now);
  tokenHits.set(ip, hits);
  const out = agents.issueToken(req.body?.apiKey);
  if (!out) return res.status(401).json({ error: "Invalid agent key" });
  if (out.disabled) return res.status(403).json({ error: "This AI agent is switched off" });
  res.json(out);
});

const agentOnly = [
  auth.requireAuth("admin"),
  (req, res, next) => (req.admin?.agent ? next() : res.status(403).json({ error: "For AI agents only" })),
];

app.get("/api/agents/self", agentOnly, crm(async (req, res) => {
  res.json({
    agent: { id: req.admin.agentId, name: req.admin.name, roleName: req.admin.roleName, permissions: req.admin.permissions },
    ...agents.status(req.admin.agentId),
    supportKnowledge: agents.getConfig().supportKnowledge,
    supportAutoSend: agents.getConfig().supportAutoSend,
    kind: req.admin.kind,
    instructions: ["specialist", "engineer"].includes(req.admin.kind) ? req.admin.instructions : undefined,
    template: req.admin.kind === "engineer" ? req.admin.template : undefined,
  });
}));

app.post("/api/agents/heartbeat", agentOnly, crm(async (req, res) => res.json(agents.heartbeat(req.admin.agentId, req.body || {}))));

app.post("/api/agents/usage", agentOnly, crm(async (req, res) => res.json(agents.recordUsage(req.admin.agentId, req.body || {}))));

app.post("/api/agents/feed", agentOnly, crm(async (req, res) => {
  const out = agents.postFeed(req.admin, req.body || {});
  if (!out.duplicate && out.item.severity === "critical") {
    await store.logActivity("ai", `${req.admin.name}: ${out.item.title}`).catch(() => {});
  }
  res.status(out.duplicate ? 200 : 201).json(out);
}));

app.post("/api/agents/actions", agentOnly, crm(async (req, res) => {
  const out = agents.propose(req.admin, req.body || {});
  if (!out.duplicate) await store.logActivity("ai", `${req.admin.name} proposed: ${out.action.title} (awaiting approval)`).catch(() => {});
  res.status(out.duplicate ? 200 : 201).json(out);
}));

// Best effort: free-form WhatsApp only arrives within 24h of the owner last
// messaging the business number (see whatsapp.js). Capped per agent per day.
const ownerPings = new Map(); // `${agentId}:${day}` -> count
app.post("/api/agents/notify-owner", agentOnly, crm(async (req, res) => {
  const text = String(req.body?.text || "").trim().slice(0, 3000);
  if (!text) return res.status(400).json({ error: "text is required" });
  const k = `${req.admin.agentId}:${new Date().toISOString().slice(0, 10)}`;
  const n = ownerPings.get(k) || 0;
  if (n >= 10) return res.status(429).json({ error: "Daily owner message limit reached" });
  ownerPings.set(k, n + 1);
  const { sendWhatsAppMessage } = require("./whatsapp");
  const results = [];
  for (const phone of auth.adminPhones()) {
    results.push(await sendWhatsAppMessage(phone, `[${req.admin.name}] ${text}`).catch(() => false));
  }
  res.json({ delivered: results.filter(Boolean).length, attempted: results.length });
}));

// -- human side --
app.get("/api/admin/ai/config", adminOnly, crm(async (req, res) => res.json(agents.getConfig())));
app.patch("/api/admin/ai/config", adminOnly, crm(async (req, res) => {
  const before = agents.getConfig();
  const cfg = agents.setConfig({ enabled: req.body?.enabled, supportKnowledge: req.body?.supportKnowledge, supportAutoSend: req.body?.supportAutoSend }, actorOf(req));
  if (before.enabled !== cfg.enabled) {
    audit(req, "ai.config", "ai", "config", "AI agents", [{ field: "enabled", from: before.enabled, to: cfg.enabled }]);
    await store.logActivity("ai", `All AI agents switched ${cfg.enabled ? "on" : "off"} by ${actorOf(req)}`).catch(() => {});
  }
  if (before.supportAutoSend !== cfg.supportAutoSend) {
    audit(req, "ai.config", "ai", "config", "Support auto-send", [{ field: "supportAutoSend", from: before.supportAutoSend, to: cfg.supportAutoSend }]);
    await store.logActivity("ai", `WhatsApp support AI ${cfg.supportAutoSend ? "now sends replies itself" : "switched to review mode (drafts only)"} — by ${actorOf(req)}`).catch(() => {});
  }
  if (before.supportKnowledge !== cfg.supportKnowledge) {
    audit(req, "ai.knowledge", "ai", "config", "Support knowledge", [{ field: "supportKnowledge", from: `${before.supportKnowledge.length} chars`, to: `${cfg.supportKnowledge.length} chars` }]);
  }
  res.json(cfg);
}));

app.get("/api/admin/ai/catalog", adminOnly, crm(async (req, res) => res.json({ teams: require("./agentCatalog").TEAMS })));
app.get("/api/admin/ai/agents", adminOnly, crm(async (req, res) => res.json({ agents: agents.listAgents(), proposableTypes: agents.PROPOSABLE_TYPES })));
app.post("/api/admin/ai/agents", adminOnly, crm(async (req, res) => {
  const out = agents.createAgent(req.body || {}, actorOf(req));
  audit(req, "ai.agent.create", "aiAgent", out.agent.id, out.agent.name, [{ field: "role", from: null, to: out.agent.roleId }]);
  res.status(201).json(out);
}));
app.patch("/api/admin/ai/agents/:id", adminOnly, crm(async (req, res) => {
  const before = agents.listAgents().find((a) => a.id === req.params.id);
  const agent = agents.updateAgent(req.params.id, req.body || {});
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const changes = store.diffValues(before || {}, agent, ["name", "roleId", "active", "dailyBudgetUsd", "kind", "template"]);
  if (changes.length) audit(req, "ai.agent.update", "aiAgent", agent.id, agent.name, changes);
  res.json(agent);
}));
app.post("/api/admin/ai/agents/:id/rotate-key", adminOnly, crm(async (req, res) => {
  const out = agents.rotateKey(req.params.id);
  if (!out) return res.status(404).json({ error: "Agent not found" });
  audit(req, "ai.agent.rotate_key", "aiAgent", out.agent.id, out.agent.name);
  res.json(out);
}));
app.delete("/api/admin/ai/agents/:id", adminOnly, crm(async (req, res) => {
  const before = agents.listAgents().find((a) => a.id === req.params.id);
  if (!agents.deleteAgent(req.params.id)) return res.status(404).json({ error: "Agent not found" });
  audit(req, "ai.agent.delete", "aiAgent", req.params.id, before?.name);
  res.status(204).end();
}));

app.get("/api/admin/ai/feed", adminOnly, crm(async (req, res) => {
  res.json(agents.listFeed({ kind: req.query.kind, unacked: req.query.unacked === "1", limit: req.query.limit }));
}));
app.post("/api/admin/ai/feed/:id/ack", adminOnly, crm(async (req, res) => {
  const item = agents.ackFeed(req.params.id, actorOf(req));
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
}));

app.get("/api/admin/ai/actions", adminOnly, crm(async (req, res) => res.json(agents.listActions({ status: req.query.status, limit: req.query.limit }))));

// Approving runs the proposed request against this same API *as the person
// approving* (their token, their permissions, their name in the audit log) —
// approving an AI proposal can never do more than that person could by hand.
app.post("/api/admin/ai/actions/:id/approve", adminOnly, crm(async (req, res) => {
  if (req.admin.agent) return res.status(403).json({ error: "AI agents can't approve proposals" });
  const action = agents.claimForExecution(req.params.id, actorOf(req));
  const { method, path, body } = action.request;
  let ok = false;
  let result = null;
  let error = null;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: req.headers.authorization },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => null);
    ok = r.ok;
    if (ok) result = { status: r.status };
    else error = data?.error || `Request failed (${r.status})`;
  } catch (e) {
    error = e.message;
  }
  const updated = agents.finishExecution(action.id, { ok, result, error });
  audit(req, ok ? "ai.action.approve" : "ai.action.approve_failed", "aiAction", action.id, action.title, [
    { field: "proposedBy", from: null, to: action.agentName },
    ...(error ? [{ field: "error", from: null, to: error }] : []),
  ]);
  if (!ok) return res.status(422).json({ error: `Approved, but the action failed: ${error}`, action: updated });
  res.json(updated);
}));
app.post("/api/admin/ai/actions/:id/reject", adminOnly, crm(async (req, res) => {
  if (req.admin.agent) return res.status(403).json({ error: "AI agents can't decide proposals" });
  const action = agents.rejectAction(req.params.id, req.body?.note, actorOf(req));
  audit(req, "ai.action.reject", "aiAction", action.id, action.title, [{ field: "proposedBy", from: null, to: action.agentName }]);
  res.json(action);
}));

// ---- WhatsApp inbox (inbound via MSG91 webhook; see inbox.js) ----
// Configure in MSG91: WhatsApp -> Webhook (New) -> "On Inbound Request Received",
// URL https://<api host>/api/webhooks/whatsapp/msg91, and add a header
// x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>. Requests without it are refused.
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || "";
const sameSecret = (given) => {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(WEBHOOK_SECRET);
  return a.length === b.length && require("crypto").timingSafeEqual(a, b);
};
app.post("/api/webhooks/whatsapp/msg91", ah(async (req, res) => {
  if (!WEBHOOK_SECRET) {
    console.warn("[whatsapp-webhook] rejected: WHATSAPP_WEBHOOK_SECRET is not set on the server");
    return res.status(503).json({ error: "Inbound WhatsApp isn't configured" });
  }
  if (!sameSecret(req.headers["x-webhook-secret"])) {
    console.warn(`[whatsapp-webhook] rejected: ${req.headers["x-webhook-secret"] ? "wrong" : "missing"} x-webhook-secret header`);
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Messages from the owner's own number go to the CEO agent's thread.
  const ownerHandler = (p) => {
    const last10 = (x) => String(x || "").replace(/\D/g, "").slice(-10);
    if (!auth.adminPhones().some((a) => last10(a) === last10(p.phone))) return false;
    office.addOwnerWhatsApp(p.phone, p.text, p.waId);
    return true;
  };
  const added = await inbox.ingest(req.body, { businessNumber: process.env.MSG91_WHATSAPP_NUMBER, ownerHandler });
  const items = Array.isArray(req.body) ? req.body.length : req.body && typeof req.body === "object" ? 1 : 0;
  console.log(`[whatsapp-webhook] ok: ${items} event(s), ${added.length} new customer message(s)`);
  res.json({ received: added.length });
}));

app.get("/api/admin/inbox", adminOnly, crm(async (req, res) => {
  res.json(inbox.listConversations({ queue: req.query.queue, mode: req.query.mode, q: req.query.q, limit: req.query.limit }));
}));
app.get("/api/admin/inbox/:id", adminOnly, crm(async (req, res) => {
  const found = inbox.getConversation(req.params.id, { limit: req.query.limit });
  if (!found) return res.status(404).json({ error: "Conversation not found" });
  res.json(found);
}));
app.post("/api/admin/inbox/:id/reply", adminOnly, crm(async (req, res) => {
  const msg = await inbox.reply(req.params.id, req.body?.text, actorOf(req), {
    agent: Boolean(req.admin.agent),
    // A person sending the AI's draft (as-is or edited) keeps the chat in AI mode.
    fromDraft: !req.admin.agent && req.body?.fromDraft === true,
  });
  if (!msg) return res.status(404).json({ error: "Conversation not found" });
  res.status(201).json(msg);
}));
// Review mode: the support agent leaves a draft; a person sends or discards it.
app.post("/api/admin/inbox/:id/draft", adminOnly, crm(async (req, res) => {
  if (!req.admin.agent) return res.status(403).json({ error: "Only the support AI writes drafts — reply directly instead" });
  const conv = inbox.saveDraft(req.params.id, req.body || {}, actorOf(req));
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  res.status(201).json(conv);
}));
app.delete("/api/admin/inbox/:id/draft", adminOnly, crm(async (req, res) => {
  const conv = inbox.discardDraft(req.params.id, actorOf(req));
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  res.json(conv);
}));
app.post("/api/admin/inbox/:id/mode", adminOnly, crm(async (req, res) => {
  const conv = inbox.setMode(req.params.id, req.body?.mode, req.body?.reason, actorOf(req));
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  if (req.admin.agent && conv.mode === "human") {
    await store.logActivity("ai", `${req.admin.name} handed a WhatsApp chat (${conv.name || conv.phone}) to the team: ${conv.handoffReason || "needs a person"}`).catch(() => {});
  }
  res.json(conv);
}));

// ---- Agent Office: task board, CEO thread, weekly goals (see office.js) ----
const personActor = (req) => ({ type: "person", id: req.admin.id, name: req.admin.name });
const agentActor = (req) => ({
  type: "agent", id: req.admin.agentId, name: req.admin.name, ceo: Boolean(req.admin.ceo),
  bugTriage: req.admin.kind === "engineer" && req.admin.template === "bug_triage",
});
const officeActor = (req) => (req.admin?.agent ? agentActor(req) : personActor(req));
// Phone numbers never go into the CEO agent's context.
const redactPhones = (t) => String(t || "").replace(/\+?\d[\d\s-]{8,}\d/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[phone]" : m));

// Everything the CEO agent reads, in one bounded, phone-free bundle.
function ceoContext() {
  const since = Date.now() - 24 * 3600 * 1000;
  const feed = agents.listFeed({ limit: 300 }).filter((f) => Date.parse(f.createdAt) >= since);
  const ageDays = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return {
    now: new Date().toISOString(),
    week: office.weekOf(),
    agents: agents.listAgents().map((a) => ({ name: a.name, kind: a.kind, role: a.roleName, active: a.active, lastSeenAt: a.lastSeenAt, lastStatus: a.lastStatus })),
    reports: feed.filter((f) => f.kind === "report").slice(0, 8).map((f) => ({ agent: f.agentName, title: redactPhones(f.title), body: redactPhones(f.body).slice(0, 1500) })),
    alerts: feed.filter((f) => f.kind !== "report").slice(0, 40).map((f) => ({ agent: f.agentName, severity: f.severity, title: redactPhones(f.title), seen: Boolean(f.ackedAt) })),
    approvalsWaiting: agents.listActions({ status: "pending", limit: 30 }).map((a) => ({ agent: a.agentName, title: redactPhones(a.title), ageDays: ageDays(a.createdAt) })),
    tasks: office.listTasks({ active: true }).slice(0, 40).map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, assignee: t.assignee?.name || null, ageDays: ageDays(t.createdAt) })),
    goals: office.listGoals().map((g) => ({ text: g.text, status: g.status })),
    thread: office.listMessages("ceo", { limit: 20 }).map((m) => ({ from: m.from.type === "agent" ? "CEO" : "Owner", text: redactPhones(m.text).slice(0, 800), at: m.at })),
    pending: office.pendingForCeo().map((m) => ({ id: m.id, text: redactPhones(m.text).slice(0, 1500), at: m.at, channel: m.channel })),
    assignees: [
      ...agents.listAgents().filter((a) => a.active && a.kind !== "ceo").map((a) => ({ type: "agent", id: a.id, name: a.name })),
      { type: "person", id: "owner", name: "Owner" },
    ],
  };
}

// -- agent side --
app.get("/api/agents/office", agentOnly, crm(async (req, res) => {
  if (req.admin.ceo) return res.json({ role: "ceo", ...ceoContext() });
  const mine = office.listTasks({ assigneeType: "agent", assigneeId: req.admin.agentId }).filter((t) => ["open", "in_progress"].includes(t.status));
  const out = { role: "agent", tasks: mine.map((t) => ({ ...t, messages: office.listMessages(t.id, { limit: 30 }) })) };
  // Specialists draft from the same phone-free company summary the CEO reads.
  if (req.admin.kind === "specialist" && mine.length) {
    const c = ceoContext();
    out.context = { now: c.now, week: c.week, reports: c.reports, alerts: c.alerts, goals: c.goals };
  }
  res.json(out);
}));
app.post("/api/agents/office/tasks", agentOnly, crm(async (req, res) => {
  const b = req.body || {};
  // The CEO names an assignee from the list it was given; resolve it here.
  let assignee = null;
  if (b.assignee) {
    const match = ceoContext().assignees.find((x) => x.name.toLowerCase() === String(b.assignee).toLowerCase());
    if (match) assignee = match.type === "person" ? { type: "person", id: "owner", name: "Owner" } : match;
  }
  // Bug Triage hands fixes to the Developer agent by role, not by name.
  if (!assignee && b.assigneeTemplate === "developer") {
    const dev = agents.listAgents().find((a) => a.active && a.kind === "engineer" && a.template === "developer");
    if (dev) assignee = { type: "agent", id: dev.id, name: dev.name };
  }
  const out = office.createTask({ title: b.title, description: b.description, priority: b.priority, dueDate: b.dueDate, assignee }, agentActor(req));
  res.status(out.duplicate ? 200 : 201).json(out);
}));
app.post("/api/agents/office/tasks/:id/messages", agentOnly, crm(async (req, res) => {
  const t = office.getTask(req.params.id);
  if (!t) return res.status(404).json({ error: "Task not found" });
  const assigned = t.task.assignee?.type === "agent" && t.task.assignee.id === req.admin.agentId;
  if (!assigned && !req.admin.ceo) return res.status(403).json({ error: "This task isn't assigned to this agent" });
  res.status(201).json(office.addMessage(req.params.id, agentActor(req), req.body?.text));
}));
app.post("/api/agents/office/tasks/:id/status", agentOnly, crm(async (req, res) => {
  const t = office.updateTask(req.params.id, { status: req.body?.status, result: req.body?.result }, agentActor(req));
  if (!t) return res.status(404).json({ error: "Task not found" });
  res.json(t);
}));
app.post("/api/agents/office/goals", agentOnly, crm(async (req, res) => {
  const out = office.proposeGoal(req.body?.text, agentActor(req));
  res.status(out.duplicate ? 200 : 201).json(out);
}));
// The CEO's reply in its thread; also sent on WhatsApp when the owner wrote there.
app.post("/api/agents/office/ceo/reply", agentOnly, crm(async (req, res) => {
  if (!req.admin.ceo) return res.status(403).json({ error: "Only the CEO agent replies in this thread" });
  const target = office.whatsappReplyTarget();
  const msg = office.addMessage("ceo", agentActor(req), req.body?.text);
  let whatsapp = null;
  if (target) {
    const { sendWhatsAppMessage } = require("./whatsapp");
    whatsapp = await sendWhatsAppMessage(target, msg.text.slice(0, 1500)).catch(() => false);
  }
  res.status(201).json({ message: msg, whatsapp });
}));

// -- people side --
app.get("/api/admin/ai/office/tasks", adminOnly, crm(async (req, res) => {
  res.json({ tasks: office.listTasks({ status: req.query.status }), statuses: office.STATUSES, priorities: office.PRIORITIES, assignees: ceoContext().assignees.filter((a) => a.type === "agent"), staff: await complaints.listStaff() });
}));
app.get("/api/admin/ai/office/tasks/:id", adminOnly, crm(async (req, res) => {
  const t = office.getTask(req.params.id);
  if (!t) return res.status(404).json({ error: "Task not found" });
  res.json(t);
}));
app.post("/api/admin/ai/office/tasks", adminOnly, crm(async (req, res) => {
  const out = office.createTask(req.body || {}, personActor(req));
  audit(req, "office.task.create", "aiTask", out.task.id, out.task.title);
  res.status(201).json(out);
}));
app.patch("/api/admin/ai/office/tasks/:id", adminOnly, crm(async (req, res) => {
  const t = office.updateTask(req.params.id, req.body || {}, personActor(req));
  if (!t) return res.status(404).json({ error: "Task not found" });
  res.json(t);
}));
app.post("/api/admin/ai/office/tasks/:id/decide", adminOnly, crm(async (req, res) => {
  const t = office.decideTask(req.params.id, req.body?.approve === true, req.body?.note, personActor(req));
  if (!t) return res.status(404).json({ error: "Task not found" });
  audit(req, req.body?.approve === true ? "office.task.approve" : "office.task.reject", "aiTask", t.id, t.title);
  res.json(t);
}));
app.post("/api/admin/ai/office/tasks/:id/messages", adminOnly, crm(async (req, res) => {
  res.status(201).json(office.addMessage(req.params.id, personActor(req), req.body?.text));
}));
app.get("/api/admin/ai/office/threads/ceo", adminOnly, crm(async (req, res) => res.json(office.listMessages("ceo", { limit: req.query.limit || 200 }))));
app.post("/api/admin/ai/office/threads/ceo/messages", adminOnly, crm(async (req, res) => {
  res.status(201).json(office.addMessage("ceo", personActor(req), req.body?.text));
}));
app.get("/api/admin/ai/office/goals", adminOnly, crm(async (req, res) => res.json({ week: office.weekOf(), goals: office.listGoals({ week: req.query.week }) })));
app.post("/api/admin/ai/office/goals", adminOnly, crm(async (req, res) => res.status(201).json(office.proposeGoal(req.body?.text, personActor(req)))));
app.post("/api/admin/ai/office/goals/:id/decide", adminOnly, crm(async (req, res) => {
  const g = office.decideGoal(req.params.id, req.body?.decision, personActor(req));
  if (!g) return res.status(404).json({ error: "Goal not found" });
  res.json(g);
}));

// ---- Back-office checks (read-only; used by the Registration, Verification
// and Payments agents and shown to staff — see backoffice.js) ----
app.get("/api/admin/verification/precheck", adminOnly, crm(async (req, res) => res.json(await backoffice.precheckPending())));
app.get("/api/admin/payments/reconciliation", adminOnly, crm(async (req, res) => res.json(await backoffice.reconcile())));

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
  if (err instanceof multer.MulterError || /^(Only image uploads|Upload a photo)/.test(err.message || "")) {
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
