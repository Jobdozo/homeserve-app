// Reels and YouTube Shorts for social.js: a 9:16 video made from Tikdum's own frames
// (socialCards.js reelCover / reelSlide / reelCta), each shown for a few seconds with a slow zoom,
// with a silent sound track (Instagram and YouTube handle a video with no audio stream badly).
// Made with ffmpeg (installed in the server image; FFMPEG_PATH to point elsewhere). The videos
// are served from /api/social-videos/<name>.mp4 so Meta can fetch them.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const FPS = 30;
const ffmpeg = () => process.env.FFMPEG_PATH || "ffmpeg";
const fail = (status, message) => Object.assign(new Error(message), { status });

function run(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", (e) => (clearTimeout(timer), reject(fail(500, e.code === "ENOENT" ? "ffmpeg isn't installed on the server" : e.message))));
    p.on("close", (code) => (clearTimeout(timer), code === 0 ? resolve() : reject(fail(500, `ffmpeg failed: ${err.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 300)}`))));
  });
}

let checked = null;
async function available() {
  if (checked === null) checked = await run(["-hide_banner", "-version"], 10000).then(() => true, () => false);
  return checked;
}

// Pure: the ffmpeg arguments for frames shown `seconds` each, in order. Exported for tests.
function reelArgs(files, seconds, out) {
  const total = seconds.reduce((a, b) => a + b, 0);
  const args = ["-hide_banner", "-y"];
  for (const f of files) args.push("-i", f);
  args.push("-f", "lavfi", "-t", String(total), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const parts = files.map((_, i) => {
    const frames = Math.round(seconds[i] * FPS);
    // Scaled up first so the zoom doesn't judder; a short fade in from black between frames.
    return `[${i}:v]scale=1296:2304,zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${FPS},setsar=1,fade=t=in:st=0:d=0.25[v${i}]`;
  });
  const filter = `${parts.join(";")};${files.map((_, i) => `[v${i}]`).join("")}concat=n=${files.length}:v=1:a=0,format=yuv420p[v]`;
  args.push("-filter_complex", filter, "-map", "[v]", "-map", `${files.length}:a`);
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", String(FPS), "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", out);
  return args;
}

// frames: [{ buffer (JPEG), seconds }]. Writes the video into dir and returns { file, name, seconds }.
async function buildReel(frames, dir) {
  if (!frames.length) throw fail(400, "A Reel needs frames");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-reel-"));
  try {
    const files = frames.map((f, i) => {
      const file = path.join(work, `f${i}.jpg`);
      fs.writeFileSync(file, f.buffer);
      return file;
    });
    const out = path.join(work, "reel.mp4");
    await run(reelArgs(files, frames.map((f) => f.seconds), out));
    const data = fs.readFileSync(out);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.createHash("sha256").update(data).digest("hex").slice(0, 32)}.mp4`;
    fs.writeFileSync(path.join(dir, name), data);
    return { file: path.join(dir, name), name, seconds: frames.reduce((a, f) => a + f.seconds, 0) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// What ffmpeg says about a file: its length in seconds and whether it has sound.
function probe(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg(), ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let out = "";
    p.stderr.on("data", (d) => (out += d));
    p.on("error", () => resolve({ seconds: 0, audio: false }));
    p.on("close", () => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
      resolve({ seconds: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0, audio: /Stream #\d+:\d+.*Audio:/.test(out) });
    });
  });
}

// Pure: ffmpeg arguments that brand an AI clip — cropped to 9:16, the logo throughout, the title
// for the first 3.5 s — and add the "book now" card with silence after it. Exported for tests.
function brandArgs({ clip, logo, title, cta, out, clipSeconds, clipAudio, ctaSeconds = 3 }) {
  const args = ["-hide_banner", "-y", "-i", clip, "-i", logo, "-i", title, "-loop", "1", "-t", String(ctaSeconds), "-i", cta];
  args.push("-f", "lavfi", "-t", String(ctaSeconds), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  if (!clipAudio) args.push("-f", "lavfi", "-t", String(clipSeconds), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const clipA = clipAudio ? "[0:a]aresample=44100,aformat=channel_layouts=stereo[a0]" : "[5:a]anull[a0]";
  const filter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=${FPS}[c]`,
    `[c][1:v]overlay=70:150:enable='lt(t,${Number(clipSeconds).toFixed(2)})'[c1]`,
    "[c1][2:v]overlay=0:H-h-430:enable='between(t,0,3.5)',format=yuv420p[m]",
    `[3:v]scale=1080:1920,setsar=1,fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.3[e]`,
    clipA,
    "[m][a0][e][4:a]concat=n=2:v=1:a=1[v][a]",
  ].join(";");
  args.push("-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-r", String(FPS), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out);
  return args;
}

// An AI clip (Buffer) made into a Tikdum Reel. parts: { logo, title, cta } image Buffers.
async function brandClip(clipBuffer, parts, dir) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-reel-"));
  try {
    const file = (n, b) => (fs.writeFileSync(path.join(work, n), b), path.join(work, n));
    const clip = file("clip.mp4", clipBuffer);
    const info = await probe(clip);
    if (!info.seconds) throw fail(502, "The AI video couldn't be read");
    const out = path.join(work, "reel.mp4");
    await run(brandArgs({ clip, logo: file("logo.png", parts.logo), title: file("title.png", parts.title), cta: file("cta.jpg", parts.cta), out, clipSeconds: info.seconds, clipAudio: info.audio }));
    const data = fs.readFileSync(out);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.createHash("sha256").update(data).digest("hex").slice(0, 32)}.mp4`;
    fs.writeFileSync(path.join(dir, name), data);
    return { file: path.join(dir, name), name, seconds: info.seconds + 3 };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ---- Video Studio: several AI clips, subtitles and a voice-over ----

// Pure: ffmpeg arguments for the finished video — the clips one after another (cropped to the
// frame, each fading in), the logo throughout, the title over the first 3.5 s, each scene's
// subtitle during that scene, the clips' own sound (quieter under a voice-over) with the voice
// lines placed at their scene's start, then the "book now" card. Exported for tests.
// clips: [{ file, seconds, audio }]; subtitles: [{ file, start, end }]; voices: [{ file, start }].
function composeArgs({ clips, logo, title, subtitles = [], voices = [], cta, ctaSeconds = 3, wide = false, out }) {
  const W = wide ? 1920 : 1080;
  const H = wide ? 1080 : 1920;
  const args = ["-hide_banner", "-y"];
  const input = (...a) => (args.push(...a), args.filter((x) => x === "-i").length - 1);
  const clipIn = clips.map((c) => input("-i", c.file));
  const logoIn = input("-i", logo);
  const titleIn = input("-i", title);
  const subIn = subtitles.map((s) => input("-i", s.file));
  const ctaIn = input("-loop", "1", "-t", String(ctaSeconds), "-i", cta);
  const total = clips.reduce((a, c) => a + c.seconds, 0);
  const silenceIn = input("-f", "lavfi", "-t", String(total + ctaSeconds), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const voiceIn = voices.map((v) => input("-i", v.file));

  const f = [];
  clips.forEach((c, i) => f.push(`[${clipIn[i]}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.3[c${i}]`));
  f.push(`[${ctaIn}:v]scale=${W}:${H},setsar=1,fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.3[cta]`);
  f.push(`${clips.map((_, i) => `[c${i}]`).join("")}[cta]concat=n=${clips.length + 1}:v=1:a=0[base]`);
  let v = "base";
  // The title along the top at first; the logo above it, over the clips only (the end card has its own).
  f.push(`[${v}][${titleIn}:v]overlay=0:${wide ? "0" : "230"}:enable='between(t,0,3.5)'[o0]`);
  v = "o0";
  f.push(`[${v}][${logoIn}:v]overlay=${wide ? "70:50" : "70:150"}:enable='lt(t,${total.toFixed(2)})'[o1]`);
  v = "o1";
  subtitles.forEach((s, i) => {
    // Under the title band's place on an upright video, clear of Instagram's buttons.
    f.push(`[${v}][${subIn[i]}:v]overlay=(W-w)/2:${wide ? "H-h-70" : "H-h-560"}:enable='between(t,${s.start.toFixed(2)},${s.end.toFixed(2)})'[s${i}]`);
    v = `s${i}`;
  });
  f.push(`[${v}]format=yuv420p[v]`);

  // Sound: each clip's own sound (or silence), then silence under the end card.
  clips.forEach((c, i) => f.push(c.audio ? `[${clipIn[i]}:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur=${c.seconds}[ca${i}]` : `[${silenceIn}:a]atrim=0:${c.seconds},asetpts=N/SR/TB[ca${i}]`));
  f.push(`[${silenceIn}:a]atrim=0:${ctaSeconds},asetpts=N/SR/TB[cs]`);
  f.push(`${clips.map((_, i) => `[ca${i}]`).join("")}[cs]concat=n=${clips.length + 1}:v=0:a=1[bed]`);
  if (voices.length) {
    f.push(`[bed]volume=0.22[bedq]`);
    voices.forEach((x, i) => f.push(`[${voiceIn[i]}:a]aresample=44100,aformat=channel_layouts=stereo,adelay=${Math.round(x.start * 1000)}|${Math.round(x.start * 1000)}[vo${i}]`));
    f.push(`[bedq]${voices.map((_, i) => `[vo${i}]`).join("")}amix=inputs=${voices.length + 1}:duration=first:normalize=0[a]`);
  } else f.push(`[bed]anull[a]`);

  args.push("-filter_complex", f.join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-r", String(FPS), "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out);
  return args;
}

// parts: { clips: [Buffer], logo, title, cta, subtitles: [{ buffer, line }] per clip, voices: [Buffer|null] per clip }.
// Writes the video into dir; returns { file, name, seconds }.
async function compose(parts, dir, { wide = false } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-studio-"));
  try {
    const file = (n, b) => (fs.writeFileSync(path.join(work, n), b), path.join(work, n));
    const clips = [];
    for (const [i, buf] of parts.clips.entries()) {
      const f = file(`clip${i}.mp4`, buf);
      const info = await probe(f);
      if (!info.seconds) throw fail(502, `AI clip ${i + 1} couldn't be read`);
      clips.push({ file: f, seconds: info.seconds, audio: info.audio });
    }
    let t = 0;
    const subtitles = [];
    const voices = [];
    clips.forEach((c, i) => {
      if (parts.subtitles?.[i]) subtitles.push({ file: file(`sub${i}.png`, parts.subtitles[i]), start: t + 0.3, end: t + c.seconds - 0.2 });
      if (parts.voices?.[i]) voices.push({ file: file(`vo${i}.wav`, parts.voices[i]), start: t + 0.4 });
      t += c.seconds;
    });
    const out = path.join(work, "video.mp4");
    await run(composeArgs({ clips, logo: file("logo.png", parts.logo), title: file("title.png", parts.title), subtitles, voices, cta: file("cta.jpg", parts.cta), wide, out }), 600000);
    const data = fs.readFileSync(out);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${crypto.createHash("sha256").update(data).digest("hex").slice(0, 32)}.mp4`;
    fs.writeFileSync(path.join(dir, name), data);
    return { file: path.join(dir, name), name, seconds: t + 3 };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// Pure: ffmpeg arguments that turn one picture into a moving clip — a slow zoom in, or a slow
// zoom out (alternate scenes), with silence, `seconds` long. Exported for tests.
function stillArgs(picture, seconds, { wide = false, zoomOut = false, out }) {
  const W = wide ? 1920 : 1080;
  const H = wide ? 1080 : 1920;
  const frames = Math.round(seconds * FPS);
  const z = zoomOut ? `if(eq(on,1),1.12,max(zoom-0.0011,1.0))` : `min(zoom+0.0011,1.12)`;
  return [
    "-hide_banner", "-y", "-i", picture,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex", `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p[v]`,
    "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-c:a", "aac", "-shortest", "-movflags", "+faststart", out,
  ];
}

// One picture as a clip (Buffer of an MP4).
async function stillClip(picture, seconds, opts = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-still-"));
  try {
    const pic = path.join(work, "pic.img");
    fs.writeFileSync(pic, picture);
    const out = path.join(work, "clip.mp4");
    await run(stillArgs(pic, seconds, { ...opts, out }));
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// How long a sound file is, in seconds (0 if it can't be read).
async function seconds(buffer) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-len-"));
  try {
    const f = path.join(work, "a.wav");
    fs.writeFileSync(f, buffer);
    return (await probe(f)).seconds;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// A still from 1 s into the video, for previews. Returns the file written.
async function thumbnail(file, out) {
  await run(["-hide_banner", "-y", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", out], 30000);
  return out;
}

module.exports = { buildReel, reelArgs, brandClip, brandArgs, compose, composeArgs, stillClip, stillArgs, seconds, thumbnail, probe, available };
