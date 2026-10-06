// Run: node --test test/   (uses a throwaway DATA_DIR)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agents-"));
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_PHONES = "+919876543210";

const auth = require("../src/auth");
const access = require("../src/access");
const agents = require("../src/agents");
access.setAgentHooks({ resolve: agents.resolveAgent, policy: agents.policy });

const call = (token, method, url, body) => {
  const payload = auth.verifyToken(token);
  const req = { method, originalUrl: `/api${url}`, body };
  return { denied: access.guard(req, payload), req };
};

test("agents can't hold Super Admin / Admin roles", () => {
  assert.throws(() => agents.createAgent({ name: "Bad", roleId: "super_admin" }, "t"), /Super Admin or Admin/);
  assert.throws(() => agents.createAgent({ name: "Bad2", roleId: "admin" }, "t"), /Super Admin or Admin/);
});

test("effective permissions drop human-only decisions and denied modules", () => {
  const perms = agents.agentPermissions(["complaints.manage", "providers.approve", "payments.manage", "users.view", "settings.view", "notifications.add"]);
  assert.ok(perms.includes("complaints.view"));
  assert.ok(perms.includes("complaints.edit"));
  assert.ok(!perms.includes("complaints.approve"));
  assert.ok(!perms.includes("complaints.delete"));
  assert.ok(!perms.includes("providers.approve"));
  assert.ok(!perms.includes("payments.edit"));
  assert.ok(perms.includes("payments.view"));
  assert.ok(!perms.some((p) => p.startsWith("users.") || p.startsWith("settings.")));
  assert.ok(perms.includes("notifications.add"));
});

test("key -> token -> guarded requests, kill switch and deactivation", () => {
  const { agent, apiKey } = agents.createAgent({ name: "Ops", roleId: "operations" }, "test");
  assert.equal(agents.issueToken("tkag_wrong"), null);
  const { token } = agents.issueToken(apiKey);

  // Allowed reads
  assert.equal(call(token, "GET", "/bookings").denied, null);
  assert.equal(call(token, "GET", "/admin/monitoring").denied, null);
  // Role-held write that agents are denied (bookings.edit)
  assert.equal(call(token, "PATCH", "/bookings/b1", { status: "Cancelled" }).denied.status, 403);
  // Super-admin-only and user management
  assert.equal(call(token, "GET", "/admin/otp-requests").denied.status, 403);
  assert.equal(call(token, "POST", "/admin/users", {}).denied.status, 403);
  // AI approvals
  assert.equal(call(token, "POST", "/admin/ai/actions/x/approve").denied.status, 403);
  // Broadcast: single ok, mass denied
  assert.equal(call(token, "POST", "/admin/notifications/broadcast", { audience: "single" }).denied, null);
  assert.equal(call(token, "POST", "/admin/notifications/broadcast", { audience: "providers" }).denied.status, 403);
  // Audit attribution
  assert.equal(call(token, "GET", "/bookings").req.admin.agent, true);

  agents.setConfig({ enabled: false }, "test");
  assert.equal(call(token, "GET", "/bookings").denied.status, 401);
  assert.deepEqual(agents.issueToken(apiKey), { disabled: true });
  agents.setConfig({ enabled: true }, "test");

  agents.updateAgent(agent.id, { active: false });
  assert.equal(call(token, "GET", "/bookings").denied.status, 401);
  agents.updateAgent(agent.id, { active: true });

  const rotated = agents.rotateKey(agent.id);
  assert.equal(agents.issueToken(apiKey), null);
  assert.ok(agents.issueToken(rotated.apiKey).token);
});

test("complaint agent can't resolve/close directly but can move stages", () => {
  const { apiKey } = agents.createAgent({ name: "Complaints", roleId: "complaints" }, "test");
  const { token } = agents.issueToken(apiKey);
  assert.equal(call(token, "POST", "/admin/complaints/C1/status", { status: "investigating" }).denied, null);
  assert.equal(call(token, "POST", "/admin/complaints/C1/status", { status: "resolved" }).denied.status, 403);
  assert.equal(call(token, "PATCH", "/admin/refund-claims/r1", { status: "approved" }).denied.status, 403);
});

test("proposals: allowlist, role scope, dedupe, single execution", () => {
  const { apiKey } = agents.createAgent({ name: "Verifier", roleId: "verification" }, "test");
  const admin = agents.resolveAgent(auth.verifyToken(agents.issueToken(apiKey).token).agentId);

  assert.throws(() => agents.propose(admin, { title: "x", request: { method: "DELETE", path: "/admin/providers/p1" } }), /can't be proposed/);
  assert.throws(() => agents.propose(admin, { title: "x", request: { method: "PATCH", path: "/providers/../admin/users/verification" } }), /can't be proposed/);
  // Verification role has no complaints.approve -> can't propose refund decisions
  assert.throws(() => agents.propose(admin, { title: "x", request: { method: "PATCH", path: "/admin/refund-claims/r1", body: { status: "approved" } } }), /role doesn't cover/);

  const req = { method: "PATCH", path: "/providers/p1/verification", body: { status: "approved" } };
  const a = agents.propose(admin, { title: "Approve p1", request: req, dedupeKey: "verify:p1" });
  assert.equal(a.duplicate, false);
  assert.equal(agents.propose(admin, { title: "Approve p1", request: req, dedupeKey: "verify:p1" }).duplicate, true);

  agents.claimForExecution(a.action.id, "owner");
  assert.throws(() => agents.claimForExecution(a.action.id, "owner"), /already executing/);
  agents.finishExecution(a.action.id, { ok: false, error: "boom" });
  assert.equal(agents.getAction(a.action.id).status, "pending");
  agents.claimForExecution(a.action.id, "owner");
  agents.finishExecution(a.action.id, { ok: true, result: { status: 200 } });
  assert.equal(agents.getAction(a.action.id).status, "approved");
  assert.throws(() => agents.rejectAction(a.action.id, "", "owner"), /already approved/);
});

test("feed dedupe and budget accounting", () => {
  const { apiKey } = agents.createAgent({ name: "Reporter", roleId: "management", dailyBudgetUsd: 0.5 }, "test");
  const admin = agents.resolveAgent(auth.verifyToken(agents.issueToken(apiKey).token).agentId);
  assert.equal(agents.postFeed(admin, { kind: "report", title: "Daily", dedupeKey: "d1" }).duplicate, false);
  assert.equal(agents.postFeed(admin, { kind: "report", title: "Daily", dedupeKey: "d1" }).duplicate, true);
  agents.recordUsage(admin.agentId, { inputTokens: 1000, outputTokens: 200, costUsd: 0.3 });
  const st = agents.recordUsage(admin.agentId, { inputTokens: 1000, outputTokens: 200, costUsd: 0.3 });
  assert.equal(st.budgetRemainingUsd, 0);
  assert.equal(st.usage.calls, 2);
});

test("humans by phone still resolve; empty phone never does", () => {
  assert.equal(access.resolveByPhone(""), null);
  assert.ok(access.resolveByPhone("+91 98765 43210").owner);
});
