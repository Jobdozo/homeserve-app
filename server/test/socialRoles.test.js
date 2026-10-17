const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-social-roles-"));
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const jsonStore = require("../src/jsonStore");
const access = require("../src/access");
const agents = require("../src/agents");
const auth = require("../src/auth");
access.setAgentHooks({ resolve: agents.resolveAgent, policy: agents.policy });

test("existing saved roles: the migration adds the Marketing Team role and social posting for Admin, once", () => {
  // Roles as saved before social media existed.
  jsonStore.insert("adminRoles", { id: "admin", name: "Admin", permissions: ["dashboard.view"], system: true });
  jsonStore.insert("adminRoles", { id: "management", name: "Reporting / Management Team", permissions: ["dashboard.view", "reports.view"], system: true });
  const roles = access.listRoles();
  assert.ok(roles.find((r) => r.id === "marketing").permissions.includes("social.add"));
  assert.ok(roles.find((r) => r.id === "admin").permissions.includes("social.add"));
  assert.ok(!roles.find((r) => r.id === "management").permissions.includes("social.add"));
  // Someone removes the permission later: the migration doesn't put it back.
  jsonStore.update("adminRoles", "admin", { permissions: ["dashboard.view"] });
  assert.ok(!access.listRoles().find((r) => r.id === "admin").permissions.includes("social.add"));
});

test("Marketing agent: may propose a post, can't publish directly; a Management-role agent can't even propose", () => {
  const { apiKey } = agents.createAgent({ name: "Marketing", roleId: "marketing", kind: "specialist", template: "marketing" }, "test");
  const { token } = agents.issueToken(apiKey);
  const admin = agents.resolveAgent(auth.verifyToken(token).agentId);
  const denied = access.guard({ method: "POST", originalUrl: "/api/admin/social/posts", body: {} }, auth.verifyToken(token));
  assert.equal(denied.status, 403);
  assert.equal(access.guard({ method: "GET", originalUrl: "/api/admin/social/images", body: {} }, auth.verifyToken(token)), null);
  const out = agents.propose(admin, { title: "Post", request: { method: "POST", path: "/admin/social/posts", body: { caption: "Hi", imageUrl: "/x.jpg" } } });
  assert.equal(out.action.type, "social.post");

  const other = agents.createAgent({ name: "SEO", roleId: "management", kind: "specialist", template: "seo" }, "test");
  const seo = agents.resolveAgent(auth.verifyToken(agents.issueToken(other.apiKey).token).agentId);
  assert.throws(() => agents.propose(seo, { title: "Post", request: { method: "POST", path: "/admin/social/posts", body: {} } }), /role doesn't cover/);
});
