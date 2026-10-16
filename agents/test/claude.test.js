const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

process.env.ANTHROPIC_API_KEY = "test-key";
const config = require("../src/config");
const claude = require("../src/claude");

// A stand-in for the Tikdum API client: plenty of budget, records reported usage.
const usage = [];
const client = { get: async () => ({ budgetRemainingUsd: 5, dailyBudgetUsd: 5 }), post: async (path, body) => usage.push(body) };

let sent;
let reply;
const realFetch = global.fetch;
beforeEach(() => {
  usage.length = 0;
  sent = null;
  reply = { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: "Hello" }], usage: { input_tokens: 1000, output_tokens: 300 } };
  global.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => reply };
  };
});
afterEach(() => {
  global.fetch = realFetch;
});

test("Claude Haiku 5.5 by default: low effort, room for thinking, answer read after thinking blocks", async () => {
  assert.equal(config.anthropic.model, "claude-haiku-5-5");
  const text = await claude.complete(client, { system: "s", prompt: "p", maxTokens: 500 });
  assert.equal(text, "Hello");
  assert.equal(sent.model, "claude-haiku-5-5");
  assert.deepEqual(sent.output_config, { effort: "low" });
  assert.equal(sent.max_tokens, 500 + config.anthropic.thinkingRoom);
  assert.equal(sent.temperature, undefined, "Haiku 5.5 rejects sampling settings");
  assert.equal(sent.thinking, undefined, "adaptive thinking is the default; no budget");
  // 1000 in × $0.10/M + 300 out × $0.50/M
  assert.ok(Math.abs(usage[0].costUsd - 0.00025) < 1e-9);
});

test("models that don't take effort (Haiku 4.5) get neither effort nor extra room", async () => {
  await claude.complete(client, { system: "s", prompt: "p", maxTokens: 500, model: { id: "claude-haiku-4-5", inputPerMTok: 1, outputPerMTok: 5 } });
  assert.equal(sent.output_config, undefined);
  assert.equal(sent.max_tokens, 500);
  assert.equal(claude.takesEffort("claude-sonnet-5-5"), true);
  assert.equal(claude.takesEffort("claude-haiku-4-5-20251001"), false);
});

test("a safety refusal becomes an error, so the item goes to a person", async () => {
  reply = { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [], usage: { input_tokens: 10, output_tokens: 0 } };
  await assert.rejects(claude.complete(client, { system: "s", prompt: "p" }), /declined this request \(cyber\)/);
});
