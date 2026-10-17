// Network Bot — fixed rules, no AI. Runs in its own container (compose service
// "netwatch", host network) next to the agents worker:
//   every second   the API, the three website containers and nginx (the web server
//                  in front of everything) answer on this server
//   every 10 s     tikdum.com, provider., admin. and api.tikdum.com load over HTTPS,
//                  and the server can reach the internet
//   every 6 hours  the HTTPS certificates aren't about to expire
// Anything failing for 20 s in a row -> one WhatsApp to the owner numbers, straight
// through MSG91 (not through the API, so "the API is down" still gets out), then a
// reminder every 10 minutes and a message when everything is back, with how long it
// lasted. Short blips (a deploy restarting a container) stay under the 20 s.
//
// When the VPS itself is switched off nothing on it can send anything; the moment it's
// back this bot says when it went dark and for how long (17 Oct 2026: Hostinger powered
// the VPS off twice, about 17 minutes in all). A watcher outside this server is the only
// thing that can message during such an outage.
//
//   node src/netwatch.js           run forever
//   node src/netwatch.js --check   run every check once, print the results, exit
require("./env");
const net = require("net");
const tls = require("tls");
const fs = require("fs");
const log = require("./log");
const state = require("./state");
const owner = require("./ownerWhatsApp");

const STATE = "netwatch";
const NAME = "network";
const num = (v, d) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
const env = process.env;

const CFG = {
  downAfterMs: num(env.NETWATCH_DOWN_AFTER_SEC, 20) * 1000,
  upAfterMs: num(env.NETWATCH_UP_AFTER_SEC, 10) * 1000,
  publicEveryMs: num(env.NETWATCH_PUBLIC_EVERY_SEC, 10) * 1000,
  remindMs: num(env.NETWATCH_REMIND_MIN, 10) * 60000,
  // A second thing going down within this long of the last message waits for it.
  updateGapMs: 60000,
  maxPerDay: num(env.NETWATCH_MAX_MESSAGES_PER_DAY, 40),
  sslWarnDays: num(env.NETWATCH_SSL_WARN_DAYS, 14),
  // The bot itself being off this long (not a VPS restart) is worth a message.
  botOffAlertMs: 5 * 60000,
};

const SITES = String(env.NETWATCH_SITES || "tikdum.com,provider.tikdum.com,admin.tikdum.com").split(",").map((s) => s.trim()).filter(Boolean);
const API_LOCAL = `${(env.TIKDUM_API_URL || "http://127.0.0.1:4000/api").replace(/\/$/, "")}/health`;
const API_PUBLIC = env.NETWATCH_PUBLIC_API || "https://api.tikdum.com/api/health";

// ---- formatting (IST) -------------------------------------------------------
const istDay = (ms) => new Date(ms).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const clock = (ms, now = ms) => {
  const t = new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return istDay(ms) === istDay(now) ? t : `${istDay(ms)} ${t}`;
};
function dur(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// ---- probes -----------------------------------------------------------------
function reason(e, ms) {
  const code = e?.cause?.code || e?.code || "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || code === "ETIMEDOUT") return `no answer in ${ms / 1000} s`;
  if (code === "ECONNREFUSED") return "connection refused (not running)";
  if (code === "ECONNRESET") return "connection dropped";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS lookup failed";
  if (/CERT|SSL|TLS/i.test(code) || /certificate/i.test(e?.message || "")) return "HTTPS certificate problem";
  return code || String(e?.message || e).slice(0, 80);
}

async function httpOk(url, ms, okStatuses) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "TikdumNetworkBot/1" } });
    await r.arrayBuffer().catch(() => null);
    return okStatuses.includes(r.status) ? { ok: true } : { ok: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: reason(e, ms) };
  }
}

function tcpOk(host, port, ms) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (r) => {
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(ms, () => done({ ok: false, error: reason({ code: "ETIMEDOUT" }, ms) }));
    sock.once("connect", () => done({ ok: true }));
    sock.once("error", (e) => done({ ok: false, error: reason(e, ms) }));
  });
}

async function anyOk(probes) {
  const results = await Promise.all(probes);
  return results.find((r) => r.ok) || results[0];
}

function checkList(cfg = CFG) {
  return [
    { id: "api", label: "API (apps, bookings, logins)", everyMs: 1000, run: () => httpOk(API_LOCAL, 5000, [200, 503]) },
    { id: "website", label: "Customer website", everyMs: 1000, run: () => tcpOk("127.0.0.1", 5175, 3000) },
    { id: "provider", label: "Provider website", everyMs: 1000, run: () => tcpOk("127.0.0.1", 5174, 3000) },
    { id: "admin", label: "Admin panel", everyMs: 1000, run: () => tcpOk("127.0.0.1", 5177, 3000) },
    { id: "nginx", label: "Web server (nginx)", everyMs: 1000, run: () => tcpOk("127.0.0.1", 443, 3000) },
    ...SITES.map((h) => ({ id: `https:${h}`, label: h, everyMs: cfg.publicEveryMs, run: () => httpOk(`https://${h}/`, 10000, [200]) })),
    { id: "https:api", label: new URL(API_PUBLIC).host, everyMs: cfg.publicEveryMs, run: () => httpOk(API_PUBLIC, 10000, [200, 503]) },
    { id: "internet", label: "Server's internet connection", everyMs: cfg.publicEveryMs, run: () => anyOk([tcpOk("1.1.1.1", 443, 5000), tcpOk("8.8.8.8", 443, 5000)]) },
  ];
}

// ---- pure logic (exported for tests) -----------------------------------------
// One probe result; `at` is when the probe started.
function record(st, id, result, at) {
  st.checks = st.checks || {};
  const c = (st.checks[id] = st.checks[id] || { failingSince: null, okSince: null, down: false, downSince: null, error: null });
  if (result.ok) {
    c.failingSince = null;
    if (c.okSince == null) c.okSince = at;
  } else {
    c.okSince = null;
    if (c.failingSince == null) c.failingSince = at;
    c.error = result.error || "failed";
  }
}

// A one-line guess at the cause, from which checks are down.
function hint(down) {
  const has = (id) => down.includes(id);
  const local = ["api", "website", "provider", "admin"];
  if (has("internet")) return "The server can't reach the internet: likely a Hostinger network problem.";
  if (local.every(has)) return "Everything on the server stopped: Docker may be down or the server is restarting.";
  if (has("nginx")) return "nginx isn't answering: on the server run systemctl status nginx.";
  if (local.some(has)) return "On the server run: docker compose -p homeserve ps";
  if (down.every((id) => id.startsWith("https:"))) return "The apps run but the public address fails: check nginx, DNS or the HTTPS certificate.";
  return "";
}

// Turns check states into messages. One incident = everything that goes down until
// all of it is back; usually two messages (down, back up), plus reminders.
function evaluate(st, labels, now, cfg = CFG) {
  const out = [];
  st.checks = st.checks || {};
  for (const [id, c] of Object.entries(st.checks)) {
    if (!labels[id]) {
      delete st.checks[id];
      continue;
    }
    if (!c.down && c.failingSince != null && now - c.failingSince >= cfg.downAfterMs) {
      c.down = true;
      c.downSince = c.failingSince;
    } else if (c.down && c.okSince != null && now - c.okSince >= cfg.upAfterMs) {
      c.down = false;
      c.downSince = null;
    }
  }
  const down = Object.keys(st.checks).filter((id) => st.checks[id].down);
  const name = (id) => labels[id] || id;
  const describe = (ids) => ids.map((id) => `${name(id)} (${st.checks[id].error || "failing"})`).join(", ");

  let inc = st.incident;
  if (!inc && !down.length) return out;
  if (!inc) inc = st.incident = { id: now, startedAt: Math.min(...down.map((id) => st.checks[id].downSince)), affected: [], notified: [], lastMsgAt: null };
  for (const id of down) if (!inc.affected.includes(id)) inc.affected.push(id);

  if (!down.length) {
    const backAt = Math.max(...inc.affected.map((id) => st.checks[id]?.okSince ?? now));
    out.push({
      kind: "up",
      incident: inc.id,
      text: `✅ BACK UP: ${inc.affected.map(name).join(", ")}. Down for ${dur(backAt - inc.startedAt)} (${clock(inc.startedAt, now)} to ${clock(backAt, now)} IST).`,
    });
    st.history = [...(st.history || []), { startedAt: inc.startedAt, endedAt: backAt, affected: inc.affected.map(name) }].slice(-30);
    st.incident = null;
    return out;
  }

  const fresh = down.filter((id) => !inc.notified.includes(id));
  if (fresh.length && (!inc.lastMsgAt || now - inc.lastMsgAt >= cfg.updateGapMs)) {
    const first = !inc.lastMsgAt;
    const tip = hint(down);
    const text = first
      ? `🔴 DOWN: ${describe(fresh)}. Failing since ${clock(inc.startedAt, now)} IST.${tip ? ` ${tip}` : ""} I'll update you every ${Math.round(cfg.remindMs / 60000)} min until it's back.`
      : `🔴 ALSO DOWN now: ${describe(fresh)}.${tip ? ` ${tip}` : ""}`;
    inc.notified.push(...fresh);
    inc.lastMsgAt = now;
    out.push({ kind: first ? "down" : "update", incident: inc.id, text });
  } else if (inc.lastMsgAt && now - inc.lastMsgAt >= cfg.remindMs) {
    inc.lastMsgAt = now;
    out.push({ kind: "reminder", incident: inc.id, text: `🔴 STILL DOWN after ${dur(now - inc.startedAt)}: ${describe(down)}.` });
  }
  return out;
}

// On start: was the VPS itself off (booted after we last saw it alive), or was only
// this bot stopped for a long time? lastAliveAt is saved every few seconds.
function restartNotice(st, now, hostUptimeMs, cfg = CFG) {
  const last = st.lastAliveAt;
  if (!last || now - last < 30000) return null;
  const bootAt = now - hostUptimeMs;
  if (bootAt > last) {
    return `⚠️ The server (VPS) was switched off or restarted. Everything was last seen working at ${clock(last, now)} IST and the server started again at ${clock(bootAt, now)} IST, so Tikdum was offline for about ${dur(now - last)}. If nobody on the team restarted it, ask Hostinger why. Checking everything again now.`;
  }
  if (now - last >= cfg.botOffAlertMs) {
    return `⚠️ The Network Bot itself was stopped from ${clock(last, now)} to ${clock(now, now)} IST (${dur(now - last)}), so nothing was watched then. Checking again now.`;
  }
  return null;
}

const statusLine = (st, labels, now) => {
  const ids = Object.keys(labels);
  const down = ids.filter((id) => st.checks?.[id]?.down);
  const last = (st.history || []).slice(-1)[0];
  const lastTxt = last ? ` Last problem: ${clock(last.startedAt, now)}, ${dur(last.endedAt - last.startedAt)}.` : "";
  return down.length ? `DOWN: ${down.map((id) => labels[id]).join(", ")}` : `${ids.length} checks every 1-10 s, all OK.${lastTxt}`;
};

// ---- HTTPS certificates ----------------------------------------------------------
function certDaysLeft(host, now = Date.now()) {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const c = sock.getPeerCertificate();
      sock.destroy();
      resolve(c?.valid_to ? Math.floor((Date.parse(c.valid_to) - now) / 86400000) : null);
    });
    sock.on("error", () => resolve(null));
    sock.on("timeout", () => {
      sock.destroy();
      resolve(null);
    });
  });
}

// ---- runner ------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostUptimeMs = () => {
  try {
    return parseFloat(fs.readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000;
  } catch {
    return Infinity; // not Linux: can't tell a VPS restart from a bot restart
  }
};
const dayKey = (ms) => new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);

async function checkOnce() {
  const checks = checkList();
  const results = await Promise.all(checks.map(async (c) => [c, await c.run()]));
  for (const [c, r] of results) console.log(`${r.ok ? "OK  " : "FAIL"}  ${c.label.padEnd(32)} ${r.ok ? "" : r.error}`);
  const wa = owner.settings();
  const gaps = owner.missing(wa);
  console.log(gaps.length ? `WhatsApp: not set up (${gaps.join(", ")})` : `WhatsApp: ready, ${wa.phones.length} number(s), template ${wa.template}`);
  for (const h of [...SITES, new URL(API_PUBLIC).host]) {
    const d = await certDaysLeft(h);
    console.log(`HTTPS certificate ${h}: ${d == null ? "couldn't read" : `${d} days left`}`);
  }
}

async function main() {
  const checks = checkList();
  const labels = Object.fromEntries(checks.map((c) => [c.id, c.label]));
  const st = state.load(STATE);
  const started = Date.now();
  st.outbox = st.outbox || [];
  const queue = (m) => st.outbox.push({ ...m, at: Date.now(), tries: 0, nextTryAt: 0 });

  const notice = restartNotice(st, started, hostUptimeMs());
  if (notice) queue({ kind: "restart", text: notice });
  // Timings from before this start are stale; incidents carry on.
  for (const c of Object.values(st.checks || {})) {
    c.failingSince = null;
    c.okSince = null;
  }
  if (!st.helloAt) {
    queue({
      kind: "hello",
      text: `✅ Network Bot is on. Every second I check the API, the customer, provider and admin websites and the web server; every 10 s that tikdum.com, provider, admin and api load over HTTPS and the server has internet. If anything fails for ${CFG.downAfterMs / 1000} s you get a WhatsApp here, a reminder every ${CFG.remindMs / 60000} min, and a message when it's back.`,
    });
  }
  st.lastAliveAt = started;
  state.save(STATE, st);

  // AI Agents page: heartbeat + alerts in the feed, when an agent key is set. Best effort:
  // when the API is the thing that's down these simply fail.
  let client = null;
  if (env.AGENT_KEY_NETWORK) {
    const { TikdumClient } = require("./tikdum");
    client = new TikdumClient(NAME, env.AGENT_KEY_NETWORK);
  } else {
    log.info(NAME, "AGENT_KEY_NETWORK not set: works anyway, just not shown in Admin → AI Agents");
  }
  const gaps = owner.missing(owner.settings());
  if (gaps.length) log.warn(NAME, "WhatsApp not set up — alerts only in these logs", { missing: gaps });

  let sending = false;
  async function flush() {
    if (sending || !st.outbox.length) return;
    const now = Date.now();
    // Removed by identity: tick() may drop items while a send is in flight.
    const m = st.outbox[0];
    if (m.nextTryAt > now) return;
    st.sent = st.sent?.day === dayKey(now) ? st.sent : { day: dayKey(now), n: 0 };
    if (m.kind !== "up" && st.sent.n >= CFG.maxPerDay) {
      log.warn(NAME, "daily WhatsApp limit reached, not sent", { text: m.text });
      st.outbox = st.outbox.filter((o) => o !== m);
      return;
    }
    sending = true;
    try {
      const r = await owner.send(`Network Bot: ${m.text}`);
      if (r.delivered > 0) {
        st.outbox = st.outbox.filter((o) => o !== m);
        st.sent.n += 1;
        if (m.kind === "hello") st.helloAt = new Date().toISOString();
        log.info(NAME, "WhatsApp sent", { kind: m.kind, delivered: r.delivered });
      } else if (/^not set up/.test(r.error || "")) {
        st.outbox = st.outbox.filter((o) => o !== m);
      } else {
        m.tries += 1;
        m.nextTryAt = now + 30000;
        log.warn(NAME, "WhatsApp failed, retrying in 30 s", { kind: m.kind, error: r.error, tries: m.tries });
        if (now - m.at > 6 * 3600000) st.outbox = st.outbox.filter((o) => o !== m);
      }
    } finally {
      sending = false;
    }
  }

  function tick() {
    const now = Date.now();
    for (const m of evaluate(st, labels, now)) {
      log[m.kind === "up" ? "info" : "warn"](NAME, m.text);
      if (m.kind === "up") {
        // Never-delivered messages about this incident are replaced by this one.
        const dropped = st.outbox.filter((o) => o.incident === m.incident);
        st.outbox = st.outbox.filter((o) => o.incident !== m.incident);
        if (dropped.some((o) => o.kind === "down")) m.text += " (WhatsApp couldn't be reached while it was down.)";
      }
      queue(m);
      if (client && (m.kind === "down" || m.kind === "up")) {
        client
          .feed({ kind: m.kind === "up" ? "info" : "alert", severity: m.kind === "up" ? "info" : "critical", title: m.text.slice(0, 140), body: m.text, dedupeKey: `network:${m.kind}:${m.incident}` })
          .catch(() => null);
      }
    }
    flush().catch((e) => log.error(NAME, "send failed", { error: e.message }));
  }

  for (const c of checks) {
    (async () => {
      for (;;) {
        const at = Date.now();
        const r = await c.run().catch((e) => ({ ok: false, error: e.message }));
        record(st, c.id, r, at);
        await sleep(Math.max(50, c.everyMs - (Date.now() - at)));
      }
    })();
  }
  setInterval(tick, 1000);
  setInterval(() => {
    st.lastAliveAt = Date.now();
    state.save(STATE, st);
  }, 5000);

  if (client) {
    const beat = () => client.heartbeat(st.incident ? "error" : "ok", statusLine(st, labels, Date.now()));
    setTimeout(beat, 15000);
    setInterval(beat, 60000);
  }

  async function certs() {
    const now = Date.now();
    st.ssl = st.ssl || {};
    for (const h of [...SITES, new URL(API_PUBLIC).host]) {
      const d = await certDaysLeft(h, now);
      if (d == null || d > CFG.sslWarnDays || st.ssl[h] === dayKey(now)) continue;
      st.ssl[h] = dayKey(now);
      queue({ kind: "ssl", text: `🟠 The HTTPS certificate for ${h} ${d < 0 ? "has EXPIRED" : `expires in ${d} day${d === 1 ? "" : "s"}`}. Browsers will block the site. On the server run: certbot renew` });
    }
  }
  setTimeout(() => certs().catch(() => null), 30000);
  setInterval(() => certs().catch(() => null), 6 * 3600000);

  log.info(NAME, "started", { checks: checks.length, downAfterSec: CFG.downAfterMs / 1000 });
  const stop = (sig) => {
    log.info(NAME, `received ${sig}, stopping`);
    st.lastAliveAt = Date.now();
    state.save(STATE, st);
    process.exit(0);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

module.exports = { record, evaluate, restartNotice, hint, statusLine, dur, clock, checkList, CFG };

if (require.main === module) {
  process.on("unhandledRejection", (e) => log.error(NAME, "unhandled rejection", { error: String(e?.message || e) }));
  if (process.argv.includes("--check")) checkOnce().then(() => process.exit(0));
  else main();
}
