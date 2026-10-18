// All configuration comes from environment variables (see .env.example).
// Secrets (agent keys, the Anthropic key) live only on the server, never in Git.
const num = (v, d) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === "" ? d : /^(1|true|yes|on)$/i.test(String(v)));

module.exports = {
  apiBase: (process.env.TIKDUM_API_URL || "http://127.0.0.1:4000/api").replace(/\/$/, ""),
  stateDir: process.env.AGENT_STATE_DIR || require("path").join(__dirname, "..", "state"),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    // Claude Haiku 5.5: fast and cheap, plenty for summaries, triage and support drafts;
    // set ANTHROPIC_MODEL to change it.
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    // USD per million tokens, used to report spend against each agent's daily budget.
    // Defaults are Claude Haiku 5.5 list prices for prompts up to 100K tokens (ours are
    // far smaller) — update if you change the model or Anthropic changes pricing.
    inputPerMTok: num(process.env.ANTHROPIC_INPUT_USD_PER_MTOK, 0.1),
    outputPerMTok: num(process.env.ANTHROPIC_OUTPUT_USD_PER_MTOK, 0.5),
    // Claude Haiku 5.5 thinks before answering by default. These are short, well-specified
    // jobs, so "low" effort; the thinking counts toward each answer's length limit, so every
    // call gets this much extra room on top of the answer it needs.
    effort: process.env.ANTHROPIC_EFFORT || "low",
    thinkingRoom: num(process.env.ANTHROPIC_THINKING_ROOM, 2000),
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

  // Dispatch (dispatch.js): suggests a provider for each booking on the assignment desk.
  dispatch: {
    key: process.env.AGENT_KEY_DISPATCH || "",
    everyMs: num(process.env.DISPATCH_CHECK_EVERY_SEC, 60) * 1000,
  },

  // Provider Quality (quality.js): daily report + proposed warnings.
  quality: {
    key: process.env.AGENT_KEY_QUALITY || "",
    hourIst: num(process.env.QUALITY_HOUR_IST, 11),
    everyMs: 15 * 60000,
  },

  // Retention (retention.js): weekly win-back groups, one proposed message per group.
  retention: {
    key: process.env.AGENT_KEY_RETENTION || "",
    weekdayIst: num(process.env.RETENTION_WEEKDAY_IST, 1), // 0 = Sunday, 1 = Monday
    hourIst: num(process.env.RETENTION_HOUR_IST, 11),
    everyMs: 15 * 60000,
  },

  // Reviews & Reputation (reviews.js): low-rating alerts + weekly report (AI summary).
  reviews: {
    key: process.env.AGENT_KEY_REVIEWS || "",
    everyMs: num(process.env.REVIEWS_CHECK_EVERY_MIN, 10) * 60000,
    weekdayIst: num(process.env.REVIEWS_WEEKDAY_IST, 1), // Monday
    hourIst: num(process.env.REVIEWS_HOUR_IST, 12),
  },

  // Fraud (fraud.js): hourly suspicious patterns, alerts only.
  fraud: {
    key: process.env.AGENT_KEY_FRAUD || "",
    everyMs: num(process.env.FRAUD_CHECK_EVERY_MIN, 60) * 60000,
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

  // Marketing Agent's scheduled Facebook/Instagram posts (socialPosts.js): one proposal on
  // each of these IST weekdays (0 = Sunday) from this hour. Empty SOCIAL_POST_DAYS_IST = none.
  social: {
    daysIst: (process.env.SOCIAL_POST_DAYS_IST ?? "0,1,2,3,4,5,6").split(",").map((d) => d.trim()).filter((d) => d !== "").map(Number).filter((d) => d >= 0 && d <= 6),
    hourIst: num(process.env.SOCIAL_POST_HOUR_IST, 10),
  },

  // Engineering team (Bug triage, Developer, Reviewer, Tester): one key per
  // agent, comma-separated; each agent's job comes from its role in Admin.
  // They work on GitHub as a GitHub App (preferred) or a machine-user token.
  engineering: {
    keys: (process.env.AGENT_KEYS_ENGINEERING || "").split(",").map((k) => k.trim()).filter(Boolean),
    everyMs: num(process.env.ENGINEERING_CHECK_EVERY_SEC, 120) * 1000,
    bugTriageEveryMs: num(process.env.BUG_TRIAGE_EVERY_MIN, 120) * 60000,
    // Code needs a stronger model than summaries. Prices: Sonnet 5.5 list
    // prices (platform.claude.com, Oct 2026) — update with the model.
    model: {
      id: process.env.ENGINEERING_MODEL || "claude-sonnet-5-5",
      inputPerMTok: num(process.env.ENGINEERING_INPUT_USD_PER_MTOK, 2),
      outputPerMTok: num(process.env.ENGINEERING_OUTPUT_USD_PER_MTOK, 10),
    },
    timeoutMs: num(process.env.ENGINEERING_TIMEOUT_MS, 240000),
    autoFixesPerPr: num(process.env.DEVELOPER_CI_AUTOFIXES, 2),
  },

  github: {
    repo: process.env.GITHUB_REPO || "", // owner/name, e.g. Jobdozo/homeserve-app
    base: process.env.GITHUB_BASE_BRANCH || "master",
    appId: process.env.GITHUB_APP_ID || "",
    privateKeyFile: process.env.GITHUB_APP_PRIVATE_KEY_FILE || "",
    token: process.env.GITHUB_TOKEN || "", // fallback: classic token of a machine user (repo scope, NOT workflow)
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
    // Server watch (serverWatch.js): WhatsApp the owner about /api/health problems.
    watchServer: bool(process.env.OPS_WATCH_SERVER, true),
    healthRemindHours: num(process.env.OPS_HEALTH_REMIND_HOURS, 6),
    refusedAlert: num(process.env.OPS_REFUSED_ALERT, 300),
  },
};
