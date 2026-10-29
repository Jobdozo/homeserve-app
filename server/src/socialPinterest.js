// Pinterest for social.js: every picture post becomes a Pin and every Reel a video Pin, on one
// Tikdum board, each linking to tikdum.com (the article or page named in the caption, else the
// Jammu page) so people who save it can book. Pinterest API v5.
//
// Setup: an app at developers.pinterest.com with the redirect URI
// https://api.tikdum.com/api/social/pinterest/callback; deploy/set-pinterest.sh saves its
// PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET. Then Admin → Social Media → Connect Pinterest
// signs in with Tikdum's Pinterest business account; the tokens are kept in the server's records
// and renewed here before they run out (an access token lasts 30 days), so nobody signs in again.
// While the app only has Pinterest's "Trial access", Pins can only be made in its sandbox
// (PINTEREST_API=https://api-sandbox.pinterest.com/v5) where nobody else sees them; posting for
// real needs "Standard access" (apply in the app's settings).
const fs = require("fs");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const API = () => (process.env.PINTEREST_API || "https://api.pinterest.com/v5").replace(/\/$/, "");
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const SCOPES = "boards:read,boards:write,pins:read,pins:write,user_accounts:read";
const AUTH = "socialPinterestAuth";
const STATES = "socialPinterestStates";
const BOARD_NAME = "Home Care Tips by Tikdum";
const RENEW_BEFORE_MS = 5 * 24 * 3600 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });

const app = () => ({ id: String(process.env.PINTEREST_CLIENT_ID || "").trim(), secret: String(process.env.PINTEREST_CLIENT_SECRET || "").trim() });
const redirectUri = () => `${(process.env.SOCIAL_IMAGE_BASE || "https://api.tikdum.com").replace(/\/$/, "")}/api/social/pinterest/callback`;
const saved = () => jsonStore.readAll(AUTH).find((r) => r.id === "auth") || null;
const appReady = () => Boolean(app().id && app().secret);
const configured = () => Boolean(appReady() && saved()?.refreshToken);

function save(patch) {
  const s = saved();
  return s ? jsonStore.update(AUTH, "auth", patch) : jsonStore.insert(AUTH, { id: "auth", ...patch });
}

// ---- signing in (Admin → Social Media → Connect Pinterest) ----
// A one-time state ties Pinterest's answer to the admin who started it (10 minutes).
function connectUrl(actor) {
  if (!appReady()) throw fail(400, "Pinterest isn't set up on the server yet (deploy/set-pinterest.sh)");
  const state = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  for (const old of jsonStore.readAll(STATES)) if (now - Date.parse(old.at) > 10 * 60 * 1000) jsonStore.remove(STATES, old.id);
  jsonStore.insert(STATES, { id: state, by: actor || null, at: new Date(now).toISOString() });
  return `${AUTHORIZE_URL}?${new URLSearchParams({ client_id: app().id, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES, state })}`;
}

async function tokenRequest(params) {
  const { id, secret } = app();
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw fail(502, `Pinterest sign-in: ${d.message || d.error_description || d.error || `HTTP ${r.status}`}`);
  return d;
}
const tokenFields = (d, now = Date.now()) => ({
  accessToken: d.access_token,
  accessUntil: new Date(now + (Number(d.expires_in) || 30 * 86400) * 1000).toISOString(),
  ...(d.refresh_token ? { refreshToken: d.refresh_token, refreshUntil: d.refresh_token_expires_in ? new Date(now + Number(d.refresh_token_expires_in) * 1000).toISOString() : null } : {}),
  renewedAt: new Date(now).toISOString(),
});

// Pinterest's redirect: checks the state, trades the code for tokens, notes the account name.
async function finishConnect({ code, state, error }) {
  const st = state && jsonStore.readAll(STATES).find((s) => s.id === String(state));
  if (st) jsonStore.remove(STATES, st.id);
  if (error) throw fail(400, `Pinterest said: ${error}`);
  if (!st || Date.now() - Date.parse(st.at) > 10 * 60 * 1000) throw fail(400, "That sign-in link has expired — press Connect Pinterest again");
  if (!code) throw fail(400, "Pinterest didn't send a sign-in code");
  const d = await tokenRequest({ grant_type: "authorization_code", code: String(code), redirect_uri: redirectUri(), continuous_refresh: "true" });
  save({ ...tokenFields(d), boardId: null, connectedBy: st.by, connectedAt: new Date().toISOString() });
  const me = await call("GET", "/user_account").catch(() => ({}));
  save({ username: me.username || null, accountType: me.account_type || null });
  return { username: me.username || null };
}

// Renews the access token a few days before it runs out (refresh tokens are renewed with it).
async function accessToken(now = Date.now()) {
  const s = saved();
  if (!s?.refreshToken) throw fail(400, "Pinterest isn't connected (Admin → Social Media → Connect Pinterest)");
  if (s.accessToken && Date.parse(s.accessUntil) - now > RENEW_BEFORE_MS) return s.accessToken;
  const d = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refreshToken, continuous_refresh: "true" });
  return save(tokenFields(d, now)).accessToken;
}

async function call(method, pathname, body) {
  const r = await fetch(`${API()}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(502, `Pinterest: ${d.message || `HTTP ${r.status}`}`);
  return d;
}

// The board Pins go to: PINTEREST_BOARD_ID, else Tikdum's own board (found or made once).
async function boardId() {
  if (process.env.PINTEREST_BOARD_ID) return String(process.env.PINTEREST_BOARD_ID).trim();
  const s = saved();
  if (s?.boardId) return s.boardId;
  const list = await call("GET", "/boards?page_size=100");
  let board = (list.items || []).find((b) => String(b.name || "").toLowerCase() === BOARD_NAME.toLowerCase());
  if (!board) board = await call("POST", "/boards", { name: BOARD_NAME, description: "Cleaning, repair and home-care tips from Tikdum — book verified home services in Jammu & Kashmir on tikdum.com", privacy: "PUBLIC" });
  save({ boardId: board.id });
  return board.id;
}

// Pure: the Pin's title, description and link. Exported for tests.
function pinFor(post) {
  const caption = String(post.caption || "").trim();
  const firstLine = caption.split("\n").find((l) => l.trim()) || "";
  const title = String(post.title || firstLine || "Home care tip").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);
  let description = caption.replace(/\n{3,}/g, "\n\n");
  if (description.length > 500) {
    const cut = description.slice(0, 497);
    description = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 400))}…`;
  }
  const own = (caption.match(/https:\/\/(www\.)?tikdum\.com\/[^\s)]*/i) || [])[0];
  const page = own ? own.replace(/[.,!?]+$/, "") : "https://tikdum.com/jammu";
  const link = `${page}${page.includes("?") ? "&" : "?"}utm_source=pinterest&utm_medium=social`;
  return { title, description, link, alt_text: title };
}
const pinLink = (id) => `https://www.pinterest.com/pin/${id}/`;

// A picture Pin (a carousel's first picture: Pins are one picture each).
async function publish(post, images) {
  const pin = await call("POST", "/pins", { board_id: await boardId(), ...pinFor(post), media_source: { source_type: "image_url", url: images[0].url } });
  return { ok: true, id: pin.id, link: pinLink(pin.id) };
}

// A video Pin: register the upload, send the file to Pinterest's storage, wait for it to be
// processed, then make the Pin with the Reel's cover picture.
async function publishVideo(post, videoFile, coverUrl) {
  const media = await call("POST", "/media", { media_type: "video" });
  const form = new FormData();
  for (const [k, v] of Object.entries(media.upload_parameters || {})) form.append(k, v);
  form.append("file", new Blob([fs.readFileSync(videoFile)], { type: "video/mp4" }), "reel.mp4");
  const up = await fetch(media.upload_url, { method: "POST", body: form, signal: AbortSignal.timeout(180000) });
  if (!up.ok) throw fail(502, `Pinterest: video upload HTTP ${up.status}`);
  for (let i = 0; ; i++) {
    const s = await call("GET", `/media/${encodeURIComponent(media.media_id)}`);
    if (s.status === "succeeded") break;
    if (s.status === "failed") throw fail(502, "Pinterest couldn't process the video");
    if (i >= 60) throw fail(502, "Pinterest took too long to process the video");
    await new Promise((r) => setTimeout(r, Number(process.env.PINTEREST_POLL_MS) || 5000));
  }
  const source = { source_type: "video_id", media_id: media.media_id, ...(coverUrl ? { cover_image_url: coverUrl } : { cover_image_key_frame_time: 1 }) };
  const pin = await call("POST", "/pins", { board_id: await boardId(), ...pinFor(post), media_source: source });
  return { ok: true, id: pin.id, link: pinLink(pin.id) };
}

// Saves, clicks and impressions of one Pin over the last 30 days (Pinterest's own numbers).
async function metrics(id, now = Date.now()) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const q = new URLSearchParams({ start_date: day(now - 30 * 86400000), end_date: day(now), metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK" });
  const d = await call("GET", `/pins/${encodeURIComponent(id)}/analytics?${q}`);
  const all = d.all?.summary_metrics || {};
  return { impressions: all.IMPRESSION || 0, saves: all.SAVE || 0, clicks: all.PIN_CLICK || 0, outboundClicks: all.OUTBOUND_CLICK || 0 };
}

function status() {
  const s = saved();
  return { appReady: appReady(), connected: configured(), username: s?.username || null, redirectUri: redirectUri() };
}

module.exports = { configured, status, connectUrl, finishConnect, publish, publishVideo, metrics, pinFor, accessToken, BOARD_NAME };
