// All configuration comes from environment variables (see .env.example).
// Secrets (agent keys, the Anthropic key) live only on the server, never in Git.
const num = (v, d) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));

module.exports = {
  apiBase: (process.env.TIKDUM_API_URL || "http://127.0.0.1:4000/api").replace(/\/$/, ""),
  stateDir: process.env.AGENT_STATE_DIR || require("path").join(__dirname, "..", "state"),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    // Haiku 4.5 is plenty for summaries; set ANTHROPIC_MODEL to change it.
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
    // USD per million tokens, used to report spend against each agent's
    // daily budget. Defaults are Haiku 4.5 list prices — update if you
    // change model or Anthropic changes pricing.
    inputPerMTok: num(process.env.ANTHROPIC_INPUT_USD_PER_MTOK, 1),
    outputPerMTok: num(process.env.ANTHROPIC_OUTPUT_USD_PER_MTOK, 5),
    timeoutMs: num(process.env.ANTHROPIC_TIMEOUT_MS, 60000),
  },

  reporting: {
    key: process.env.AGENT_KEY_REPORTING || "",
    hourIst: num(process.env.REPORT_HOUR_IST, 9), // daily brief at 09:00 IST
    whatsapp: bool(process.env.REPORT_WHATSAPP, true),
    checkEveryMs: 5 * 60 * 1000,
  },

  complaints: {
    key: process.env.AGENT_KEY_COMPLAINTS || "",
    everyMs: num(process.env.COMPLAINTS_CHECK_EVERY_SEC, 180) * 1000,
    maxPerRun: num(process.env.COMPLAINTS_MAX_PER_RUN, 10),
    lookbackDays: num(process.env.COMPLAINTS_LOOKBACK_DAYS, 7),
    proposeReplies: bool(process.env.COMPLAINTS_PROPOSE_REPLIES, true),
    minConfidence: num(process.env.COMPLAINTS_MIN_CONFIDENCE, 0.6),
  },

  support: {
    key: process.env.AGENT_KEY_SUPPORT || "",
    everyMs: num(process.env.SUPPORT_CHECK_EVERY_SEC, 20) * 1000,
    maxPerRun: num(process.env.SUPPORT_MAX_PER_RUN, 10),
  },

  registration: {
    key: process.env.AGENT_KEY_REGISTRATION || "",
    everyMs: num(process.env.REGISTRATION_CHECK_EVERY_MIN, 60) * 60000,
    digestHourIst: num(process.env.REGISTRATION_DIGEST_HOUR_IST, 10),
    nudgeEveryHours: num(process.env.REGISTRATION_NUDGE_EVERY_HOURS, 48),
    maxNudges: num(process.env.REGISTRATION_MAX_NUDGES, 3),
    lookbackDays: num(process.env.REGISTRATION_LOOKBACK_DAYS, 7),
  },

  verification: {
    key: process.env.AGENT_KEY_VERIFICATION || "",
    everyMs: num(process.env.VERIFICATION_CHECK_EVERY_MIN, 15) * 60000,
  },

  payments: {
    key: process.env.AGENT_KEY_PAYMENTS || "",
    everyMs: num(process.env.PAYMENTS_CHECK_EVERY_MIN, 360) * 60000,
    reportHourIst: num(process.env.PAYMENTS_REPORT_HOUR_IST, 8),
  },

  ceo: {
    key: process.env.AGENT_KEY_CEO || "",
    everyMs: num(process.env.CEO_CHECK_EVERY_SEC, 60) * 1000,
    planHourIst: num(process.env.CEO_PLAN_HOUR_IST, 10), // after the 9 AM brief and 10 AM call list
    maxTasksPerPlan: num(process.env.CEO_MAX_TASKS_PER_PLAN, 5),
  },

  // Specialist agents (Marketing, SEO, Analyst, Research …): one key per agent, comma-separated.
  specialists: {
    keys: (process.env.AGENT_KEYS_SPECIALISTS || "").split(",").map((k) => k.trim()).filter(Boolean),
    everyMs: num(process.env.SPECIALIST_CHECK_EVERY_SEC, 120) * 1000,
  },

  operations: {
    key: process.env.AGENT_KEY_OPERATIONS || "",
    everyMs: num(process.env.OPS_CHECK_EVERY_SEC, 300) * 1000,
    pendingStuckMin: num(process.env.OPS_PENDING_STUCK_MIN, 15),
    lateMin: num(process.env.OPS_LATE_MIN, 30),
    lateCriticalMin: num(process.env.OPS_LATE_CRITICAL_MIN, 90),
    longJobMin: num(process.env.OPS_LONG_JOB_MIN, 360),
    lookbackHours: num(process.env.OPS_LOOKBACK_HOURS, 48),
    nudgeProviders: bool(process.env.OPS_NUDGE_PROVIDERS, true),
  },
};
