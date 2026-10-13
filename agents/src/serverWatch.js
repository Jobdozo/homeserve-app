// Server watch (scaling steps 0 and 4), run by the Operations agent on every tick.
// Reads the public /api/health and tells the owner on WhatsApp when something goes
// wrong (API or database down, backup failed, server busy, photo copies failing, a
// flood of refused requests), reminds while it stays wrong, and says when it's fixed.
// Rule-based — no AI calls. If the whole VPS is down this worker is down too; the
// GitHub uptime check (email) covers that case.
const config = require("./config");
const state = require("./state");

const MIN = 60000;

const ist = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const lasted = (ms) => {
  const m = Math.max(1, Math.round(ms / MIN));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

// Pure: health (null = the API didn't answer) + what we remember -> open problems,
// keyed so the same problem is recognised on the next tick. Exported for tests.
function problems(h, { missed = 0, refusedDelta = 0 } = {}, cfg = config.operations) {
  const out = {};
  if (!h) {
    // One missed check can be a restart during a deploy; two in a row is an outage.
    if (missed >= 2) out.api = { severity: "critical", fixed: "The Tikdum API is answering again", text: "The Tikdum API isn't answering. Apps and websites can't load data or take bookings." };
    return out;
  }
  if (h.database && h.database !== "ok") {
    out.database = { severity: "critical", fixed: "The database is reachable again", text: "The API is up but can't reach the database. Bookings and logins will fail." };
  }
  const b = h.backup || {};
  if (b.state === "failed") out.backup = { severity: "critical", fixed: "Backups are working again", text: `Last night's backup failed${b.note ? ` (${b.note})` : ""}. Check /var/log/tikdum-backup.log on the server.` };
  else if (b.state === "overdue") out.backup = { severity: "critical", fixed: "Backups are working again", text: `No backup for ${b.ageHours ?? "?"} hours (it should run every night). Check the backup timer on the server.` };
  if (h.load?.busy) {
    out.load = {
      severity: "warning",
      fixed: "The server is no longer busy",
      text: `The server has been busy for 5 minutes (CPU ${h.load.cpuPct}%, slowest responses ${h.load.loopP99Ms} ms, ${h.load.requestsPerMin} requests/min). If this keeps happening it's time for scaling step 4, more than one server.`,
    };
  }
  const u = h.uploads || {};
  if (u.enabled && (u.failed > 0 || u.lastError)) {
    out.uploads = { severity: "warning", fixed: "Photos are copying to cloud storage again", text: `Photos aren't copying to cloud storage (${u.failed || 0} failed${u.lastError ? `: ${String(u.lastError).slice(0, 120)}` : ""}). They're safe on the server; check the Supabase storage keys.` };
  }
  if (refusedDelta >= cfg.refusedAlert) {
    out.limits = { severity: "warning", fixed: null, text: `${refusedDelta} requests were refused for going over the rate limits in the last few minutes — possibly a bot or an app stuck in a loop.` };
  }
  return out;
}

async function readHealth() {
  try {
    const r = await fetch(`${config.apiBase}/health`, { signal: AbortSignal.timeout(20000) });
    if (r.status !== 200 && r.status !== 503) return null; // 503 = up, database down
    return await r.json();
  } catch {
    return null;
  }
}

// Best effort: the server sends it to the owner numbers (free text, or the approved
// notice template when the owner hasn't written to the business number in 24h).
async function tellOwner(client, text) {
  try {
    const r = await client.post("/agents/notify-owner", { text });
    return { reached: true, delivered: r?.delivered || 0 };
  } catch (e) {
    return { reached: false, error: e.message };
  }
}

async function check(client, log, { now = Date.now(), health, cfg = config.operations } = {}) {
  const h = health === undefined ? await readHealth() : health;
  const st = state.load("server-watch");
  st.open = st.open || {};
  st.missed = h ? 0 : (st.missed || 0) + 1;
  const refused = h?.limits?.refused;
  // The counter starts again from 0 when the API restarts.
  const refusedDelta = Number.isFinite(refused) && Number.isFinite(st.lastRefused) && refused >= st.lastRefused ? refused - st.lastRefused : 0;
  if (Number.isFinite(refused)) st.lastRefused = refused;

  const found = problems(h, { missed: st.missed, refusedDelta }, cfg);
  const sent = [];

  for (const [key, p] of Object.entries(found)) {
    const open = st.open[key];
    if (!open) {
      st.open[key] = { since: now, severity: p.severity, text: p.text, fixed: p.fixed, sentAt: null };
      await client.feed({ kind: "alert", severity: p.severity, title: p.text.slice(0, 140), body: p.text, dedupeKey: `health:${key}:${now}` }).catch(() => null);
    } else {
      open.text = p.text;
    }
    const o = st.open[key];
    const due = !o.sentAt || now - o.sentAt >= cfg.healthRemindHours * 3600000;
    if (!due) continue;
    const icon = p.severity === "critical" ? "🔴" : "🟠";
    const prefix = o.sentAt ? `${icon} Still not fixed (since ${ist(o.since)}):` : `${icon} Server alert:`;
    const r = await tellOwner(client, `${prefix} ${p.text}`);
    // When the API itself is down the message can't go out; it's retried next tick.
    if (r.reached) {
      o.sentAt = now;
      sent.push(key);
    }
  }

  for (const [key, o] of Object.entries(st.open)) {
    if (found[key]) continue;
    // Still unreachable: the API problem can't be judged fixed from one good-looking tick.
    if (!h && key !== "api") continue;
    if (!o.fixed) {
      delete st.open[key];
      continue;
    }
    const text = `✅ ${o.fixed}. The problem started ${ist(o.since)} and lasted ${lasted(now - o.since)}.`;
    const r = await tellOwner(client, text);
    if (!r.reached) continue; // API not back yet; say it next tick
    await client.feed({ kind: "info", severity: "info", title: text.slice(0, 140), body: text, dedupeKey: `health-fixed:${key}:${o.since}` }).catch(() => null);
    delete st.open[key];
    sent.push(`${key} fixed`);
  }

  state.save("server-watch", st);
  const openKeys = Object.keys(st.open);
  if (sent.length) log.info("operations", "server watch WhatsApp", { sent });
  return openKeys.length ? `server: ${openKeys.join(", ")}` : h ? "server ok" : "server not answering";
}

module.exports = { problems, check, readHealth };
