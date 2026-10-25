// The music under every video — Video Studio's and the Marketing Agent's Reels: a track uploaded
// in Admin → Video Studio → Settings, else the free music made on the server (socialVideo.js
// musicArgs). Kept in DATA_DIR/social/music, not with the public pictures in /uploads.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, "..", "data"), "social", "music");
const TABLE = "socialMusic";
const MIN_SECONDS = 10;
const fail = (status, message) => Object.assign(new Error(message), { status });
const row = () => jsonStore.readAll(TABLE)[0] || null;

// The uploaded track's file, or null (then the built-in music plays).
function trackFile() {
  const r = row();
  if (!r?.file) return null;
  const p = path.join(DIR, path.basename(r.file));
  return fs.existsSync(p) ? p : null;
}

function info() {
  const r = row();
  return trackFile() ? { custom: true, name: r.name, seconds: r.seconds, updatedAt: r.updatedAt, updatedBy: r.updatedBy || null } : { custom: false };
}

// Pure: a track's name as people know it, from the uploaded file's name. Exported for tests.
const nameFrom = (original) => String(original || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Your music";

// tmpPath: the uploaded file; probe: socialVideo.probe (how long it is, whether it has sound).
async function setTrack(tmpPath, originalName, actor, probe) {
  try {
    const p = await probe(tmpPath);
    if (!p.audio) throw fail(400, "That file has no sound in it — upload an MP3, M4A or WAV");
    if (p.seconds < MIN_SECONDS) throw fail(400, `The music is too short — use a track of at least ${MIN_SECONDS} seconds`);
    fs.mkdirSync(DIR, { recursive: true });
    const ext = (path.extname(String(originalName || "")).toLowerCase().match(/^\.(mp3|m4a|wav|aac|ogg)$/) || [".mp3"])[0];
    const file = `track-${crypto.randomBytes(8).toString("hex")}${ext}`;
    fs.copyFileSync(tmpPath, path.join(DIR, file));
    const old = row();
    const next = { id: "music", file, name: nameFrom(originalName), seconds: Math.round(p.seconds), updatedAt: new Date().toISOString(), updatedBy: actor || null };
    if (old) jsonStore.update(TABLE, "music", next);
    else jsonStore.insert(TABLE, next);
    if (old?.file && old.file !== file) fs.rmSync(path.join(DIR, path.basename(old.file)), { force: true });
    return info();
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

function clearTrack() {
  const old = row();
  if (old) {
    jsonStore.remove(TABLE, "music");
    if (old.file) fs.rmSync(path.join(DIR, path.basename(old.file)), { force: true });
  }
  return info();
}

module.exports = { trackFile, info, setTrack, clearTrack, nameFrom, DIR };
