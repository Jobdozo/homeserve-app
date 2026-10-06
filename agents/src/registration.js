// Registration Agent — rule-based, no AI. It keeps sign-ups moving:
//   - providers whose application is incomplete get a friendly in-app nudge
//     listing exactly what's missing (at most every 48h, max 3 times), IF the
//     agent's role allows sending notifications (Registration Team role +
//     "Notifications → Add"); otherwise it only reports them;
//   - once a day it posts a call list: people who asked for a login code in
//     the last week but never finished signing up, plus stuck applications.
const config = require("./config");
const state = require("./state");
const { istDay, istHour } = require("./time");

const FRIENDLY = {
  name: "your full name",
  category: "your main service category",
  area: "the areas / PIN codes you serve",
  services: "at least one service with a price",
  id_proof: "a photo of your ID proof (Aadhaar, PAN, Voter ID or Driving Licence)",
  agreement: "accepting the Tikdum provider agreement",
  gst_format: "a correct GST number (or remove it)",
  gst_doc: "your GST certificate",
};

// Pure: who to nudge now. Exported for tests.
function dueForNudge(pending, nudges, now, cfg = config.registration) {
  return pending.filter((p) => {
    const items = p.missing.filter((k) => FRIENDLY[k]);
    if (!items.length) return false; // only duplicates or nothing a provider can fix
    const n = nudges[p.providerId] || { count: 0, last: 0 };
    return n.count < cfg.maxNudges && now - n.last >= cfg.nudgeEveryHours * 3600000;
  });
}

function nudgeText(p) {
  const items = p.missing.filter((k) => FRIENDLY[k]).map((k) => FRIENDLY[k]);
  return `Your Tikdum profile is almost ready! To get verified and start receiving jobs, please add: ${items.join("; ")}. Open the Tikdum Business app → Profile to finish.`;
}

// Pure: the daily call list from login attempts. Exported for tests.
function unfinishedSignups(rows, now, cfg = config.registration) {
  const since = now - cfg.lookbackDays * 86400000;
  return (rows || []).filter((r) => r.role !== "admin" && !r.hasAccount && (r.status || "new") === "new" && Date.parse(r.lastAt) >= since);
}

async function tick(client, log) {
  const st = state.load("registration");
  st.nudges = st.nudges || {};
  const now = Date.now();
  const pending = await client.get("/admin/verification/precheck");
  const incomplete = pending.filter((p) => !p.ready);

  let nudged = 0;
  const self = await client.get("/agents/self");
  const canNotify = (self.agent?.permissions || []).includes("notifications.add");
  if (canNotify) {
    for (const p of dueForNudge(incomplete, st.nudges, now)) {
      try {
        await client.post("/admin/notifications/broadcast", { audience: "single", recipientId: `provider:${p.providerId}`, title: "Finish your Tikdum profile", message: nudgeText(p) });
        const n = st.nudges[p.providerId] || { count: 0, last: 0 };
        st.nudges[p.providerId] = { count: n.count + 1, last: now };
        nudged++;
      } catch (e) {
        log.warn("registration", "nudge failed", { providerId: p.providerId, error: e.message });
        if (e.status === 429) break;
      }
    }
  }

  let digest = false;
  const today = istDay(now);
  if (st.lastDigest !== today && istHour(now) >= config.registration.digestHourIst) {
    const attempts = await client.get("/admin/customers/login-attempts").catch(() => []);
    const signups = unfinishedSignups(attempts, now);
    const lines = [];
    if (signups.length) {
      lines.push(`Started signing up but never finished (last ${config.registration.lookbackDays} days) — worth a call:`);
      for (const r of signups.slice(0, 30)) {
        lines.push(`- ${r.phone} · ${r.role} · ${r.requests || 1} code request(s) · last ${new Date(r.lastAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}${r.lastResult === "send-failed" ? " · WhatsApp code FAILED to send" : ""}`);
      }
    }
    if (incomplete.length) {
      lines.push("", `Provider applications not complete (${incomplete.length}):`);
      for (const p of incomplete.slice(0, 30)) {
        const n = st.nudges[p.providerId]?.count || 0;
        lines.push(`- ${p.name || "(no name)"} · ${p.phone} · waiting ${p.waitingDays ?? "?"} days · missing: ${p.missing.join(", ")}${n ? ` · nudged ${n}×` : ""}`);
      }
    }
    if (!canNotify) lines.push("", "Tip: give the Registration Team role \"Notifications → Add\" so this agent can remind providers in the app.");
    if (signups.length || incomplete.length) {
      await client.feed({ kind: "report", severity: "info", title: `Sign-up follow-ups for ${today}: ${signups.length} unfinished sign-ups, ${incomplete.length} incomplete applications`, body: lines.join("\n"), dedupeKey: `reg-digest:${today}` });
    }
    st.lastDigest = today;
    digest = true;
  }

  state.save("registration", st);
  return nudged || digest ? `${incomplete.length} incomplete applications, ${nudged} nudged${digest ? ", daily call list posted" : ""}` : null;
}

module.exports = { tick, dueForNudge, unfinishedSignups, nudgeText };
