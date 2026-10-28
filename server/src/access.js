// Super Admin user management: internal staff accounts, roles and
// permissions, plus the per-request guard that enforces them on every admin
// route. Flat-JSON storage (see jsonStore.js).
//
// A permission is "<module>.<action>". "<module>.manage" grants every action
// in that module (e.g. payments.manage = "Manage payments"), and "*" grants
// everything (Super Admin). Owners — the phone numbers in ADMIN_PHONES — are
// always Super Admin, so the portal can never be locked out.
const jsonStore = require("./jsonStore");
const auth = require("./auth");

const USERS = "adminUsers";
const ROLES = "adminRoles";

const ACTIONS = ["view", "add", "edit", "delete", "approve", "reject", "export", "import", "manage"];

// Which actions make sense per module (drives the permission matrix).
const MODULES = [
  { key: "dashboard", label: "Dashboard", actions: ["view"] },
  { key: "customers", label: "Customers", actions: ["view", "add", "edit", "delete", "export", "import", "manage"] },
  { key: "providers", label: "Service providers", actions: ["view", "add", "edit", "delete", "approve", "reject", "export", "import", "manage"] },
  { key: "crm", label: "Provider CRM (leads, follow-ups, pipeline)", actions: ["view", "add", "edit", "delete", "manage"] },
  { key: "services", label: "Services & categories", actions: ["view", "add", "edit", "delete", "approve", "reject", "export", "import", "manage"] },
  { key: "bookings", label: "Bookings & conversations", actions: ["view", "edit", "export", "manage"] },
  { key: "payments", label: "Payments & wallets", actions: ["view", "edit", "export", "manage"] },
  { key: "reviews", label: "Reviews & ratings", actions: ["view", "delete", "manage"] },
  { key: "complaints", label: "Complaints & disputes", actions: ["view", "add", "edit", "delete", "approve", "reject", "export", "manage"] },
  { key: "monitoring", label: "Live provider monitoring", actions: ["view", "export", "manage"] },
  { key: "notifications", label: "Notifications", actions: ["view", "add", "manage"] },
  { key: "cms", label: "Home layout, banners & offers", actions: ["view", "add", "edit", "delete", "manage"] },
  { key: "locations", label: "Locations (cities, areas, PIN codes)", actions: ["view", "add", "edit", "delete", "manage"] },
  { key: "reports", label: "Reports & analytics", actions: ["view", "export", "manage"] },
  { key: "data", label: "Data import & export", actions: ["export", "import", "manage"] },
  { key: "settings", label: "Settings", actions: ["view", "edit", "delete", "manage"] },
  { key: "audit", label: "Audit logs", actions: ["view", "export"] },
  { key: "users", label: "User management", actions: ["view", "add", "edit", "delete", "manage"] },
  { key: "ai", label: "AI agents (approvals, alerts, agent accounts)", actions: ["view", "approve", "manage"] },
  { key: "inbox", label: "WhatsApp inbox (customer chats)", actions: ["view", "add", "manage"] },
  { key: "email", label: "Email inbox (support@tikdum.com)", actions: ["view", "add", "manage"] },
  { key: "accounting", label: "Accounting & GST (invoices, credit notes, returns)", actions: ["view", "export", "manage"] },
  { key: "social", label: "Social media posts (Facebook, Instagram)", actions: ["view", "add", "manage"] },
  { key: "blog", label: "Blog articles (tikdum.com/blog)", actions: ["view", "add", "edit", "delete", "approve", "manage"] },
];

// One-time grants for permissions added after roles were first saved (saved
// roles don't pick up new modules by themselves). Each runs once, ever.
const ROLE_MIGRATIONS = [
  { id: "2026-10-inbox", grant: { support: ["inbox.view", "inbox.add"], admin: ["inbox.view", "inbox.add"] } },
  {
    id: "2026-10-crm",
    grant: {
      admin: ["crm.view", "crm.add", "crm.edit", "crm.delete"],
      registration: ["crm.view", "crm.add", "crm.edit"],
      verification: ["crm.view", "crm.add", "crm.edit"],
      operations: ["crm.view", "crm.add", "crm.edit"],
      management: ["crm.view"],
    },
  },
  // create: built-in roles (DEFAULT_ROLES) added after roles were first saved.
  { id: "2026-10-social", create: ["marketing"], grant: { admin: ["social.view", "social.add"] } },
  // Marketing proposes scheduled push campaigns (an agent can only propose them: agents.policy).
  { id: "2026-10-push", grant: { marketing: ["notifications.view", "notifications.add"] } },
  // The blog: the SEO Agent (management role) writes drafts and proposes publishing them (an agent
  // can't publish itself — "approve" isn't an agent write); Marketing shares published articles.
  {
    id: "2026-10-blog",
    grant: { admin: ["blog.view", "blog.add", "blog.edit", "blog.delete", "blog.approve"], management: ["blog.view", "blog.add", "blog.approve"], marketing: ["blog.view"] },
  },
  // The email inbox (mailbox.js): read and answered by people; agents may not send (agents.policy).
  { id: "2026-10-email", grant: { support: ["email.view", "email.add"], admin: ["email.view", "email.add"] } },
];
function runRoleMigrations(roles) {
  const done = new Set(jsonStore.readAll("accessMigrations").map((m) => m.id));
  for (const mig of ROLE_MIGRATIONS) {
    if (done.has(mig.id)) continue;
    for (const key of mig.create || []) {
      const r = DEFAULT_ROLES.find((x) => x.key === key);
      if (!r || roles.some((x) => x.id === key)) continue;
      roles.push(jsonStore.insert(ROLES, { id: r.key, name: r.name, description: r.description, permissions: r.permissions, system: true, locked: false, createdAt: new Date().toISOString() }));
    }
    for (const [roleId, perms] of Object.entries(mig.grant || {})) {
      const role = roles.find((r) => r.id === roleId);
      if (!role || role.locked) continue;
      const next = [...new Set([...(role.permissions || []), ...perms])];
      if (next.length !== role.permissions.length) {
        jsonStore.update(ROLES, role.id, { permissions: next });
        role.permissions = next;
      }
    }
    jsonStore.insert("accessMigrations", { id: mig.id, at: new Date().toISOString() });
  }
  return roles;
}

const all = (module, actions) => actions.map((a) => `${module}.${a}`);
const everything = MODULES.flatMap((m) => all(m.key, m.actions.filter((a) => a !== "manage")));

const DEFAULT_ROLES = [
  { key: "super_admin", name: "Super Admin", description: "Full access to everything, including user management.", permissions: ["*"], locked: true },
  {
    key: "admin", name: "Admin", description: "Runs the platform day to day; can't manage users or delete platform data.",
    permissions: everything.filter((p) => !p.startsWith("users.") && !p.startsWith("accounting.") && p !== "settings.delete").concat(["users.view"]),
  },
  {
    key: "registration", name: "Registration Team", description: "Onboards customers and providers.",
    permissions: [...all("customers", ["view", "add", "edit", "export", "import"]), ...all("providers", ["view", "add", "edit", "import"]), ...all("crm", ["view", "add", "edit"]), "data.import", "dashboard.view"],
  },
  {
    key: "verification", name: "Provider Verification Team", description: "Reviews and approves providers and their services.",
    permissions: [...all("providers", ["view", "edit", "approve", "reject"]), ...all("crm", ["view", "add", "edit"]), ...all("services", ["view", "approve", "reject"]), "monitoring.view", "dashboard.view"],
  },
  {
    key: "payments", name: "Payment Team", description: "Handles wallets, fees and payment reports.",
    permissions: ["payments.manage", "providers.view", ...all("reports", ["view", "export"]), "dashboard.view"],
  },
  {
    key: "complaints", name: "Complaint Handling Team", description: "Investigates and resolves complaints and disputes.",
    permissions: ["complaints.manage", "bookings.view", "customers.view", "providers.view", ...all("monitoring", ["view"])],
  },
  {
    key: "support", name: "Customer Support", description: "Helps customers and logs complaints.",
    permissions: [...all("customers", ["view", "edit"]), ...all("bookings", ["view"]), ...all("complaints", ["view", "add", "edit"]), "providers.view", "notifications.view"],
  },
  {
    key: "operations", name: "Operations Team", description: "Keeps bookings, providers and live activity running smoothly.",
    permissions: [...all("bookings", ["view", "edit", "export"]), ...all("providers", ["view", "edit"]), ...all("crm", ["view", "add", "edit"]), "monitoring.manage", ...all("services", ["view", "edit"]), ...all("notifications", ["view", "add"]), "customers.view", "dashboard.view"],
  },
  {
    key: "management", name: "Reporting / Management Team", description: "Read-only oversight with report exports.",
    permissions: [
      "dashboard.view", ...all("reports", ["view", "export"]), ...all("monitoring", ["view", "export"]), "payments.view", "bookings.view",
      "audit.view", "complaints.view", "providers.view", "customers.view", "services.view", "crm.view",
    ],
  },
  {
    key: "marketing", name: "Marketing Team", description: "Plans and publishes Facebook and Instagram posts and push notification campaigns; reads reports.",
    permissions: [...all("social", ["view", "add"]), ...all("notifications", ["view", "add"]), "cms.view", "reports.view", "dashboard.view", "services.view"],
  },
];

const fail = (status, message) => Object.assign(new Error(message), { status });
const validPermission = (p) => {
  if (p === "*") return true;
  const [m, a] = String(p).split(".");
  const mod = MODULES.find((x) => x.key === m);
  return Boolean(mod && mod.actions.includes(a));
};

// ---- roles ----
function listRoles() {
  let roles = jsonStore.readAll(ROLES);
  if (roles.length === 0) {
    roles = DEFAULT_ROLES.map((r) =>
      jsonStore.insert(ROLES, { id: r.key, name: r.name, description: r.description, permissions: r.permissions, system: true, locked: Boolean(r.locked), createdAt: new Date().toISOString() })
    );
  }
  roles = runRoleMigrations(roles);
  const users = jsonStore.readAll(USERS);
  return roles.map((r) => ({ ...r, userCount: users.filter((u) => u.roleId === r.id).length }));
}

const roleById = (id) => listRoles().find((r) => r.id === id);

function cleanPermissions(input) {
  const list = [...new Set((Array.isArray(input) ? input : []).map(String))];
  const bad = list.find((p) => !validPermission(p));
  if (bad) throw fail(400, `Unknown permission: ${bad}`);
  if (list.includes("*")) throw fail(400, "Full access can only be given by the Super Admin role");
  // "manage" already covers the module, so drop that module's other entries.
  const managed = new Set(list.filter((p) => p.endsWith(".manage")).map((p) => p.split(".")[0]));
  return list.filter((p) => p.endsWith(".manage") || !managed.has(p.split(".")[0]));
}

function createRole({ name, description, permissions, copyFrom }) {
  const clean = String(name || "").trim().slice(0, 50);
  if (!clean) throw fail(400, "Role name is required");
  if (listRoles().some((r) => r.name.toLowerCase() === clean.toLowerCase())) throw fail(409, "A role with that name already exists");
  const source = copyFrom ? roleById(copyFrom) : null;
  const perms = permissions !== undefined ? cleanPermissions(permissions) : source && !source.locked ? source.permissions : [];
  return jsonStore.insert(ROLES, {
    id: `role_${Date.now().toString(36)}`,
    name: clean,
    description: String(description || "").trim().slice(0, 200),
    permissions: perms,
    system: false,
    locked: false,
    createdAt: new Date().toISOString(),
  });
}

function updateRole(id, { name, description, permissions }) {
  const role = roleById(id);
  if (!role) return null;
  if (role.locked) throw fail(400, "The Super Admin role always has full access and can't be changed");
  const patch = {};
  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 50);
    if (!clean) throw fail(400, "Role name is required");
    if (listRoles().some((r) => r.id !== id && r.name.toLowerCase() === clean.toLowerCase())) throw fail(409, "A role with that name already exists");
    patch.name = clean;
  }
  if (description !== undefined) patch.description = String(description).trim().slice(0, 200);
  if (permissions !== undefined) patch.permissions = cleanPermissions(permissions);
  jsonStore.update(ROLES, id, patch);
  return roleById(id);
}

function deleteRole(id) {
  const role = roleById(id);
  if (!role) return false;
  if (role.system) throw fail(400, "Built-in roles can't be deleted — edit their permissions instead");
  if (role.userCount > 0) throw fail(409, "Some staff still have this role — move them to another role first");
  return jsonStore.remove(ROLES, id);
}

// ---- users ----
const normPhone = (p) => auth.normalizePhone(p);
const publicUser = (u, roles) => ({ ...u, roleName: roles.find((r) => r.id === u.roleId)?.name || "—" });

function listUsers() {
  const roles = listRoles();
  const owners = auth.adminPhones().map((phone) => ({
    id: `admin:${phone}`, name: "Owner", phone, roleId: "super_admin", roleName: "Super Admin", active: true, owner: true,
  }));
  const staff = jsonStore.readAll(USERS).map((u) => publicUser(u, roles));
  return [...owners, ...staff];
}

function cleanUserFields({ name, phone, email, roleId }, { partial = false } = {}) {
  const out = {};
  if (!partial || name !== undefined) {
    out.name = String(name || "").trim().slice(0, 60);
    if (!out.name) throw fail(400, "Name is required");
  }
  if (!partial || phone !== undefined) {
    out.phone = normPhone(phone);
    if (!/^\+?\d{10,15}$/.test(out.phone)) throw fail(400, "Enter a valid mobile number (with country code, e.g. +91…)");
  }
  if (email !== undefined) {
    out.email = String(email || "").trim().slice(0, 100);
    if (out.email && !/^\S+@\S+\.\S+$/.test(out.email)) throw fail(400, "Enter a valid email address");
  }
  if (!partial || roleId !== undefined) {
    if (!roleById(roleId)) throw fail(400, "Choose a role");
    out.roleId = roleId;
  }
  return out;
}

const samePhone = (a, b) => normPhone(a).slice(-10) === normPhone(b).slice(-10);

function phoneTaken(phone, exceptId) {
  return (
    auth.adminPhones().some((p) => samePhone(p, phone)) ||
    jsonStore.readAll(USERS).some((u) => u.id !== exceptId && samePhone(u.phone, phone))
  );
}

function createUser(input, actor) {
  const data = cleanUserFields(input);
  if (phoneTaken(data.phone)) throw fail(409, "That mobile number already has an admin account");
  return jsonStore.insert(USERS, { ...data, email: data.email || "", active: true, createdAt: new Date().toISOString(), createdBy: actor, lastLoginAt: null });
}

function updateUser(id, input, self) {
  const user = jsonStore.readAll(USERS).find((u) => u.id === id);
  if (!user) return null;
  const data = cleanUserFields(input, { partial: true });
  if (input.active !== undefined) data.active = Boolean(input.active);
  const isSelf = self && `admin:${normPhone(user.phone)}` === self;
  if (isSelf && (data.active === false || (data.roleId && data.roleId !== user.roleId))) {
    throw fail(400, "You can't deactivate your own account or change your own role");
  }
  if (data.phone && phoneTaken(data.phone, id)) throw fail(409, "That mobile number already has an admin account");
  return jsonStore.update(USERS, id, data);
}

function deleteUser(id, self) {
  const user = jsonStore.readAll(USERS).find((u) => u.id === id);
  if (!user) return false;
  if (self && `admin:${normPhone(user.phone)}` === self) throw fail(400, "You can't delete your own account");
  return jsonStore.remove(USERS, id);
}

// ---- resolving who is calling ----
// Returns { id, name, phone, roleId, roleName, permissions, owner } for an
// active admin/staff phone, or null if that number has no access (any more).
function resolveByPhone(phone) {
  if (normPhone(phone).replace(/\D/g, "").length < 10) return null;
  if (auth.isAdminPhone(phone)) {
    return { id: `admin:${normPhone(phone)}`, name: "Owner", phone: normPhone(phone), roleId: "super_admin", roleName: "Super Admin", permissions: ["*"], owner: true };
  }
  const user = jsonStore.readAll(USERS).find((u) => samePhone(u.phone, phone));
  if (!user || user.active === false) return null;
  const role = roleById(user.roleId);
  if (!role) return null;
  return { id: `admin:${normPhone(user.phone)}`, name: user.name, phone: normPhone(user.phone), roleId: role.id, roleName: role.name, permissions: role.permissions, owner: false, userId: user.id };
}

function recordLogin(phone) {
  const user = jsonStore.readAll(USERS).find((u) => samePhone(u.phone, phone));
  if (user) jsonStore.update(USERS, user.id, { lastLoginAt: new Date().toISOString() });
}

const has = (perms, needed) => {
  if (perms.includes("*")) return true;
  const [m] = needed.split(".");
  return perms.includes(needed) || perms.includes(`${m}.manage`);
};
// `needed` is a permission, or an array meaning "any of these".
const allowed = (perms, needed) => (Array.isArray(needed) ? needed.some((n) => has(perms, n)) : has(perms, needed));

// ---- route -> permission table ----
const byMethod = (m) => ({ GET: "view", HEAD: "view", POST: "add", PUT: "edit", PATCH: "edit", DELETE: "delete" }[m] || "edit");
const decisionAction = (v) => (v === "approved" || v === "approve" ? "approve" : v === "rejected" || v === "reject" ? "reject" : "edit");
const RULES = [
  // [path regex, (method, body, match) => permission | permission[] | null (any staff) | "super"]
  [/^\/auth\/me$/, () => null],
  [/^\/admin\/accounting\/(settings|invoices\/[^/]+\/credit-note)/, (m) => (m === "GET" ? "accounting.view" : "accounting.manage")],
  [/^\/admin\/accounting(\/|$)/, () => "accounting.view"],
  [/^\/admin\/ai\/actions\/[^/]+\/(approve|reject)$/, () => "ai.approve"],
  [/^\/admin\/ai\/office\/(tasks|goals)\/[^/]+\/decide$/, () => "ai.approve"],
  [/^\/admin\/ai\/office\/(tasks\/[^/]+\/messages|threads\/ceo\/messages)$/, () => "ai.view"],
  [/^\/admin\/ai\/feed\/[^/]+\/ack$/, () => "ai.view"],
  [/^\/admin\/ai\/(actions|feed)(\/|$)/, () => "ai.view"],
  [/^\/admin\/ai\//, (m) => (m === "GET" ? "ai.view" : "ai.manage")],
  [/^\/admin\/inbox(\/|$)/, (m) => (m === "GET" ? "inbox.view" : "inbox.add")],
  [/^\/admin\/email(\/|$)/, (m) => (m === "GET" ? "email.view" : "email.add")],
  [/^\/admin\/verification\/precheck$/, () => "providers.view"],
  [/^\/admin\/watch\/provider-quality$/, () => "providers.view"],
  [/^\/admin\/watch\/(retention|fraud|reviews)$/, () => "customers.view"],
  // The blog (blog.js): publishing is "approve" — a person, or a person approving the SEO Agent.
  [/^\/admin\/blog\/[^/]+\/publish$/, () => "blog.approve"],
  [/^\/admin\/blog\/[^/]+\/unpublish$/, () => "blog.edit"],
  [/^\/admin\/blog\/picture$/, () => "blog.add"],
  [/^\/admin\/blog(\/|$)/, (m) => `blog.${byMethod(m)}`],
  // Ads on the blog (blogAds.js): changing them is "manage" — not the SEO Agent's to touch.
  [/^\/admin\/blog-ads$/, (m) => (m === "GET" ? "blog.view" : "blog.manage")],
  // The Renewals Bot reads renewal dates; the list itself (/admin/paid-services) stays Super Admin only.
  [/^\/admin\/watch\/renewals$/, () => "reports.view"],
  [/^\/admin\/meta\/(status|exclusion-check)$/, () => "reports.view"],
  [/^\/admin\/meta\/self-test$/, () => "settings.edit"],
  // Google Ads booking tracking (googleAds.js): seen with social media, changed by whoever edits settings.
  [/^\/admin\/google-ads$/, (m) => (m === "GET" ? "social.view" : "settings.edit")],
  [/^\/admin\/social\/posts$/, (m) => (m === "GET" ? "social.view" : "social.add")],
  // Video Studio: making videos is "social.add" (publishing one is the person's: agents.policy).
  [/^\/admin\/video-studio(\/|$)/, (m) => (m === "GET" ? "social.view" : "social.add")],
  // A fresh picture for a post (Image Studio) and reading results back are part of posting.
  [/^\/admin\/social\/(picture|metrics\/refresh)$/, () => "social.add"],
  // Read by the Marketing Agent and, for blog articles, the SEO Agent.
  [/^\/admin\/social\/calendar(\/|$)/, (m) => (m === "GET" ? ["social.view", "blog.view"] : "social.add")],
  [/^\/admin\/social(\/|$)/, () => "social.view"],
  [/^\/admin\/crm\/settings$/, (m) => (m === "GET" ? "crm.view" : "crm.manage")],
  [/^\/admin\/crm(\/|$)/, (m) => `crm.${byMethod(m)}`],
  [/^\/admin\/payments\/reconciliation$/, () => "payments.view"],
  [/^\/admin\/(users|roles)(\/|$)/, (m) => `users.${byMethod(m)}`],
  [/^\/admin\/permissions/, () => "users.view"],
  [/^\/admin\/providers\/message$/, () => "providers.edit"],
  [/^\/admin\/providers\/search$/, () => "providers.view"],
  [/^\/admin\/provider-(alerts|tags)$/, () => "providers.view"],
  [/^\/admin\/providers\/[^/]+\/kyc-documents\/[^/]+\/review$/, (m, b) => `providers.${decisionAction(b?.status)}`],
  [/^\/admin\/providers\/[^/]+\/(performance|kyc)$/, () => "providers.view"],
  [/^\/admin\/providers\/[^/]+\/money$/, () => ["payments.view", "providers.view"]],
  [/^\/admin\/providers\/[^/]+\/(pause|prices|tags|notes)(\/|$)/, (m) => (m === "GET" ? "providers.view" : "providers.edit")],
  [/^\/admin\/providers\/[^/]+\/wallet\/recharge$/, () => "payments.manage"],
  [/^\/admin\/providers\/[^/]+\/wallet$/, () => ["payments.view", "providers.view"]],
  [/^\/providers\/[^/]+\/verification$/, (m, b) => `providers.${decisionAction(b?.status)}`],
  [/^\/admin\/providers\/[^/]+\/(coverage|capacity|warn)$/, (m) => (m === "GET" ? "providers.view" : "providers.edit")],
  [/^\/admin\/provider-capacity$/, () => "providers.view"],
  [/^\/admin\/providers\/[^/]+\/kyc-documents$/, () => "providers.view"],
  [/^\/admin\/providers(\/|$)/, (m) => `providers.${byMethod(m)}`],
  [/^\/providers\/[^/]+\/earnings$/, () => "providers.view"],
  [/^\/admin\/customers\/(login-attempts|deleted-accounts|blocked-numbers)/, (m) => (m === "GET" ? "customers.view" : "customers.edit")],
  [/^\/admin\/customers/, () => "customers.view"],
  [/^\/admin\/services\/[^/]+\/image$/, () => "services.edit"],
  [/^\/admin\/services\/[^/]+\/review$/, (m, b) => `services.${decisionAction(b?.decision)}`],
  [/^\/admin\/duplicates(\/|$)/, (m) => (m === "GET" ? "services.view" : "services.delete")],
  [/^\/admin\/provider-changes\/[^/]+\/review$/, (m, b) => `providers.${decisionAction(b?.decision)}`],
  [/^\/admin\/provider-changes/, () => "providers.view"],
  [/^\/admin\/service-changes\/[^/]+\/review$/, (m, b) => `services.${decisionAction(b?.decision)}`],
  [/^\/admin\/service-changes/, () => "services.view"],
  [/^\/admin\/images(\/|$)/, (m) => (m === "GET" ? "services.view" : "services.edit")],
  [/^\/admin\/subcategories\/[^/]+\/image$/, () => "services.edit"],
  [/^\/admin\/categories\/[^/]+\/(banner|photo)$/, () => "services.edit"],
  [/^\/admin\/services\/[^/]+\/options$/, (m) => (m === "GET" ? "services.view" : "services.edit")],
  [/^\/admin\/(categories|services|subcategories)(\/|$)/, (m) => `services.${byMethod(m)}`],
  [/^\/admin\/service-catalog\/[^/]+\/apply$/, () => "services.add"],
  [/^\/admin\/service-catalog\/[^/]+\/image$/, () => "services.edit"],
  [/^\/admin\/service-catalog(\/|$)/, (m) => `services.${byMethod(m)}`],
  [/^\/services\/[^/]+$/, () => "services.edit"],
  [/^\/admin\/communication-fees/, (m) => (m === "GET" ? ["services.view", "settings.view"] : ["services.edit", "settings.edit"])],
  [/^\/admin\/home-sections\/reorder$/, () => "cms.edit"],
  [/^\/admin\/(banners|home-sections|offers)(\/|$)/, (m) => `cms.${byMethod(m)}`],
  [/^\/admin\/locations(\/|$)/, (m) => `locations.${byMethod(m)}`],
  [/^\/admin\/notifications/, (m) => (m === "GET" ? "notifications.view" : "notifications.add")],
  [/^\/admin\/push-campaigns(\/|$)/, (m) => (m === "GET" ? "notifications.view" : "notifications.add")],
  [/^\/admin\/refund-claims/, (m, b) => (m === "GET" ? "complaints.view" : `complaints.${decisionAction(b?.status)}`)],
  [/^\/admin\/complaint-stages/, (m) => (m === "GET" ? "complaints.view" : "complaints.manage")],
  [/^\/admin\/staff$/, () => "complaints.view"],
  [/^\/admin\/complaints\/[^/]+\/(assign|status|reopen|entries|evidence)$/, () => "complaints.edit"],
  [/^\/admin\/complaints(\/|$)/, (m) => `complaints.${byMethod(m)}`],
  [/^\/admin\/monitoring\/report$/, () => "monitoring.export"],
  [/^\/admin\/monitoring/, () => "monitoring.view"],
  [/^\/admin\/transactions/, () => "payments.view"],
  [/^\/admin\/reports/, () => "reports.view"],
  [/^\/admin\/overview/, () => "dashboard.view"],
  [/^\/activities/, () => ["dashboard.view", "audit.view"]],
  [/^\/admin\/change-log/, () => "audit.view"],
  [/^\/admin\/business-rules/, () => "settings.view"],
  [/^\/admin\/settings/, (m) => (m === "GET" ? "settings.view" : "settings.edit")],
  [/^\/admin\/remove-seed-data/, () => "settings.delete"],
  [/^\/admin\/import\//, () => "data.import"],
  // A page of bookings (scaling step 5): the same people who can load the booking list.
  [/^\/admin\/bookings$/, () => ["bookings.view", "reviews.view", "payments.view", "monitoring.view", "complaints.view", "customers.view", "dashboard.view", "reports.view"]],
  // Assignment desk: anyone who sees bookings sees the waiting ones; assigning (or giving up) changes them.
  [/^\/admin\/fcm-token(\/remove)?$/, () => "bookings.view"],
  [/^\/admin\/assignments$/, () => "bookings.view"],
  // Providers on the way right now (live tracking) — who's where is for monitoring staff.
  [/^\/admin\/live-trips$/, () => ["monitoring.view", "bookings.view"]],
  [/^\/admin\/bookings\/[^/]+\/(assign|give-up)$/, () => "bookings.edit"],
  // Call desk (callDesk.js): looking a caller up shows their open bookings; booking / closing changes them.
  [/^\/admin\/call-desk\/lookup$/, () => "bookings.view"],
  [/^\/admin\/call-desk\//, () => "bookings.edit"],
  [/^\/admin\/bookings\//, () => "bookings.view"],
  [/^\/bookings$/, () => ["bookings.view", "reviews.view", "payments.view", "monitoring.view", "complaints.view", "customers.view", "dashboard.view", "reports.view"]],
  [/^\/bookings(\/|$)/, (m) => (m === "GET" ? "bookings.view" : "bookings.edit")],
  [/^\/messages\//, () => "bookings.view"],
];

function requiredFor(method, path, body) {
  for (const [re, fn] of RULES) if (re.test(path)) return fn(method, body || {});
  // Anything under /admin that isn't listed fails closed: Super Admin only.
  return path.startsWith("/admin/") ? "super" : null;
}

// AI agents (agents.js) plug in here rather than being required, to avoid a
// require cycle: resolve(agentId) -> admin-shaped object | null, and
// policy(req, admin, path) -> denial | null for agent-specific limits.
let agentHooks = { resolve: () => null, policy: () => null };
function setAgentHooks(hooks) {
  agentHooks = { ...agentHooks, ...hooks };
}

// Who an admin-role token belongs to right now: a person (by phone) or an AI agent.
function resolveToken(payload) {
  if (!payload) return null;
  if (payload.agentId) return agentHooks.resolve(payload.agentId);
  return resolveByPhone(payload.phone);
}

// Installed into auth.requireAuth: runs for every admin-role token.
function guard(req, payload) {
  const admin = resolveToken(payload);
  if (!admin) return { status: 401, error: payload.agentId ? "This AI agent is switched off" : "This admin account no longer has access" };
  req.admin = admin;
  req.user = { ...payload, id: admin.id };
  const path = req.originalUrl.split("?")[0].replace(/^\/api/, "");
  const needed = requiredFor(req.method, path, req.body);
  let denied = null;
  if (needed === "super") denied = admin.permissions.includes("*") ? null : { status: 403, error: "Only a Super Admin can do that" };
  else if (needed !== null && !allowed(admin.permissions, needed)) denied = { status: 403, error: "Your role doesn't have permission to do that" };
  if (!denied && admin.agent) denied = agentHooks.policy(req, admin, path);
  return denied;
}

// For the few public-ish endpoints that show extra data to admins.
function adminCan(admin, permission) {
  return Boolean(admin) && allowed(admin.permissions, permission);
}

function catalogue() {
  return { modules: MODULES, actions: ACTIONS };
}

module.exports = {
  catalogue, listRoles, createRole, updateRole, deleteRole,
  listUsers, createUser, updateUser, deleteUser,
  resolveByPhone, resolveToken, setAgentHooks, recordLogin, guard, adminCan, requiredFor,
  permits: allowed,
};
