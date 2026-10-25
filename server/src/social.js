// Social media: publishes posts to Tikdum's Facebook Page and Instagram account through Meta's
// Graph API. Three formats:
//   single    one picture + caption (the default)
//   carousel  the picture with the title on it, one card per point, and a "book now" card
//             (socialCards.js), swiped through on Instagram / shown as an album on Facebook
//   story     a 9:16 Story made from the picture with one line on it (Stories have no caption)
//   reel      a 9:16 video of the picture and the points (socialVideo.js) — Instagram and Facebook
//             Reels, a Threads video and a YouTube Short (socialYoutube.js). Video takes Meta a
//             minute or two to process, so a Reel is published in the background: the post is
//             saved as "publishing" and updated when every channel has answered. With a
//             videoScene, the video is a real-looking AI clip (socialAiVideo.js, at most one a day)
//             with the logo, the title and the "book now" card; otherwise, or if that fails, it's
//             made from Tikdum's own frames.
// Every post's results (likes, comments, shares, saves, reach) are read back twice a day
// (refreshMetrics) for the Marketing Agent's weekly report, so it writes more of what works. Only ever called when a person posts from
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
const threads = require("./socialThreads");
const youtube = require("./socialYoutube");
const video = require("./socialVideo");
const aiVideo = require("./socialAiVideo");

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
  const base = { facebook: Boolean(pageId && token), instagram: Boolean(igUserId && token), threads: threads.configured(), youtube: youtube.configured(), video: await video.available() };
  if (!base.facebook) return { ...base, page: null, instagramUsername: null, threadsUsername: base.threads ? await threads.username() : null };
  if (statusCache.value && Date.now() - statusCache.at < 10 * 60 * 1000) return statusCache.value;
  let value = { ...base, page: null, instagramUsername: null };
  try {
    const p = await graph("GET", `/${pageId}`, { fields: "name,instagram_business_account{username}" });
    value = { ...base, page: p.name || null, instagramUsername: p.instagram_business_account?.username || null, threadsUsername: base.threads ? await threads.username() : null };
  } catch (e) {
    value = { ...base, error: e.message };
  }
  statusCache = { at: Date.now(), value };
  return value;
}

function store(buffer) {
  fs.mkdirSync(DIR, { recursive: true });
  const name = `${crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32)}.jpg`;
  fs.writeFileSync(path.join(DIR, name), buffer);
  return { name, url: `${IMAGE_BASE}/api/social-images/${name}` };
}

// Fetches one of Tikdum's own pictures (never anyone else's).
async function fetchPicture(src) {
  const url = abs(src);
  if (!/^https:\/\/([a-z0-9-]+\.)*tikdum\.com\//i.test(url) && !/^https:\/\/[a-z0-9.-]+\.(r2\.dev|amazonaws\.com|supabase\.co|cloudflarestorage\.com)\//i.test(url)) {
    throw fail(400, "Pick a picture from Tikdum's own images");
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw fail(400, `Couldn't load the picture (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// Fetches a picture and stores it as a 1080×1080 JPEG Instagram accepts. Returns its public URL.
async function prepareImage(src) {
  const input = await fetchPicture(src);
  const sharp = require("sharp");
  return store(await sharp(input).rotate().resize(1080, 1080, { fit: "cover", position: "attention" }).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
}

// The pictures each format publishes: [{ url }] (one for single and story, 4–8 for a carousel).
async function prepareFormat(post) {
  const cards = require("./socialCards");
  if (post.format === "single") return [await prepareImage(post.imageUrl)];
  const photo = await fetchPicture(post.imageUrl);
  if (post.format === "story") return [store(await cards.storyImage(photo, post.storyLine, post.colour))];
  const total = post.slides.length + 2;
  const out = [store(await cards.coverSlide(photo, post.title, post.colour))];
  for (const [i, sl] of post.slides.entries()) out.push(store(await cards.textSlide({ ...sl, n: i + 2, total, colour: post.colour })));
  out.push(store(await cards.ctaSlide(post.colour)));
  return out;
}

// GET /api/social-images/<name>: the prepared pictures, public so Meta can fetch them.
// GET /api/social-videos/<name>: the Reels, public so Meta can fetch them.
function serveVideo(req, res) {
  const name = String(req.params.name || "");
  if (!/^[a-f0-9]{32}\.mp4$/.test(name)) return res.status(404).end();
  const file = path.join(DIR, "videos", name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type("mp4").sendFile(file);
}

function serveImage(req, res) {
  const name = String(req.params.name || "");
  if (!/^[a-f0-9]{32}\.jpg$/.test(name)) return res.status(404).end();
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set("Cache-Control", "public, max-age=604800, immutable");
  res.type("jpg").sendFile(file);
}

const FORMATS = ["single", "carousel", "story", "reel"];
const CHANNELS = ["facebook", "instagram", "threads", "youtube"];
const line = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

function cleanPost({ caption, imageUrl, channels, format, title, slides, storyLine, colour, threadsText, videoScene } = {}) {
  const kind = FORMATS.includes(format) ? format : "single";
  const text = String(caption || "").trim();
  if (!text && kind !== "story") throw fail(400, "Write a caption");
  if (text.length > IG_MAX) throw fail(400, `Captions can be at most ${IG_MAX} characters (Instagram's limit)`);
  if ((text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 30) throw fail(400, "Instagram allows at most 30 hashtags");
  if (!imageUrl) throw fail(400, "Pick a picture — Instagram posts need one");
  const wanted = [...new Set((Array.isArray(channels) && channels.length ? channels : ["facebook", "instagram"]).map(String))];
  if (wanted.some((c) => !CHANNELS.includes(c))) throw fail(400, "Channels can be facebook, instagram, threads and youtube");
  // Threads has no Stories; YouTube only takes Reels (as Shorts).
  const fits = (c) => (c === "youtube" ? kind === "reel" : c === "threads" ? kind !== "story" : true);
  const out = { caption: text, imageUrl: String(imageUrl), channels: wanted.filter(fits), format: kind };
  if (!out.channels.length) throw fail(400, kind === "story" ? "Stories go to Facebook and Instagram" : "Choose Facebook, Instagram or Threads");
  if (threadsText) out.threadsText = String(threadsText).trim().slice(0, threads.MAX_TEXT);
  out.colour = /^#[0-9a-f]{6}$/i.test(colour?.hex || "") ? { hex: colour.hex, name: line(colour.name, 30) } : null;
  if (kind === "carousel" || kind === "reel") {
    const what = kind === "reel" ? "A Reel" : "A carousel";
    out.title = line(title, 90);
    if (!out.title) throw fail(400, `${what} needs a title for its first picture`);
    out.slides = (Array.isArray(slides) ? slides : []).map((sl) => ({ title: line(sl?.title, 70), text: line(sl?.text, 220) })).filter((sl) => sl.title).slice(0, kind === "reel" ? 5 : 6);
    if (out.slides.length < 2) throw fail(400, `${what} needs at least 2 points`);
  }
  if (kind === "reel" && videoScene) out.videoScene = line(videoScene, 700);
  if (kind === "story") {
    out.storyLine = line(storyLine, 70);
    if (!out.storyLine) throw fail(400, "A Story needs one short line to show on the picture");
  }
  return out;
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

// Facebook: one photo, an album post of several (uploaded unpublished, then attached), or a Story.
async function toFacebook(st, post, images) {
  if (post.format === "story") {
    const photo = await graph("POST", `/${st.pageId}/photos`, { url: images[0].url, published: "false" });
    const r = await graph("POST", `/${st.pageId}/photo_stories`, { photo_id: photo.id });
    return { ok: true, id: r.post_id || photo.id, link: null };
  }
  if (images.length === 1) {
    const r = await graph("POST", `/${st.pageId}/photos`, { url: images[0].url, caption: post.caption });
    return { ok: true, id: r.post_id || r.id, link: `https://www.facebook.com/${r.post_id || r.id}` };
  }
  const ids = [];
  for (const im of images) ids.push((await graph("POST", `/${st.pageId}/photos`, { url: im.url, published: "false" })).id);
  const params = { message: post.caption };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const r = await graph("POST", `/${st.pageId}/feed`, params);
  return { ok: true, id: r.id, link: `https://www.facebook.com/${r.id}` };
}

// Instagram: a picture, a carousel (one container per picture, then the carousel), or a Story.
async function toInstagram(st, post, images) {
  let creation;
  if (post.format === "story") {
    creation = (await graph("POST", `/${st.igUserId}/media`, { image_url: images[0].url, media_type: "STORIES" })).id;
  } else if (images.length === 1) {
    creation = (await graph("POST", `/${st.igUserId}/media`, { image_url: images[0].url, caption: post.caption })).id;
  } else {
    const children = [];
    for (const im of images) children.push((await graph("POST", `/${st.igUserId}/media`, { image_url: im.url, is_carousel_item: "true" })).id);
    for (const id of children) await waitForContainer(id);
    creation = (await graph("POST", `/${st.igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption })).id;
  }
  await waitForContainer(creation);
  const r = await graph("POST", `/${st.igUserId}/media_publish`, { creation_id: creation });
  const info = await graph("GET", `/${r.id}`, { fields: "permalink" }).catch(() => ({}));
  return { ok: true, id: r.id, link: info.permalink || null };
}

// ---- Reels ----
async function waitForVideo(get, label) {
  for (let i = 0; i < 60; i++) {
    const s = await get();
    if (s === "FINISHED") return;
    if (s === "ERROR" || s === "EXPIRED") throw fail(502, `${label} couldn't process the video`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw fail(502, `${label} took too long to process the video`);
}

async function reelToInstagram(st, post, videoUrl) {
  const c = await graph("POST", `/${st.igUserId}/media`, { media_type: "REELS", video_url: videoUrl, caption: post.caption, share_to_feed: "true" });
  await waitForVideo(async () => (await graph("GET", `/${c.id}`, { fields: "status_code" })).status_code, "Instagram");
  const r = await graph("POST", `/${st.igUserId}/media_publish`, { creation_id: c.id });
  const info = await graph("GET", `/${r.id}`, { fields: "permalink" }).catch(() => ({}));
  return { ok: true, id: r.id, link: info.permalink || null };
}

// Facebook Reels: start an upload, let Facebook fetch the file, then publish it.
async function reelToFacebook(st, post, videoUrl) {
  const start = await graph("POST", `/${st.pageId}/video_reels`, { upload_phase: "start" });
  const up = await fetch(start.upload_url || `https://rupload.facebook.com/video-upload/v23.0/${start.video_id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${st.token}`, file_url: videoUrl },
    signal: AbortSignal.timeout(120000),
  });
  const upData = await up.json().catch(() => ({}));
  if (!up.ok || upData.success === false) throw fail(502, `Meta: ${upData.debug_info?.message || upData.error?.message || `upload HTTP ${up.status}`}`);
  await graph("POST", `/${st.pageId}/video_reels`, { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: post.caption });
  return { ok: true, id: start.video_id, link: `https://www.facebook.com/reel/${start.video_id}` };
}

// The frames of a Reel: the photo with the title, one per point, then "book now".
async function reelFrames(post) {
  const cards = require("./socialCards");
  const photo = await fetchPicture(post.imageUrl);
  const total = post.slides.length + 2;
  const frames = [{ buffer: await cards.reelCover(photo, post.title, post.colour), seconds: 3.5 }];
  for (const [i, sl] of post.slides.entries()) frames.push({ buffer: await cards.reelSlide({ ...sl, n: i + 2, total, colour: post.colour }), seconds: sl.text ? 3.5 : 2.5 });
  frames.push({ buffer: await cards.reelCta(post.colour), seconds: 3 });
  return frames;
}

const AI_VIDEOS_PER_DAY = Number(process.env.AI_VIDEOS_PER_DAY) || 1;
const istDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// The AI clip, branded — or null (no scene, no key, today's AI video done, or it failed: the
// reason is kept on the post).
async function aiReel(rowId, post, frames) {
  if (!post.videoScene || !aiVideo.configured()) return null;
  const today = istDay();
  const made = jsonStore.readAll(POSTS).filter((p) => p.videoKind === "ai" && p.at && istDay(Date.parse(p.at)) === today).length;
  if (made >= AI_VIDEOS_PER_DAY) return null;
  try {
    const cards = require("./socialCards");
    const clip = await aiVideo.makeClip({ scene: post.videoScene, topic: post.topic || post.title, category: post.category || "" });
    const out = await video.brandClip(clip, { logo: await cards.logoPng(230), title: await cards.reelTitleOverlay(post.title, post.colour), cta: frames[frames.length - 1].buffer }, path.join(DIR, "videos"));
    jsonStore.update(POSTS, rowId, { videoKind: "ai" });
    return out;
  } catch (e) {
    console.error("AI video failed, using Tikdum's frames:", e.message);
    jsonStore.update(POSTS, rowId, { videoError: String(e.message).slice(0, 300) });
    return null;
  }
}

// Runs after publish() has answered: makes the video, sends it everywhere, saves what happened.
async function finishReel(rowId, post) {
  const st = cfg();
  const results = {};
  let videoUrl = null;
  let cover = null;
  try {
    const frames = await reelFrames(post);
    cover = store(frames[0].buffer).url;
    const made = (await aiReel(rowId, post, frames)) || (await video.buildReel(frames, path.join(DIR, "videos")));
    videoUrl = `${IMAGE_BASE}/api/social-videos/${made.name}`;
    const send = {
      facebook: () => reelToFacebook(st, post, videoUrl),
      instagram: () => reelToInstagram(st, post, videoUrl),
      threads: () => threads.publishVideo(post, videoUrl),
      youtube: () => youtube.publish(post, made.file),
    };
    // One at a time: each waits for its own processing, and a slow one doesn't hold the others' errors.
    for (const c of post.channels) {
      try {
        results[c] = await send[c]();
      } catch (e) {
        results[c] = { ok: false, error: e.message };
      }
    }
  } catch (e) {
    for (const c of post.channels) results[c] = { ok: false, error: e.message };
  }
  const ok = Object.values(results).some((r) => r.ok);
  jsonStore.update(POSTS, rowId, { results, status: ok ? "published" : "failed", video: videoUrl, ...(cover ? { image: cover, images: [cover] } : {}), finishedAt: new Date().toISOString() });
}

// Publishes to each chosen channel; one failing doesn't stop the other. Returns the saved post.
async function publish(input, actor) {
  const post = cleanPost(input);
  const st = cfg();
  if (post.channels.includes("facebook") && !(st.pageId && st.token)) throw fail(400, "Facebook isn't connected (deploy/set-meta.sh)");
  if (post.channels.includes("instagram") && !(st.igUserId && st.token)) throw fail(400, "Instagram isn't connected (deploy/set-meta.sh)");
  if (post.channels.includes("threads") && !threads.configured()) throw fail(400, "Threads isn't connected (deploy/set-threads.sh)");
  if (post.channels.includes("youtube") && !youtube.configured()) throw fail(400, "YouTube isn't connected (deploy/set-youtube.sh)");
  if (post.format === "reel") {
    if (!(await video.available())) throw fail(400, "The server can't make videos yet (ffmpeg isn't installed — redeploy the server)");
    await fetchPicture(post.imageUrl); // a bad picture fails now, not in the background
    const row = jsonStore.insert(POSTS, {
      format: "reel",
      status: "publishing",
      caption: post.caption,
      title: post.title,
      slides: post.slides,
      topic: line(input.topic, 80) || null,
      fresh: input.fresh === true,
      videoKind: "frames",
      imageUrl: post.imageUrl,
      image: null,
      images: [],
      channels: post.channels,
      results: {},
      by: actor || "admin",
      at: new Date().toISOString(),
    });
    finishReel(row.id, { ...post, topic: line(input.topic, 80), category: line(input.category, 60) }).catch((e) => console.error("reel failed:", e.message));
    return row;
  }
  const images = await prepareFormat(post);
  const results = {};
  for (const [channel, send] of [["facebook", toFacebook], ["instagram", toInstagram], ["threads", (_, p, im) => threads.publish(p, im)]]) {
    if (!post.channels.includes(channel)) continue;
    try {
      results[channel] = await send(st, post, images);
    } catch (e) {
      results[channel] = { ok: false, error: e.message };
    }
  }
  const row = jsonStore.insert(POSTS, {
    format: post.format,
    caption: post.caption,
    title: post.title || null,
    slides: post.slides || null,
    storyLine: post.storyLine || null,
    topic: line(input.topic, 80) || null,
    fresh: input.fresh === true,
    imageUrl: post.imageUrl,
    image: images[0].url,
    images: images.map((i) => i.url),
    results,
    by: actor || "admin",
    at: new Date().toISOString(),
  });
  const ok = Object.values(results).filter((r) => r.ok).length;
  if (!ok) throw fail(502, Object.entries(results).map(([k, r]) => `${k}: ${r.error}`).join("; "));
  return row;
}

// ---- results ----
// Pure: one number to compare posts by — a comment or share counts for more than a like.
function score(m = {}) {
  const f = m.facebook || {};
  const i = m.instagram || {};
  const t = m.threads || {};
  const y = m.youtube || {};
  return (f.reactions || 0) + (i.likes || 0) + (t.likes || 0) + (y.likes || 0) + 3 * ((f.comments || 0) + (i.comments || 0) + (t.replies || 0) + (y.comments || 0)) + 4 * ((f.shares || 0) + (i.shares || 0) + (t.reposts || 0) + (t.quotes || 0)) + 2 * (i.saved || 0);
}

// Each number is asked for on its own: they need different Page permissions (reactions and
// shares: pages_read_engagement; comments: pages_read_user_content; reach: read_insights), and
// one that's refused shouldn't hide the others. Throws only when none could be read.
async function facebookMetrics(id) {
  const out = {};
  const refused = [];
  const ask = async (fields, take) => {
    try {
      take(await graph("GET", `/${id}`, { fields }));
    } catch (e) {
      refused.push(e.message);
    }
  };
  await ask("reactions.summary(total_count).limit(0)", (p) => (out.reactions = p.reactions?.summary?.total_count || 0));
  await ask("shares", (p) => (out.shares = p.shares?.count || 0));
  await ask("comments.summary(total_count).limit(0)", (p) => (out.comments = p.comments?.summary?.total_count || 0));
  if (!Object.keys(out).length) throw new Error(refused[0] || "Facebook gave no numbers");
  const ins = await graph("GET", `/${id}/insights`, { metric: "post_impressions_unique" }).catch(() => null);
  const reach = ins?.data?.[0]?.values?.[0]?.value;
  if (Number.isFinite(reach)) out.reach = reach;
  if (refused.length) out.refused = [...new Set(refused)].slice(0, 2);
  return out;
}

async function instagramMetrics(id) {
  const m = await graph("GET", `/${id}`, { fields: "like_count,comments_count" });
  const out = { likes: m.like_count || 0, comments: m.comments_count || 0 };
  const ins = await graph("GET", `/${id}/insights`, { metric: "reach,saved,shares" }).catch(() => null);
  for (const d of ins?.data || []) {
    const v = d.values?.[0]?.value ?? d.total_value?.value;
    if (Number.isFinite(v)) out[d.name] = v;
  }
  return out;
}

// Reads the results of the posts from the last 30 days (not Stories: they're gone after a day).
async function refreshMetrics({ now = Date.now() } = {}) {
  if (!cfg().token && !threads.configured() && !youtube.configured()) return { checked: 0 };
  await threads.renewIfDue(now);
  let checked = 0;
  for (const row of jsonStore.readAll(POSTS)) {
    if (row.format === "story" || now - Date.parse(row.at) > 30 * 24 * 3600 * 1000) continue;
    const metrics = { at: new Date(now).toISOString() };
    const errors = [];
    for (const [channel, read] of [["facebook", facebookMetrics], ["instagram", instagramMetrics], ["threads", threads.metrics], ["youtube", youtube.metrics]]) {
      const r = row.results?.[channel];
      if (!r?.ok || !r.id) continue;
      try {
        const { refused, ...numbers } = await read(r.id);
        metrics[channel] = numbers;
        for (const m of refused || []) errors.push(`${channel}: ${m}`.slice(0, 160));
      } catch (e) {
        errors.push(`${channel}: ${e.message}`.slice(0, 160));
      }
    }
    if (errors.length) metrics.errors = errors;
    metrics.score = score(metrics);
    jsonStore.update(POSTS, row.id, { metrics });
    checked++;
  }
  return { checked };
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

module.exports = { status, publish, listPosts, serveImage, serveVideo, imageLibrary, cleanPost, prepareImage, refreshMetrics, score, FORMATS, _finishReel: finishReel };
