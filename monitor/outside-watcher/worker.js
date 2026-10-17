// Tikdum outside watcher: a Cloudflare Worker that runs every minute on Cloudflare,
// completely away from the Hostinger VPS. It exists for the one case the Network Bot
// (agents/src/netwatch.js, on the VPS) can't report: the whole VPS off or cut off, as
// on 17 Oct 2026 when Hostinger powered it down for about 17 minutes.
//
// Every minute: tikdum.com and api.tikdum.com/api/health, each tried twice. When BOTH
// fail on 2 runs in a row (about 2 minutes), one WhatsApp to the owner numbers through
// MSG91's approved notice template, a reminder every 30 minutes, and a message when the
// site is reachable again. Anything smaller (one site down, the API down) is the Network
// Bot's job, so you don't get two messages for it.
//
// Settings (Cloudflare dashboard -> the Worker -> Settings -> Variables and Secrets):
//   MSG91_AUTH_KEY         secret: the MSG91 auth key (the same one the VPS uses)
//   MSG91_WHATSAPP_NUMBER  the business WhatsApp number in MSG91 (integrated number)
//   OWNER_PHONES           comma-separated, e.g. 91XXXXXXXXXX,91YYYYYYYYYY
//   MSG91_NOTICE_TEMPLATE  optional, default tikdum_message
//   MSG91_NOTICE_TEMPLATE_VARS  optional, default name,message
// Binding: a KV namespace bound as STATE (remembers up/down between runs; written only
// when something changes, well inside the free plan). Trigger: cron "* * * * *".

const CHECKS = [
  { name: "tikdum.com", url: "https://tikdum.com/", ok: [200] },
  { name: "api.tikdum.com", url: "https://api.tikdum.com/api/health", ok: [200, 503] },
];
const FAILS_BEFORE_ALERT = 2;
const REMIND_MS = 30 * 60000;
const MSG91_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

const clock = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

async function probe(check, fetchFn, retryDelayMs) {
  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchFn(check.url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "TikdumOutsideWatcher/1" }, cf: { cacheTtl: 0 } });
      if (check.ok.includes(r.status)) return { name: check.name, ok: true };
      error = `HTTP ${r.status}`;
    } catch (e) {
      error = e?.name === "TimeoutError" ? "no answer in 15 s" : "no connection";
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, retryDelayMs));
  }
  return { name: check.name, ok: false, error };
}

async function sendWhatsApp(env, message, fetchFn) {
  const phones = String(env.OWNER_PHONES || "").split(",").map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 10).map((p) => (p.length === 10 ? `91${p}` : p));
  if (!env.MSG91_AUTH_KEY || !env.MSG91_WHATSAPP_NUMBER || !phones.length) return { delivered: 0, error: "not set up (MSG91_AUTH_KEY, MSG91_WHATSAPP_NUMBER, OWNER_PHONES)" };
  const vars = String(env.MSG91_NOTICE_TEMPLATE_VARS || "name,message").split(",").map((v) => v.trim());
  const values = { name: "Owner", message: `Outside watcher: ${message}`.replace(/\s*[\r\n\t]+\s*/g, " · ").slice(0, 1000) };
  let delivered = 0;
  let error = null;
  for (const phone of phones) {
    const components = {};
    vars.forEach((v, i) => {
      components[`body_${i + 1}`] = { type: "text", value: values[v] ?? "" };
    });
    try {
      const r = await fetchFn(MSG91_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: env.MSG91_AUTH_KEY },
        body: JSON.stringify({
          integrated_number: env.MSG91_WHATSAPP_NUMBER,
          content_type: "template",
          payload: {
            messaging_product: "whatsapp",
            type: "template",
            template: { name: env.MSG91_NOTICE_TEMPLATE || "tikdum_message", language: { code: "en", policy: "deterministic" }, namespace: null, to_and_components: [{ to: [phone], components }] },
          },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.status !== "error" && !data.hasError) delivered += 1;
      else error = `MSG91 ${r.status}: ${JSON.stringify(data.errors || data.message || data).slice(0, 200)}`;
    } catch (e) {
      error = String(e?.message || e);
    }
  }
  return { delivered, error };
}

// One run. Exported for tests; `now`, `fetchFn` and the retry delay are injectable.
export async function run(env, { now = Date.now(), fetchFn = fetch, retryDelayMs = 3000 } = {}) {
  const results = await Promise.all(CHECKS.map((c) => probe(c, fetchFn, retryDelayMs)));
  const st = JSON.parse((await env.STATE.get("state")) || "{}");
  const before = JSON.stringify(st);
  const sent = [];
  const say = async (text) => {
    const r = await sendWhatsApp(env, text, fetchFn);
    sent.push({ text, ...r });
    return r.delivered > 0;
  };

  if (!st.helloAt && (await say("✅ I'm on. Every minute I check tikdum.com and the API from Cloudflare, outside the Hostinger server. If the whole server can't be reached for 2 minutes, I'll message you here, even when the server itself can't."))) {
    st.helloAt = now;
  }

  const unreachable = results.every((r) => !r.ok);
  if (unreachable) {
    st.fails = (st.fails || 0) + 1;
    st.downSince = st.downSince || now;
    const what = results.map((r) => `${r.name}: ${r.error}`).join("; ");
    if (st.fails >= FAILS_BEFORE_ALERT && !st.alertedAt) {
      if (await say(`🔴 Tikdum can't be reached from the internet since ${clock(st.downSince)} IST (${what}). The whole server looks down or cut off, so the Network Bot on it can't message you. Check hPanel → VPS, and contact Hostinger if nobody restarted it.`)) st.alertedAt = st.lastMsgAt = now;
    } else if (st.alertedAt && now - st.lastMsgAt >= REMIND_MS) {
      if (await say(`🔴 Still unreachable after ${dur(now - st.downSince)} (since ${clock(st.downSince)} IST): ${what}.`)) st.lastMsgAt = now;
    }
  } else if (st.fails || st.downSince) {
    if (st.alertedAt) await say(`✅ Tikdum can be reached again. It was unreachable for about ${dur(now - st.downSince)} (${clock(st.downSince)} to ${clock(now)} IST).`);
    st.fails = 0;
    st.downSince = st.alertedAt = st.lastMsgAt = null;
  }

  // Only write when something changed: KV's free plan allows 1,000 writes a day.
  if (JSON.stringify(st) !== before) await env.STATE.put("state", JSON.stringify(st));
  return { results, state: st, sent: sent.map((s) => ({ delivered: s.delivered, error: s.error })) };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  // Opening the Worker's address shows the last known state (no settings, no numbers).
  async fetch(request, env) {
    const st = JSON.parse((await env.STATE.get("state")) || "{}");
    return Response.json({
      watcher: "Tikdum outside watcher",
      checks: CHECKS.map((c) => c.url),
      on: Boolean(st.helloAt),
      status: st.downSince ? `unreachable since ${clock(st.downSince)} IST` : "reachable",
    });
  },
};
