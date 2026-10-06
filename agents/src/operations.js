// Operations Agent — rule-based, no AI calls (cheap, predictable, 24/7).
// Every few minutes it looks at live bookings and:
//   - alerts when a request has waited too long for any provider,
//   - nudges the provider (one in-app notification per booking) and alerts
//     when they're late for an accepted booking, and escalates if very late,
//   - flags jobs that have been "In Progress" unusually long.
// Thresholds are env-configurable (see config.js). Alerts are de-duplicated
// on the server, nudges in local state, so nothing repeats on every tick.
const config = require("./config");
const state = require("./state");
const { slotStartMs } = require("./time");

const MIN = 60000;

// Pure: bookings + now -> findings. Exported for tests.
function detect(bookings, now, cfg = config.operations) {
  const out = [];
  const since = now - cfg.lookbackHours * 3600 * 1000;
  for (const b of bookings || []) {
    const ref = b.ref ? `#${b.ref}` : b.id;
    const svc = b.service?.name || "service";
    const created = Date.parse(b.createdAt);
    if (b.status === "Pending") {
      if (!Number.isFinite(created) || created < since) continue;
      const waited = Math.floor((now - created) / MIN);
      if (waited >= cfg.pendingStuckMin) {
        out.push({ type: "pending_stuck", booking: b, severity: waited >= cfg.pendingStuckMin * 3 ? "critical" : "warning",
          title: `Booking ${ref} (${svc}) has waited ${waited} min for a provider`, dedupeKey: `pending:${b.id}` });
      }
    } else if (b.status === "Accepted") {
      const start = slotStartMs(b.date, b.time);
      if (start === null || start < since) continue;
      const late = Math.floor((now - start) / MIN);
      if (late >= cfg.lateCriticalMin) {
        out.push({ type: "late_critical", booking: b, severity: "critical",
          title: `Provider is ${late} min late for booking ${ref} (${svc}) — consider calling or reassigning`, dedupeKey: `late-critical:${b.id}`, nudge: true });
      } else if (late >= cfg.lateMin) {
        out.push({ type: "late", booking: b, severity: "warning",
          title: `Provider is ${late} min late for booking ${ref} (${svc})`, dedupeKey: `late:${b.id}`, nudge: true });
      }
    } else if (b.status === "In Progress") {
      const started = Date.parse(b.statusHistory?.["In Progress"] || "");
      if (!Number.isFinite(started) || started < since) continue;
      const mins = Math.floor((now - started) / MIN);
      if (mins >= cfg.longJobMin) {
        out.push({ type: "long_job", booking: b, severity: "info",
          title: `Booking ${ref} (${svc}) has been in progress for ${Math.floor(mins / 60)}h ${mins % 60}m`, dedupeKey: `long:${b.id}` });
      }
    }
  }
  return out;
}

async function tick(client, log) {
  const bookings = await client.get("/bookings");
  const findings = detect(bookings, Date.now());
  const st = state.load("operations");
  st.nudged = st.nudged || {};
  let posted = 0;
  let nudged = 0;

  for (const f of findings) {
    const b = f.booking;
    const res = await client.feed({
      kind: "alert",
      severity: f.severity,
      title: f.title,
      body: `Status: ${b.status} · slot ${b.date} ${b.time} · placed ${new Date(b.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      refs: { bookingId: b.id, providerId: b.providerId },
      dedupeKey: f.dedupeKey,
    });
    if (!res.duplicate) posted++;

    if (f.nudge && config.operations.nudgeProviders && b.providerId && !st.nudged[b.id]) {
      try {
        await client.post("/admin/notifications/broadcast", {
          audience: "single",
          recipientId: `provider:${b.providerId}`,
          title: "Customer is waiting",
          message: `You're running late for booking #${b.ref || ""} (${b.service?.name || "service"}). Please start the job or update the customer in the app.`,
        });
        st.nudged[b.id] = Date.now();
        nudged++;
      } catch (e) {
        log.warn("operations", "nudge failed", { bookingId: b.id, error: e.message });
      }
    }
  }

  // Forget nudges older than a week so state stays small.
  for (const [id, at] of Object.entries(st.nudged)) if (Date.now() - at > 7 * 86400000) delete st.nudged[id];
  state.save("operations", st);
  return `${bookings.length} bookings checked, ${findings.length} issues, ${posted} new alerts, ${nudged} nudges`;
}

module.exports = { detect, tick };
