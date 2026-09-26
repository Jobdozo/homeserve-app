// Real-time events, delivered only to the people an event is about.
//
// Sockets identify themselves with their sign-in token (handshake auth). Each
// one is put into rooms according to who it is:
//   public                  every socket (signed in or not) — public catalogue events only
//   customer:<id>           that customer
//   provider:<id>           the provider account owner, and staff who may see all orders
//   staff-limited:<staffId> staff who only see their assigned orders
//   staff:<staffId>         every socket of that staff member (used to disconnect them)
//   admin:bookings | admin:activity | admin:catalog | admin:any   admins, by permission
// Booking, message, notification and activity events go to the matching rooms
// only, so nobody receives another customer's booking, address or chat.
const auth = require("./auth");
const access = require("./access");
const staff = require("./staff");
const accountDeletion = require("./accountDeletion");
const store = require("./store");

let io = null;
let mask = { forProvider: (b) => b, forCustomer: (b) => b };

const ADMIN_BOOKING_PERMS = ["bookings.view", "reviews.view", "payments.view", "monitoring.view", "complaints.view", "customers.view", "dashboard.view", "reports.view"];
const ADMIN_ACTIVITY_PERMS = ["dashboard.view", "audit.view"];
const ADMIN_CATALOG_PERMS = ["services.view", "providers.view", "dashboard.view"];

// The rooms a socket belongs in, from its token. Anything invalid, expired,
// revoked or deleted gets the public room only.
function roomsFor(socket) {
  const publicOnly = ["public"];
  const token = socket.handshake?.auth?.token;
  const payload = token && auth.verifyToken(token);
  if (!payload) return publicOnly;

  if (payload.role === "admin") {
    const admin = access.resolveByPhone(payload.phone);
    if (!admin) return publicOnly;
    const rooms = ["public", "admin:any", `adminuser:${admin.id}`];
    if (access.adminCan(admin, ADMIN_BOOKING_PERMS)) rooms.push("admin:bookings");
    if (access.adminCan(admin, ADMIN_ACTIVITY_PERMS)) rooms.push("admin:activity");
    if (access.adminCan(admin, ADMIN_CATALOG_PERMS)) rooms.push("admin:catalog");
    return rooms;
  }
  if (accountDeletion.isDeleted(payload.id)) return publicOnly;
  if (payload.role === "customer") return ["public", `customer:${payload.id}`];
  if (payload.role === "provider") {
    if (!payload.staffId) return ["public", `provider:${payload.id}`];
    const s = staff.getStaff(payload.staffId);
    if (!s || s.active === false || s.providerId !== payload.id) return publicOnly;
    return ["public", `staff:${s.id}`, s.permissions.includes("orders.view_all") ? `provider:${payload.id}` : `staff-limited:${s.id}`];
  }
  return publicOnly;
}

// masks: { forProvider(booking), forCustomer(booking) } — strip what each side
// must not see (e.g. a completed order's contact details).
function attach(ioInstance, masks) {
  io = ioInstance;
  if (masks) mask = masks;
  io.on("connection", (socket) => {
    for (const room of roomsFor(socket)) socket.join(room);
  });
}

const to = (rooms) => io.to(rooms);

// booking:created | booking:updated. `previous` = providers that used to hold
// the order (reassigned/swapped away) — they're told so it leaves their list.
function booking(event, b, { previous = [] } = {}) {
  if (!b) return;
  to("admin:bookings").emit(event, b);
  if (b.customerId) to(`customer:${b.customerId}`).emit(event, mask.forCustomer(b));
  const providerView = mask.forProvider(b);
  for (const pid of new Set([b.providerId, ...previous].filter(Boolean))) to(`provider:${pid}`).emit(event, providerView);
  const assigned = staff.assignmentFor(b.id);
  if (assigned) to(`staff-limited:${assigned.staffId}`).emit(event, providerView);
}

function checkpoint(b, cp) {
  if (!b) return;
  to("admin:bookings").emit("booking:checkpoint", cp);
  if (b.customerId) to(`customer:${b.customerId}`).emit("booking:checkpoint", cp);
  if (b.providerId) to(`provider:${b.providerId}`).emit("booking:checkpoint", cp);
  const assigned = staff.assignmentFor(b.id);
  if (assigned) to(`staff-limited:${assigned.staffId}`).emit("booking:checkpoint", cp);
}

async function message(bookingId, msg) {
  const b = await store.getBooking(bookingId);
  if (!b) return;
  const payload = { bookingId, message: msg };
  to("admin:bookings").emit("message:created", payload);
  if (b.customerId) to(`customer:${b.customerId}`).emit("message:created", payload);
  if (b.providerId) to(`provider:${b.providerId}`).emit("message:created", payload);
  const assigned = staff.assignmentFor(bookingId);
  if (assigned) to(`staff-limited:${assigned.staffId}`).emit("message:created", payload);
}

function notification(n) {
  if (!n?.recipientId) return;
  const room = n.recipientType === "customer" ? `customer:${n.recipientId}` : n.recipientType === "provider" ? `provider:${n.recipientId}` : null;
  if (room) to(room).emit("notification:created", n);
}

function activity(a) {
  if (a) to("admin:activity").emit("activity:created", a);
}

// Live (active/inactive) services are public catalogue data; anything still
// under review or rejected only goes to admins and the owning provider.
function service(event, s) {
  if (!s) return;
  if (["active", "inactive"].includes(s.status)) return to("public").emit(event, s);
  const rooms = ["admin:catalog"];
  if (s.providerId) rooms.push(`provider:${s.providerId}`);
  to(rooms).emit(event, s);
}

// Disconnect sockets in a room; the app reconnects and is re-evaluated (so a
// deactivated staff member, deleted account or changed role loses access now).
function kick(room) {
  if (io) io.in(room).disconnectSockets(true);
}

module.exports = { attach, booking, checkpoint, message, notification, activity, service, kick };
