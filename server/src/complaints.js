// Complaints & Disputes CRM: complaint records with a configurable pipeline,
// staff assignment, an append-only history (notes, customer/provider
// communication, evidence, status changes, resolution, reopen) and lookup by
// customer / provider / booking / request / order / complaint ID.
// Flat-JSON storage (see jsonStore.js) — no schema migration needed.
const jsonStore = require("./jsonStore");
const store = require("./store");
const access = require("./access");

const COMPLAINTS = "complaints";
const EVENTS = "complaintEvents";
const STAGES = "complaintStages";

// kind drives behaviour: open (default), waiting, escalated, resolved, closed.
// The system stages (new, resolved, closed, reopened) are what the workflow
// itself relies on, so they can be renamed/reordered but not removed.
const DEFAULT_STAGES = [
  { key: "new", label: "New Complaint", kind: "open", system: true },
  { key: "assigned", label: "Assigned", kind: "open" },
  { key: "investigating", label: "Under Investigation", kind: "open" },
  { key: "waiting_customer", label: "Waiting for Customer", kind: "waiting" },
  { key: "waiting_provider", label: "Waiting for Service Provider", kind: "waiting" },
  { key: "escalated", label: "Escalated", kind: "escalated" },
  { key: "resolution_proposed", label: "Resolution Proposed", kind: "open" },
  { key: "resolved", label: "Resolved", kind: "resolved", system: true },
  { key: "closed", label: "Closed", kind: "closed", system: true },
  { key: "reopened", label: "Reopened", kind: "open", system: true },
];
const KINDS = ["open", "waiting", "escalated", "resolved", "closed"];
const CATEGORIES = ["Service quality", "Provider behaviour", "No-show / delay", "Payment or refund", "Safety", "Damage or loss", "App / booking issue", "Other"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const OUTCOMES = ["Refund issued", "Provider warned", "Provider suspended", "Redo / re-service", "Explained to customer", "No action needed", "Other"];
const COMM_CHANNELS = ["In-app notification", "Phone call", "WhatsApp", "SMS", "Email", "Other"];

const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();

// ---- pipeline ----
function listStages({ includeInactive = true } = {}) {
  let stages = jsonStore.readAll(STAGES);
  if (stages.length === 0) {
    stages = DEFAULT_STAGES.map((s, i) => jsonStore.insert(STAGES, { id: s.key, ...s, order: i, active: true }));
  }
  stages.sort((a, b) => a.order - b.order);
  return includeInactive ? stages : stages.filter((s) => s.active !== false);
}

const stageByKey = (key) => listStages().find((s) => s.key === key);

function createStage({ label, kind }) {
  const clean = String(label || "").trim().slice(0, 40);
  if (!clean) throw fail(400, "Stage name is required");
  if (!["open", "waiting", "escalated"].includes(kind)) throw fail(400, "Custom stages must be open, waiting or escalated");
  const stages = listStages();
  const key = `custom_${Date.now().toString(36)}`;
  return jsonStore.insert(STAGES, { id: key, key, label: clean, kind, system: false, order: stages.length, active: true });
}

function updateStage(key, { label, active }) {
  const stage = stageByKey(key);
  if (!stage) return null;
  const patch = {};
  if (label !== undefined) {
    const clean = String(label).trim().slice(0, 40);
    if (!clean) throw fail(400, "Stage name is required");
    patch.label = clean;
  }
  if (active !== undefined) {
    if (stage.system && !active) throw fail(400, "This stage is required by the workflow and can't be hidden");
    patch.active = Boolean(active);
  }
  return jsonStore.update(STAGES, key, patch);
}

function deleteStage(key) {
  const stage = stageByKey(key);
  if (!stage) return false;
  if (stage.system) throw fail(400, "This stage is required by the workflow and can't be deleted");
  if (jsonStore.readAll(COMPLAINTS).some((c) => c.status === key)) {
    throw fail(409, "Complaints are still in this stage — move them first, or hide the stage instead");
  }
  return jsonStore.remove(STAGES, key);
}

function reorderStages(keys) {
  const stages = listStages();
  const known = new Set(stages.map((s) => s.key));
  const ordered = [...new Set(keys)].filter((k) => known.has(k));
  for (const s of stages) if (!ordered.includes(s.key)) ordered.push(s.key);
  ordered.forEach((k, i) => jsonStore.update(STAGES, k, { order: i }));
  return listStages();
}

// ---- staff (assignees): admin phones from the environment + staff added here ----
// Assignees are the internal accounts from User Management (owners included).
async function listStaff() {
  return access
    .listUsers()
    .filter((u) => u.active !== false)
    .map((u) => ({ id: `admin:${String(u.phone).replace(/[^\d+]/g, "")}`, name: u.owner ? `Owner (${u.phone})` : u.name, phone: u.phone, role: u.roleName }));
}

// ---- events (the complete history) ----
function addEvent(complaintId, event) {
  return jsonStore.insert(EVENTS, { complaintId, at: nowIso(), ...event });
}

function eventsFor(complaintId) {
  return jsonStore.readAll(EVENTS).filter((e) => e.complaintId === complaintId).sort((a, b) => new Date(a.at) - new Date(b.at));
}

function touch(id, patch = {}) {
  return jsonStore.update(COMPLAINTS, id, { ...patch, updatedAt: nowIso() });
}

function nextComplaintId() {
  const max = jsonStore
    .readAll(COMPLAINTS)
    .map((c) => Number(String(c.id).replace(/\D/g, "")))
    .reduce((m, n) => Math.max(m, n || 0), 0);
  return `CMP-${String(max + 1).padStart(4, "0")}`;
}

// ---- lookup: find bookings by any identifier an admin might have in hand ----
async function lookup(q) {
  const term = String(q || "").trim().toLowerCase();
  if (term.length < 2) return [];
  // Only treat the term as a phone number when it looks like one.
  const digits = /^[\d\s+\-()]+$/.test(term) ? term.replace(/\D/g, "") : "";
  const [bookings, providers] = await Promise.all([store.listBookings({}), store.listProviders()]);
  const provById = new Map(providers.map((p) => [p.id, p]));
  return bookings
    .filter((b) => {
      const p = provById.get(b.providerId);
      return (
        String(b.ref || "").toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term) ||
        String(b.orderId || "").toLowerCase().includes(term) ||
        String(b.customerId || "").toLowerCase() === term ||
        String(b.providerId || "").toLowerCase() === term ||
        String(b.customer?.name || "").toLowerCase().includes(term) ||
        String(p?.name || "").toLowerCase().includes(term) ||
        (digits.length >= 4 && (String(b.customer?.phone || "").replace(/\D/g, "").includes(digits) || String(p?.phone || "").replace(/\D/g, "").includes(digits)))
      );
    })
    .slice(0, 15)
    .map((b) => summarizeBooking(b, provById.get(b.providerId)));
}

function summarizeBooking(b, provider) {
  return {
    bookingId: b.id,
    bookingRef: b.ref,
    orderId: b.orderId || "",
    service: b.service?.name || "",
    status: b.status,
    amount: b.amount,
    date: b.date,
    customerId: b.customerId,
    customerName: b.customer?.name || "",
    customerPhone: b.customer?.phone || "",
    providerId: b.providerId,
    providerName: provider?.name || "",
    providerPhone: provider?.phone || "",
  };
}

// ---- complaints ----
async function createComplaint(input, actor) {
  const subject = String(input.subject || "").trim().slice(0, 120);
  const description = String(input.description || "").trim().slice(0, 4000);
  if (!subject) throw fail(400, "Subject is required");
  if (!description) throw fail(400, "Please describe the complaint");
  const category = categoryList().includes(input.category) ? input.category : categoryList().includes("Other") ? "Other" : categoryList()[0];
  const priority = PRIORITIES.includes(input.priority) ? input.priority : "normal";

  // Resolve who it's about from the booking when given; otherwise from the
  // customer / provider ids or details typed in.
  let link = {
    bookingId: "", bookingRef: "", orderId: "", customerId: "", customerName: "", customerPhone: "",
    providerId: "", providerName: "", providerPhone: "", service: "",
  };
  if (input.bookingId) {
    const b = await store.getBooking(input.bookingId);
    if (!b) throw fail(404, "That booking wasn't found");
    const provider = await store.getProvider(b.providerId);
    link = { ...link, ...summarizeBooking(b, provider), service: b.service?.name || "" };
    delete link.status; delete link.amount; delete link.date;
  } else {
    const customers = await store.listCustomers();
    const digits = String(input.customerPhone || "").replace(/\D/g, "").slice(-10);
    const customer =
      customers.find((c) => c.id === input.customerId) ||
      (digits.length >= 10 ? customers.find((c) => String(c.phone || "").replace(/\D/g, "").endsWith(digits)) : null);
    if (customer) link = { ...link, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone || "" };
    else {
      link.customerName = String(input.customerName || "").trim().slice(0, 80);
      link.customerPhone = String(input.customerPhone || "").trim().slice(0, 20);
    }
    if (input.providerId) {
      const provider = await store.getProvider(input.providerId);
      if (!provider) throw fail(404, "That provider wasn't found");
      link = { ...link, providerId: provider.id, providerName: provider.name, providerPhone: provider.phone || "" };
    }
    if (!link.customerId && !link.customerPhone && !link.providerId) {
      throw fail(400, "Link the complaint to a booking, or give the customer's mobile number or a provider");
    }
  }

  const initial = listStages()[0];
  const complaint = jsonStore.insert(COMPLAINTS, {
    id: nextComplaintId(),
    subject,
    description,
    category,
    priority,
    status: (listStages().find((s) => s.key === "new") || initial).key,
    assignedTo: null,
    ...link,
    resolution: null,
    reopenCount: 0,
    createdBy: actor,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    closedAt: null,
  });
  addEvent(complaint.id, { type: "created", actor, text: subject });
  return complaint;
}

function enrich(c, stagesByKey) {
  const stage = stagesByKey.get(c.status);
  return { ...c, statusLabel: stage?.label || c.status, statusKind: stage?.kind || "open" };
}

function listComplaints(f = {}) {
  const stages = listStages();
  const byKey = new Map(stages.map((s) => [s.key, s]));
  const q = String(f.q || "").trim().toLowerCase();
  const qDigits = /^[\d\s+\-()]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const all = jsonStore.readAll(COMPLAINTS).map((c) => enrich(c, byKey));
  const counts = {};
  for (const c of all) counts[c.status] = (counts[c.status] || 0) + 1;
  const rows = all
    .filter((c) => {
      if (f.status && c.status !== f.status) return false;
      if (f.assignee === "unassigned" ? c.assignedTo : f.assignee && c.assignedTo?.id !== f.assignee) return false;
      if (f.priority && c.priority !== f.priority) return false;
      if (f.category && c.category !== f.category) return false;
      if (!q) return true;
      return (
        [c.id, c.subject, c.customerId, c.customerName, c.providerId, c.providerName, c.bookingId, c.bookingRef, c.orderId, c.service]
          .some((v) => String(v || "").toLowerCase().includes(q)) ||
        (qDigits.length >= 4 && [c.customerPhone, c.providerPhone].some((p) => String(p || "").replace(/\D/g, "").includes(qDigits)))
      );
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const open = all.filter((c) => !["resolved", "closed"].includes(c.statusKind)).length;
  return { stages, counts, open, total: all.length, complaints: rows };
}

function getComplaint(id) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  const byKey = new Map(listStages().map((s) => [s.key, s]));
  return { complaint: enrich(c, byKey), events: eventsFor(id).map((e) => ({ ...e, ...(e.type === "status" ? { fromLabel: byKey.get(e.from)?.label || e.from, toLabel: byKey.get(e.to)?.label || e.to } : {}) })) };
}

function updateComplaint(id, patch, actor) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  const next = {};
  const changes = [];
  if (patch.subject !== undefined && String(patch.subject).trim() && patch.subject.trim() !== c.subject) next.subject = String(patch.subject).trim().slice(0, 120);
  if (patch.description !== undefined && String(patch.description).trim() && patch.description.trim() !== c.description) next.description = String(patch.description).trim().slice(0, 4000);
  if (patch.category !== undefined && categoryList().includes(patch.category) && patch.category !== c.category) next.category = patch.category;
  if (patch.priority !== undefined && PRIORITIES.includes(patch.priority) && patch.priority !== c.priority) next.priority = patch.priority;
  for (const k of Object.keys(next)) changes.push({ field: k, from: c[k], to: next[k] });
  if (changes.length === 0) return c;
  const updated = touch(id, next);
  addEvent(id, { type: "edit", actor, changes });
  return updated;
}

async function assign(id, assigneeId, actor) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  let assignedTo = null;
  if (assigneeId) {
    const person = (await listStaff()).find((s) => s.id === assigneeId);
    if (!person) throw fail(400, "That staff member wasn't found");
    assignedTo = { id: person.id, name: person.name };
  }
  if ((c.assignedTo?.id || null) === (assignedTo?.id || null)) return c;
  const patch = { assignedTo };
  // A brand-new complaint moves to "Assigned" once someone owns it.
  const stages = listStages();
  const assignedStage = stages.find((s) => s.key === "assigned" && s.active !== false);
  const moved = assignedTo && c.status === "new" && assignedStage;
  if (moved) patch.status = "assigned";
  const updated = touch(id, patch);
  addEvent(id, { type: "assign", actor, from: c.assignedTo?.name || null, to: assignedTo?.name || null });
  if (moved) addEvent(id, { type: "status", actor, from: "new", to: "assigned", text: "Moved automatically when assigned" });
  return updated;
}

function cleanResolution(input, existing) {
  const source = input || existing;
  const summary = String(source?.summary || "").trim().slice(0, 2000);
  if (!summary) throw fail(400, "Resolution details are required to resolve or close a complaint");
  const outcome = outcomeList().includes(source?.outcome) ? source.outcome : outcomeList().includes("Other") ? "Other" : outcomeList()[0];
  const refundAmount = Number(source?.refundAmount);
  return {
    summary,
    outcome,
    ...(Number.isFinite(refundAmount) && refundAmount > 0 ? { refundAmount: Math.round(refundAmount) } : {}),
  };
}

function changeStatus(id, status, { note, resolution } = {}, actor) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  const target = stageByKey(status);
  if (!target || target.active === false) throw fail(400, "Unknown or hidden pipeline stage");
  if (target.key === c.status) throw fail(409, "The complaint is already in that stage");
  const current = stageByKey(c.status);
  if (target.key === "reopened") throw fail(400, "Use Reopen to bring a resolved or closed complaint back");
  const patch = {};
  if (["resolved", "closed"].includes(target.kind)) {
    patch.resolution = cleanResolution(resolution, c.resolution);
    patch.resolution = { ...patch.resolution, at: nowIso(), by: actor };
    if (target.kind === "closed") patch.closedAt = nowIso();
  }
  // Moving a finished complaint back into the pipeline is a reopen, with a reason.
  if (["resolved", "closed"].includes(current?.kind) && !["resolved", "closed"].includes(target.kind)) {
    throw fail(400, "This complaint is finished — use Reopen and give a reason");
  }
  const updated = touch(id, { status: target.key, ...patch });
  addEvent(id, { type: "status", actor, from: c.status, to: target.key, text: String(note || "").trim().slice(0, 1000) });
  // Log the resolution once, when it's first written or changed — not again on close.
  if (patch.resolution && (resolution || !c.resolution)) addEvent(id, { type: "resolution", actor, ...patch.resolution });
  return updated;
}

function reopen(id, reason, actor) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  const current = stageByKey(c.status);
  if (!["resolved", "closed"].includes(current?.kind)) throw fail(409, "Only a resolved or closed complaint can be reopened");
  const text = String(reason || "").trim().slice(0, 1000);
  if (!text) throw fail(400, "Please give a reason for reopening");
  const previous = [...(c.previousResolutions || []), ...(c.resolution ? [c.resolution] : [])];
  const updated = touch(id, {
    status: "reopened",
    resolution: null,
    previousResolutions: previous,
    closedAt: null,
    reopenCount: (c.reopenCount || 0) + 1,
  });
  addEvent(id, { type: "reopen", actor, from: c.status, to: "reopened", text });
  return updated;
}

// note | customer_comm | provider_comm. Outbound in-app messages are actually
// delivered as a notification to that person; everything else is a log entry.
async function addComm(id, input, actor) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  const type = input.type;
  if (!["note", "customer_comm", "provider_comm"].includes(type)) throw fail(400, "Invalid entry type");
  const text = String(input.text || "").trim().slice(0, 2000);
  if (!text) throw fail(400, "Write something first");
  const event = { type, actor, text };
  if (type !== "note") {
    event.direction = input.direction === "inbound" ? "inbound" : "outbound";
    event.channel = COMM_CHANNELS.includes(input.channel) ? input.channel : "Other";
    const recipientId = type === "customer_comm" ? c.customerId : c.providerId;
    if (event.direction === "outbound" && event.channel === "In-app notification") {
      if (!recipientId) throw fail(400, `This complaint has no ${type === "customer_comm" ? "customer" : "service provider"} account to notify`);
      await store.addNotification({
        recipientType: type === "customer_comm" ? "customer" : "provider",
        recipientId,
        type: "support",
        title: `Update on your complaint ${c.id}`,
        message: text.length > 160 ? `${text.slice(0, 160)}…` : text,
        bookingId: c.bookingId || undefined,
      });
      event.delivered = true;
    }
  }
  const saved = addEvent(id, event);
  touch(id);
  return saved;
}

function addEvidence(id, file, note, actor) {
  const c = jsonStore.readAll(COMPLAINTS).find((x) => x.id === id);
  if (!c) return null;
  const saved = addEvent(id, {
    type: "evidence",
    actor,
    text: String(note || "").trim().slice(0, 500),
    attachment: { url: `/uploads/${file.filename}`, name: file.originalname, mime: file.mimetype, size: file.size },
  });
  touch(id);
  return saved;
}

// Categories and resolution outcomes are Business Rules (Settings); the
// built-in lists above are only the fallback.
const categoryList = () => store.getSettings().complaintCategories || CATEGORIES;
const outcomeList = () => store.getSettings().complaintOutcomes || OUTCOMES;

function meta() {
  return { categories: categoryList(), priorities: PRIORITIES, outcomes: outcomeList(), channels: COMM_CHANNELS, kinds: KINDS };
}

module.exports = {
  listStages, createStage, updateStage, deleteStage, reorderStages,
  listStaff,
  lookup, createComplaint, listComplaints, getComplaint, updateComplaint,
  assign, changeStatus, reopen, addComm, addEvidence, meta,
};
