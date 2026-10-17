// Retention Agent — rule-based, no AI. Once a week (Monday 11:00 IST) it reads
// the server's win-back groups (server/src/watchdogs.js):
//   - customers whose last request got no provider (in the last 3 weeks),
//   - customers who booked once and never came back,
//   - regular customers who stopped booking 1½–6 months ago,
// posts a weekly report, and PROPOSES one in-app message per group (an active
// offer code is mentioned when there is one). A person approves before anything
// is sent. A customer is put in a proposal at most once every 30 days.
const config = require("./config");
const state = require("./state");
const { istDay, istHour } = require("./time");

const IST_MS = 5.5 * 3600 * 1000;
const COOLDOWN_MS = 30 * 86400000;
const PER_PROPOSAL = 100; // keeps each proposal small enough to review (and under the size limit)
const weekdayIst = (ms) => new Date(ms + IST_MS).getUTCDay();

function messageFor(segment, offer) {
  return offer ? `${segment.text} Use code ${offer.code} for ${offer.discountPercent}% off.` : segment.text;
}

function proposalsFor(segments, offer, contacted, now, today) {
  const out = [];
  for (const seg of segments) {
    const fresh = seg.customers.filter((c) => now - (contacted[c.customerId] || 0) >= COOLDOWN_MS);
    for (let i = 0; i < fresh.length; i += PER_PROPOSAL) {
      const group = fresh.slice(i, i + PER_PROPOSAL);
      const message = messageFor(seg, offer);
      out.push({
        customers: group,
        action: {
          title: `Send "${seg.title}" to ${group.length} customer${group.length === 1 ? "" : "s"} (${seg.label.toLowerCase()})`,
          summary: `In-app message:\n\n${seg.title}\n"${message}"\n\nTo: ${group.slice(0, 10).map((c) => c.name || c.phone || "customer").join(", ")}${group.length > 10 ? ` and ${group.length - 10} more` : ""}.`,
          reasoning: `Rule-based (no AI): ${seg.label}. Customers with a booking in the last 14 days, an open booking, or a message from this agent in the last 30 days are left out.\n${group
            .slice(0, 30)
            .map((c) => `• ${c.name || "(no name)"} ${c.phone} · last booking ${String(c.lastBookingAt).slice(0, 10)}${c.lastService ? ` (${c.lastService})` : ""} · ${c.completed} completed`)
            .join("\n")}`,
          dedupeKey: `retention:${today}:${seg.key}:${i / PER_PROPOSAL}`,
          request: { method: "POST", path: "/admin/notifications/broadcast", body: { audience: "customer-list", customerIds: group.map((c) => c.customerId), title: seg.title, message } },
        },
      });
    }
  }
  return out;
}

async function tick(client, log, { force = false, now = Date.now() } = {}) {
  const st = state.load("retention");
  st.contacted = st.contacted || {};
  const today = istDay(now);
  const due = weekdayIst(now) === config.retention.weekdayIst && istHour(now) >= config.retention.hourIst;
  if (!force && (st.lastRun === today || !due)) return null;

  const { segments = [], offer = null } = await client.get("/admin/watch/retention");
  const total = segments.reduce((n, s) => n + s.customers.length, 0);
  let proposed = 0;
  for (const p of proposalsFor(segments, offer, st.contacted, now, today)) {
    const out = await client.propose(p.action).catch((e) => (log.warn("retention", "propose failed", { error: e.message }), null));
    if (!out) continue;
    for (const c of p.customers) st.contacted[c.customerId] = now;
    if (!out.duplicate) proposed++;
  }
  if (total) {
    await client.feed({
      kind: "report",
      severity: "info",
      title: `Win-back list ${today}: ${total} customers to bring back`,
      body: `${segments.map((s) => `${s.label}: ${s.customers.length}`).join("\n")}\n\n${proposed ? `${proposed} message${proposed === 1 ? "" : "s"} waiting for approval in Approvals.` : "Everyone here was already messaged in the last 30 days."}${offer ? `\nMentions offer ${offer.code} (${offer.discountPercent}% off).` : "\nTip: add an active offer (Home layout → Offers, no minimum order) and the messages will mention it."}`,
      dedupeKey: `retention:${today}`,
    });
  }
  for (const [id, t] of Object.entries(st.contacted)) if (now - t > 3 * COOLDOWN_MS) delete st.contacted[id];
  st.lastRun = today;
  state.save("retention", st);
  return `${total} customers in win-back groups, ${proposed} messages proposed`;
}

module.exports = { tick, proposalsFor, messageFor };
