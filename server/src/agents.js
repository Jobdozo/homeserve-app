// AI agents: non-human staff accounts that work the admin API on the team's
// behalf (see the separate agents/ worker service).
//
// Safety model, in order:
//   1. An agent holds one of the normal staff roles (never Super Admin/Admin)
//      and goes through the exact same per-route permission guard as a person
//      (access.guard). Its effective permissions are that role's, cut down to
//      read/export plus a short allowlist of low-risk writes (AGENT_WRITES).
//   2. Anything consequential — approving/rejecting providers, refund
//      decisions, closing complaints, mass notifications — an agent can only
//      *propose*. A person approves it in Admin → AI Agents, and it then runs
//      as that person, with that person's own permissions (index.js).
//   3. A global kill switch and a per-agent on/off take effect on the very
//      next request (permissions are resolved live, tokens last 15 minutes).
//   4. Agents authenticate with an API key that is stored only as a SHA-256
//      hash and shown once at creation.
// Flat-JSON storage (see jsonStore.js). Only the API server process writes
// these files — the worker talks to it over HTTP, never to the files.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");
const access = require("./access");
const auth = require("./auth");

const AGENTS = "aiAgents";
const ACTIONS = "aiAgentActions";
const FEED = "aiAgentFeed";
const CONFIG = "aiAgentConfig";
const MAX_FEED = 2000;
const MAX_ACTIONS = 2000;
const TOKEN_TTL = "15m";
const ACTION_TTL_MS = 72 * 3600 * 1000; // an unanswered proposal goes stale
const DEFAULT_DAILY_BUDGET_USD = 1;

const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const IST_MS = 5.5 * 3600 * 1000;
const istDay = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// Roles an agent may never hold.
const FORBIDDEN_ROLES = ["super_admin", "admin"];
// Modules an agent never touches, even read-only.
const DENY_MODULES = ["users", "settings", "data", "ai", "accounting"];
// Read-style actions an agent keeps from its role.
const READ_ACTIONS = ["view", "export"];
// The only writes an agent may make directly (if its role has them).
const AGENT_WRITES = ["complaints.add", "complaints.edit", "notifications.add", "inbox.add"];
// Per-agent ceiling on direct notifications (in-app messages to one person).
const NOTIFY_PER_HOUR = 30;

// What an agent may propose for a person to approve: [type, method, path regex].
const PROPOSABLE = [
  ["provider.verification", "PATCH", /^\/providers\/[A-Za-z0-9_-]+\/verification$/],
  ["refund.decision", "PATCH", /^\/admin\/refund-claims\/[A-Za-z0-9_-]+$/],
  ["complaint.status", "POST", /^\/admin\/complaints\/[A-Za-z0-9_-]+\/status$/],
  ["complaint.message", "POST", /^\/admin\/complaints\/[A-Za-z0-9_-]+\/entries$/],
  ["provider.warn", "POST", /^\/admin\/providers\/[A-Za-z0-9_-]+\/warn$/],
  ["notification.broadcast", "POST", /^\/admin\/notifications\/broadcast$/],
];

// ---- config (global kill switch + what the support agent may tell customers) ----
const MAX_KNOWLEDGE = 8000;

function getConfig() {
  const row = jsonStore.readAll(CONFIG)[0];
  return {
    enabled: row ? row.enabled !== false : true,
    supportKnowledge: row?.supportKnowledge || "",
    // false = review mode: the support agent only drafts replies and a person
    // sends them. Off by default so nothing reaches customers unreviewed.
    supportAutoSend: row?.supportAutoSend === true,
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
  };
}

function setConfig(patch, actor) {
  const current = jsonStore.readAll(CONFIG)[0] || { id: "config", enabled: true };
  const row = { ...current, id: "config", updatedAt: nowIso(), updatedBy: actor };
  if (patch.enabled !== undefined) row.enabled = Boolean(patch.enabled);
  if (patch.supportAutoSend !== undefined) row.supportAutoSend = patch.supportAutoSend === true;
  if (patch.supportKnowledge !== undefined) {
    const text = String(patch.supportKnowledge || "");
    if (text.length > MAX_KNOWLEDGE) throw fail(400, `Support knowledge is limited to ${MAX_KNOWLEDGE} characters`);
    row.supportKnowledge = text;
  }
  jsonStore.writeAll(CONFIG, [row]);
  return getConfig();
}

// ---- permissions ----
function expand(perms) {
  const { modules } = access.catalogue();
  const out = new Set();
  for (const p of perms || []) {
    const [m, a] = String(p).split(".");
    const mod = modules.find((x) => x.key === m);
    if (!mod) continue;
    if (a === "manage") mod.actions.filter((x) => x !== "manage").forEach((x) => out.add(`${m}.${x}`));
    else out.add(p);
  }
  return [...out];
}

// The role's permissions cut down to what an agent may do on its own.
function agentPermissions(rolePerms) {
  return expand(rolePerms).filter((p) => {
    const [m, a] = p.split(".");
    if (DENY_MODULES.includes(m)) return false;
    return READ_ACTIONS.includes(a) || AGENT_WRITES.includes(p);
  });
}

// ---- agent records ----
const publicAgent = (a, roles = access.listRoles()) => {
  const { keyHash, ...rest } = a;
  const role = roles.find((r) => r.id === a.roleId);
  const today = istDay();
  const usage = a.usage?.day === today ? a.usage : { day: today, costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
  return { ...rest, kind: a.kind || "standard", roleName: role?.name || "—", usage, effectivePermissions: role ? agentPermissions(role.permissions) : [] };
};

function listAgents() {
  const roles = access.listRoles();
  return jsonStore.readAll(AGENTS).map((a) => publicAgent(a, roles));
}

function cleanRole(roleId) {
  if (FORBIDDEN_ROLES.includes(roleId)) throw fail(400, "AI agents can't be given the Super Admin or Admin role");
  const role = access.listRoles().find((r) => r.id === roleId);
  if (!role) throw fail(400, "Choose a role");
  if (role.permissions.includes("*")) throw fail(400, "AI agents can't be given a full-access role");
  return role;
}

function cleanBudget(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw fail(400, "Daily AI budget must be between $0 and $100");
  return Math.round(n * 100) / 100;
}

function newKey() {
  return `tkag_${crypto.randomBytes(32).toString("base64url")}`;
}

// Returns the agent plus its API key — the only time the key is ever visible.
// kind: "standard", or "ceo" — the one agent that reads every team's reports
// and proposes tasks/goals on the task board (see office.js). At most one.
// specialist: a generic AI worker that drafts deliverables for tasks assigned
// to it on the task board (see agents/src/specialist.js and agentCatalog.js).
// engineer: one of the Engineering team (bug_triage / developer / reviewer /
// tester, set by `template`). They work on GitHub through the worker's own
// GitHub App identity — pull requests and comments only, never merges
// (see agents/src/engineering.js). Tikdum itself only gives them tasks.
const KINDS_ALLOWED = ["standard", "ceo", "specialist", "engineer"];
const ENGINEER_TEMPLATES = ["bug_triage", "developer", "reviewer", "tester"];
const TEAM_KEYS = ["leadership", "operations", "marketing", "planning", "rnd", "engineering"];
const cleanTeam = (t) => (TEAM_KEYS.includes(t) ? t : null);
const cleanInstructions = (v) => String(v || "").slice(0, 6000);
function cleanKind(kind, exceptId) {
  const k = kind || "standard";
  if (!KINDS_ALLOWED.includes(k)) throw fail(400, "Unknown agent type");
  if (k === "ceo" && jsonStore.readAll(AGENTS).some((a) => a.kind === "ceo" && a.id !== exceptId)) throw fail(409, "There is already a CEO agent");
  return k;
}

function createAgent({ name, roleId, description, dailyBudgetUsd, kind, team, template, instructions }, actor) {
  const clean = String(name || "").trim().slice(0, 50);
  if (!clean) throw fail(400, "Agent name is required");
  if (jsonStore.readAll(AGENTS).some((a) => a.name.toLowerCase() === clean.toLowerCase())) throw fail(409, "An agent with that name already exists");
  cleanRole(roleId);
  const agentKind = cleanKind(kind);
  const tpl = template ? require("./agentCatalog").roleByKey(String(template)) : null;
  if (agentKind === "engineer" && !ENGINEER_TEMPLATES.includes(tpl?.key)) throw fail(400, "Pick which Engineering role this agent is (Bug triage, Developer, Reviewer or Tester)");
  const apiKey = newKey();
  const agent = jsonStore.insert(AGENTS, {
    id: `agt_${crypto.randomBytes(6).toString("hex")}`,
    name: clean,
    description: String(description || "").trim().slice(0, 200),
    roleId,
    kind: agentKind,
    team: cleanTeam(team) || tpl?.team || null,
    template: tpl?.key || null,
    instructions: cleanInstructions(instructions !== undefined ? instructions : tpl?.instructions),
    active: true,
    dailyBudgetUsd: dailyBudgetUsd === undefined ? DEFAULT_DAILY_BUDGET_USD : cleanBudget(dailyBudgetUsd),
    keyHash: sha256(apiKey),
    keyPrefix: apiKey.slice(0, 10),
    createdAt: nowIso(),
    createdBy: actor,
    lastSeenAt: null,
    lastStatus: null,
  });
  return { agent: publicAgent(agent), apiKey };
}

function updateAgent(id, input) {
  const agent = jsonStore.readAll(AGENTS).find((a) => a.id === id);
  if (!agent) return null;
  const patch = {};
  if (input.name !== undefined) {
    patch.name = String(input.name).trim().slice(0, 50);
    if (!patch.name) throw fail(400, "Agent name is required");
  }
  if (input.description !== undefined) patch.description = String(input.description).trim().slice(0, 200);
  if (input.roleId !== undefined) patch.roleId = cleanRole(input.roleId).id;
  if (input.active !== undefined) patch.active = Boolean(input.active);
  if (input.dailyBudgetUsd !== undefined) patch.dailyBudgetUsd = cleanBudget(input.dailyBudgetUsd);
  if (input.kind !== undefined) patch.kind = cleanKind(input.kind, id);
  if (input.team !== undefined) patch.team = cleanTeam(input.team);
  if (input.instructions !== undefined) patch.instructions = cleanInstructions(input.instructions);
  if (input.template !== undefined) {
    const tpl = input.template ? require("./agentCatalog").roleByKey(String(input.template)) : null;
    patch.template = tpl?.key || null;
  }
  const kindAfter = patch.kind || agent.kind;
  const templateAfter = patch.template !== undefined ? patch.template : agent.template;
  if (kindAfter === "engineer" && !ENGINEER_TEMPLATES.includes(templateAfter)) throw fail(400, "Pick which Engineering role this agent is (Bug triage, Developer, Reviewer or Tester)");
  return publicAgent(jsonStore.update(AGENTS, id, patch));
}

function rotateKey(id) {
  const agent = jsonStore.readAll(AGENTS).find((a) => a.id === id);
  if (!agent) return null;
  const apiKey = newKey();
  jsonStore.update(AGENTS, id, { keyHash: sha256(apiKey), keyPrefix: apiKey.slice(0, 10) });
  return { agent: publicAgent({ ...agent, keyPrefix: apiKey.slice(0, 10) }), apiKey };
}

function deleteAgent(id) {
  return jsonStore.remove(AGENTS, id);
}

// ---- auth ----
// Resolves a live agent into the same shape access.resolveByPhone returns,
// or null when the agent (or all agents) is switched off.
function resolveAgent(agentId) {
  if (!getConfig().enabled) return null;
  const agent = jsonStore.readAll(AGENTS).find((a) => a.id === agentId);
  if (!agent || agent.active === false) return null;
  if (FORBIDDEN_ROLES.includes(agent.roleId)) return null;
  const role = access.listRoles().find((r) => r.id === agent.roleId);
  if (!role || role.permissions.includes("*")) return null;
  return {
    id: `agent:${agent.id}`,
    name: agent.name,
    phone: "",
    roleId: role.id,
    roleName: role.name,
    permissions: agentPermissions(role.permissions),
    rolePermissions: expand(role.permissions),
    owner: false,
    agent: true,
    agentId: agent.id,
    ceo: agent.kind === "ceo",
    kind: agent.kind || "standard",
    template: agent.template || null,
    instructions: agent.instructions || "",
  };
}

// API key -> short-lived token. Constant-time compare on the hash.
function issueToken(apiKey) {
  const key = String(apiKey || "");
  if (!key.startsWith("tkag_")) return null;
  const want = Buffer.from(sha256(key), "hex");
  const agent = jsonStore.readAll(AGENTS).find((a) => {
    const have = Buffer.from(a.keyHash || "", "hex");
    return have.length === want.length && crypto.timingSafeEqual(have, want);
  });
  if (!agent) return null;
  const resolved = resolveAgent(agent.id);
  if (!resolved) return { disabled: true };
  jsonStore.update(AGENTS, agent.id, { lastSeenAt: nowIso() });
  const token = auth.signToken({ id: resolved.id, role: "admin", agentId: agent.id, phone: "" }, { expiresIn: TOKEN_TTL });
  return { token, expiresInSec: 15 * 60, agent: { id: agent.id, name: agent.name, roleName: resolved.roleName, permissions: resolved.permissions } };
}

// ---- request policy (runs inside access.guard, after the permission check) ----
const notifyLog = new Map(); // agentId -> [timestamps]

function policy(req, admin, path) {
  const body = req.body || {};
  if (req.method === "POST" && path === "/admin/notifications/broadcast") {
    if (body.audience !== "single") return { status: 403, error: "AI agents can only message one person at a time — propose a broadcast for approval instead" };
    const now = Date.now();
    const recent = (notifyLog.get(admin.agentId) || []).filter((t) => now - t < 3600 * 1000);
    if (recent.length >= NOTIFY_PER_HOUR) return { status: 429, error: "Hourly notification limit reached for this agent" };
    recent.push(now);
    notifyLog.set(admin.agentId, recent);
  }
  if (req.method === "POST" && /^\/admin\/complaints\/[^/]+\/status$/.test(path) && ["resolved", "closed"].includes(body.status)) {
    return { status: 403, error: "AI agents can't resolve or close complaints — propose it for approval instead" };
  }
  // Internal notes are fine; anything sent to a customer/provider from a complaint is proposed.
  if (req.method === "POST" && /^\/admin\/complaints\/[^/]+\/entries$/.test(path) && body.type !== "note") {
    return { status: 403, error: "AI agents can only add internal notes to complaints — propose messages for approval instead" };
  }
  // Agents can hand a chat to people, never take one back from them.
  if (req.method === "POST" && /^\/admin\/inbox\/[^/]+\/mode$/.test(path) && body.mode !== "human") {
    return { status: 403, error: "Only a person can hand a conversation back to the AI" };
  }
  return null;
}

// ---- heartbeat, usage & budget ----
function todayUsage(agent) {
  const today = istDay();
  return agent.usage?.day === today ? agent.usage : { day: today, costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
}

function status(agentId) {
  const agent = jsonStore.readAll(AGENTS).find((a) => a.id === agentId);
  if (!agent) return null;
  const usage = todayUsage(agent);
  const remaining = Math.max(0, (agent.dailyBudgetUsd ?? DEFAULT_DAILY_BUDGET_USD) - usage.costUsd);
  return { enabled: getConfig().enabled, active: agent.active !== false, dailyBudgetUsd: agent.dailyBudgetUsd, usage, budgetRemainingUsd: Math.round(remaining * 10000) / 10000 };
}

function heartbeat(agentId, { status: s, note } = {}) {
  jsonStore.update(AGENTS, agentId, { lastSeenAt: nowIso(), lastStatus: String(s || "ok").slice(0, 20), lastNote: String(note || "").slice(0, 300) });
  return status(agentId);
}

function recordUsage(agentId, { inputTokens, outputTokens, costUsd }) {
  const agent = jsonStore.readAll(AGENTS).find((a) => a.id === agentId);
  if (!agent) return null;
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  const u = todayUsage(agent);
  const usage = {
    day: u.day,
    calls: u.calls + 1,
    inputTokens: u.inputTokens + Math.round(n(inputTokens)),
    outputTokens: u.outputTokens + Math.round(n(outputTokens)),
    costUsd: Math.round((u.costUsd + Math.min(n(costUsd), 50)) * 1e6) / 1e6,
  };
  jsonStore.update(AGENTS, agentId, { usage });
  return status(agentId);
}

// ---- feed (reports & alerts) ----
const SEVERITIES = ["info", "warning", "critical"];
const KINDS = ["report", "alert", "info"];

function postFeed(admin, input) {
  const kind = KINDS.includes(input.kind) ? input.kind : "info";
  const severity = SEVERITIES.includes(input.severity) ? input.severity : "info";
  const title = String(input.title || "").trim().slice(0, 140);
  if (!title) throw fail(400, "title is required");
  const dedupeKey = input.dedupeKey ? String(input.dedupeKey).slice(0, 120) : null;
  const rows = jsonStore.readAll(FEED);
  if (dedupeKey) {
    const dup = rows.find((r) => r.agentId === admin.agentId && r.dedupeKey === dedupeKey && Date.now() - new Date(r.createdAt).getTime() < 24 * 3600 * 1000);
    if (dup) return { duplicate: true, item: dup };
  }
  const refs = {};
  for (const k of ["bookingId", "providerId", "customerId", "complaintId"]) if (input.refs?.[k]) refs[k] = String(input.refs[k]).slice(0, 60);
  const item = {
    id: `feed_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    agentId: admin.agentId,
    agentName: admin.name,
    kind,
    severity,
    title,
    body: String(input.body || "").slice(0, 8000),
    refs,
    dedupeKey,
    createdAt: nowIso(),
    ackedAt: null,
    ackedBy: null,
  };
  rows.push(item);
  jsonStore.writeAll(FEED, rows.slice(-MAX_FEED));
  return { duplicate: false, item };
}

function listFeed({ kind, unacked, limit } = {}) {
  return jsonStore
    .readAll(FEED)
    .filter((r) => (!kind || r.kind === kind) && (!unacked || !r.ackedAt))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, Math.min(Number(limit) || 100, 500));
}

function ackFeed(id, actor) {
  return jsonStore.update(FEED, id, { ackedAt: nowIso(), ackedBy: actor }) || null;
}

// ---- proposals (actions that need a person) ----
function proposableType(method, path) {
  if (!/^\/[A-Za-z0-9_\/-]+$/.test(path) || path.includes("..")) return null;
  const hit = PROPOSABLE.find(([, m, re]) => m === method && re.test(path));
  return hit ? hit[0] : null;
}

function propose(admin, input) {
  const req = input.request || {};
  const method = String(req.method || "").toUpperCase();
  const path = String(req.path || "");
  const type = proposableType(method, path);
  if (!type) throw fail(400, "That action can't be proposed by an agent");
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (JSON.stringify(body).length > 5000) throw fail(400, "Proposed request body is too large");
  // An agent may only propose what its own role could do with a person's sign-off.
  const needed = access.requiredFor(method, path, body);
  if (needed === "super" || (needed !== null && !access.permits(admin.rolePermissions, needed))) {
    throw fail(403, "This agent's role doesn't cover that action");
  }
  const title = String(input.title || "").trim().slice(0, 140);
  if (!title) throw fail(400, "title is required");
  const dedupeKey = input.dedupeKey ? String(input.dedupeKey).slice(0, 120) : null;
  const rows = jsonStore.readAll(ACTIONS);
  if (dedupeKey) {
    const dup = rows.find((r) => r.agentId === admin.agentId && r.dedupeKey === dedupeKey && r.status === "pending");
    if (dup) return { duplicate: true, action: dup };
  }
  const action = {
    id: `act_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    agentId: admin.agentId,
    agentName: admin.name,
    type,
    title,
    summary: String(input.summary || "").slice(0, 2000),
    reasoning: String(input.reasoning || "").slice(0, 4000),
    request: { method, path, body },
    dedupeKey,
    status: "pending",
    createdAt: nowIso(),
    decidedAt: null,
    decidedBy: null,
    note: null,
    result: null,
    lastError: null,
  };
  rows.push(action);
  jsonStore.writeAll(ACTIONS, rows.slice(-MAX_ACTIONS));
  return { duplicate: false, action };
}

const expired = (a) => a.status === "pending" && Date.now() - new Date(a.createdAt).getTime() > ACTION_TTL_MS;

function listActions({ status: s, limit } = {}) {
  return jsonStore
    .readAll(ACTIONS)
    .map((a) => (expired(a) ? { ...a, status: "expired" } : a))
    .filter((a) => !s || a.status === s)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, Math.min(Number(limit) || 100, 500));
}

function getAction(id) {
  const a = jsonStore.readAll(ACTIONS).find((x) => x.id === id);
  return a && expired(a) ? { ...a, status: "expired" } : a || null;
}

// Moves a pending proposal to "executing". jsonStore is synchronous and Node
// is single-threaded, so check-and-set here can't interleave with a second
// approval of the same proposal.
function claimForExecution(id, actor) {
  const a = getAction(id);
  if (!a) throw fail(404, "Proposal not found");
  if (a.status !== "pending") throw fail(409, `This proposal is already ${a.status}`);
  return jsonStore.update(ACTIONS, id, { status: "executing", decidedBy: actor, decidedAt: nowIso() });
}

function finishExecution(id, { ok, result, error }) {
  // A failed run goes back to pending so it can be retried or rejected.
  return jsonStore.update(ACTIONS, id, ok
    ? { status: "approved", result: result ?? null, lastError: null }
    : { status: "pending", decidedBy: null, decidedAt: null, lastError: String(error || "Failed").slice(0, 500) });
}

function rejectAction(id, note, actor) {
  const a = getAction(id);
  if (!a) throw fail(404, "Proposal not found");
  if (a.status !== "pending") throw fail(409, `This proposal is already ${a.status}`);
  return jsonStore.update(ACTIONS, id, { status: "rejected", decidedBy: actor, decidedAt: nowIso(), note: String(note || "").slice(0, 500) });
}

module.exports = {
  getConfig, setConfig, ENGINEER_TEMPLATES,
  listAgents, createAgent, updateAgent, rotateKey, deleteAgent,
  resolveAgent, issueToken, policy, agentPermissions,
  status, heartbeat, recordUsage,
  postFeed, listFeed, ackFeed,
  propose, listActions, getAction, claimForExecution, finishExecution, rejectAction,
  PROPOSABLE_TYPES: PROPOSABLE.map(([t]) => t),
};
