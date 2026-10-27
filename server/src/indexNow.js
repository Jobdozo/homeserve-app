// IndexNow (indexnow.org): tells Bing — whose index ChatGPT search leans on — and the other
// IndexNow engines (Yandex, Seznam, Naver) about tikdum.com's pages straight away, instead of
// waiting for them to be crawled. New pages go the same day; every page again once a week, so
// changed prices and texts are picked up too.
//
// The key is made once and kept with the rest of Tikdum's data. It isn't a secret: engines fetch
// tikdum.com/<key>.txt (served by seoPages.js) to check the site is Tikdum's.
// On only where INDEXNOW=on (the live server, docker-compose.yml), so local runs and tests never
// send anything.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const TABLE = "indexNow";
const HOST = "tikdum.com";
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || "https://api.indexnow.org/indexnow";
const RESEND_MS = 7 * 24 * 3600 * 1000;
const MAX_URLS = 10000; // per request, IndexNow's limit

const enabled = () => String(process.env.INDEXNOW || "").toLowerCase() === "on";
const row = (id) => jsonStore.readAll(TABLE).find((r) => r.id === id) || null;

function key() {
  const r = row("key");
  if (r?.key) return r.key;
  const made = crypto.randomBytes(16).toString("hex");
  jsonStore.insert(TABLE, { id: "key", key: made, at: new Date().toISOString() });
  return made;
}

// tikdum.com/<key>.txt: the key itself, else null (a 404).
function keyFile(path) {
  const r = row("key");
  return r?.key && path === `/${r.key}.txt` ? r.key : null;
}

// Pure: the addresses to send now — the ones never sent, and the rest once a week. Exported for tests.
function due(urls, sent = {}, now = Date.now()) {
  return [...new Set(urls)].filter((u) => !sent[u] || now - sent[u] >= RESEND_MS).slice(0, MAX_URLS);
}

async function submit(urls, { fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  if (!enabled() && !force) return { sent: 0, skipped: "off" };
  const k = key();
  const state = row("sent");
  const sent = state?.urls || {};
  const todo = due(urls, sent, now);
  if (!todo.length) return { sent: 0 };
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: k, keyLocation: `https://${HOST}/${k}.txt`, urlList: todo }),
    signal: AbortSignal.timeout(20000),
  });
  // 200 = received, 202 = received and the key is being checked.
  if (![200, 202].includes(res.status)) throw new Error(`IndexNow answered ${res.status}`);
  const keep = new Set(urls);
  const next = Object.fromEntries(Object.entries(sent).filter(([u]) => keep.has(u)));
  for (const u of todo) next[u] = now;
  const data = { id: "sent", urls: next, lastAt: new Date(now).toISOString(), lastCount: todo.length };
  if (state) jsonStore.update(TABLE, "sent", data);
  else jsonStore.insert(TABLE, data);
  return { sent: todo.length };
}

module.exports = { key, keyFile, due, submit, enabled, RESEND_MS };
