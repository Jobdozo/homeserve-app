// Agent Office: the task board, conversation threads and weekly goals shared
// by people and AI agents (see agents.js for who agents are).
//
// Hub-and-spoke on purpose: agents never message each other. Every message
// lives in a thread — the "ceo" thread (owner <-> CEO agent) or one thread
// per task — and people can read and reply to all of them.
//
// What each side may do:
//   CEO agent    — PROPOSE tasks and weekly goals, reply in the CEO thread,
//                  comment on tasks. A person approves proposals.
//   Other agents — see tasks assigned to them, comment, move them to
//                  in_progress or review. Only a person marks a task done.
//   People       — everything: create/assign/approve/reject/close, reply anywhere.
// Daily caps stop runaway loops and AI bills. Flat-JSON storage.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const TASKS = "aiTasks";
const MESSAGES = "aiMessages";
const GOALS = "aiGoals";
const MAX_MESSAGES = 20000;

const STATUSES = ["proposed", "open", "in_progress", "review", "done", "cancelled", "rejected"];
const ACTIVE = ["proposed", "open", "in_progress", "review"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const LIMITS = { ceoTasksPerDay: 10, ceoGoalsPerWeek: 5, agentMessagesPerDay: 60, ceoRepliesPerDay: 40 };

const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const IST_MS = 5.5 * 3600 * 1000;
const istDay = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);
// Monday (IST) of the week containing `ms`, as YYYY-MM-DD.
function weekOf(ms = Date.now()) {
  const d = new Date(ms + IST_MS);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}
const newId = (p) => `${p}_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
const str = (v, max) => String(v ?? "").trim().slice(0, max);

// actor: { type: "person"|"agent"|"system", id, name, ceo? }
const who = (a) => ({ type: a.type, id: a.id, name: a.name });
const sameActor = (x, a) => x && a && x.type === a.type && x.id === a.id;

function countToday(predicate) {
  const today = istDay();
  return (rows) => rows.filter((r) => istDay(Date.parse(r.createdAt || r.at)) === today && predicate(r)).length;
}

// ---- tasks ----
function cleanAssignee(a) {
  if (!a) return null;
  if (!["agent", "person"].includes(a.type) || !a.id) throw fail(400, "Assignee must be an agent or a person");
  return { type: a.type, id: str(a.id, 80), name: str(a.name || a.id, 80) };
}

function createTask(input, actor) {
  const title = str(input.title, 140);
  if (!title) throw fail(400, "Task title is required");
  const rows = jsonStore.readAll(TASKS);
  const proposed = actor.type === "agent"; // agents (the CEO) can only propose
  if (proposed) {
    if (!actor.ceo) throw fail(403, "Only the CEO agent can propose tasks");
    if (countToday((t) => sameActor(t.createdBy, actor))(rows) >= LIMITS.ceoTasksPerDay) throw fail(429, "The CEO agent has reached today's task-proposal limit");
    const dup = rows.find((t) => ACTIVE.includes(t.status) && t.title.toLowerCase() === title.toLowerCase());
    if (dup) return { duplicate: true, task: dup };
  }
  const task = {
    id: newId("task"),
    title,
    description: str(input.description, 4000),
    status: proposed ? "proposed" : "open",
    priority: PRIORITIES.includes(input.priority) ? input.priority : "normal",
    assignee: cleanAssignee(input.assignee),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "") ? input.dueDate : null,
    createdBy: who(actor),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    result: null,
    decidedBy: null,
  };
  rows.push(task);
  jsonStore.writeAll(TASKS, rows);
  if (task.description || proposed) addMessage(task.id, actor, proposed ? `Proposed: ${task.description || task.title}` : task.description, { bypassCaps: true });
  return { duplicate: false, task };
}

function listTasks({ status, assigneeType, assigneeId, active } = {}) {
  const order = { urgent: 0, high: 1, normal: 2, low: 3 };
  return jsonStore
    .readAll(TASKS)
    .filter((t) => (!status || t.status === status) && (!active || ACTIVE.includes(t.status)))
    .filter((t) => (!assigneeType || t.assignee?.type === assigneeType) && (!assigneeId || t.assignee?.id === assigneeId))
    .sort((a, b) => order[a.priority] - order[b.priority] || new Date(b.updatedAt) - new Date(a.updatedAt));
}

const getTaskRow = (id) => jsonStore.readAll(TASKS).find((t) => t.id === id) || null;

function getTask(id) {
  const task = getTaskRow(id);
  return task ? { task, messages: listMessages(id, { limit: 200 }) } : null;
}

// People: any field. Agents: only their own task, only in_progress/review (+ result).
function updateTask(id, patch, actor) {
  const t = getTaskRow(id);
  if (!t) return null;
  const next = {};
  if (actor.type === "agent") {
    if (!sameActor(t.assignee, actor)) throw fail(403, "This task isn't assigned to this agent");
    if (!["open", "in_progress", "review"].includes(t.status)) throw fail(409, `The task is ${t.status}`);
    if (patch.status !== undefined) {
      if (!["in_progress", "review"].includes(patch.status)) throw fail(403, "Agents can only move a task to in progress or review — a person marks it done");
      next.status = patch.status;
    }
    if (patch.result !== undefined) next.result = str(patch.result, 8000);
  } else {
    if (patch.title !== undefined) next.title = str(patch.title, 140) || t.title;
    if (patch.description !== undefined) next.description = str(patch.description, 4000);
    if (patch.status !== undefined) {
      if (!STATUSES.includes(patch.status)) throw fail(400, "Unknown status");
      next.status = patch.status;
    }
    if (patch.priority !== undefined && PRIORITIES.includes(patch.priority)) next.priority = patch.priority;
    if (patch.assignee !== undefined) next.assignee = cleanAssignee(patch.assignee);
    if (patch.dueDate !== undefined) next.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate || "") ? patch.dueDate : null;
    if (patch.result !== undefined) next.result = str(patch.result, 8000);
  }
  if (!Object.keys(next).length) return t;
  const updated = jsonStore.update(TASKS, id, { ...next, updatedAt: nowIso() });
  if (next.status && next.status !== t.status) addMessage(id, { type: "system", id: "system", name: "System" }, `${actor.name} moved this to ${next.status.replace("_", " ")}`, { bypassCaps: true });
  return updated;
}

function decideTask(id, approve, note, actor) {
  const t = getTaskRow(id);
  if (!t) return null;
  if (t.status !== "proposed") throw fail(409, `This task is already ${t.status}`);
  const updated = jsonStore.update(TASKS, id, { status: approve ? "open" : "rejected", decidedBy: actor.name, updatedAt: nowIso() });
  addMessage(id, actor, `${approve ? "Approved" : "Rejected"}${note ? `: ${str(note, 500)}` : ""}`, { bypassCaps: true });
  return updated;
}

// ---- messages / threads ----
// threadId: "ceo" or a task id.
function addMessage(threadId, actor, text, { channel = "admin", bypassCaps = false, phone, waId } = {}) {
  const body = str(text, 4000);
  if (!body) throw fail(400, "Write a message first");
  if (threadId !== "ceo" && !getTaskRow(threadId)) throw fail(404, "Task not found");
  const rows = jsonStore.readAll(MESSAGES);
  if (!bypassCaps && actor.type === "agent") {
    const limit = actor.ceo ? LIMITS.ceoRepliesPerDay : LIMITS.agentMessagesPerDay;
    if (countToday((m) => sameActor(m.from, actor))(rows) >= limit) throw fail(429, "This agent has reached today's message limit");
  }
  const msg = { id: newId("msg"), threadId, from: who(actor), text: body, channel, at: nowIso(), ...(phone ? { phone } : {}), ...(waId ? { waId } : {}) };
  rows.push(msg);
  jsonStore.writeAll(MESSAGES, rows.slice(-MAX_MESSAGES));
  if (threadId !== "ceo") jsonStore.update(TASKS, threadId, { updatedAt: msg.at });
  return msg;
}

function listMessages(threadId, { limit = 100, since } = {}) {
  return jsonStore
    .readAll(MESSAGES)
    .filter((m) => m.threadId === threadId && (!since || m.at > since))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-Math.min(Number(limit) || 100, 500));
}

// Owner messages in the CEO thread that arrived after the CEO's last reply.
function pendingForCeo() {
  const thread = listMessages("ceo", { limit: 500 });
  let lastCeo = -1;
  thread.forEach((m, i) => { if (m.from.type === "agent") lastCeo = i; });
  return thread.slice(lastCeo + 1).filter((m) => m.from.type === "person");
}

// Where the CEO's reply should also go: the WhatsApp number of the last
// person who wrote on WhatsApp, if that was within WhatsApp's 24h window.
function whatsappReplyTarget() {
  const last = listMessages("ceo", { limit: 500 }).filter((m) => m.from.type === "person").pop();
  if (!last || last.channel !== "whatsapp" || !last.phone) return null;
  return Date.now() - Date.parse(last.at) < 24 * 3600 * 1000 ? last.phone : null;
}

function addOwnerWhatsApp(phone, text, waId) {
  if (waId && jsonStore.readAll(MESSAGES).some((m) => m.waId === waId)) return null; // MSG91 retry
  return addMessage("ceo", { type: "person", id: `admin:${phone}`, name: "Owner (WhatsApp)" }, text, { channel: "whatsapp", bypassCaps: true, phone, waId });
}

// ---- weekly goals ----
function proposeGoal(text, actor) {
  const body = str(text, 300);
  if (!body) throw fail(400, "Goal text is required");
  const week = weekOf();
  const rows = jsonStore.readAll(GOALS);
  const proposed = actor.type === "agent";
  if (proposed) {
    if (!actor.ceo) throw fail(403, "Only the CEO agent can propose goals");
    if (rows.filter((g) => g.week === week && sameActor(g.createdBy, actor)).length >= LIMITS.ceoGoalsPerWeek) throw fail(429, "Weekly goal-proposal limit reached");
    const dup = rows.find((g) => g.week === week && g.text.toLowerCase() === body.toLowerCase());
    if (dup) return { duplicate: true, goal: dup };
  }
  const goal = { id: newId("goal"), week, text: body, status: proposed ? "proposed" : "approved", createdBy: who(actor), createdAt: nowIso(), decidedBy: proposed ? null : actor.name };
  rows.push(goal);
  jsonStore.writeAll(GOALS, rows);
  return { duplicate: false, goal };
}

function listGoals({ week } = {}) {
  const w = week || weekOf();
  return jsonStore.readAll(GOALS).filter((g) => g.week === w).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function decideGoal(id, decision, actor) {
  const g = jsonStore.readAll(GOALS).find((x) => x.id === id);
  if (!g) return null;
  if (!["approved", "rejected", "done"].includes(decision)) throw fail(400, "decision must be approved, rejected or done");
  return jsonStore.update(GOALS, id, { status: decision, decidedBy: actor.name });
}

module.exports = {
  STATUSES, PRIORITIES, LIMITS, weekOf,
  createTask, listTasks, getTask, updateTask, decideTask,
  addMessage, listMessages, pendingForCeo, whatsappReplyTarget, addOwnerWhatsApp,
  proposeGoal, listGoals, decideGoal,
};
