// YouTube Shorts for social.js: the same 9:16 Reel uploaded to Tikdum's YouTube channel (a video
// up to 60 s, vertical, with #Shorts in the title, becomes a Short). YouTube Data API v3 with a
// refresh token for the channel's Google account, saved by deploy/set-youtube.sh
// (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN).
//
// Google keeps videos uploaded through the API PRIVATE until the Google Cloud project passes
// YouTube's API audit; until then set YOUTUBE_PRIVACY=private (the default is "public", which
// Google turns into private anyway) and publish them from YouTube Studio, or apply for the audit.
const fs = require("fs");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const fail = (status, message) => Object.assign(new Error(message), { status });

const cfg = () => ({
  id: String(process.env.YOUTUBE_CLIENT_ID || "").trim(),
  secret: String(process.env.YOUTUBE_CLIENT_SECRET || "").trim(),
  refresh: String(process.env.YOUTUBE_REFRESH_TOKEN || "").trim(),
  privacy: ["public", "unlisted", "private"].includes(process.env.YOUTUBE_PRIVACY) ? process.env.YOUTUBE_PRIVACY : "public",
});
const configured = () => {
  const c = cfg();
  return Boolean(c.id && c.secret && c.refresh);
};

let access = { token: null, until: 0 };
async function accessToken() {
  if (access.token && Date.now() < access.until - 60000) return access.token;
  const c = cfg();
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: c.refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw fail(502, `YouTube sign-in: ${d.error_description || d.error || `HTTP ${r.status}`}`);
  access = { token: d.access_token, until: Date.now() + (d.expires_in || 3600) * 1000 };
  return access.token;
}

// Pure: the video's title and description. Exported for tests.
function metadata(post) {
  const base = String(post.title || post.topic || String(post.caption || "").split("\n")[0] || "Home care tip").replace(/[<>]/g, "").trim();
  const title = `${base.slice(0, 100 - " #Shorts".length).trim()} #Shorts`;
  const caption = String(post.caption || "").replace(/[<>]/g, "").trim();
  const description = `${caption}\n\nBook verified home services in Jammu & Kashmir: https://tikdum.com`.slice(0, 4900);
  const tags = [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1)))].slice(0, 12);
  return { title, description, tags };
}

// Uploads the video file. Returns { ok, id, link, privacy }.
async function publish(post, videoFile) {
  const c = cfg();
  const meta = metadata(post);
  const token = await accessToken();
  const size = fs.statSync(videoFile).size;
  const start = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify({ snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: "26" }, status: { privacyStatus: c.privacy, selfDeclaredMadeForKids: false } }),
    signal: AbortSignal.timeout(30000),
  });
  const where = start.headers.get("location");
  if (!start.ok || !where) {
    const d = await start.json().catch(() => ({}));
    throw fail(502, `YouTube: ${d.error?.message || `HTTP ${start.status}`}`);
  }
  const put = await fetch(where, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(size) }, body: fs.readFileSync(videoFile), signal: AbortSignal.timeout(180000) });
  const v = await put.json().catch(() => ({}));
  if (!put.ok || !v.id) throw fail(502, `YouTube: ${v.error?.message || `HTTP ${put.status}`}`);
  return { ok: true, id: v.id, link: `https://youtube.com/shorts/${v.id}`, privacy: v.status?.privacyStatus || c.privacy };
}

// Views, likes and comments of one video (part of the channel's own data, same sign-in).
async function metrics(id) {
  const token = await accessToken();
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(502, `YouTube: ${d.error?.message || `HTTP ${r.status}`}`);
  const s = d.items?.[0]?.statistics || {};
  return { views: Number(s.viewCount) || 0, likes: Number(s.likeCount) || 0, comments: Number(s.commentCount) || 0 };
}

module.exports = { configured, publish, metrics, metadata };
