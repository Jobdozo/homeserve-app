// Social media: publishes one post (a picture + caption) to Tikdum's Facebook Page and
// Instagram account through Meta's Graph API. Only ever called when a person posts from
// Admin or approves a Marketing Agent proposal (agents.js "social.post") — agents can't
// publish on their own.
//
// Setup (deploy/set-meta.sh): META_PAGE_TOKEN (a Page access token that doesn't expire),
// META_PAGE_ID and META_IG_USER_ID (the Instagram professional account linked to the Page).
//
// Instagram fetches the picture itself, needs a JPEG and an aspect ratio between 4:5 and
// 1.91:1, so every picture is first turned into a 1080×1080 JPEG and served from
// /api/social-images/<name> on this server (SOCIAL_IMAGE_BASE).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const GRAPH = (process.env.META_GRAPH_URL || "https://graph.facebook.com/v23.0").replace(/\/$/, "");
const SITE = "https://tikdum.com";
const POSTS = "socialPosts";
const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "social");
const IMAGE_BASE = (process.env.SOCIAL_IMAGE_BASE || "https://api.tikdum.com").replace(/\/$/, "");
const IG_MAX = 2200;
const fail = (status, message) => Object.assign(new Error(message), { status });

const cfg = () => ({ pageId: process.env.META_PAGE_ID || "", token: process.env.META_PAGE_TOKEN || "", igUserId: process.env.META_IG_USER_ID || "" });
// Uploaded photos live on the API host (/uploads/…); built-in ones (/category-photos/…) on the site.
const abs = (u) => {
  const s = String(u || "");
  if (/^https?:\/\//.test(s)) return s;
  const p = s.startsWith("/") ? s : `/${s}`;
  return `${p.startsWith("/uploads/") ? IMAGE_BASE : SITE}${p}`;
};

async function graph(method, pathname, params = {}) {
  const { token } = cfg();
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${GRAPH}${pathname}?${body}` : `${GRAPH}${pathname}`;
  const r = await fetch(url, { method, body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(30000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw fail(502, `Meta: ${data.error?.message || `HTTP ${r.status}`}`);
  return data;
}

// Which channels are connected, with the Page and Instagram names (cached 10 minutes).
let statusCache = { at: 0, value: null };
async function status() {
  const { pageId, token, igUserId } = cfg();
  const base = { facebook: Boolean(pageId && token), instagram: Boolean(igUserId && token) };
  if (!base.facebook) return { ...base, page: null, instagramUsername: null };
  if (statusCache.value && Date.now() - statusCache.at < 10 * 60 * 1000) return statusCache.value;
  let value = { ...base, page: null, instagramUsername: null };
  try {
    const p = await graph("GET", `/${pageId}`, { fields: "name,instagram_business_account{username}" });
    value = { ...base, page: p.name || null, instagramUsername: p.instagram_business_account?.username || null };
  } catch (e) {
    value = { ...base, error: e.message };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

// Fetches a picture and stores it as a 1080×1080 JPEG Instagram accepts. Returns its public URL.
async function prepareImage(src) {
  const url = abs(src);
  if (!/^https:\/\/([a-z0-9-]+\.)*tikdum\.com\//i.test(url) && !/^https:\/\/[a-z0-9.-]+\.(r2\.dev|amazonaws\.com|supabase\.co|cloudflarestorage\.com)\//i.test(url)) {
    throw fail(400, "Pick a picture from Tikdum's own images");
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw fail(400, `Couldn't load the picture (${r.status})`);
  const input = Buffer.from(await r.arrayBuffer());
  const sharp = require("sharp");
  const out = await sharp(input).rotate().resize(1080, 1080, { fit: "cover", position: "attention" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  fs.mkdirSync(DIR, { recursive: true });
  const name = `${crypto.createHash("sha256").update(out).digest("hex").slice(0, 32)}.jpg`;
  fs.writeFileSync(path.join(DIR, name), out);
  return { name, url: `${IMAGE_BASE}/api/social-images/${name}` };
}

// GET /api/social-images/<name>: the prepared pictures, public so Meta can fetch them.
function serveImage(req, res) {
  const name = String(req.params.name || "");
  if (!/^[a-f0-9]{32}\.jpg$/.test(name)) return res.status(404).end();
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type("jpg").sendFile(file);
}

function cleanPost({ caption, imageUrl, channels } = {}) {
  const text = String(caption || "").trim();
  if (!text) throw fail(400, "Write a caption");
  if (text.length > IG_MAX) throw fail(400, `Captions can be at most ${IG_MAX} characters (Instagram's limit)`);
  if ((text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) throw fail(400, "Instagram allows at most 30 hashtags");
  if (!imageUrl) throw fail(400, "Pick a picture — Instagram posts need one");
  const wanted = [...new Set((Array.isArray(channels) && channels.length ? channels : ["facebook", "instagram"]).map(String))];
  if (wanted.some((c) => !["facebook", "instagram"].includes(c))) throw fail(400, "Channels can be facebook and/or instagram");
  return { caption: text, imageUrl: String(imageUrl), channels: wanted };
}

async function waitForContainer(id) {
  for (let i = 0; i < 10; i++) {
    const s = await graph("GET", `/${id}`, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw fail(502, "Instagram couldn't process the picture");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw fail(502, "Instagram took too long to process the picture");
}

// Publishes to each chosen channel; one failing doesn't stop the other. Returns per-channel results.
async function publish(input, actor) {
  const post = cleanPost(input);
  const st = cfg();
  if (post.channels.includes("facebook") && !(st.pageId && st.token)) throw fail(400, "Facebook isn't connected (deploy/set-meta.sh)");
  if (post.channels.includes("instagram") && !(st.igUserId && st.token)) throw fail(400, "Instagram isn't connected (deploy/set-meta.sh)");
  const image = await prepareImage(post.imageUrl);
  const results = {};
  if (post.channels.includes("facebook")) {
    try {
      const r = await graph("POST", `/${st.pageId}/photos`, { url: image.url, caption: post.caption });
      results.facebook = { ok: true, id: r.post_id || r.id, link: `https://www.facebook.com/${r.post_id || r.id}` };
    } catch (e) {
      results.facebook = { ok: false, error: e.message };
    }
  }
  if (post.channels.includes("instagram")) {
    try {
      const c = await graph("POST", `/${st.igUserId}/media`, { image_url: image.url, caption: post.caption });
      await waitForContainer(c.id);
      const r = await graph("POST", `/${st.igUserId}/media_publish`, { creation_id: c.id });
      const info = await graph("GET", `/${r.id}`, { fields: "permalink" }).catch(() => ({}));
      results.instagram = { ok: true, id: r.id, link: info.permalink || null };
    } catch (e) {
      results.instagram = { ok: false, error: e.message };
    }
  }
  const row = jsonStore.insert(POSTS, { caption: post.caption, imageUrl: post.imageUrl, image: image.url, results, by: actor || "admin", at: new Date().toISOString() });
  const ok = Object.values(results).filter((r) => r.ok).length;
  if (!ok) throw fail(502, Object.entries(results).map(([k, r]) => `${k}: ${r.error}`).join("; "));
  return row;
}

function listPosts(limit = 30) {
  return jsonStore.readAll(POSTS).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

// Pictures a post can use: category photos, live banners and service photos (public URLs).
function imageLibrary({ categories = [], banners = [], services = [] }) {
  const BUILT_IN = new Set(["ac-repair", "appliance-repair", "carpentry", "computer-repair", "electrician", "home-cleaning", "packers-movers", "painting", "pest-control", "plumbing", "salon-spa"]);
  const out = [];
  const seen = new Set();
  const add = (url, label, kind) => {
    if (!url) return;
    const u = abs(url);
    if (seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, label, kind });
  };
  for (const c of categories) add(c.imageUrl || c.bannerUrl || (BUILT_IN.has(c.id) ? `/category-photos/${c.id}.jpg` : null), `${c.name} (category photo)`, "category");
  for (const b of banners) add(b.imageUrl, `${b.title || "Banner"} (home banner)`, "banner");
  for (const s of services) if (s.imageUrl) add(s.imageUrl, `${s.name} (service photo)`, "service");
  return out.slice(0, 80);
}

module.exports = { status, publish, listPosts, serveImage, imageLibrary, cleanPost, prepareImage };
