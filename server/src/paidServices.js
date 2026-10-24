// Paid services Tikdum depends on (Super Admin -> Paid services): the domain, the
// VPS, MSG91, the AI and maps accounts, storage... each with the date it ends (or
// the next payment / balance check) and how to renew it. The Renewals Bot
// (agents/src/renewals.js) reads /api/admin/watch/renewals and reminds the owner
// 30, 14, 7, 3 and 1 days before, on the day and while it's overdue.
//
// Some dates are read automatically twice a day so nobody has to type them:
//   check "domain"  the registry's expiry date (RDAP, free, no key)
//   check "ssl"     the HTTPS certificate's expiry on each host in `checkTarget`
const crypto = require("crypto");
const tls = require("tls");
const jsonStore = require("./jsonStore");

const COLL = "paidServices";
const META = "paidServicesMeta";
const DAY = 24 * 60 * 60 * 1000;
const BILLING = ["yearly", "monthly", "prepaid", "usage", "free"];
const CHECKS = ["domain", "ssl"];
// Reminder days before the date; things that renew by themselves only get the last few.
const STAGES = [30, 14, 7, 3, 1, 0];
const AUTO_STAGES = [7, 1, 0];

const fail = (status, message) => Object.assign(new Error(message), { status });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
const istToday = (now) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// What's already known on 24 Oct 2026; the rest have no date yet and the page asks for it.
const SEED = [
  { name: "tikdum.com domain", vendor: "GoDaddy", usedFor: "The website, the apps' server address and every link (tikdum.com, api., admin., provider.). If it lapses, everything stops.", billing: "yearly", every: 12, renewsOn: "2026-12-30", check: "domain", checkTarget: "tikdum.com", renewUrl: "https://dcc.godaddy.com/control/portfolio" },
  { name: "HTTPS certificates", vendor: "Let's Encrypt (on the VPS)", usedFor: "The padlock on tikdum.com, api., admin. and provider. — browsers and the apps refuse the site without it.", billing: "free", every: 0, autoRenew: true, check: "ssl", checkTarget: "tikdum.com, api.tikdum.com, admin.tikdum.com, provider.tikdum.com", notes: "Renews by itself. A reminder means the automatic renewal has stopped working." },
  { name: "Hostinger VPS", vendor: "Hostinger", usedFor: "Runs the server, database, websites, backups and AI agents. If it lapses, everything stops.", billing: "yearly", every: 12, renewUrl: "https://hpanel.hostinger.com/billing/subscriptions" },
  { name: "MSG91 wallet (WhatsApp + SMS)", vendor: "MSG91", usedFor: "Login codes, booking messages to customers and providers, owner alerts. When the balance runs out, nobody can log in.", billing: "prepaid", every: 1, renewUrl: "https://control.msg91.com", notes: "Set the date to when you'll next check the balance; \"Paid\" moves it a month on." },
  { name: "Anthropic API credits (Claude)", vendor: "Anthropic", usedFor: "The AI agents: Support, CEO, Reporting, Complaints, Reviews, Engineering.", billing: "prepaid", every: 1, renewUrl: "https://console.anthropic.com/settings/billing", notes: "Turn on auto-reload in the console so the agents never stop." },
  { name: "Google Cloud billing (Maps, Routes, Gemini)", vendor: "Google Cloud", usedFor: "Address search and maps, live-tracking routes, Image Studio pictures.", billing: "usage", every: 1, renewUrl: "https://console.cloud.google.com/billing", notes: "Billed monthly to the card on file — check the card hasn't expired." },
  { name: "Supabase (photo storage + offsite backups)", vendor: "Supabase", usedFor: "Copies of every photo and the nightly offsite backup.", billing: "monthly", every: 1, renewUrl: "https://supabase.com/dashboard/org/_/billing" },
  { name: "Cloudflare (AI pictures)", vendor: "Cloudflare", usedFor: "Workers AI pictures for Image Studio and social posts.", billing: "usage", every: 1, renewUrl: "https://dash.cloudflare.com/" },
];

function clean(input, old = {}) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const out = { ...old };
  if ("name" in input || !old.name) out.name = s(input.name, 80);
  if (!out.name) throw fail(400, "Give the service a name");
  for (const [k, n] of [["vendor", 80], ["usedFor", 300], ["notes", 500], ["checkTarget", 300], ["renewUrl", 300]]) if (k in input) out[k] = s(input[k], n);
  if (out.renewUrl && !/^https:\/\//i.test(out.renewUrl)) throw fail(400, "The renew link must start with https://");
  if ("billing" in input) out.billing = BILLING.includes(input.billing) ? input.billing : "yearly";
  if ("every" in input) out.every = [0, 1, 3, 6, 12, 24, 36].includes(Number(input.every)) ? Number(input.every) : 12;
  if ("autoRenew" in input) out.autoRenew = Boolean(input.autoRenew);
  if ("cost" in input) out.cost = input.cost === "" || input.cost == null ? null : Math.max(0, Math.round(Number(input.cost) * 100) / 100) || null;
  if ("currency" in input) out.currency = ["INR", "USD"].includes(input.currency) ? input.currency : "INR";
  if ("renewsOn" in input) {
    if (input.renewsOn && !isDate(input.renewsOn)) throw fail(400, "Pick a valid date");
    out.renewsOn = input.renewsOn || null;
  }
  if ("check" in input) out.check = CHECKS.includes(input.check) ? input.check : null;
  out.billing = out.billing || "yearly";
  out.every = out.every ?? 12;
  out.currency = out.currency || "INR";
  return out;
}

function seedOnce() {
  if (jsonStore.readAll(META).some((r) => r.id === "seed")) return;
  const now = new Date().toISOString();
  for (const [i, row] of SEED.entries()) jsonStore.insert(COLL, { id: `svc_seed${i + 1}`, ...clean(row), createdAt: now, updatedAt: now, updatedBy: "Tikdum (starting list)" });
  jsonStore.insert(META, { id: "seed", at: now });
}

// Pure: where an item stands on `now`. stage = the reminder it's due (days before, 0 = today,
// "overdue"), or null when it's further away than the first reminder.
function status(item, now = Date.now()) {
  if (!item.renewsOn) return { level: "no-date", daysLeft: null, stage: null };
  const daysLeft = Math.round((Date.parse(`${item.renewsOn}T00:00:00Z`) - Date.parse(`${istToday(now)}T00:00:00Z`)) / DAY);
  if (daysLeft < 0) return { level: "overdue", daysLeft, stage: "overdue" };
  const stages = item.autoRenew ? AUTO_STAGES : STAGES;
  const due = stages.filter((d) => daysLeft <= d);
  const stage = due.length ? Math.min(...due) : null;
  const level = daysLeft <= 7 ? "urgent" : daysLeft <= 30 ? "soon" : "ok";
  return { level, daysLeft, stage };
}

function list(now = Date.now()) {
  seedOnce();
  return jsonStore
    .readAll(COLL)
    .map((r) => ({ ...r, status: status(r, now) }))
    .sort((a, b) => (a.status.daysLeft ?? 1e6) - (b.status.daysLeft ?? 1e6) || a.name.localeCompare(b.name));
}

function add(input, actor) {
  seedOnce();
  const now = new Date().toISOString();
  return jsonStore.insert(COLL, { id: `svc_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`, ...clean(input), createdAt: now, updatedAt: now, updatedBy: actor || null });
}

function edit(id, input, actor) {
  const old = jsonStore.readAll(COLL).find((r) => r.id === id);
  if (!old) throw fail(404, "Service not found");
  return jsonStore.update(COLL, id, { ...clean(input, old), updatedAt: new Date().toISOString(), updatedBy: actor || null });
}

// "Renewed / paid": the date moves on by its period (from the old date, or today if that's long gone).
function markRenewed(id, actor, now = Date.now()) {
  const old = jsonStore.readAll(COLL).find((r) => r.id === id);
  if (!old) throw fail(404, "Service not found");
  let next = null;
  if (old.every > 0) {
    const today = istToday(now);
    const from = old.renewsOn && old.renewsOn > today ? old.renewsOn : today;
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + old.every);
    next = d.toISOString().slice(0, 10);
  }
  return jsonStore.update(COLL, id, { renewsOn: next, renewedAt: new Date(now).toISOString(), renewedBy: actor || null, updatedAt: new Date(now).toISOString(), updatedBy: actor || null });
}

function remove(id) {
  return jsonStore.remove(COLL, String(id));
}

// ---- automatic dates --------------------------------------------------------
async function domainExpiry(domain, fetchImpl = fetch) {
  // rdap.org forwards to the right registry (and refuses requests without a User-Agent).
  const r = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    headers: { Accept: "application/rdap+json", "User-Agent": "TikdumRenewalsBot/1 (+https://tikdum.com)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`registry answered ${r.status}`);
  const d = await r.json();
  const at = (d.events || []).find((e) => e.eventAction === "expiration")?.eventDate;
  if (!at) throw new Error("the registry gave no expiry date");
  const registrar = (d.entities || []).find((e) => (e.roles || []).includes("registrar"));
  const name = registrar?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3];
  return { date: new Date(at).toISOString().slice(0, 10), detail: name ? `registrar ${name}` : "" };
}

function certExpiry(host) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 10000 }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      if (!cert?.valid_to) return reject(new Error(`${host}: no certificate`));
      resolve(new Date(cert.valid_to).toISOString().slice(0, 10));
    });
    sock.on("timeout", () => (sock.destroy(), reject(new Error(`${host}: no answer`))));
    sock.on("error", (e) => reject(new Error(`${host}: ${e.message}`)));
  });
}

async function sslExpiry(target) {
  const hosts = String(target || "").split(/[\s,]+/).filter(Boolean);
  if (!hosts.length) throw new Error("no hosts to check");
  const dates = await Promise.all(hosts.map(async (h) => ({ h, d: await certExpiry(h) })));
  const first = dates.sort((a, b) => a.d.localeCompare(b.d))[0];
  return { date: first.d, detail: `earliest: ${first.h}` };
}

// Reads every automatic date and stores it (and what happened) on the item.
async function refresh({ fetchImpl = fetch } = {}) {
  seedOnce();
  const out = [];
  for (const item of jsonStore.readAll(COLL).filter((r) => r.check && r.checkTarget)) {
    const at = new Date().toISOString();
    try {
      const got = item.check === "domain" ? await domainExpiry(item.checkTarget.trim(), fetchImpl) : await sslExpiry(item.checkTarget);
      jsonStore.update(COLL, item.id, { renewsOn: got.date, lastCheck: { at, ok: true, date: got.date, detail: got.detail } });
      out.push({ id: item.id, ok: true, date: got.date });
    } catch (e) {
      jsonStore.update(COLL, item.id, { lastCheck: { at, ok: false, error: String(e.message || e).slice(0, 200), lastOkAt: item.lastCheck?.ok ? item.lastCheck.at : item.lastCheck?.lastOkAt || null } });
      out.push({ id: item.id, ok: false, error: e.message });
    }
  }
  return out;
}

module.exports = { list, add, edit, markRenewed, remove, refresh, status, STAGES, AUTO_STAGES, BILLING };
