// Provider Quality Agent — rule-based, no AI. Once a day (11:00 IST) it reads
// the server's quality list (server/src/watchdogs.js): falling or low ratings,
// bad reviews, ignored or missed requests, jobs dropped after accepting,
// complaints. It posts a daily report and, for the providers that need action,
// PROPOSES a polite warning message — a person approves before it is sent.
// At most one proposal per provider every 14 days. It never pauses or hides anyone.
const config = require("./config");
const state = require("./state");
const { istDay, istHour } = require("./time");

const COOLDOWN_MS = 14 * 86400000;

function reportBody(rows) {
  return rows
    .slice(0, 40)
    .map((r) => `${r.severity === "high" ? "🔴" : "🟠"} ${r.name}${r.phone ? ` · ${r.phone}` : ""} · ${r.completed30} jobs in 30 days\n   ${r.issues.map((i) => i.label).join("\n   ")}`)
    .join("\n");
}

function proposalFor(r, today) {
  return {
    title: `Warn ${r.name}: ${r.issues[0].label}`,
    summary: `Sends this in-app message to ${r.name}:\n\n"${r.warning}"`,
    reasoning: `Automated checks (no AI) over the last 30 days:\n${r.issues.map((i) => `• ${i.label}`).join("\n")}\n${r.completed30} completed jobs in the same time.`,
    dedupeKey: `warn:${r.providerId}:${today}`,
    request: { method: "POST", path: `/admin/providers/${encodeURIComponent(r.providerId)}/warn`, body: { message: r.warning } },
  };
}

async function tick(client, log, { force = false, now = Date.now() } = {}) {
  const st = state.load("quality");
  st.warned = st.warned || {};
  const today = istDay(now);
  if (!force && (st.lastRun === today || istHour(now) < config.quality.hourIst)) return null;

  const rows = await client.get("/admin/watch/provider-quality");
  const high = rows.filter((r) => r.severity === "high");
  if (rows.length) {
    await client.feed({
      kind: "report",
      severity: high.length ? "warning" : "info",
      title: `Provider quality ${today}: ${high.length} need action, ${rows.length - high.length} to watch`,
      body: reportBody(rows),
      dedupeKey: `quality:${today}`,
    });
  }
  let proposed = 0;
  for (const r of high) {
    if (now - (st.warned[r.providerId] || 0) < COOLDOWN_MS) continue;
    const out = await client.propose(proposalFor(r, today)).catch((e) => (log.warn("quality", "propose failed", { providerId: r.providerId, error: e.message }), null));
    if (out) {
      st.warned[r.providerId] = now;
      if (!out.duplicate) proposed++;
    }
  }
  for (const [id, t] of Object.entries(st.warned)) if (now - t > 4 * COOLDOWN_MS) delete st.warned[id];
  st.lastRun = today;
  state.save("quality", st);
  return `${rows.length} providers flagged (${high.length} need action), ${proposed} warnings proposed`;
}

module.exports = { tick, proposalFor };
