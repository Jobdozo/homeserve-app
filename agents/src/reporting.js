// Reporting Agent — once a day (REPORT_HOUR_IST) it gathers yesterday's
// numbers from Tikdum, has Claude turn them into a short founder brief, and
// posts it to Admin → AI Agents (and, best effort, to the owner's WhatsApp).
//
// Prompt-injection guard: only numbers and fixed labels go to the model —
// never complaint text, names, addresses or any other user-typed content.
// If the AI call fails or the budget is used up, the plain numbers still go out.
const config = require("./config");
const state = require("./state");
const { complete, BudgetExceeded } = require("./claude");
const { istDay, istHour, addDays } = require("./time");

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Pure: raw API responses -> numbers-only metrics. Exported for tests.
function buildMetrics({ day, daily, weekly, overview, complaints, monitoring }) {
  const row = (daily?.rows || [])[0] || {};
  const week = weekly?.rows || [];
  const sum = (k) => week.reduce((t, r) => t + n(r[k]), 0);
  const open = (complaints?.complaints || []).filter((c) => !["resolved", "closed"].includes(c.statusKind));
  const by = (key) => open.reduce((m, c) => ((m[c[key] || "unknown"] = (m[c[key] || "unknown"] || 0) + 1), m), {});
  return {
    day,
    yesterday: {
      ordersPlaced: n(row["Orders placed"]),
      completed: n(row["Completed"]),
      rejected: n(row["Rejected"]),
      cancelled: n(row["Cancelled"]),
      completedValueInr: n(row["Completed value (INR)"]),
      platformFeesInr: n(row["Communication fees (INR)"]),
      activeProviders: n(row["Active providers"]),
    },
    last7Days: {
      ordersPlaced: sum("Orders placed"),
      completed: sum("Completed"),
      rejected: sum("Rejected"),
      cancelled: sum("Cancelled"),
      completedValueInr: sum("Completed value (INR)"),
      avgOrdersPerDay: Math.round((sum("Orders placed") / Math.max(week.length, 1)) * 10) / 10,
    },
    now: {
      pendingRequests: n(overview?.stats?.pendingRequests),
      providersAwaitingVerification: n(overview?.verification?.pending),
      totalProviders: n(overview?.systemOverview?.totalProviders),
      providersOnline: n(monitoring?.summary?.online),
      averageRating: n(overview?.stats?.averageRating),
      openComplaints: open.length,
      openComplaintsByPriority: by("priority"),
      openComplaintsByCategory: by("category"),
    },
  };
}

function plainReport(m) {
  const y = m.yesterday;
  const w = m.last7Days;
  const c = m.now;
  return [
    `Yesterday (${m.day}): ${y.ordersPlaced} orders placed, ${y.completed} completed, ${y.rejected} rejected, ${y.cancelled} cancelled.`,
    `Completed value ₹${y.completedValueInr.toLocaleString("en-IN")} · platform fees ₹${y.platformFeesInr.toLocaleString("en-IN")} · ${y.activeProviders} active providers.`,
    `Last 7 days: ${w.ordersPlaced} orders (${w.avgOrdersPerDay}/day), ${w.completed} completed, ₹${w.completedValueInr.toLocaleString("en-IN")} completed value.`,
    `Right now: ${c.pendingRequests} pending requests, ${c.providersOnline}/${c.totalProviders} providers online, ${c.providersAwaitingVerification} awaiting verification, ${c.openComplaints} open complaints, avg rating ${c.averageRating}.`,
  ].join("\n");
}

const SYSTEM = `You write the daily business brief for the founder of Tikdum, a home-services marketplace in India (customers book local service providers).
Rules:
- Use ONLY the numbers in the JSON you are given. Never invent figures, causes or names.
- If a number is 0 or data looks missing, say so plainly instead of guessing.
- Plain English, short sentences, Indian number formatting with ₹.
- Format: one headline line, then 3-5 bullet points ("- "), then a line starting "Watch:" with the one or two things that most need attention today (e.g. urgent complaints, providers awaiting verification, a drop vs the 7-day average).
- Maximum 130 words. No greetings or sign-off.`;

async function gather(client, day) {
  const q = (params) => new URLSearchParams(params).toString();
  const [daily, weekly, overview, complaints, monitoring] = await Promise.all([
    client.get(`/admin/monitoring/report?${q({ type: "daily", from: day, to: day })}`),
    client.get(`/admin/monitoring/report?${q({ type: "weekly", from: day, to: day })}`),
    client.get("/admin/overview"),
    client.get("/admin/complaints"),
    client.get("/admin/monitoring"),
  ]);
  return buildMetrics({ day, daily, weekly, overview, complaints, monitoring });
}

// Runs at most once per IST day, at or after REPORT_HOUR_IST. `force` runs now.
async function tick(client, log, { force = false } = {}) {
  const today = istDay();
  const st = state.load("reporting");
  if (!force && (st.lastDay === today || istHour() < config.reporting.hourIst)) return null;

  const day = addDays(today, -1);
  const metrics = await gather(client, day);
  const plain = plainReport(metrics);

  let brief = null;
  let note = "";
  try {
    brief = await complete(client, { system: SYSTEM, prompt: `Data for the brief:\n${JSON.stringify(metrics)}`, maxTokens: 400 });
  } catch (e) {
    note = e instanceof BudgetExceeded ? "AI budget used up — numbers only." : "AI summary unavailable — numbers only.";
    log.warn("reporting", "summary failed", { error: e.message });
  }

  const body = [brief, note, brief ? "— Numbers —" : "", plain].filter(Boolean).join("\n\n");
  await client.feed({ kind: "report", severity: "info", title: `Daily brief for ${day}`, body, dedupeKey: `daily:${day}` });
  if (config.reporting.whatsapp) {
    const wa = await client.post("/agents/notify-owner", { text: `Daily brief ${day}\n\n${brief || plain}` }).catch((e) => ({ error: e.message }));
    if (!wa?.delivered) log.info("reporting", "WhatsApp copy not delivered (expected outside the 24h window)", wa || {});
  }
  st.lastDay = today;
  state.save("reporting", st);
  return `daily brief for ${day} posted${brief ? "" : " (numbers only)"}`;
}

module.exports = { tick, buildMetrics, plainReport, SYSTEM };
