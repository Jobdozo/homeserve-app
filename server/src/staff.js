// Service provider staff management: a company/provider account can add
// employees who sign in with their own mobile number, with per-staff module
// access, service and area/PIN assignments, order assignment and an activity
// log. Staff act on the company's data (their token carries the company's
// provider id plus their staffId); this module resolves who they are and what
// they may do. Flat-JSON storage (see jsonStore.js).
const jsonStore = require("./jsonStore");
const store = require("./store");
const auth = require("./auth");

const STAFF = "providerStaff";
const ASSIGNMENTS = "orderAssignments";
const ACTIVITY = "staffActivity";
const MAX_ACTIVITY = 3000; // keep the log bounded

const fail = (status, message) => Object.assign(new Error(message), { status });

// Modules a staff member can be given access to.
const PERMISSION_GROUPS = [
  {
    key: "orders", label: "Orders",
    permissions: [
      ["orders.view_all", "See all company orders"],
      ["orders.view_assigned", "See only orders assigned to them"],
      ["orders.act", "Accept, reject, start, complete or swap orders (with photos and check-ins)"],
      ["orders.assign", "Assign orders to staff"],
    ],
  },
  { key: "messages", label: "Messages", permissions: [["messages.use", "Chat with customers"]] },
  { key: "services", label: "Services", permissions: [["services.view", "View services"], ["services.manage", "Add and edit services"]] },
  { key: "earnings", label: "Earnings & wallet", permissions: [["earnings.view", "View earnings, wallet balance and fees"]] },
  { key: "ads", label: "Advertising", permissions: [["ads.manage", "Create and manage ads (spends wallet balance)"]] },
  { key: "profile", label: "Business profile", permissions: [["profile.edit", "Edit business profile, documents, service area and availability"]] },
  { key: "staff", label: "Staff management", permissions: [["staff.view", "View staff and their activity"], ["staff.manage", "Add, edit and deactivate staff, and change permissions"]] },
];
const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map(([k]) => k));

const ROLE_TEMPLATES = {
  "Company Admin": ALL_PERMISSIONS.filter((p) => p !== "orders.view_assigned"),
  Manager: ["orders.view_all", "orders.act", "orders.assign", "messages.use", "services.view", "services.manage", "earnings.view", "staff.view"],
  Supervisor: ["orders.view_all", "orders.act", "orders.assign", "messages.use", "services.view", "staff.view"],
  Technician: ["orders.view_assigned", "orders.act", "messages.use"],
  "Field Staff": ["orders.view_assigned", "orders.act"],
  "Customer Support": ["orders.view_all", "messages.use", "services.view"],
  Accountant: ["orders.view_all", "earnings.view"],
};

// Role defaults are a Business Rule: the Super Admin can override any
// template in Settings; anything not overridden uses the built-ins above.
function roleTemplates() {
  const custom = store.getSettings().providerStaffRoleTemplates;
  return custom ? { ...ROLE_TEMPLATES, ...custom } : ROLE_TEMPLATES;
}

function validateTemplates(input) {
  if (input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw fail(400, "Role templates must be an object");
  const out = {};
  for (const [name, perms] of Object.entries(input)) {
    if (!ROLE_TEMPLATES[name]) throw fail(400, `Unknown staff role: ${name}`);
    out[name] = cleanPermissions(perms);
  }
  return out;
}

function cleanPermissions(input) {
  const list = [...new Set((Array.isArray(input) ? input : []).map(String))];
  const bad = list.find((p) => !ALL_PERMISSIONS.includes(p));
  if (bad) throw fail(400, `Unknown permission: ${bad}`);
  return list;
}

const has = (perms, needed) => (Array.isArray(needed) ? needed.some((n) => perms.includes(n)) : perms.includes(needed));

// ---- staff records ----
const normPhone = (p) => auth.normalizePhone(p);
const last10 = (p) => normPhone(p).slice(-10);

function allStaff() {
  return jsonStore.readAll(STAFF);
}

function getStaff(id) {
  return allStaff().find((s) => s.id === id) || null;
}

function activeStaffByPhone(phone) {
  const t = last10(phone);
  return allStaff().find((s) => s.active !== false && last10(s.phone) === t) || null;
}

function cleanPincodes(input) {
  const list = (Array.isArray(input) ? input : String(input || "").split(/[\s,]+/)).map((p) => String(p).trim()).filter(Boolean);
  const bad = list.find((p) => !/^\d{6}$/.test(p));
  if (bad) throw fail(400, `"${bad}" isn't a valid 6-digit PIN code`);
  return [...new Set(list)];
}

async function cleanServiceIds(providerId, input) {
  const ids = [...new Set((Array.isArray(input) ? input : []).map(String))];
  if (ids.length === 0) return [];
  const own = new Set((await store.listProviderServices(providerId)).map((s) => s.id));
  const bad = ids.find((id) => !own.has(id));
  if (bad) throw fail(400, "One of the selected services isn't yours");
  return ids;
}

// `actor` = the person doing this: { owner: true, name } or { staff }. A staff
// manager can only hand out permissions they hold themselves.
function assertCanGrant(actor, perms) {
  if (actor.owner) return;
  const mine = actor.staff?.permissions || [];
  const extra = perms.find((p) => !mine.includes(p) && !(p === "orders.view_assigned" && mine.includes("orders.view_all")));
  if (extra) throw fail(403, "You can only give permissions you have yourself");
}

async function createStaff(providerId, input, actor) {
  const cfg = store.getSettings();
  if (!cfg.providerStaffEnabled) throw fail(403, "Adding staff isn't available right now");
  if (allStaff().filter((s) => s.providerId === providerId && s.active !== false).length >= cfg.providerStaffMax) {
    throw fail(409, `You can have at most ${cfg.providerStaffMax} active staff members`);
  }
  const name = String(input.name || "").trim().slice(0, 60);
  if (!name) throw fail(400, "Name is required");
  const phone = normPhone(input.phone);
  if (!/^\+?\d{10,15}$/.test(phone)) throw fail(400, "Enter a valid mobile number (with country code, e.g. +91…)");
  if (activeStaffByPhone(phone)) throw fail(409, "That number is already a staff member");
  if (await store.getProviderByPhone(phone)) throw fail(409, "That number already has its own service provider account, so it can't be added as staff");
  const role = roleTemplates()[input.role] ? input.role : "Field Staff";
  const permissions = input.permissions !== undefined ? cleanPermissions(input.permissions) : roleTemplates()[role];
  assertCanGrant(actor, permissions);
  const email = String(input.email || "").trim().slice(0, 100);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw fail(400, "Enter a valid email address");
  const record = jsonStore.insert(STAFF, {
    providerId, name, phone, email, role, permissions,
    serviceIds: await cleanServiceIds(providerId, input.serviceIds),
    pincodes: cleanPincodes(input.pincodes),
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.name,
    lastLoginAt: null,
  });
  log(providerId, { name: actor.name }, "Added staff member", null, `${name} (${role})`, true);
  return record;
}

async function updateStaff(providerId, id, input, actor) {
  const s = getStaff(id);
  if (!s || s.providerId !== providerId) return null;
  const isSelf = actor.staff?.id === id;
  const patch = {};
  if (input.name !== undefined) {
    patch.name = String(input.name).trim().slice(0, 60);
    if (!patch.name) throw fail(400, "Name is required");
  }
  if (input.email !== undefined) {
    patch.email = String(input.email || "").trim().slice(0, 100);
    if (patch.email && !/^\S+@\S+\.\S+$/.test(patch.email)) throw fail(400, "Enter a valid email address");
  }
  if (input.phone !== undefined && last10(input.phone) !== last10(s.phone)) {
    const phone = normPhone(input.phone);
    if (!/^\+?\d{10,15}$/.test(phone)) throw fail(400, "Enter a valid mobile number (with country code, e.g. +91…)");
    const other = activeStaffByPhone(phone);
    if (other && other.id !== id) throw fail(409, "That number is already a staff member");
    if (await store.getProviderByPhone(phone)) throw fail(409, "That number already has its own service provider account");
    patch.phone = phone;
  }
  if (input.role !== undefined || input.permissions !== undefined || input.active !== undefined) {
    if (isSelf) throw fail(400, "You can't change your own role, permissions or status");
  }
  if (input.role !== undefined) {
    if (!roleTemplates()[input.role]) throw fail(400, "Choose a valid role");
    patch.role = input.role;
  }
  if (input.permissions !== undefined) {
    patch.permissions = cleanPermissions(input.permissions);
    const added = patch.permissions.filter((p) => !s.permissions.includes(p));
    assertCanGrant(actor, added);
  }
  // Company Admin-level staff can only be changed by the owner or another admin.
  if (!actor.owner && s.role === "Company Admin" && actor.staff?.role !== "Company Admin") {
    throw fail(403, "Only the account owner or a Company Admin can change a Company Admin");
  }
  if (input.active !== undefined) patch.active = Boolean(input.active);
  if (input.serviceIds !== undefined) patch.serviceIds = await cleanServiceIds(providerId, input.serviceIds);
  if (input.pincodes !== undefined) patch.pincodes = cleanPincodes(input.pincodes);
  const updated = jsonStore.update(STAFF, id, patch);
  const what = [
    patch.active === false ? "Deactivated" : patch.active === true ? "Reactivated" : "Edited",
  ][0];
  log(providerId, { name: actor.name }, `${what} staff member`, null, updated.name, true);
  return updated;
}

// ---- assignments ----
function assignments() {
  return new Map(jsonStore.readAll(ASSIGNMENTS).map((a) => [a.id, a]));
}

function assignmentFor(bookingId) {
  return jsonStore.readAll(ASSIGNMENTS).find((a) => a.id === bookingId) || null;
}

function assignedBookingIds(staffId) {
  return new Set(jsonStore.readAll(ASSIGNMENTS).filter((a) => a.staffId === staffId).map((a) => a.id));
}

// Assign (or clear, with staffId null) an order. Returns the assignee's summary.
async function assignOrder(providerId, booking, staffId, actor) {
  if (booking.providerId !== providerId) throw fail(403, "Not your order");
  const existing = assignmentFor(booking.id);
  if (!staffId) {
    if (existing) jsonStore.remove(ASSIGNMENTS, booking.id);
    if (existing) log(providerId, { name: actor.name }, "Unassigned order", booking.id, `from ${getStaff(existing.staffId)?.name || "staff"}`, true);
    return null;
  }
  const s = getStaff(staffId);
  if (!s || s.providerId !== providerId || s.active === false) throw fail(400, "That staff member isn't available");
  if (["Completed", "Rejected", "Cancelled"].includes(booking.status)) throw fail(409, "This order is already finished");
  const record = { id: booking.id, staffId, providerId, assignedAt: new Date().toISOString(), assignedBy: actor.name };
  if (existing) jsonStore.update(ASSIGNMENTS, booking.id, record);
  else jsonStore.insert(ASSIGNMENTS, record);
  log(providerId, { name: actor.name }, "Assigned order", booking.id, `to ${s.name}`, true);
  try {
    await store.addNotification({
      recipientType: "provider",
      recipientId: providerId,
      type: "booking",
      title: "Order assigned",
      message: `${booking.service?.name || "An order"} was assigned to ${s.name}.`,
      bookingId: booking.id,
      skipPush: true,
    });
  } catch (e) {
    console.error("assignment notification failed", e);
  }
  return { id: s.id, name: s.name };
}

function clearAssignment(bookingId) {
  return jsonStore.remove(ASSIGNMENTS, bookingId);
}

// ---- activity log ----
function log(providerId, who, action, bookingId, detail, byOwner = false) {
  try {
    jsonStore.insert(ACTIVITY, {
      providerId,
      staffId: who.id || null,
      staffName: who.name,
      byOwner,
      action,
      bookingId: bookingId || null,
      detail: detail || "",
      at: new Date().toISOString(),
    });
    const all = jsonStore.readAll(ACTIVITY);
    if (all.length > MAX_ACTIVITY) jsonStore.writeAll(ACTIVITY, all.slice(all.length - MAX_ACTIVITY));
  } catch (e) {
    console.error("staff activity log failed", e);
  }
}

function listActivity(providerId, { staffId, limit = 100 } = {}) {
  return jsonStore
    .readAll(ACTIVITY)
    .filter((a) => a.providerId === providerId && (!staffId || a.staffId === staffId))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

// ---- views ----
const orderLine = (b, ref) => ({
  id: b.id, ref: b.ref, service: b.service?.name || "", status: b.status, amount: b.amount, date: b.date, time: b.time,
  customerName: b.customer?.name || "", createdAt: b.createdAt, assignedAt: ref?.assignedAt || null,
});

async function listWithStats(providerId) {
  const staff = allStaff().filter((s) => s.providerId === providerId);
  const bookings = await store.listBookings({ providerId });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const asg = jsonStore.readAll(ASSIGNMENTS).filter((a) => a.providerId === providerId);
  const lastSeen = new Map();
  for (const a of listActivity(providerId, { limit: MAX_ACTIVITY })) if (a.staffId && !lastSeen.has(a.staffId)) lastSeen.set(a.staffId, a.at);
  return staff.map((s) => {
    const mine = asg.filter((a) => a.staffId === s.id).map((a) => byId.get(a.id)).filter(Boolean);
    return {
      ...s,
      pending: mine.filter((b) => ["Pending", "Accepted", "In Progress"].includes(b.status)).length,
      completed: mine.filter((b) => b.status === "Completed").length,
      lastActiveAt: lastSeen.get(s.id) || s.lastLoginAt || null,
    };
  });
}

async function detail(providerId, id) {
  const s = getStaff(id);
  if (!s || s.providerId !== providerId) return null;
  const bookings = await store.listBookings({ providerId });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const mine = jsonStore.readAll(ASSIGNMENTS).filter((a) => a.staffId === id && a.providerId === providerId);
  const lines = mine.map((a) => ({ b: byId.get(a.id), a })).filter((x) => x.b).map((x) => orderLine(x.b, x.a));
  const sortDesc = (l) => l.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
  return {
    staff: s,
    pendingOrders: sortDesc(lines.filter((o) => ["Pending", "Accepted", "In Progress"].includes(o.status))),
    completedOrders: sortDesc(lines.filter((o) => o.status === "Completed")).slice(0, 50),
    otherOrders: sortDesc(lines.filter((o) => ["Rejected", "Cancelled"].includes(o.status))).slice(0, 20),
    activity: listActivity(providerId, { staffId: id, limit: 100 }),
  };
}

async function catalogue(providerId) {
  return {
    groups: PERMISSION_GROUPS.map((g) => ({ key: g.key, label: g.label, permissions: g.permissions.map(([key, label]) => ({ key, label })) })),
    roles: Object.entries(roleTemplates()).map(([name, permissions]) => ({ name, permissions })),
    services: (await store.listProviderServices(providerId)).map((s) => ({ id: s.id, name: s.name, status: s.status })),
  };
}

// ---- login / request guard ----
function loginProfile(staff) {
  return { id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions, isStaff: true };
}

function recordLogin(staff) {
  jsonStore.update(STAFF, staff.id, { lastLoginAt: new Date().toISOString() });
  log(staff.providerId, staff, "Signed in", null, "");
}

const bookingIdOf = (path) => (path.match(/^\/(?:bookings|messages)\/([^/]+)/) || [])[1];
const ACTING = /^\/bookings\/[^/]+\/(swap|otp\/verify)$/;

// What each provider route needs from a staff member. "owner" = the account
// owner only; null = any signed-in staff. `scope: true` also requires access to
// the specific order in the path.
function ruleFor(method, path) {
  const write = method !== "GET" && method !== "HEAD";
  if (/^\/auth\/me$/.test(path)) return { needs: null };
  if (/^\/provider\/agreement/.test(path)) return { needs: "owner" };
  if (/^\/provider\/swap-rules$/.test(path)) return { needs: null };
  if (/^\/provider\/assignable-staff$/.test(path)) return { needs: "orders.assign" };
  if (/^\/provider\/staff\/activity$/.test(path)) return { needs: ["staff.view", "staff.manage"] };
  if (/^\/provider\/staff/.test(path)) return { needs: write ? "staff.manage" : ["staff.view", "staff.manage"] };
  if (/^\/provider\/orders\/[^/]+\/assign$/.test(path)) return { needs: "orders.assign", scope: false };
  if (/^\/provider\/(capacity|wallet)$/.test(path) || /^\/providers\/[^/]+\/earnings$/.test(path)) return { needs: null };
  if (/^\/provider\/ads/.test(path)) return { needs: "ads.manage" };
  if (/^\/provider\/kyc-documents/.test(path)) return { needs: "profile.edit" };
  if (/^\/provider\/service-changes$/.test(path)) return { needs: ["services.view", "services.manage"] };
  if (/^\/provider\/notification-prefs$/.test(path)) return { needs: write ? "profile.edit" : null };
  if (/^\/providers\/[^/]+\/(coverage|profile)$/.test(path)) return { needs: "profile.edit" };
  if (/^\/providers\/[^/]+\/services/.test(path)) return { needs: write ? "services.manage" : null };
  if (/^\/(push|provider\/fcm-token)/.test(path) || /^\/notifications/.test(path)) return { needs: null };
  if (path === "/bookings") return { needs: null };
  if (/^\/messages\/[^/]+$/.test(path)) return { needs: "messages.use", scope: true };
  if (/^\/bookings\/[^/]+\/(photos|checkpoints)$/.test(path)) return { needs: write ? "orders.act" : ["orders.view_all", "orders.view_assigned"], scope: true };
  if (ACTING.test(path)) return { needs: "orders.act", scope: true };
  if (/^\/bookings\/[^/]+$/.test(path)) return { needs: write ? "orders.act" : ["orders.view_all", "orders.view_assigned"], scope: true };
  // Any other provider-account route stays with the owner.
  if (/^\/provider(s)?(\/|$)/.test(path)) return { needs: "owner" };
  return { needs: null };
}

function describeAction(method, path, body) {
  if (method === "PATCH" && /^\/bookings\/[^/]+$/.test(path)) return `Marked order ${body?.status || "updated"}`;
  if (/\/swap$/.test(path)) return "Swapped an order to another provider";
  if (/\/otp\/verify$/.test(path)) return body?.type === "complete" ? "Verified the completion code" : "Verified the start code";
  if (/\/checkpoints$/.test(path)) return `Checked in: ${String(body?.type || "").replace(/_/g, " ")}`;
  if (/\/photos$/.test(path)) return "Uploaded a job photo";
  if (/^\/messages\//.test(path) && method === "POST") return "Messaged the customer";
  if (/^\/providers\/[^/]+\/services/.test(path)) return method === "POST" ? "Added a service" : "Edited a service";
  if (/^\/providers\/[^/]+\/(coverage|profile)$/.test(path)) return "Updated the business profile / service area";
  if (/^\/provider\/ads/.test(path)) return "Changed an ad";
  if (/^\/provider\/kyc-documents/.test(path)) return "Changed KYC documents";
  return null;
}

// Runs for every provider-role token that carries a staffId.
function guard(req, payload) {
  if (!payload.staffId) return null; // the account owner
  const staff = getStaff(payload.staffId);
  if (!staff || staff.active === false || staff.providerId !== payload.id) {
    return { status: 401, error: "This staff account no longer has access" };
  }
  req.staff = staff;
  const path = req.originalUrl.split("?")[0].replace(/^\/api/, "");
  const rule = ruleFor(req.method, path);
  if (rule.needs === "owner") return { status: 403, error: "Only the account owner can do that" };
  if (rule.needs !== null && rule.needs !== undefined && !has(staff.permissions, rule.needs)) {
    return { status: 403, error: "You don't have access to that" };
  }
  if (rule.scope) {
    const bid = bookingIdOf(path);
    const sees = staff.permissions.includes("orders.view_all") || (staff.permissions.includes("orders.view_assigned") && assignmentFor(bid)?.staffId === staff.id);
    if (!sees) return { status: 403, error: "That order isn't assigned to you" };
  }
  const label = req.method !== "GET" ? describeAction(req.method, path, req.body) : null;
  if (label) {
    const bookingId = bookingIdOf(path) || null;
    req.res?.on?.("finish", () => {
      if (req.res.statusCode < 400) log(staff.providerId, staff, label, bookingId, "");
    });
  }
  return null;
}

// Scope helpers for list endpoints.
function ordersScope(staff) {
  if (!staff) return "all";
  if (staff.permissions.includes("orders.view_all")) return "all";
  if (staff.permissions.includes("orders.view_assigned")) return "assigned";
  return "none";
}

const EMPTY_PERIOD = { total: 0, changePct: 0, breakdown: { completedJobs: 0, inProgressJobs: 0, cancelledJobs: 0, platformFeePct: 0, platformFeeAmt: 0 } };
const emptyEarnings = () => ({
  allTime: 0, thisMonth: 0, changePct: 0, breakdown: EMPTY_PERIOD.breakdown,
  periods: { Daily: EMPTY_PERIOD, Weekly: EMPTY_PERIOD, Monthly: EMPTY_PERIOD, Yearly: EMPTY_PERIOD },
  transactions: [], restricted: true,
});

module.exports = {
  PERMISSION_GROUPS, ROLE_TEMPLATES, roleTemplates, validateTemplates,
  getStaff, activeStaffByPhone, createStaff, updateStaff, listWithStats, detail, catalogue,
  assignments, assignmentFor, assignedBookingIds, assignOrder, clearAssignment,
  log, listActivity, loginProfile, recordLogin, guard, ordersScope, emptyEarnings,
};
