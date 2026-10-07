const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-spec-"));
process.env.ANTHROPIC_API_KEY = "test-key";
const specialist = require("../src/specialist");
const silent = { info() {}, warn() {}, error() {} };
const person = { type: "person", name: "Owner" };
const agent = { type: "agent", name: "Marketing Agent" };

test("works on new tasks and on tasks sent back with feedback, not on ones waiting for review", () => {
  const ids = specialist.tasksToWork([
    { id: "a", status: "open", messages: [] },
    { id: "b", status: "in_progress", messages: [{ from: agent, text: "draft" }, { from: person, text: "shorter please" }] },
    { id: "c", status: "in_progress", messages: [{ from: agent, text: "draft" }] },
    { id: "d", status: "review", messages: [] },
  ]).map((t) => t.id);
  assert.deepEqual(ids, ["a", "b"]);
  assert.deepEqual(specialist.tasksToWork([{ id: "a", status: "open", updatedAt: "x" }], { a: "x" }), []);
});

test("drafts, posts on the task and moves it to review — never anything else", async () => {
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    assert.match(body.system, /Marketing/);
    assert.match(body.messages[0].content, /<task>/);
    return { ok: true, json: async () => ({ content: [{ type: "text", text: "Summary: Diwali offer plan\n..." }], usage: { input_tokens: 800, output_tokens: 400 } }) };
  };
  const calls = [];
  const client = {
    async get(p) { calls.push(["GET", p]); if (p === "/agents/office") return { tasks: [{ id: "t1", title: "Diwali campaign", status: "open", priority: "high", messages: [] }], context: { reports: [] } }; return { kind: "specialist", instructions: "You are Marketing.", budgetRemainingUsd: 1 }; },
    async post(p, b) { calls.push(["POST", p, b]); return {}; },
  };
  assert.match(await specialist.tick(client, silent, "mk"), /1 task/);
  const posts = calls.filter(([m]) => m === "POST").map(([, p, b]) => [p, b.status || "msg"]);
  assert.deepEqual(posts.filter(([p]) => !p.startsWith("/agents/usage")), [
    ["/agents/office/tasks/t1/status", "in_progress"],
    ["/agents/office/tasks/t1/messages", "msg"],
    ["/agents/office/tasks/t1/status", "review"],
  ]);
});

test("refuses to run unless the agent's type is Specialist", async () => {
  const client = { async get(p) { return p === "/agents/office" ? { tasks: [{ id: "t", status: "open", messages: [] }] } : { kind: "standard" }; }, async post() { return {}; } };
  await assert.rejects(specialist.tick(client, silent, "x"), /isn't set as a Specialist/);
});
