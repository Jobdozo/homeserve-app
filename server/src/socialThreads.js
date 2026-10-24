// Threads (threads.net) for social.js: the same posts as Facebook and Instagram, with a shorter
// text (Threads allows 500 characters and one topic tag). Uses the Threads API, which has its own
// login: deploy/set-threads.sh saves THREADS_USER_ID and a long-lived THREADS_TOKEN. That token
// lasts 60 days; it's renewed here once a week (Meta allows it after a day) and the renewed one
// is kept in the server's records, so nobody has to run the script again.
const jsonStore = require("./jsonStore");

const API = (process.env.THREADS_GRAPH_URL || "https://graph.threads.net/v1.0").replace(/\/$/, "");
const REFRESH = "https://graph.threads.net/refresh_access_token";
const AUTH = "socialThreadsAuth";
const RENEW_AFTER_MS = 7 * 24 * 3600 * 1000;
const MAX_TEXT = 500;
const fail = (status, message) => Object.assign(new Error(message), { status });

const saved = () => jsonStore.readAll(AUTH).find((r) => r.id === "auth") || null;
// The renewed token wins over the .env one, unless .env has a newer token (the script was run again).
function token() {
  const env = String(process.env.THREADS_TOKEN || "").trim();
  const s = saved();
  return s?.token && s.fromEnv === env ? s.token : env;
}
const userId = () => String(process.env.THREADS_USER_ID || "").trim();
const configured = () => Boolean(userId() && token());

async function call(method, pathname, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token() });
  const url = method === "GET" ? `${API}${pathname}?${body}` : `${API}${pathname}`;
  const r = await fetch(url, { method, body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(30000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw fail(502, `Threads: ${data.error?.message || `HTTP ${r.status}`}`);
  return data;
}

// Pure: the text for Threads — the post's own Threads text, else the caption without its hashtags
// (one topic tag kept), cut at a sentence or word so it fits. Exported for tests.
function threadsText(post) {
  const own = String(post.threadsText || "").trim();
  if (own) return own.slice(0, MAX_TEXT);
  const caption = String(post.caption || "");
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) || [];
  let text = caption.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const tag = tags.find((t) => !/tikdum/i.test(t)) || tags[0];
  const room = MAX_TEXT - (tag ? tag.length + 2 : 0);
  if (text.length > room) {
    const cut = text.slice(0, room - 1);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("\n"));
    text = `${end > room * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(" "))}`.trim();
  }
  return tag ? `${text}\n\n${tag}` : text;
}

async function waitFor(id) {
  for (let i = 0; i < 15; i++) {
    const s = await call("GET", `/${id}`, { fields: "status,error_message" });
    if (s.status === "FINISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") throw fail(502, `Threads couldn't process the picture${s.error_message ? ` (${s.error_message})` : ""}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw fail(502, "Threads took too long to process the picture");
}

// One post (single picture or carousel; Threads has no Stories). Returns { ok, id, link }.
async function publish(post, images) {
  const uid = userId();
  const text = threadsText(post);
  let creation;
  if (images.length === 1) {
    creation = (await call("POST", `/${uid}/threads`, { media_type: "IMAGE", image_url: images[0].url, text })).id;
  } else {
    const children = [];
    for (const im of images.slice(0, 20)) children.push((await call("POST", `/${uid}/threads`, { media_type: "IMAGE", image_url: im.url, is_carousel_item: "true" })).id);
    for (const id of children) await waitFor(id);
    creation = (await call("POST", `/${uid}/threads`, { media_type: "CAROUSEL", children: children.join(","), text })).id;
  }
  await waitFor(creation);
  const r = await call("POST", `/${uid}/threads_publish`, { creation_id: creation });
  const info = await call("GET", `/${r.id}`, { fields: "permalink" }).catch(() => ({}));
  return { ok: true, id: r.id, link: info.permalink || null };
}

// Likes, replies, reposts, quotes and views of one post (needs threads_manage_insights).
async function metrics(id) {
  const d = await call("GET", `/${id}/insights`, { metric: "views,likes,replies,reposts,quotes" });
  const out = {};
  for (const m of d.data || []) {
    const v = m.values?.[0]?.value ?? m.total_value?.value;
    if (Number.isFinite(v)) out[m.name] = v;
  }
  return out;
}

async function username() {
  return (await call("GET", "/me", { fields: "username" }).catch(() => ({}))).username || null;
}

// Renews the long-lived token when it's a week old. Never throws.
async function renewIfDue(now = Date.now()) {
  if (!configured()) return false;
  const s = saved();
  const env = String(process.env.THREADS_TOKEN || "").trim();
  // A token from the script (new, or replaced): start counting from now — Meta refuses to renew
  // a token less than a day old.
  if (!s || s.fromEnv !== env) {
    const row = { id: "auth", token: env, fromEnv: env, renewedAt: new Date(now).toISOString() };
    if (s) jsonStore.update(AUTH, "auth", row);
    else jsonStore.insert(AUTH, row);
    return false;
  }
  if (now - Date.parse(s.renewedAt) < RENEW_AFTER_MS) return false;
  try {
    const r = await fetch(`${REFRESH}?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: token() })}`, { signal: AbortSignal.timeout(20000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) throw new Error(data.error?.message || `HTTP ${r.status}`);
    const row = { id: "auth", token: data.access_token, fromEnv: env, renewedAt: new Date(now).toISOString(), expiresIn: data.expires_in || null };
    if (s) jsonStore.update(AUTH, "auth", row);
    else jsonStore.insert(AUTH, row);
    return true;
  } catch (e) {
    console.error("Threads token renewal failed:", e.message);
    return false;
  }
}

module.exports = { configured, publish, metrics, username, renewIfDue, threadsText, MAX_TEXT };
