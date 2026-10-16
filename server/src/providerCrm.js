// Provider CRM (Super Admin → Provider CRM): every provider and every would-be provider
// in one pipeline, with follow-ups (tasks with a due time and an owner), a contact log,
// an onboarding checklist and one timeline per provider.
//
//   crmLeads      people who don't have a Business-app account yet (field visit, call, referral,
//                 imported list). When one signs up with the same phone they're linked and their
//                 history moves to the provider.
//   crmProviders  per provider: owner (account manager), source, and a manual "hold" stage
//                 (at risk / inactive / lost). Everything else about the stage is worked out
//                 from real data, so the board never disagrees with the account.
//   crmTasks      follow-ups. Some are created automatically (welcome call, collect documents,
//                 review documents, finish setup) — at most one of each kind at a time.
//   crmActivity   calls, WhatsApp, visits, notes, stage and owner changes.
//
// The rules are plain functions of their inputs (tested in test/providerCrm.test.js); the
// async functions below only gather data.
const jsonStore = require("./jsonStore");
const store = require("./store");
const access = require("./access");
const { kycStatus } = require("./providerAdmin");

const LEADS = "crmLeads";
const PROVIDERS = "crmProviders";
const TASKS = "crmTasks";
const ACTIVITY = "crmActivity";
const SETTINGS = "crmSettings";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const IST_OFFSET = 5.5 * HOUR;
const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = (now = Date.now()) => new Date(now).toISOString();
const clean = (v, max = 200) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// ---------------------------------------------------------------- stages

const STAGES = [
  { key: "lead", label: "Lead", hint: "Not contacted yet", manual: true },
  { key: "contacted", label: "Contacted", hint: "Spoke to them", manual: true },
  { key: "interested", label: "Interested", hint: "Wants to join", manual: true },
  { key: "documents", label: "Documents pending", hint: "Signed up, KYC missing" },
  { key: "review", label: "Under review", hint: "Documents waiting for approval" },
  { key: "onboarding", label: "Onboarding", hint: "Approved, setup not finished" },
  { key: "active", label: "Active", hint: "Ready for bookings" },
  { key: "at_risk", label: "At risk", hint: "Needs attention", hold: true },
  { key: "inactive", label: "Inactive", hint: "Not working with us now", hold: true },
  { key: "lost", label: "Lost / Rejected", hint: "Not joining", hold: true, manual: true },
];
const STAGE_KEYS = STAGES.map((s) => s.key);
const LEAD_STAGES = ["lead", "contacted", "interested", "lost"];
const HOLD_STAGES = ["at_risk", "inactive", "lost"];
const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || key;

const SOURCES = ["Business app sign-up", "Field visit", "Phone call", "Referral", "WhatsApp", "Walk-in", "Social media", "News / advert", "Imported list", "Other"];
const TASK_KINDS = ["call", "whatsapp", "visit", "documents", "review", "setup", "other"];
const OUTCOMES = ["Interested", "Not interested", "Not reachable", "Call back later", "Documents promised", "Will finish setup", "Wrong number", "Other"];
const CONTACT_KINDS = ["call", "whatsapp", "visit", "note"];

// ---------------------------------------------------------------- onboarding checklist

// What an approved provider needs before customers can book them. The first completed job is
// shown alongside but isn't required to count as Active.
function checklist(p, { kyc, activeServices = 0, completedJobs = null } = {}) {
  const items = [
    { key: "documents", label: "Documents approved", done: Boolean(kyc?.complete), detail: kyc && !kyc.complete && kyc.missing?.length ? `Missing: ${kyc.missing.join(", ")}` : null },
    { key: "verified", label: "Account approved", done: (p.verificationStatus || "pending") === "approved" },
    { key: "agreement", label: "Agreement accepted", done: Boolean(p.agreementAccepted) },
    { key: "services", label: "Services and prices added", done: activeServices > 0, detail: activeServices ? `${activeServices} live` : null },
    { key: "coverage", label: "Areas (PIN codes) set", done: Boolean(p.coverage?.serveAllAreas || p.coverage?.pincodes?.length) },
    { key: "photo", label: "Profile photo", done: Boolean(p.photoUrl) },
    { key: "app", label: "Opened the Business app", done: p.live !== false },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    items,
    done,
    total: items.length,
    complete: done === items.length,
    missing: items.filter((i) => !i.done).map((i) => i.label),
    firstJob: completedJobs === null ? null : completedJobs > 0,
  };
}

// Where a provider is, worked out from their account. A manual hold (at risk, inactive,
// lost) wins until someone clears it.
function providerStage(p, { kyc, list, hold } = {}) {
  if (hold && HOLD_STAGES.includes(hold)) return hold;
  const status = p.verificationStatus || "pending";
  if (status === "rejected") return "lost";
  if (status !== "approved") {
    // Every required document uploaded (waiting or approved) → it's on us to review.
    const required = (kyc?.types || []).filter((t) => t.required);
    const allIn = required.length > 0 && required.every((t) => ["waiting", "approved"].includes(t.status));
    return allIn || kyc?.complete ? "review" : "documents";
  }
  return list?.complete ? "active" : "onboarding";
}

// ---------------------------------------------------------------- phones

const digits = (v) => String(v || "").replace(/\D/g, "");
const phoneKey = (v) => {
  const d = digits(v);
  return d.length >= 10 ? d.slice(-10) : d;
};

// ---------------------------------------------------------------- settings

const DEFAULT_SETTINGS = { defaultOwnerId: null, autoTasks: true, whatsappDigest: true, digestHourIst: 9 };
function getSettings() {
  const row = jsonStore.readAll(SETTINGS).find((r) => r.id === "settings");
  return { ...DEFAULT_SETTINGS, ...(row || {}) };
}
function updateSettings(patch = {}) {
  const next = {};
  if (patch.defaultOwnerId !== undefined) next.defaultOwnerId = patch.defaultOwnerId || null;
  if (patch.autoTasks !== undefined) next.autoTasks = Boolean(patch.autoTasks);
  if (patch.whatsappDigest !== undefined) next.whatsappDigest = Boolean(patch.whatsappDigest);
  if (patch.digestHourIst !== undefined) {
    const h = Number(patch.digestHourIst);
    if (!Number.isInteger(h) || h < 5 || h > 21) throw fail(400, "Pick an hour between 5 and 21");
    next.digestHourIst = h;
  }
  if (next.defaultOwnerId && !staffById(next.defaultOwnerId)) throw fail(400, "That team member wasn't found");
  if (jsonStore.readAll(SETTINGS).some((r) => r.id === "settings")) jsonStore.update(SETTINGS, "settings", next);
  else jsonStore.insert(SETTINGS, { id: "settings", ...next });
  return getSettings();
}

// ---------------------------------------------------------------- team

// Everyone who can work the CRM (active staff whose role can edit it, and the owners).
function listStaff() {
  return access
    .listUsers()
    .filter((u) => u.active !== false)
    .map((u) => {
      const id = `admin:${String(u.phone).replace(/[^\d+]/g, "")}`;
      const resolved = access.resolveByPhone(u.phone);
      return { id, name: u.owner ? "Owner" : u.name, phone: u.phone, role: u.roleName, canWork: Boolean(resolved && access.permits(resolved.permissions, "crm.edit")) };
    })
    .filter((s) => s.canWork);
}
function staffById(id) {
  return id ? listStaff().find((s) => s.id === id) || null : null;
}

// ---------------------------------------------------------------- records

const subjectOf = (type, id) => `${type}:${id}`;
function parseSubject(subject) {
  const m = /^(lead|provider):(.+)$/.exec(String(subject || ""));
  if (!m) throw fail(400, "Unknown provider or lead");
  return { type: m[1], id: m[2] };
}

function providerRecord(providerId) {
  return jsonStore.readAll(PROVIDERS).find((r) => r.id === providerId) || { id: providerId, ownerId: null, hold: null, source: null };
}
function saveProviderRecord(providerId, patch) {
  if (jsonStore.readAll(PROVIDERS).some((r) => r.id === providerId)) return jsonStore.update(PROVIDERS, providerId, patch);
  return jsonStore.insert(PROVIDERS, { id: providerId, ownerId: null, hold: null, source: null, ...patch });
}

function logActivity(subject, { kind, text = "", outcome = null, by = null, at, meta } = {}) {
  return jsonStore.insert(ACTIVITY, { subject, kind, text: clean(text, 2000), outcome, by, at: at || nowIso(), ...(meta ? { meta } : {}) });
}

// ---------------------------------------------------------------- leads

function cleanLead(input = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    out.name = clean(input.name, 80);
    if (!out.name) throw fail(400, "Name is required");
  }
  if (!partial || input.phone !== undefined) {
    const d = digits(input.phone);
    if (d.length < 10 || d.length > 13) throw fail(400, "Enter a valid 10-digit mobile number");
    out.phone = store.canonicalPhone(input.phone);
  }
  for (const [k, max] of [["businessName", 80], ["category", 60], ["area", 80], ["source", 40]]) {
    if (input[k] !== undefined) out[k] = clean(input[k], max);
  }
  if (input.pincode !== undefined) {
    out.pincode = digits(input.pincode).slice(0, 6);
    if (out.pincode && out.pincode.length !== 6) throw fail(400, "PIN code must have 6 digits");
  }
  if (input.ownerId !== undefined) {
    if (input.ownerId && !staffById(input.ownerId)) throw fail(400, "That team member wasn't found");
    out.ownerId = input.ownerId || null;
  }
  return out;
}

// Who already has this phone: a provider account or another lead.
async function findByPhone(phone, { exceptLeadId } = {}) {
  const key = phoneKey(phone);
  if (key.length < 10) return null;
  const provider = (await store.listProviders()).find((p) => phoneKey(p.phone) === key);
  if (provider) return { type: "provider", id: provider.id, name: provider.businessName || provider.name };
  const lead = jsonStore.readAll(LEADS).find((l) => l.id !== exceptLeadId && phoneKey(l.phone) === key);
  if (lead) return { type: "lead", id: lead.id, name: lead.businessName || lead.name, providerId: lead.providerId || null };
  return null;
}

async function createLead(input, actor) {
  const data = cleanLead(input);
  const existing = await findByPhone(data.phone);
  if (existing) {
    const where = existing.type === "provider" || existing.providerId ? "a provider account" : "a lead";
    throw Object.assign(fail(409, `${existing.name} already has ${where} with this number`), { existing });
  }
  const lead = jsonStore.insert(LEADS, {
    ...data,
    source: data.source || "Other",
    stage: LEAD_STAGES.includes(input.stage) ? input.stage : "lead",
    ownerId: data.ownerId || getSettings().defaultOwnerId || null,
    providerId: null,
    lostReason: null,
    createdAt: nowIso(),
    createdBy: actor || null,
  });
  logActivity(subjectOf("lead", lead.id), { kind: "lead", text: `Lead added${lead.source ? ` (${lead.source})` : ""}`, by: actor });
  if (clean(input.note, 2000)) logActivity(subjectOf("lead", lead.id), { kind: "note", text: input.note, by: actor });
  if (input.followUp?.dueAt) createTask({ subject: subjectOf("lead", lead.id), title: input.followUp.title || "First call", kind: "call", dueAt: input.followUp.dueAt, assigneeId: lead.ownerId }, actor);
  return lead;
}

// Rows pasted from Excel or a CSV file. Duplicates (an existing provider or lead, or the same
// number twice in the file) are skipped, never merged, so nothing is overwritten.
async function importLeads(rows = [], { source, ownerId } = {}, actor) {
  if (!Array.isArray(rows) || rows.length === 0) throw fail(400, "No rows to import");
  if (rows.length > 1000) throw fail(400, "Import at most 1,000 rows at a time");
  const providers = await store.listProviders();
  const taken = new Map(providers.map((p) => [phoneKey(p.phone), `provider: ${p.businessName || p.name}`]));
  for (const l of jsonStore.readAll(LEADS)) if (!taken.has(phoneKey(l.phone))) taken.set(phoneKey(l.phone), `lead: ${l.businessName || l.name}`);
  const added = [];
  const skipped = [];
  rows.forEach((row, i) => {
    try {
      const data = cleanLead({ ...row, source: row.source || source || "Imported list", ownerId: row.ownerId !== undefined ? row.ownerId : ownerId });
      const key = phoneKey(data.phone);
      if (taken.has(key)) return skipped.push({ row: i + 1, name: data.name, reason: `Already a ${taken.get(key)}` });
      taken.set(key, `row ${i + 1} of this file`);
      const lead = jsonStore.insert(LEADS, { ...data, stage: "lead", ownerId: data.ownerId || getSettings().defaultOwnerId || null, providerId: null, lostReason: null, createdAt: nowIso(), createdBy: actor || null });
      logActivity(subjectOf("lead", lead.id), { kind: "lead", text: `Imported (${lead.source})`, by: actor });
      added.push(lead.id);
    } catch (e) {
      skipped.push({ row: i + 1, name: clean(row?.name, 80) || "—", reason: e.message });
    }
  });
  return { added: added.length, skipped };
}

function updateLead(id, input = {}, actor) {
  const lead = jsonStore.readAll(LEADS).find((l) => l.id === id);
  if (!lead) throw fail(404, "Lead not found");
  const data = cleanLead(input, { partial: true });
  const subject = subjectOf("lead", id);
  if (input.stage !== undefined && input.stage !== lead.stage) {
    if (!LEAD_STAGES.includes(input.stage)) throw fail(400, "A lead can be Lead, Contacted, Interested or Lost. Later stages follow their Business-app account.");
    data.stage = input.stage;
    data.lostReason = input.stage === "lost" ? clean(input.lostReason, 200) || null : null;
    logActivity(subject, { kind: "stage", text: `${stageLabel(lead.stage)} → ${stageLabel(input.stage)}${data.lostReason ? ` (${data.lostReason})` : ""}`, by: actor });
  }
  if (data.ownerId !== undefined && data.ownerId !== lead.ownerId) {
    logActivity(subject, { kind: "owner", text: `Owner: ${staffById(data.ownerId)?.name || "nobody"}`, by: actor });
  }
  return jsonStore.update(LEADS, id, { ...data, updatedAt: nowIso() });
}

function deleteLead(id) {
  const lead = jsonStore.readAll(LEADS).find((l) => l.id === id);
  if (!lead) throw fail(404, "Lead not found");
  const subject = subjectOf("lead", id);
  for (const t of jsonStore.readAll(TASKS).filter((x) => x.subject === subject)) jsonStore.remove(TASKS, t.id);
  for (const a of jsonStore.readAll(ACTIVITY).filter((x) => x.subject === subject)) jsonStore.remove(ACTIVITY, a.id);
  jsonStore.remove(LEADS, id);
  return { deleted: true };
}

// A lead who signed up in the Business app becomes that provider: same owner and source,
// and their calls, notes and open follow-ups move across.
async function linkLeads(providers) {
  const byPhone = new Map(providers.map((p) => [phoneKey(p.phone), p]));
  const linked = [];
  for (const lead of jsonStore.readAll(LEADS)) {
    if (lead.providerId) continue;
    const p = byPhone.get(phoneKey(lead.phone));
    if (!p) continue;
    jsonStore.update(LEADS, lead.id, { providerId: p.id, linkedAt: nowIso() });
    const rec = providerRecord(p.id);
    saveProviderRecord(p.id, { ownerId: rec.ownerId || lead.ownerId || null, source: rec.source || lead.source || null, leadId: lead.id });
    const from = subjectOf("lead", lead.id);
    const to = subjectOf("provider", p.id);
    for (const t of jsonStore.readAll(TASKS).filter((x) => x.subject === from)) jsonStore.update(TASKS, t.id, { subject: to });
    for (const a of jsonStore.readAll(ACTIVITY).filter((x) => x.subject === from)) jsonStore.update(ACTIVITY, a.id, { subject: to });
    logActivity(to, { kind: "system", text: "Signed up in the Business app (was a lead)" });
    linked.push(lead.id);
  }
  return linked;
}

// ---------------------------------------------------------------- providers (owner, hold, source)

function updateProvider(providerId, input = {}, actor) {
  const rec = providerRecord(providerId);
  const subject = subjectOf("provider", providerId);
  const patch = {};
  if (input.hold !== undefined) {
    const hold = input.hold || null;
    if (hold && !HOLD_STAGES.includes(hold)) throw fail(400, "Only At risk, Inactive or Lost can be set by hand — the other stages follow the provider's account.");
    if (hold !== rec.hold) {
      patch.hold = hold;
      patch.holdReason = hold ? clean(input.holdReason, 200) || null : null;
      patch.holdAt = hold ? nowIso() : null;
      logActivity(subject, { kind: "stage", text: hold ? `Marked ${stageLabel(hold)}${patch.holdReason ? ` — ${patch.holdReason}` : ""}` : `${stageLabel(rec.hold)} cleared`, by: actor });
    }
  }
  if (input.ownerId !== undefined && (input.ownerId || null) !== rec.ownerId) {
    if (input.ownerId && !staffById(input.ownerId)) throw fail(400, "That team member wasn't found");
    patch.ownerId = input.ownerId || null;
    logActivity(subject, { kind: "owner", text: `Owner: ${staffById(patch.ownerId)?.name || "nobody"}`, by: actor });
  }
  if (input.source !== undefined) patch.source = clean(input.source, 40) || null;
  return Object.keys(patch).length ? saveProviderRecord(providerId, patch) : rec;
}

// ---------------------------------------------------------------- tasks (follow-ups)

function cleanDue(v) {
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw fail(400, "Pick a date and time for the follow-up");
  return new Date(t).toISOString();
}

function createTask({ subject, title, kind = "call", dueAt, assigneeId, auto = null, note = "" } = {}, actor) {
  parseSubject(subject);
  const t = clean(title, 140);
  if (!t) throw fail(400, "Say what needs doing");
  if (!TASK_KINDS.includes(kind)) throw fail(400, "Unknown follow-up type");
  if (assigneeId && !staffById(assigneeId)) throw fail(400, "That team member wasn't found");
  const task = jsonStore.insert(TASKS, {
    subject, title: t, kind, dueAt: cleanDue(dueAt), assigneeId: assigneeId || null, status: "open",
    note: clean(note, 1000) || null, auto, createdAt: nowIso(), createdBy: actor || (auto ? "Tikdum (automatic)" : null),
    doneAt: null, doneBy: null, outcome: null, remindedAt: null,
  });
  return task;
}

function updateTask(id, input = {}, actor) {
  const task = jsonStore.readAll(TASKS).find((t) => t.id === id);
  if (!task) throw fail(404, "Follow-up not found");
  const patch = {};
  if (input.title !== undefined) {
    patch.title = clean(input.title, 140);
    if (!patch.title) throw fail(400, "Say what needs doing");
  }
  if (input.dueAt !== undefined) {
    patch.dueAt = cleanDue(input.dueAt);
    patch.remindedAt = null; // a new time gets its own reminder
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId && !staffById(input.assigneeId)) throw fail(400, "That team member wasn't found");
    patch.assigneeId = input.assigneeId || null;
  }
  if (input.kind !== undefined) {
    if (!TASK_KINDS.includes(input.kind)) throw fail(400, "Unknown follow-up type");
    patch.kind = input.kind;
  }
  if (input.note !== undefined) patch.note = clean(input.note, 1000) || null;
  if (input.status !== undefined && input.status !== task.status) {
    if (!["open", "done", "cancelled"].includes(input.status)) throw fail(400, "Unknown status");
    patch.status = input.status;
    patch.doneAt = input.status === "open" ? null : nowIso();
    patch.doneBy = input.status === "open" ? null : actor || null;
    if (input.outcome !== undefined) patch.outcome = clean(input.outcome, 60) || null;
    const verb = input.status === "done" ? "Done" : input.status === "cancelled" ? "Cancelled" : "Reopened";
    logActivity(task.subject, { kind: "task", text: `${verb}: ${task.title}${patch.outcome ? ` — ${patch.outcome}` : ""}`, by: actor });
  }
  return jsonStore.update(TASKS, id, patch);
}

// A call, WhatsApp, visit or note — optionally closing the follow-up it answered and
// booking the next one. A lead moves forward on its own: contacted after the first
// contact, interested when that's the outcome.
function logContact({ subject, kind, outcome, text, taskId, next } = {}, actor) {
  const { type, id } = parseSubject(subject);
  if (!CONTACT_KINDS.includes(kind)) throw fail(400, "Pick call, WhatsApp, visit or note");
  if (kind === "note" && !clean(text)) throw fail(400, "Write a note first");
  if (outcome && !OUTCOMES.includes(outcome)) throw fail(400, "Unknown outcome");
  const entry = logActivity(subject, { kind, outcome: outcome || null, text, by: actor });
  if (taskId) updateTask(taskId, { status: "done", outcome: outcome || null }, actor);
  if (type === "lead" && kind !== "note") {
    const lead = jsonStore.readAll(LEADS).find((l) => l.id === id);
    if (lead && !lead.providerId) {
      const target = outcome === "Interested" ? "interested" : lead.stage === "lead" ? "contacted" : null;
      if (target && target !== lead.stage && LEAD_STAGES.indexOf(target) > LEAD_STAGES.indexOf(lead.stage)) updateLead(id, { stage: target }, actor);
    }
  }
  let nextTask = null;
  if (next?.dueAt) nextTask = createTask({ subject, title: next.title || "Follow up", kind: next.kind || "call", dueAt: next.dueAt, assigneeId: next.assigneeId }, actor);
  return { entry, nextTask };
}

// Overdue / today / upcoming, by the India calendar day.
function istDay(ms) {
  return Math.floor((ms + IST_OFFSET) / DAY);
}
function bucketOf(task, now = Date.now()) {
  if (task.status !== "open") return "done";
  const due = Date.parse(task.dueAt);
  if (due < now && istDay(due) < istDay(now)) return "overdue";
  if (istDay(due) === istDay(now)) return due < now ? "overdue" : "today";
  return "upcoming";
}

// ---------------------------------------------------------------- automatic follow-ups

// Which automatic follow-up a provider needs now, if any. Each kind is created at most once
// per 3 days (the welcome call only ever once), and never while one is still open.
function autoTaskFor(card, tasks, now = Date.now()) {
  if (card.type !== "provider" || HOLD_STAGES.includes(card.stage)) return null;
  const mine = tasks.filter((t) => t.subject === card.subject && t.auto);
  // One automatic follow-up at a time per provider: the next comes after this one is done.
  if (mine.some((t) => t.status === "open")) return null;
  const recently = (auto) => mine.some((t) => t.auto === auto && (t.status === "open" || now - Date.parse(t.createdAt) < 3 * DAY));
  const joined = Date.parse(card.joinedAt || "") || 0;
  const age = joined ? now - joined : Infinity;
  if (age < 3 * DAY && !mine.some((t) => t.auto === "welcome")) {
    return { auto: "welcome", kind: "call", title: "Welcome call — new sign-up", dueAt: nowIso(now + HOUR) };
  }
  if (card.stage === "documents" && age >= DAY && !recently("documents")) {
    return { auto: "documents", kind: "documents", title: `Collect documents${card.missing?.length ? `: ${card.missing.join(", ")}` : ""}`.slice(0, 140), dueAt: nowIso(now + 2 * HOUR) };
  }
  if (card.stage === "review" && !recently("review")) {
    return { auto: "review", kind: "review", title: "Review uploaded documents and approve", dueAt: nowIso(now + 2 * HOUR) };
  }
  if (card.stage === "onboarding" && age >= 2 * DAY && !recently("setup")) {
    const missing = (card.checklist?.missing || []).filter((m) => m !== "Documents approved" && m !== "Account approved");
    return { auto: "setup", kind: "setup", title: `Help finish setup${missing.length ? `: ${missing.join(", ")}` : ""}`.slice(0, 140), dueAt: nowIso(now + 2 * HOUR) };
  }
  return null;
}

// ---------------------------------------------------------------- the board

async function gather() {
  const [providers, services] = await Promise.all([store.listProviders(), store.listServices({})]);
  await linkLeads(providers);
  const required = store.getSettings().kycRequiredDocs || [];
  const docs = jsonStore.readAll("kycDocuments");
  const activeByProvider = new Map();
  for (const s of services) if (s.status === "active" && s.providerId) activeByProvider.set(s.providerId, (activeByProvider.get(s.providerId) || 0) + 1);
  return { providers, required, docs, activeByProvider, records: new Map(jsonStore.readAll(PROVIDERS).map((r) => [r.id, r])) };
}

function providerCard(p, g, staff) {
  const kyc = kycStatus(g.docs.filter((d) => d.providerId === p.id), g.required);
  const list = checklist(p, { kyc, activeServices: g.activeByProvider.get(p.id) || 0 });
  const rec = g.records.get(p.id) || {};
  const stage = providerStage(p, { kyc, list, hold: rec.hold });
  return {
    subject: subjectOf("provider", p.id), type: "provider", id: p.id,
    name: p.name, businessName: p.businessName || null, phone: p.phone, category: p.category && p.category !== "Not set" ? p.category : null,
    area: p.serviceArea || null, stage, autoStage: !rec.hold, holdReason: rec.holdReason || null,
    verificationStatus: p.verificationStatus || "pending", joinedAt: p.joinedAt || null,
    ownerId: rec.ownerId || null, ownerName: staff.find((s) => s.id === rec.ownerId)?.name || null, source: rec.source || "Business app sign-up",
    checklist: { done: list.done, total: list.total, missing: list.missing }, missing: kyc.missing, docsWaiting: kyc.waiting,
    rating: p.reviews ? p.rating : null,
  };
}

function leadCard(l, staff) {
  return {
    subject: subjectOf("lead", l.id), type: "lead", id: l.id,
    name: l.name, businessName: l.businessName || null, phone: l.phone, category: l.category || null, area: l.area || l.pincode || null, pincode: l.pincode || null,
    stage: l.stage || "lead", autoStage: false, holdReason: l.lostReason || null, joinedAt: l.createdAt,
    ownerId: l.ownerId || null, ownerName: staff.find((s) => s.id === l.ownerId)?.name || null, source: l.source || "Other",
    checklist: null, missing: [],
  };
}

function withTasks(cards, tasks, now = Date.now()) {
  const open = tasks.filter((t) => t.status === "open").sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
  const lastBy = new Map();
  for (const a of jsonStore.readAll(ACTIVITY)) if (String(a.at) > String(lastBy.get(a.subject) || "")) lastBy.set(a.subject, a.at);
  return cards.map((c) => {
    const mine = open.filter((t) => t.subject === c.subject);
    const next = mine[0] || null;
    return { ...c, openTasks: mine.length, nextTask: next ? { id: next.id, title: next.title, dueAt: next.dueAt, bucket: bucketOf(next, now), assigneeId: next.assigneeId } : null, lastActivityAt: lastBy.get(c.subject) || null };
  });
}

function matches(c, f) {
  const q = clean(f.q).toLowerCase();
  if (q) {
    const d = digits(q);
    const hay = [c.name, c.businessName, c.category, c.area, c.source].map((v) => String(v || "").toLowerCase());
    if (!(hay.some((v) => v.includes(q)) || (d.length >= 3 && digits(c.phone).includes(d)))) return false;
  }
  if (f.ownerId === "none" ? c.ownerId : f.ownerId && c.ownerId !== f.ownerId) return false;
  if (f.category && String(c.category || "").toLowerCase() !== String(f.category).toLowerCase()) return false;
  if (f.source && c.source !== f.source) return false;
  if (f.type && c.type !== f.type) return false;
  return true;
}

async function pipeline(f = {}, now = Date.now()) {
  const g = await gather();
  const staff = listStaff();
  const leads = jsonStore.readAll(LEADS).filter((l) => !l.providerId);
  const tasks = jsonStore.readAll(TASKS);
  const cards = withTasks([...g.providers.map((p) => providerCard(p, g, staff)), ...leads.map((l) => leadCard(l, staff))], tasks, now);
  const shown = cards.filter((c) => matches(c, f));
  const counts = Object.fromEntries(STAGE_KEYS.map((k) => [k, shown.filter((c) => c.stage === k).length]));
  const categories = [...new Set(cards.map((c) => c.category).filter(Boolean))].sort();
  return { stages: STAGES, counts, cards: shown, total: cards.length, staff, sources: SOURCES, categories, outcomes: OUTCOMES, taskKinds: TASK_KINDS };
}

// ---------------------------------------------------------------- follow-up lists

async function tasksView(f = {}, viewerId, now = Date.now()) {
  const { cards } = await pipeline({}, now);
  const bySubject = new Map(cards.map((c) => [c.subject, c]));
  const staff = listStaff();
  let tasks = jsonStore.readAll(TASKS);
  if (f.scope === "mine") tasks = tasks.filter((t) => t.assigneeId === viewerId);
  else if (f.scope === "unassigned") tasks = tasks.filter((t) => !t.assigneeId);
  else if (f.scope && f.scope.startsWith("admin:")) tasks = tasks.filter((t) => t.assigneeId === f.scope);
  if (f.subject) tasks = tasks.filter((t) => t.subject === f.subject);
  const view = (t) => {
    const c = bySubject.get(t.subject);
    return {
      ...t, bucket: bucketOf(t, now), assigneeName: staff.find((s) => s.id === t.assigneeId)?.name || null,
      who: c ? { subject: c.subject, type: c.type, id: c.id, name: c.name, businessName: c.businessName, phone: c.phone, stage: c.stage, category: c.category } : null,
    };
  };
  const open = tasks.filter((t) => t.status === "open").sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).map(view).filter((t) => t.who);
  const done = tasks.filter((t) => t.status !== "open" && now - Date.parse(t.doneAt || t.createdAt) < 7 * DAY).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt))).slice(0, 50).map(view).filter((t) => t.who);
  return {
    overdue: open.filter((t) => t.bucket === "overdue"),
    today: open.filter((t) => t.bucket === "today"),
    upcoming: open.filter((t) => t.bucket === "upcoming"),
    done,
    staff,
    outcomes: OUTCOMES,
    taskKinds: TASK_KINDS,
  };
}

// For the menu badge: what's due today or late for this person (plus unassigned ones).
function summary(viewerId, now = Date.now()) {
  const open = jsonStore.readAll(TASKS).filter((t) => t.status === "open");
  const mine = open.filter((t) => t.assigneeId === viewerId);
  const due = (list) => list.filter((t) => ["overdue", "today"].includes(bucketOf(t, now))).length;
  return { mineDue: due(mine), mineOverdue: mine.filter((t) => bucketOf(t, now) === "overdue").length, unassignedDue: due(open.filter((t) => !t.assigneeId)), allDue: due(open) };
}

// ---------------------------------------------------------------- one provider / lead (360)

async function detail(subject, now = Date.now()) {
  const { type, id } = parseSubject(subject);
  const { cards, staff } = await pipeline({}, now);
  const card = cards.find((c) => c.subject === subject);
  if (!card) {
    // A lead that has since signed up opens as the provider.
    const lead = type === "lead" ? jsonStore.readAll(LEADS).find((l) => l.id === id) : null;
    if (lead?.providerId) return detail(subjectOf("provider", lead.providerId), now);
    throw fail(404, type === "lead" ? "Lead not found" : "Provider not found");
  }
  const tasks = jsonStore.readAll(TASKS).filter((t) => t.subject === subject);
  const view = (t) => ({ ...t, bucket: bucketOf(t, now), assigneeName: staff.find((s) => s.id === t.assigneeId)?.name || null });
  const out = {
    card,
    lead: type === "lead" ? jsonStore.readAll(LEADS).find((l) => l.id === id) : null,
    openTasks: tasks.filter((t) => t.status === "open").sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).map(view),
    timeline: await timeline(subject, card),
    staff, stages: STAGES, sources: SOURCES, outcomes: OUTCOMES, taskKinds: TASK_KINDS,
  };
  if (type === "provider") {
    const p = await store.getProvider(id);
    const kyc = kycStatus(store.listKycDocuments(id), store.getSettings().kycRequiredDocs || []);
    const services = (await store.listServices({})).filter((s) => s.providerId === id && s.status === "active").length;
    const bookings = await store.listBookings({ providerId: id });
    out.checklist = checklist(p, { kyc, activeServices: services, completedJobs: bookings.filter((b) => b.status === "Completed").length });
    out.jobs = { total: bookings.length, completed: bookings.filter((b) => b.status === "Completed").length, open: bookings.filter((b) => ["Pending", "Accepted", "In Progress"].includes(b.status)).length };
  }
  return out;
}

// Everything that happened, newest first: CRM contacts and follow-ups, team notes, documents,
// account changes, bookings, turned-down requests and complaints.
async function timeline(subject, card) {
  const { type, id } = parseSubject(subject);
  const items = [];
  const add = (at, kind, text, by = null, extra = {}) => at && items.push({ at, kind, text, by, ...extra });
  for (const a of jsonStore.readAll(ACTIVITY).filter((x) => x.subject === subject)) add(a.at, a.kind, a.text || (a.outcome ? "" : a.kind), a.by, { outcome: a.outcome });
  for (const t of jsonStore.readAll(TASKS).filter((x) => x.subject === subject)) add(t.createdAt, "task-created", `Follow-up set: ${t.title}`, t.createdBy, { dueAt: t.dueAt });
  if (type === "lead") return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300);

  if (card?.joinedAt) add(card.joinedAt, "system", "Signed up in the Business app");
  for (const n of jsonStore.readAll("providerNotes").filter((x) => x.providerId === id)) add(n.at, "note", n.text, n.by);
  for (const d of jsonStore.readAll("kycDocuments").filter((x) => x.providerId === id)) {
    add(d.uploadedAt, "document", `Uploaded ${String(d.docType || "document").replace(/_/g, " ")}`);
    if (d.reviewedAt) add(d.reviewedAt, "document", `${String(d.docType || "document").replace(/_/g, " ")} ${d.status}${d.note ? ` — ${d.note}` : ""}`, d.reviewedBy);
  }
  for (const c of store.listAdminChanges({ entityType: "provider", entityId: id, limit: 200 })) {
    if (c.action === "provider.tags") continue;
    const what = (c.changes || []).map((x) => `${x.field}: ${x.to ?? "—"}`).join(", ");
    add(c.at, "change", `${String(c.action || "").replace(/[._]/g, " ")}${what ? ` — ${what}` : ""}`, c.actor);
  }
  try {
    for (const b of (await store.listBookings({ providerId: id })).slice(0, 100)) {
      add(b.createdAt, "booking", `Booking #${b.ref || b.id} · ${b.service?.name || "Service"} · ${b.status}`, null, { bookingId: b.id });
    }
  } catch {
    // the timeline still shows everything else if bookings can't be loaded right now
  }
  for (const d of jsonStore.readAll("providerDeclines").filter((x) => x.providerId === id)) add(d.at, "declined", d.kind === "timeout" ? "Missed a booking request (no answer)" : "Turned down a booking request");
  for (const c of jsonStore.readAll("complaints").filter((x) => x.providerId === id)) add(c.createdAt, "complaint", `Complaint: ${c.subject || c.category || "—"}`);
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300);
}

// ---------------------------------------------------------------- the minute job: auto follow-ups, reminders, morning digest

let running = false;
async function runJobs({ now = Date.now(), notify = async () => {}, whatsapp = async () => {} } = {}) {
  if (running) return { skipped: true };
  running = true;
  const out = { created: 0, reminded: 0, digests: 0 };
  try {
    const settings = getSettings();
    if (settings.autoTasks) {
      const { cards } = await pipeline({}, now);
      const tasks = jsonStore.readAll(TASKS);
      for (const c of cards) {
        const plan = autoTaskFor(c, tasks, now);
        if (!plan) continue;
        const assigneeId = c.ownerId || settings.defaultOwnerId || null;
        tasks.push(createTask({ subject: c.subject, ...plan, assigneeId }, null));
        out.created++;
      }
    }
    // A push to the person's Admin app when a follow-up falls due (once per due time).
    const staff = listStaff();
    for (const t of jsonStore.readAll(TASKS).filter((x) => x.status === "open" && !x.remindedAt && Date.parse(x.dueAt) <= now)) {
      jsonStore.update(TASKS, t.id, { remindedAt: nowIso(now) });
      // Only follow-ups that came due in the last hour ring; older ones are in the morning digest.
      if (now - Date.parse(t.dueAt) > HOUR) continue;
      const targets = t.assigneeId ? [t.assigneeId] : settings.defaultOwnerId ? [settings.defaultOwnerId] : [];
      const name = await nameOf(t.subject);
      for (const to of targets) await notify(to, { title: "Follow-up due", body: `${t.title}${name ? ` — ${name}` : ""}`, subject: t.subject, taskId: t.id });
      out.reminded++;
    }
    // One WhatsApp per person each morning with what's due today and overdue.
    const ist = new Date(now + IST_OFFSET);
    const today = ist.toISOString().slice(0, 10);
    if (settings.whatsappDigest && ist.getUTCHours() === settings.digestHourIst) {
      const digests = jsonStore.readAll("crmDigests");
      for (const d of digests) if (now - Date.parse(d.at) > 30 * DAY) jsonStore.remove("crmDigests", d.id);
      const sent = new Set(digests.filter((d) => d.day === today).map((d) => d.staffId));
      const open = jsonStore.readAll(TASKS).filter((x) => x.status === "open");
      for (const s of staff) {
        if (sent.has(s.id)) continue;
        const mine = open.filter((x) => x.assigneeId === s.id);
        const overdue = mine.filter((x) => bucketOf(x, now) === "overdue").length;
        const dueToday = mine.filter((x) => bucketOf(x, now) === "today").length;
        jsonStore.insert("crmDigests", { day: today, staffId: s.id, at: nowIso(now), count: overdue + dueToday });
        if (!overdue && !dueToday) continue;
        const message = `Provider CRM: ${dueToday} follow-up${dueToday === 1 ? "" : "s"} due today${overdue ? ` and ${overdue} overdue` : ""}. Open Tikdum Admin → Provider CRM to see them.`;
        await whatsapp(s.phone, { name: s.name, message });
        out.digests++;
      }
    }
    return out;
  } finally {
    running = false;
  }
}

async function nameOf(subject) {
  try {
    const { type, id } = parseSubject(subject);
    if (type === "lead") {
      const l = jsonStore.readAll(LEADS).find((x) => x.id === id);
      return l ? l.businessName || l.name : null;
    }
    const p = (await store.listProviders()).find((x) => x.id === id);
    return p ? p.businessName || p.name : null;
  } catch {
    return null;
  }
}

module.exports = {
  STAGES, LEAD_STAGES, HOLD_STAGES, SOURCES, OUTCOMES, TASK_KINDS,
  // rules (pure)
  checklist, providerStage, bucketOf, autoTaskFor, phoneKey,
  // data
  getSettings, updateSettings, listStaff,
  createLead, importLeads, updateLead, deleteLead, linkLeads, findByPhone,
  updateProvider, createTask, updateTask, logContact,
  pipeline, tasksView, summary, detail, runJobs,
};
