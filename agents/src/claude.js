// Minimal Claude Messages API call (POST /v1/messages) with a server-side
// budget gate: before each call the agent asks Tikdum how much of today's
// budget is left, and after it reports the tokens it actually used.
const config = require("./config");

class BudgetExceeded extends Error {}

// `model` lets one agent use a different model from the default; its prices
// (USD per million tokens) come with it so budgets stay right.
// Effort (and room for thinking) is sent only to models that take it: the Claude 5 family.
// Older ones like Haiku 4.5 reject the effort setting.
const takesEffort = (id) => /^claude-(haiku|sonnet|opus|fable)-5/.test(String(id));
const defaultModel = () => ({
  id: config.anthropic.model,
  inputPerMTok: config.anthropic.inputPerMTok,
  outputPerMTok: config.anthropic.outputPerMTok,
  ...(takesEffort(config.anthropic.model) ? { effort: config.anthropic.effort, thinkingRoom: config.anthropic.thinkingRoom } : {}),
});

const costOf = (usage, m = defaultModel()) => ((usage.input_tokens || 0) * m.inputPerMTok + (usage.output_tokens || 0) * m.outputPerMTok) / 1e6;

async function complete(client, { system, prompt, maxTokens = 600, model, timeoutMs }) {
  if (!config.anthropic.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const m = model || defaultModel();
  const self = await client.get("/agents/self");
  // The answer's room plus room for the model's thinking (which counts toward max_tokens).
  const limit = maxTokens + (m.thinkingRoom || 0);
  // Worst case for this call, so one call can't blow far past the cap.
  const worst = (limit * m.outputPerMTok + (prompt.length / 2) * m.inputPerMTok) / 1e6;
  if (self.budgetRemainingUsd < worst) throw new BudgetExceeded(`Daily AI budget used up ($${self.dailyBudgetUsd})`);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropic.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: m.id,
      max_tokens: limit,
      system,
      messages: [{ role: "user", content: prompt }],
      ...(m.effort ? { output_config: { effort: m.effort } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs || config.anthropic.timeoutMs),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${data?.error?.message || "request failed"}`);

  const usage = data.usage || {};
  await client
    .post("/agents/usage", { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd: costOf(usage, m) })
    .catch(() => null);
  // A safety classifier can decline a request (HTTP 200, stop_reason "refusal"); the agents
  // then hand the item to a person, as with any other failed call.
  if (data.stop_reason === "refusal") throw new Error(`Claude declined this request${data.stop_details?.category ? ` (${data.stop_details.category})` : ""} — a person should handle it`);
  // Read text blocks by type: the answer can come after "thinking" blocks.
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  // Checked before "no text": a long think can use up the whole limit before any answer starts.
  if (data.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens) — too much for one step; ask for a shorter piece or split it");
  if (!text) throw new Error("Claude returned no text");
  return text;
}

// Asks for a JSON object and parses the first {...} block in the answer.
// Returns null when the model didn't produce valid JSON (callers then fall
// back to handing the item to a person).
async function completeJson(client, opts) {
  const text = await complete(client, opts);
  return parseJsonObject(text);
}

function parseJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Wraps text written by customers/providers so the model can tell it apart
// from instructions. Closing tags inside the text are neutralised.
function untrusted(tag, text, max = 4000) {
  const clean = String(text ?? "").replace(new RegExp(`</?${tag}[^>]*>`, "gi"), "[removed]").slice(0, max);
  return `<${tag}>\n${clean}\n</${tag}>`;
}

module.exports = { complete, completeJson, parseJsonObject, untrusted, BudgetExceeded, costOf, takesEffort };
