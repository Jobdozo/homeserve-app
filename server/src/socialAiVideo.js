// AI video for the daily Reel (social.js): a short, real-looking clip with sound — a Tikdum
// professional at work in an Indian home — made by Google's Gemini video model (Gemini Omni Flash,
// GEMINI_VIDEO_MODEL) with the server's Gemini key. socialVideo.js then puts the Tikdum logo and the
// title on it and adds the "book now" card. About $0.10 a second of video (720p), paid tier only;
// one Reel a day. If it fails for any reason the Reel is made from Tikdum's own frames instead.
//
// The prompt is built here, not by the agent: the agent describes the scene, and these rules
// (uniform, no text or logos, who may appear) always apply — the same ones as Image Studio's.
const imageStudio = require("./imageStudio");

const API = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const key = () => String(process.env.GEMINI_API_KEY || "").trim();
const model = () => String(process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.1-flash").trim();
const fail = (status, message) => Object.assign(new Error(message), { status });
const configured = () => Boolean(key());

// Pure: the full prompt for one clip. Exported for tests.
function promptFor({ scene, topic = "", category = "" }) {
  const found = imageStudio.audienceFor({ name: topic, category });
  const sceneText = String(scene || "").replace(/[₹$]/g, "").replace(/\s+/g, " ").trim().slice(0, 700);
  const who = found.people
    ? `The professional is ${imageStudio.personLine(found.audience)}`
    : "No people and no body parts in the video: show the products, tools and the finished result.";
  return [
    "A realistic, bright, 9-second vertical (9:16) video for a home-services app in Jammu & Kashmir, India, shot like a premium commercial: soft natural daylight, warm and trustworthy mood, steady smooth camera moves.",
    `What happens: ${sceneText || `a professional doing ${topic || "a home service"} carefully in a tidy Indian home`}.`,
    who,
    "Sound: the natural sounds of the work and a light, upbeat background music; no talking, no narration.",
    "Absolutely no text, captions, subtitles, logos, brand names, watermarks or readable signs anywhere in the video. Natural hands and faces, no distortion.",
  ].join(" ");
}

// Pure: the video from an Interactions API answer — { data } (base64) or { uri }, or null.
function videoFrom(answer) {
  for (const step of answer?.steps || []) {
    if (step.type !== "model_output") continue;
    for (const c of step.content || []) if (c.type === "video" && (c.data || c.uri)) return { data: c.data || null, uri: c.uri || null };
  }
  return null;
}

async function download(uri) {
  // A Files API file: wait until it's ready, then fetch it.
  const id = (/files\/([^/:?]+)/.exec(uri) || [])[1];
  if (id) {
    for (let i = 0; i < 60; i++) {
      const f = await fetch(`${API}/files/${id}?key=${encodeURIComponent(key())}`, { signal: AbortSignal.timeout(20000) }).then((r) => r.json()).catch(() => ({}));
      if (f.state === "ACTIVE") break;
      if (f.state === "FAILED") throw fail(502, "Gemini couldn't finish the video file");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  const url = id ? `${API}/files/${id}:download?alt=media&key=${encodeURIComponent(key())}` : `${uri}${uri.includes("?") ? "&" : "?"}key=${encodeURIComponent(key())}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw fail(502, `Couldn't download the video (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// One clip. Returns an MP4 Buffer.
async function makeClip({ scene, topic, category }) {
  if (!configured()) throw fail(400, "No Gemini key on the server");
  const r = await fetch(`${API}/interactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      model: model(),
      input: promptFor({ scene, topic, category }),
      response_format: { type: "video", aspect_ratio: "9:16", resolution: "720p", delivery: "uri" },
      store: false,
    }),
    signal: AbortSignal.timeout(8 * 60 * 1000),
  });
  const answer = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(r.status === 429 ? 429 : 502, `Gemini video: ${answer.error?.message || `HTTP ${r.status}`}`.slice(0, 300));
  const v = videoFrom(answer);
  if (!v) throw fail(502, "Gemini didn't return a video");
  return v.data ? Buffer.from(v.data, "base64") : download(v.uri);
}

module.exports = { configured, makeClip, promptFor, videoFrom };
