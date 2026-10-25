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

module.exports = { buildReel, reelArgs, available };
