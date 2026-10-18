const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-push-plans-"));
process.env.ANTHROPIC_API_KEY = "test";
const pushPlans = require("../src/pushPlans");

const today = "2026-10-18";
const answer = {
  name: "Jammu rotation",
  times: ["09:00", "12:00", "15:00", "18:00"],
  days: 7,
  startDate: "2026-10-19",
  messages: [
    { title: "🏡 A clean home, a happy you", message: "Book home cleaning in Jammu on Tikdum. Book on Tikdum." },
    { title: "⚡ Electrical problems?", message: "Switches, wiring, fans: book a verified electrician. Book on Tikdum." },
  ],
  why: "Rotates the two busiest services.",
};

test("isPushTask: 'Push: …' titles and 'push notification' titles", () => {
  assert.ok(pushPlans.isPushTask({ title: "Push: Diwali cleaning" }));
  assert.ok(pushPlans.isPushTask({ title: "TIKDUM PUSH NOTIFICATION CAMPAIGN" }));
  assert.ok(!pushPlans.isPushTask({ title: "Post: Diwali cleaning" }));
  assert.ok(!pushPlans.isPushTask({ title: "Weekly report" }));
});

test("cleanPlan: keeps a good answer, falls back to safe defaults for bad fields", () => {
  const p = pushPlans.cleanPlan(answer, { today });
  assert.equal(p.body.messages.length, 2);
  assert.deepEqual(p.body.times, ["09:00", "12:00", "15:00", "18:00"]);
  assert.equal(p.body.startDate, "2026-10-19");
  assert.equal(p.body.audience, "customers");
  const odd = pushPlans.cleanPlan({ ...answer, times: ["9am"], days: 99, startDate: "2026-10-01" }, { today });
  assert.deepEqual(odd.body.times, pushPlans.DEFAULT_TIMES);
  assert.equal(odd.body.days, 7);
  assert.equal(odd.body.startDate, "2026-10-19"); // past dates -> tomorrow
  assert.equal(pushPlans.cleanPlan({ messages: [] }, { today }), null);
  assert.equal(pushPlans.cleanPlan(null, { today }), null);
});

test("cleanPlan: stays under the proposal size limit", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `Service ${i} `.padEnd(60, "x"), message: "y".repeat(230) }));
  const p = pushPlans.cleanPlan({ ...answer, messages: many }, { today });
  assert.ok(p.body.messages.length <= 12);
  assert.ok(JSON.stringify(p.body).length <= 4800);
});

test("proposalFor: lists every message and posts to /admin/push-campaigns", () => {
  const prop = pushPlans.proposalFor(pushPlans.cleanPlan(answer, { today }), "push:task:t1");
  assert.equal(prop.request.method, "POST");
  assert.equal(prop.request.path, "/admin/push-campaigns");
  assert.match(prop.title, /4× a day for 7 days/);
  assert.match(prop.summary, /about 28 notifications/);
  assert.match(prop.summary, /2\. ⚡ Electrical problems\?/);
  assert.match(prop.reasoning, /nothing is sent until you approve/);
});

test("run: a 'Push:' task is proposed for approval and moved to Review", async () => {
  const calls = { posts: [], proposals: [] };
  const client = {
    get: async (p) => (p === "/categories" ? [{ name: "Home Cleaning" }, { name: "Electrician" }] : []),
    post: async (p, body) => {
      if (p === "/agents/claude") return { text: JSON.stringify(answer), usage: {} };
      calls.posts.push([p, body]);
      return {};
    },
    propose: async (a) => {
      calls.proposals.push(a);
      return {};
    },
  };
  // completeJson goes through claude.complete; stub it for this test.
  const claude = require("../src/claude");
  const orig = claude.completeJson;
  require.cache[require.resolve("../src/claude")].exports.completeJson = async () => answer;
  delete require.cache[require.resolve("../src/pushPlans")];
  const fresh = require("../src/pushPlans");
  const office = { tasks: [{ id: "t1", title: "Push: festive rotation", status: "open", updatedAt: "u1", messages: [] }] };
  const st = {};
  const n = await fresh.run(client, { warn() {} }, { st, office, now: Date.parse("2026-10-18T10:00:00+05:30") });
  claude.completeJson = orig;
  assert.equal(n, 1);
  assert.equal(calls.proposals.length, 1);
  assert.equal(calls.proposals[0].request.body.messages.length, 2);
  assert.deepEqual(calls.posts.map(([p, b]) => [p, b.status || "msg"]), [
    ["/agents/office/tasks/t1/status", "in_progress"],
    ["/agents/office/tasks/t1/messages", "msg"],
    ["/agents/office/tasks/t1/status", "review"],
  ]);
  // Same version of the task isn't proposed twice.
  assert.equal(await fresh.run(client, { warn() {} }, { st, office: { tasks: [{ ...office.tasks[0], status: "in_progress" }] } }), 0);
});
