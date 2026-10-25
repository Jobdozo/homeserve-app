// Video Studio (Admin → Video Studio): real-looking AI videos for Tikdum — one 9-second scene
// ("short") or a 3-scene story of about 30 seconds ("story": the problem, a Tikdum professional at
// work, the happy result), upright (Reels, Shorts) or wide (YouTube, the website), with a Hinglish
// or English voice-over, subtitles, the logo, the title and the "book now" card.
//
// A video goes through:
//   script  — waiting for the Video Studio Agent (agents/src/videoStudio.js) to write its scenes,
//             voice lines and caption (a person can write or edit them too)
//   queued  — waiting to be made; at most config.perDay are started a day (each costs ~$1 a scene)
//   making  — the server is making it: one AI clip per scene (socialAiVideo.js), a voice line per
//             scene (socialTts.js), then everything put together (socialVideo.js compose)
//   ready   — made; a person previews it and publishes it (social.publishVideo), remakes or deletes
//   failed / published
// One video is made at a time (makeNext(), every minute from index.js). Ready-made sets add one
// video per service category, or per festival coming up in the marketing calendar.
const crypto = require("crypto");
const path = require("path");
const jsonStore = require("./jsonStore");

const JOBS = "videoJobs";
const CONFIG = "videoStudioConfig";
const SCENES = { short: 1, story: 3 };
const USD_INR = 85;
const PER_SCENE_USD = 0.9; // ~9 s of 720p video at ~$0.10/s
const fail = (status, message) => Object.assign(new Error(message), { status });
const oneLine = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const istDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const now = () => new Date().toISOString();

const DEFAULTS = { perDay: 2, voice: "hinglish", voiceGender: "female", subtitles: true };
function getConfig() {
  const row = jsonStore.readAll(CONFIG)[0] || {};
  return {
    perDay: Math.min(10, Math.max(1, Number(row.perDay) || DEFAULTS.perDay)),
    voice: ["hinglish", "english", "none"].includes(row.voice) ? row.voice : DEFAULTS.voice,
    voiceGender: ["female", "male"].includes(row.voiceGender) ? row.voiceGender : DEFAULTS.voiceGender,
    subtitles: row.subtitles !== false,
  };
}
function setConfig(patch, actor) {
  const next = { ...getConfig() };
  if (patch.perDay !== undefined) next.perDay = Math.min(10, Math.max(1, Math.round(Number(patch.perDay)) || 1));
  if (["hinglish", "english", "none"].includes(patch.voice)) next.voice = patch.voice;
  if (["female", "male"].includes(patch.voiceGender)) next.voiceGender = patch.voiceGender;
  if (patch.subtitles !== undefined) next.subtitles = patch.subtitles !== false;
  jsonStore.writeAll(CONFIG, [{ id: "config", ...next, updatedAt: now(), updatedBy: actor || null }]);
  return getConfig();
}

const estimate = (length) => Math.round(SCENES[length] * PER_SCENE_USD * USD_INR);

function addJob(input, actor, { set = null } = {}) {
  const cfg = getConfig();
  const idea = oneLine(input.idea, 400);
  if (idea.length < 5) throw fail(400, "Describe the video you want (a few words at least)");
  const length = input.length === "short" ? "short" : "story";
  const row = {
    id: `vid_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    idea,
    length,
    aspect: input.aspect === "wide" ? "wide" : "upright",
    voice: ["hinglish", "english", "none"].includes(input.voice) ? input.voice : cfg.voice,
    subtitles: input.subtitles === undefined ? cfg.subtitles : input.subtitles !== false,
    category: oneLine(input.category, 60) || null,
    set,
    status: "script",
    script: null,
    estimateInr: estimate(length),
    by: actor || null,
    createdAt: now(),
    updatedAt: now(),
  };
  return jsonStore.insert(JOBS, row);
}

// Pure: checks a script for a job; returns the cleaned script or throws. Exported for tests.
function cleanScript(job, input) {
  const s = input || {};
  const title = oneLine(s.title, 70);
  if (title.length < 4) throw fail(400, "The script needs a title");
  const caption = String(s.caption || "").trim().slice(0, 2200);
  if (caption.length < 20) throw fail(400, "The script needs a caption");
  const want = SCENES[job.length];
  const scenes = (Array.isArray(s.scenes) ? s.scenes : []).map((x) => ({ video: oneLine(x?.video, 700), line: oneLine(x?.line, 140) })).filter((x) => x.video.length >= 20);
  if (scenes.length < want) throw fail(400, `The script needs ${want} scene${want === 1 ? "" : "s"} with a description each`);
  if (job.voice !== "none" || job.subtitles) {
    if (scenes.slice(0, want).some((x) => !x.line)) throw fail(400, "Every scene needs its voice / subtitle line");
    if (scenes.slice(0, want).some((x) => /[ऀ-ॿ]/.test(x.line))) throw fail(400, "Write the lines in Latin letters (Hinglish or English)");
  }
  return { title, caption, threads: String(s.threads || "").trim().slice(0, 500), scenes: scenes.slice(0, want) };
}

function setScript(id, input, actor) {
  const job = getJob(id);
  if (!["script", "failed", "ready"].includes(job.status)) throw fail(409, `This video is ${job.status}`);
  return jsonStore.update(JOBS, id, { script: cleanScript(job, input), status: "queued", error: null, scriptBy: actor || null, updatedAt: now() });
}

function getJob(id) {
  const j = jsonStore.readAll(JOBS).find((r) => r.id === id);
  if (!j) throw fail(404, "Video not found");
  return j;
}

function list({ status } = {}) {
  return jsonStore
    .readAll(JOBS)
    .filter((j) => !status || j.status === status)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

const startedToday = () => jsonStore.readAll(JOBS).filter((j) => j.startedAt && istDay(Date.parse(j.startedAt)) === istDay()).length;

function summary() {
  const cfg = getConfig();
  const jobs = list();
  return { config: cfg, startedToday: startedToday(), jobs: jobs.slice(0, 100), estimates: { short: estimate("short"), story: estimate("story") } };
}

// "Remake": with a new script (the agent writes it again) or the same one.
function remake(id, { newScript = false } = {}, actor) {
  const job = getJob(id);
  if (job.status === "making") throw fail(409, "It's being made right now");
  return jsonStore.update(JOBS, id, { status: newScript || !job.script ? "script" : "queued", script: newScript ? null : job.script, error: null, video: null, updatedAt: now(), remadeBy: actor || null });
}

function remove(id) {
  const job = getJob(id);
  if (job.status === "making") throw fail(409, "It's being made right now");
  return jsonStore.remove(JOBS, id);
}

// Ready-made sets: one video per active category, or per festival coming up.
function addSet(kind, { categories = [], calendar = [], aspect = "upright", length = "story" } = {}, actor) {
  const open = new Set(list().filter((j) => !["published", "failed"].includes(j.status) && j.set).map((j) => j.set));
  const made = [];
  if (kind === "categories") {
    for (const c of categories.filter((x) => x.active !== false).slice(0, 20)) {
      const set = `category:${c.id}:${aspect}`;
      if (open.has(set)) continue;
      made.push(addJob({ idea: `An advert for Tikdum's ${c.name} service: why book a verified professional, what they do, the happy result.`, length, aspect, category: c.name }, actor, { set }));
    }
  } else if (kind === "festivals") {
    for (const e of calendar.slice(0, 10)) {
      const set = `festival:${e.name}:${e.date}:${aspect}`;
      if (open.has(set)) continue;
      made.push(addJob({ idea: `A ${e.name} video (${e.date}): festive greeting from Tikdum and the home services people need for it — ${e.ideas || "cleaning and repairs before the festival"}.`, length, aspect }, actor, { set }));
    }
  } else throw fail(400, "Choose categories or festivals");
  return made;
}

// ---- making ----
let busy = false;

// Makes the oldest queued video if today's limit allows. deps: { categories, aiVideo, tts, video, cards, imageStyle, publicBase, dir }.
async function makeNext(deps) {
  if (busy) return null;
  const cfg = getConfig();
  const next = list({ status: "queued" }).reverse()[0];
  if (!next) return null;
  if (startedToday() >= cfg.perDay) return null; // waits for tomorrow
  busy = true;
  jsonStore.update(JOBS, next.id, { status: "making", startedAt: now(), error: null, updatedAt: now() });
  try {
    const job = getJob(next.id);
    const wide = job.aspect === "wide";
    const cats = deps.categories || [];
    const cat = cats.find((c) => c.name?.toLowerCase() === String(job.category || "").toLowerCase());
    const colour = cat ? deps.imageStyle.colourFor(cat.id, cats.map((c) => c.id)) : null;
    const clips = [];
    for (const sc of job.script.scenes) clips.push(await deps.aiVideo.makeClip({ scene: sc.video, topic: job.script.title, category: job.category || "", wide }));
    const voices = [];
    if (job.voice !== "none") {
      for (const sc of job.script.scenes) voices.push(await deps.tts.speak(sc.line, { language: job.voice, voice: cfg.voiceGender }).catch((e) => (console.error("voice line failed:", e.message), null)));
    }
    const subtitles = job.subtitles ? await Promise.all(job.script.scenes.map((sc) => deps.cards.subtitlePng(sc.line, wide ? 1920 : 1080))) : [];
    const made = await deps.video.compose(
      {
        clips,
        logo: await deps.cards.logoPng(wide ? 260 : 230),
        title: wide ? await deps.cards.wideTitleOverlay(job.script.title, colour) : await deps.cards.reelTitleOverlay(job.script.title, colour, { top: true }),
        cta: wide ? await deps.cards.wideCta(colour) : await deps.cards.reelCta(colour),
        subtitles,
        voices,
      },
      deps.dir,
      { wide }
    );
    const cover = await deps.video.thumbnail(made.file, path.join(deps.dir, `${made.name.replace(/\.mp4$/, "")}.jpg`)).catch(() => null);
    return jsonStore.update(JOBS, job.id, {
      status: "ready",
      video: { name: made.name, url: `${deps.publicBase}/api/social-videos/${made.name}`, seconds: Math.round(made.seconds) },
      cover: cover ? `${deps.publicBase}/api/social-videos/${path.basename(cover)}` : null,
      voiceMissing: job.voice !== "none" && voices.some((v) => !v),
      madeAt: now(),
      updatedAt: now(),
    });
  } catch (e) {
    console.error("Video Studio failed:", e.message);
    return jsonStore.update(JOBS, next.id, { status: "failed", error: String(e.message).slice(0, 300), updatedAt: now() });
  } finally {
    busy = false;
  }
}

// A person publishes a ready video (social.publishVideo sends it in the background).
async function publish(id, { channels, caption }, actor, social) {
  const job = getJob(id);
  if (job.status !== "ready" && job.status !== "published") throw fail(409, "Only a ready video can be published");
  const row = await social.publishVideo(
    { name: job.video.name, cover: job.cover, caption: String(caption || job.script.caption), title: job.script.title, threadsText: job.script.threads, channels, wide: job.aspect === "wide", topic: job.script.title },
    actor
  );
  return jsonStore.update(JOBS, id, { status: "published", postId: row.id, publishedAt: now(), publishedBy: actor || null, channels, updatedAt: now() });
}

module.exports = { getConfig, setConfig, addJob, cleanScript, setScript, getJob, list, summary, remake, remove, addSet, makeNext, publish, estimate, SCENES };
