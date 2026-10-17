// Fraud Agent — rule-based, no AI, alerts only. Every hour it reads the server's
// suspicious patterns (server/src/watchdogs.js): providers booking their own
// service, the same customer and provider over and over, refund-heavy customers,
// mass cancellations, jobs "completed" minutes after accepting. Each new flag is
// posted once to Admin → AI Agents; the serious ones also go to the owner on
// WhatsApp. It never blocks, refunds or changes anything — these are suspicions
// for a person to check, not proof. Its first run puts what's already there into
// one quiet report; providers tagged "test" in Super Admin are left out.
const state = require("./state");

const MAX_WHATSAPP_PER_RUN = 3;

async function tick(client, log, { now = Date.now() } = {}) {
  const st = state.load("fraud");
  st.seen = st.seen || {};
  const flags = await client.get("/admin/watch/fraud");

  // First run: what's already there (often your own test accounts) goes into one
  // quiet report instead of a burst of alerts and WhatsApps.
  if (!st.baselined) {
    for (const f of flags) st.seen[f.id] = now;
    if (flags.length) {
      await client.feed({
        kind: "report",
        severity: "info",
        title: `Fraud check started: ${flags.length} existing pattern${flags.length === 1 ? "" : "s"} to look through once`,
        body: `${flags.map((f) => `• ${f.title}`).join("\n")}\n\nThese were already there when the agent started, so they weren't alerted one by one. If they come from your own test accounts, tag those providers "test" in Super Admin and they're left out. From now on, only new patterns are alerted.`,
        dedupeKey: "fraud:baseline",
      });
    }
    st.baselined = true;
    state.save("fraud", st);
    return `started: ${flags.length} existing patterns noted in one report`;
  }

  let posted = 0;
  let whatsapp = 0;
  for (const f of flags) {
    if (st.seen[f.id]) continue;
    const res = await client
      .feed({ kind: "alert", severity: f.severity, title: f.title, body: `${f.detail}\n\nThis is a pattern the rules spotted, not proof — check before acting.`, refs: f.refs || {}, dedupeKey: `fraud:${f.id}`.slice(0, 120) })
      .catch((e) => (log.warn("fraud", "feed failed", { id: f.id, error: e.message }), null));
    if (!res) continue;
    st.seen[f.id] = now;
    if (res.duplicate) continue;
    posted++;
    if (f.severity === "critical" && whatsapp < MAX_WHATSAPP_PER_RUN) {
      await client.post("/agents/notify-owner", { text: `⚠️ Possible fraud: ${f.title}. ${f.detail} (Admin → AI Agents)` }).catch(() => null);
      whatsapp++;
    }
  }
  // A pattern stays "seen" while it's still there; once it's gone it may be alerted again if it returns.
  const open = new Set(flags.map((f) => f.id));
  for (const id of Object.keys(st.seen)) if (!open.has(id)) delete st.seen[id];
  state.save("fraud", st);
  return posted ? `${flags.length} patterns open, ${posted} new flagged${whatsapp ? `, ${whatsapp} sent to the owner` : ""}` : null;
}

module.exports = { tick };
