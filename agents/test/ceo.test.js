const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-ceo-"));
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.CEO_PLAN_HOUR_IST = "0";
const ceo = require("../src/ceo");
const silent = { info() {}, warn() {}, error() {} };

const assignees = [{ type: "agent", id: "a1", name: "Registration Agent" }, { type: "person", id: "owner", name: "Owner" }];
const baseCtx = (pending) => ({
  role: "ceo", now: "2026-10-07T05:00:00Z", week: "2026-10-05", agents: [], reports: [{ agent: "Reporting Agent", title: "Daily brief", body: "4 orders" }],
  alerts: [{ agent: "Operations Agent", severity: "critical", title: "Provider is 1470 min late" }], approvalsWaiting: [], tasks: [], goals: [], thread: [], pending, assignees,
});

function fakeClaude(answers) {
  let i = 0;
  global.fetch = async (url, opts) => {
    assert.match(String(url), /anthropic/);
    const body = JSON.parse(opts.body);
    assert.match(body.messages[0].content, /<company_data>/); // data is fenced
    const a = answers[Math.min(i++, answers.length - 1)];
    return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(a) }], usage: { input_tokens: 1000, output_tokens: 200 } }) };
  };
}
function fake(ctx) {
  const calls = [];
  const c = {
    calls,
    async request(m, p, b) { calls.push([m, p, b]); if (p === "/agents/office") return ctx; if (p === "/agents/self") return { budgetRemainingUsd: 1, dailyBudgetUsd: 1 }; return { duplicate: false }; },
    get(p) { return this.request("GET", p); },
    post(p, b) { return this.request("POST", p, b); },
    feed(x) { return this.post("/agents/feed", x); },
  };
  return c;
}

test("cleanTasks: bounds, known assignees only, valid priority", () => {
  const t = ceo.cleanTasks([{ title: "A", assignee: "registration agent", priority: "high" }, { title: "B", assignee: "Super Admin", priority: "now!!" }, { title: "" }, { title: "C" }], assignees, 2);
  assert.deepEqual(t.map((x) => [x.title, x.assignee, x.priority]), [["A", "Registration Agent", "high"], ["B", "", "normal"]]);
});

test("answers the owner, proposes (never creates) tasks, and posts the daily review once", async () => {
  fakeClaude([
    { reply: "Two test bookings are stuck; close them.", proposeTasks: [{ title: "Close test bookings", assignee: "Owner", priority: "high" }] },
    { summary: "Quiet day: 4 orders, all cancelled.", proposeTasks: [{ title: "Call 3 incomplete providers", assignee: "Registration Agent" }], weeklyGoals: ["Verify 3 providers"] },
  ]);
  const c = fake(baseCtx([{ id: "m1", text: "kya chal raha hai?" }]));
  const r = await ceo.tick(c, silent);
  assert.match(r, /answered owner/);
  assert.match(r, /daily review posted/);
  const posts = c.calls.filter(([m]) => m === "POST").map(([, p, b]) => [p, b]);
  assert.ok(posts.some(([p, b]) => p === "/agents/office/ceo/reply" && /stuck/.test(b.text) && /approve in Admin/.test(b.text)));
  assert.ok(posts.some(([p, b]) => p === "/agents/office/tasks" && b.title === "Close test bookings" && b.assignee === "Owner"));
  assert.ok(posts.some(([p, b]) => p === "/agents/office/ceo/reply" && /Today's review/.test(b.text)));
  assert.ok(posts.some(([p]) => p === "/agents/office/goals"));
  assert.ok(!posts.some(([p]) => /approve|decide|\/admin\//.test(p))); // never approves anything

  const c2 = fake(baseCtx([]));
  assert.equal(await ceo.tick(c2, silent), null); // review already done today, nothing pending
});

test("AI failure still answers the owner (no silence), budget message", async () => {
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "down" } }) });
  const c = fake(baseCtx([{ id: "m2", text: "status?" }]));
  await ceo.tick(c, silent);
  const reply = c.calls.find(([, p]) => p === "/agents/office/ceo/reply");
  assert.match(reply[2].text, /couldn't work on that/);
});

test("refuses to run if the agent isn't the CEO type", async () => {
  const c = fake({ role: "agent", tasks: [] });
  await assert.rejects(ceo.tick(c, silent), /isn't set as the CEO/);
});
