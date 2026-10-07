const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-office-"));
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_PHONES = "+919876543210";
const office = require("../src/office");
const agents = require("../src/agents");
const inbox = require("../src/inbox");
const store = require("../src/store");
store.getCustomerByPhone = async () => null;

const owner = { type: "person", id: "admin:+919876543210", name: "Owner" };
const ceo = { type: "agent", id: "agt_ceo", name: "CEO", ceo: true };
const ops = { type: "agent", id: "agt_ops", name: "Ops" };

test("only one CEO agent; agents get a kind", () => {
  const a = agents.createAgent({ name: "Chief", roleId: "management", kind: "ceo" }, "t");
  assert.equal(a.agent.kind, "ceo");
  assert.throws(() => agents.createAgent({ name: "Chief2", roleId: "management", kind: "ceo" }, "t"), /already a CEO/);
  assert.equal(agents.createAgent({ name: "Ops", roleId: "operations" }, "t").agent.kind, "standard");
  assert.equal(agents.resolveAgent(a.agent.id).ceo, true);
});

test("CEO proposes, a person approves; other agents can't propose", () => {
  const p = office.createTask({ title: "Call 3 incomplete providers", assignee: { type: "person", id: "owner", name: "Owner" } }, ceo);
  assert.equal(p.task.status, "proposed");
  assert.equal(office.createTask({ title: "call 3 incomplete providers" }, ceo).duplicate, true);
  assert.throws(() => office.createTask({ title: "x" }, ops), /Only the CEO/);
  const h = office.createTask({ title: "Human task" }, owner);
  assert.equal(h.task.status, "open");
  office.decideTask(p.task.id, true, "ok", owner);
  assert.equal(office.getTask(p.task.id).task.status, "open");
  assert.throws(() => office.decideTask(p.task.id, false, "", owner), /already open/);
});

test("assigned agent can only move its own task to in progress/review", () => {
  const t = office.createTask({ title: "Weekly wallet review", assignee: { type: "agent", id: "agt_ops", name: "Ops" } }, owner).task;
  assert.equal(office.updateTask(t.id, { status: "in_progress" }, ops).status, "in_progress");
  assert.throws(() => office.updateTask(t.id, { status: "done" }, ops), /person marks it done/);
  assert.throws(() => office.updateTask(t.id, { status: "review" }, { type: "agent", id: "agt_other", name: "X" }), /isn't assigned/);
  assert.equal(office.updateTask(t.id, { status: "review", result: "All good" }, ops).result, "All good");
  assert.equal(office.updateTask(t.id, { status: "done" }, owner).status, "done");
  assert.ok(office.getTask(t.id).messages.some((m) => /moved this to done/.test(m.text)));
});

test("caps: CEO task proposals per day and goals per week", () => {
  for (let i = 0; i < 20; i++) {
    try { office.createTask({ title: `cap test ${i}` }, ceo); } catch (e) { assert.match(e.message, /limit/); assert.ok(i >= 8); return; }
  }
  assert.fail("cap never hit");
});

test("goals: CEO proposes, person approves", () => {
  const g = office.proposeGoal("Get 3 providers verified", ceo).goal;
  assert.equal(g.status, "proposed");
  assert.equal(office.decideGoal(g.id, "approved", owner).status, "approved");
  assert.equal(office.proposeGoal("Owner goal", owner).goal.status, "approved");
});

test("CEO thread: pending owner messages and WhatsApp reply target", async () => {
  office.addMessage("ceo", owner, "How did yesterday go?");
  assert.equal(office.pendingForCeo().length, 1);
  office.addMessage("ceo", ceo, "4 orders, all cancelled.");
  assert.equal(office.pendingForCeo().length, 0);
  assert.equal(office.whatsappReplyTarget(), null);

  // Owner writing on WhatsApp lands in the CEO thread, not the support inbox; retries dedupe.
  const handler = (p) => (p.phone.endsWith("9876543210") ? (office.addOwnerWhatsApp(p.phone, p.text, p.waId), true) : false);
  await inbox.ingest({ customerNumber: "919876543210", text: "any urgent issue?", uuid: "o1" }, { ownerHandler: handler });
  await inbox.ingest({ customerNumber: "919876543210", text: "any urgent issue?", uuid: "o1" }, { ownerHandler: handler });
  assert.equal(office.pendingForCeo().length, 1);
  assert.equal(office.whatsappReplyTarget(), "+919876543210");
  assert.equal(inbox.listConversations({}).length, 0);
});
