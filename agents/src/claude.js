// Minimal Claude Messages API call (POST /v1/messages) with a server-side
// budget gate: before each call the agent asks Tikdum how much of today's
// budget is left, and after it reports the tokens it actually used.
const config = require("./config");

class BudgetExceeded extends Error {}

// `model` lets one agent use a different model from the default; its prices
// (USD per million tokens) come with it so budgets stay right.
const defaultModel = () => ({ id: config.anthropic.model, inputPerMTok: config.anthropic.inputPerMTok, outputPerMTok: config.anthropic.outputPerMTok });

const costOf = (usage, m = defaultModel()) => ((usage.input_tokens || 0) * m.inputPerMTok + (usage.output_tokens || 0) * m.outputPerMTok) / 1e6;

async function complete(client, { system, prompt, maxTokens = 600, model, timeoutMs }) {
  if (!config.anthropic.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const m = model || defaultModel();
  const self = await client.get("/agents/self");
  // Worst case for this call, so one call can't blow far past the cap.
  const worst = (maxTokens * m.outputPerMTok + (prompt.length / 2) * m.inputPerMTok) / 1e6;
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
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs || config.anthropic.timeoutMs),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${data?.error?.message || "request failed"}`);

  const usage = data.usage || {};
  await client
    .post("/agents/usage", { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd: costOf(usage, m) })
    .catch(() => null);
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("Claude returned no text");
  if (data.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens) — the change is too big for one step");
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

module.exports = { complete, completeJson, parseJsonObject, untrusted, BudgetExceeded, costOf };
