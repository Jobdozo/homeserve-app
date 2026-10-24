// Renewals Bot — fixed rules, no AI. Every few hours it reads the paid services
// Tikdum runs on (Super Admin -> Paid services; server/src/paidServices.js) and
// reminds the owner before each one ends: 30, 14, 7, 3 and 1 days before, on the day
// and every 2 days while it's overdue (things that renew by themselves: 7, 1 and 0
// days). Each reminder is posted to Admin -> AI Agents and sent on WhatsApp, once.
// Mondays at 10:00 IST: one list of everything due in the next 60 days, services
// with no date yet and automatic checks that keep failing. It never pays or changes
// anything — a person renews and taps "Renewed / paid".
const state = require("./state");
const { istDay, istHour } = require("./time");

const MAX_WHATSAPP_PER_RUN = 4;
const CHECK_FAILING_MS = 2 * 24 * 3600 * 1000;

const when = (d) => (d === 0 ? "today" : d === 1 ? "tomorrow" : d < 0 ? `${-d} day${d === -1 ? "" : "s"} ago` : `in ${d} days`);
const dateLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (s) => (s.cost ? ` · ${s.currency === "USD" ? "$" : "₹"}${s.cost.toLocaleString("en-IN")}` : "");
const verb = (s) => (s.billing === "prepaid" ? "Check the balance / top up" : s.billing === "usage" ? "Check the bill and card" : s.autoRenew ? "Make sure it renews" : "Renew");

// The reminder that's due for this item now, as a key that's the same all day (or two days when overdue).
function stageKey(s) {
  const st = s.status;
  if (st.stage == null) return null;
  if (st.stage === "overdue") return `overdue:${Math.floor(-st.daysLeft / 2)}`;
  return `d${st.stage}`;
}

function message(s) {
  const st = s.status;
  const what = st.daysLeft < 0 ? `ended ${when(st.daysLeft)} (${dateLabel(s.renewsOn)})` : `ends ${when(st.daysLeft)} (${dateLabel(s.renewsOn)})`;
  return {
    title: `${s.name} ${what}`,
    body: [
      `${verb(s)}: ${s.name}${s.vendor ? ` (${s.vendor})` : ""}${money(s)}.`,
      s.usedFor ? `Used for: ${s.usedFor}` : "",
      s.autoRenew ? "It's set to renew by itself — check it did, and that the card on file still works." : "",
      s.notes ? `Note: ${s.notes}` : "",
      s.renewUrl ? `Renew here: ${s.renewUrl}` : "",
      "After renewing, tap \"Renewed / paid\" in Super Admin → Paid services (domain and HTTPS dates update by themselves).",
    ]
      .filter(Boolean)
      .join("\n"),
    severity: st.daysLeft <= 3 ? "critical" : st.daysLeft <= 14 ? "warning" : "info",
  };
}

function weekly(items, now) {
  const due = items.filter((s) => s.status.daysLeft != null && s.status.daysLeft <= 60);
  const noDate = items.filter((s) => !s.renewsOn && s.billing !== "free");
  const failing = items.filter((s) => s.lastCheck && !s.lastCheck.ok && now - Date.parse(s.lastCheck.lastOkAt || s.createdAt || 0) > CHECK_FAILING_MS);
  const lines = [];
  lines.push(due.length ? "Coming up in the next 60 days:" : "Nothing ends in the next 60 days.");
  for (const s of due) lines.push(`• ${s.name} — ${dateLabel(s.renewsOn)} (${when(s.status.daysLeft)})${money(s)}${s.autoRenew ? " · renews by itself" : ""}`);
  const later = items.filter((s) => s.status.daysLeft > 60);
  if (later.length) lines.push("", "Later:", ...later.map((s) => `• ${s.name} — ${dateLabel(s.renewsOn)}`));
  if (noDate.length) lines.push("", "No date yet — add it in Super Admin → Paid services so I can remind you:", ...noDate.map((s) => `• ${s.name}`));
  if (failing.length) lines.push("", "Couldn't read the date automatically for 2+ days:", ...failing.map((s) => `• ${s.name}: ${s.lastCheck.error}`));
  return {
    title: `Paid services: ${due.length ? `${due.length} due in 60 days` : "nothing due soon"}${noDate.length ? `, ${noDate.length} without a date` : ""}`,
    body: lines.join("\n"),
    severity: due.some((s) => s.status.daysLeft <= 7) ? "warning" : "info",
  };
}

async function tick(client, log, { now = Date.now(), force = false, weekdayIst = 1, hourIst = 10 } = {}) {
  const st = state.load("renewals");
  st.sent = st.sent || {};
  const items = await client.get("/admin/watch/renewals");

  let posted = 0;
  let whatsapp = 0;
  for (const s of items) {
    const key = stageKey(s);
    if (!key) continue;
    const id = `${s.id}:${s.renewsOn}:${key}`;
    if (st.sent[id]) continue;
    const m = message(s);
    const res = await client
      .feed({ kind: "alert", severity: m.severity, title: m.title, body: m.body, dedupeKey: `renewals:${id}`.slice(0, 120) })
      .catch((e) => (log.warn("renewals", "feed failed", { id, error: e.message }), null));
    if (!res) continue;
    st.sent[id] = now;
    if (res.duplicate) continue;
    posted++;
    if (whatsapp < MAX_WHATSAPP_PER_RUN) {
      const sent = await client.post("/agents/notify-owner", { text: `🔔 ${m.title}. ${verb(s)}${s.renewUrl ? `: ${s.renewUrl}` : ""}` }).catch(() => null);
      if (sent) whatsapp++;
    }
  }
  // Forget reminders older than 400 days.
  for (const [id, at] of Object.entries(st.sent)) if (now - at > 400 * 24 * 3600 * 1000) delete st.sent[id];

  // Monday list (and the first run, so you see the whole list once).
  const day = istDay(now);
  const hour = istHour(now);
  const weekday = new Date(now + 5.5 * 3600 * 1000).getUTCDay();
  let report = false;
  if (force || !st.firstReport || (weekday === weekdayIst && hour >= hourIst && st.lastWeekly !== day)) {
    const w = weekly(items, now);
    await client.feed({ kind: "report", severity: w.severity, title: w.title, body: w.body, dedupeKey: `renewals:weekly:${day}` }).catch((e) => log.warn("renewals", "weekly report failed", { error: e.message }));
    st.lastWeekly = day;
    st.firstReport = true;
    report = true;
  }
  state.save("renewals", st);
  const parts = [posted && `${posted} reminder${posted === 1 ? "" : "s"}`, whatsapp && `${whatsapp} on WhatsApp`, report && "list posted"].filter(Boolean);
  return parts.length ? `${items.length} services: ${parts.join(", ")}` : null;
}

module.exports = { tick, stageKey, message, weekly };
