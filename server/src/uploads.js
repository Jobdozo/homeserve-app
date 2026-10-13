// Image uploads (KYC documents, job before/after photos) — stored on disk
// under DATA_DIR/uploads, the same host-mounted volume jsonStore.js and
// push.js use, so files survive a redeploy (the container filesystem itself
// is recreated fresh each time).
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PRIVATE_PREFIX = "p-";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const diskStorage = (prefix) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".jpg";
      cb(null, `${prefix}${crypto.randomBytes(16).toString("hex")}${ext}`);
    },
  });
const storage = diskStorage("");
// KYC documents, job photos, complaint evidence: named "p-…" and kept out of the public bucket.
const privateStorage = diskStorage(PRIVATE_PREFIX);

const uploadRaw = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — the client compresses first, but some formats (e.g. HEIC) fall through uncompressed
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error("Only image uploads (JPEG, PNG, WebP, HEIC) are allowed"));
    cb(null, true);
  },
});

// Complaint evidence: photos plus PDF / Word / Excel / text documents.
const EVIDENCE_TYPES = new Set([
  ...ALLOWED_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const imageFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error("Only image uploads (JPEG, PNG, WebP, HEIC) are allowed"));
  cb(null, true);
};
const uploadPrivateRaw = multer({ storage: privateStorage, limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: imageFilter });

const uploadEvidenceRaw = multer({
  storage: privateStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!EVIDENCE_TYPES.has(file.mimetype)) return cb(new Error("Upload a photo, PDF, Word, Excel or text file"));
    cb(null, true);
  },
});


// ---------------------------------------------------------------- smaller photos
// Every uploaded photo is re-saved as WebP (about a third smaller than JPEG at the
// same quality), at most PHOTO.max pixels on its longest side. Public photos also
// get a small "<name>-t.webp" copy for list cards (thumbUrl in the apps), which
// is what makes lists load fast on mobile data. Documents (KYC, job photos,
// evidence) keep more detail and get no thumbnail; PDFs and other files, HEIC
// photos and anything sharp can't read are kept exactly as sent.
let sharp = null;
try {
  sharp = require("sharp");
  sharp.cache(false); // each photo is read once; don't hold files or memory for it
} catch {
  sharp = null; // not installed: uploads are kept as sent
}
const PHOTO = { max: 1600, quality: 78 };
const DOCUMENT = { max: 2000, quality: 85 };
const THUMB = { max: 600, quality: 70 };
const OPTIMISABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
const isThumb = (name) => /-t\.webp$/.test(name);
const thumbName = (name) => `${name.replace(/\.[a-z0-9]+$/i, "")}-t.webp`;

const toWebp = (input, { max, quality }) =>
  sharp(input, { failOn: "none" })
    .rotate() // apply the phone's orientation before the EXIF data is dropped
    .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

// Re-save one uploaded file (multer's req.file) in place; updates its name and path.
async function optimiseFile(file, { thumb }) {
  if (!sharp || !OPTIMISABLE.has(file.mimetype)) return file;
  const original = fs.readFileSync(file.path);
  const webp = await toWebp(original, thumb ? PHOTO : DOCUMENT);
  if (webp.length < original.length) {
    const name = file.filename.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    const dest = path.join(UPLOADS_DIR, name);
    fs.writeFileSync(dest, webp);
    if (dest !== file.path) fs.rmSync(file.path, { force: true });
    Object.assign(file, { filename: name, path: dest, mimetype: "image/webp", size: webp.length });
  }
  if (thumb) fs.writeFileSync(path.join(UPLOADS_DIR, thumbName(file.filename)), await toWebp(file.path, THUMB));
  return file;
}

// multer, then the re-save. A failure keeps the upload as sent rather than losing it.
const optimised = (instance, opts) => ({
  single: (field) => [
    instance.single(field),
    (req, res, next) => {
      if (!req.file) return next();
      optimiseFile(req.file, opts).then(
        () => next(),
        (e) => {
          console.error("[uploads] couldn't optimise", req.file.filename, e.message);
          next();
        }
      );
    },
  ],
});
const upload = optimised(uploadRaw, { thumb: true });
const uploadPrivate = optimised(uploadPrivateRaw, { thumb: false });
const uploadEvidence = optimised(uploadEvidenceRaw, { thumb: false });

// Thumbnails for public photos uploaded before they existed (or written by other
// features, e.g. Image Studio): a batch per run, from the copy on this server.
async function makeMissingThumbs({ dir = UPLOADS_DIR, limit = 50 } = {}) {
  if (!sharp) return 0;
  const priv = privateNames();
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const have = new Set(names);
  let made = 0;
  for (const name of names) {
    if (made >= limit) break;
    if (!/\.(jpe?g|png|webp)$/i.test(name) || isThumb(name) || name.startsWith(PRIVATE_PREFIX) || priv.has(name) || have.has(thumbName(name))) continue;
    try {
      fs.writeFileSync(path.join(dir, thumbName(name)), await toWebp(path.join(dir, name), THUMB));
      made += 1;
    } catch (e) {
      console.error("[uploads] thumbnail failed for", name, e.message);
      have.add(thumbName(name)); // don't retry a broken file every run
    }
  }
  return made;
}

// ---------------------------------------------------------------- cloud copies (scaling step 3)
// Files are still written to this folder first (every feature that saves, copies or
// deletes an upload keeps working). Once cloud storage is configured (objectStorage.js)
// a background job copies each file there: photos to the public bucket, which then
// serves them through its CDN; KYC documents, job photos and complaint evidence to
// the private bucket, which nobody can open directly. Links stay /uploads/<name>.
const jsonStore = require("./jsonStore");
const objectStorage = require("./objectStorage");

const CLOUD = "cloudUploads"; // { id: file name, bucket: "public" | "private", at }
const PRIVATE = "privateUploads"; // { id: file name } — never goes to the public bucket
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const SETTLE_MS = 60 * 1000; // a file this new may not have its record (KYC, job photo …) saved yet
const PER_RUN = 200;
// Upload names are random and never reused, so a public photo can be kept for a year
// by phones and the CDN instead of being re-checked on every app open.
const PHOTO_CACHE = "public, max-age=31536000, immutable";

const CONTENT_TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".heic": "image/heic", ".heif": "image/heif", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".txt": "text/plain",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const contentTypeOf = (name) => CONTENT_TYPES[path.extname(name).toLowerCase()] || "application/octet-stream";
const nameOf = (urlOrName) => {
  const s = String(urlOrName || "");
  const name = s.startsWith("/uploads/") ? s.slice("/uploads/".length) : s;
  return SAFE_NAME.test(name) ? name : null;
};

let cloudIndex = null; // name -> record, loaded once
function cloudRecords() {
  if (!cloudIndex) cloudIndex = new Map(jsonStore.readAll(CLOUD).map((r) => [r.id, r]));
  return cloudIndex;
}

// Called by the routes that save KYC documents, job photos and complaint evidence,
// right after the file lands — before its record exists.
function markPrivate(urlOrName) {
  const name = nameOf(urlOrName);
  if (name && !jsonStore.readAll(PRIVATE).some((r) => r.id === name)) jsonStore.insert(PRIVATE, { id: name });
}

// Every file that must stay private: marked ones, plus whatever the KYC, job-photo
// and complaint records point at (files uploaded before marking existed).
function privateNames() {
  const out = new Set(jsonStore.readAll(PRIVATE).map((r) => r.id));
  for (const n of fs.readdirSync(UPLOADS_DIR).filter((n) => n.startsWith(PRIVATE_PREFIX))) out.add(n);
  for (const d of jsonStore.readAll("kycDocuments")) out.add(nameOf(d.url));
  for (const p of jsonStore.readAll("jobPhotos")) out.add(nameOf(p.url));
  for (const e of jsonStore.readAll("complaintEvents")) if (e.attachment?.url) out.add(nameOf(e.attachment.url));
  out.delete(null);
  return out;
}

const status = { enabled: false, copied: 0, pending: 0, failed: 0, lastRunAt: null, lastError: null };

// Copy files that aren't in the cloud yet. Safe to run any time; one at a time.
let running = false;
async function syncUploads({ cfg = objectStorage.config(), client = objectStorage, dir = UPLOADS_DIR, now = Date.now() } = {}) {
  status.enabled = cfg.enabled;
  if (!cfg.enabled || running) return status;
  running = true;
  try {
    const done = cloudRecords();
    const priv = privateNames();
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((n) => SAFE_NAME.test(n) && !n.startsWith(".") && !done.has(n));
    } catch {
      names = [];
    }
    const ready = names.filter((n) => {
      try {
        const st = fs.statSync(path.join(dir, n));
        return st.isFile() && now - st.mtimeMs >= SETTLE_MS;
      } catch {
        return false;
      }
    });
    let failed = 0;
    for (const name of ready.slice(0, PER_RUN)) {
      const bucket = priv.has(name) ? "private" : "public";
      try {
        await client.putObject(cfg, bucket === "private" ? cfg.privateBucket : cfg.publicBucket, name, fs.readFileSync(path.join(dir, name)), contentTypeOf(name), bucket === "public" ? PHOTO_CACHE : undefined);
        const rec = { id: name, bucket, at: new Date(now).toISOString(), ...(bucket === "public" ? { cached: true } : {}) };
        jsonStore.insert(CLOUD, rec);
        done.set(name, rec);
        status.copied += 1;
      } catch (e) {
        failed += 1;
        status.lastError = String(e.message || e).slice(0, 200);
      }
    }
    // Public photos copied before PHOTO_CACHE existed: copy them again with it, a batch per run.
    let recopy = PER_RUN - ready.slice(0, PER_RUN).length;
    let recopyFailed = 0;
    for (const rec of done.values()) {
      if (recopy <= 0) break;
      if (rec.bucket !== "public" || rec.cached || !fs.existsSync(path.join(dir, rec.id))) continue;
      recopy -= 1;
      try {
        await client.putObject(cfg, cfg.publicBucket, rec.id, fs.readFileSync(path.join(dir, rec.id)), contentTypeOf(rec.id), PHOTO_CACHE);
        Object.assign(rec, jsonStore.update(CLOUD, rec.id, { cached: true }) || { cached: true });
      } catch (e) {
        recopyFailed += 1;
        status.lastError = String(e.message || e).slice(0, 200);
        break; // try the rest next run
      }
    }
    status.pending = names.length - (ready.slice(0, PER_RUN).length - failed);
    status.failed = failed + recopyFailed;
    if (!failed && !recopyFailed) status.lastError = null; // an old error isn't shown once a run goes through
    status.lastRunAt = new Date(now).toISOString();
    return status;
  } finally {
    running = false;
  }
}

// GET /uploads/<name>: a public photo that's in the cloud goes to its CDN copy;
// otherwise the file is served from this server, or fetched back from the cloud
// if this server no longer has it.
function serveUpload(req, res, next) {
  const name = nameOf(decodeURIComponent(req.path.replace(/^\/+/, "")));
  if (!name) return next();
  const cfg = objectStorage.config();
  const rec = cfg.enabled ? cloudRecords().get(name) : null;
  if (rec?.bucket === "public") {
    res.set("Cache-Control", "public, max-age=86400");
    return res.redirect(302, objectStorage.publicUrl(cfg, name));
  }
  const local = path.join(UPLOADS_DIR, name);
  if (fs.existsSync(local)) return res.sendFile(local, { maxAge: "7d" });
  if (!rec) return next();
  objectStorage
    .getObject(cfg, cfg.privateBucket, name)
    .then((buf) => {
      if (!buf) return next();
      fs.writeFileSync(local, buf); // keep a local copy again
      res.type(contentTypeOf(name)).set("Cache-Control", "private, max-age=3600").send(buf);
    })
    .catch(next);
}

// Delete an upload everywhere: this server and the cloud. Accepts "/uploads/<name>" or a bare name.
function removeFile(urlOrName) {
  const name = nameOf(urlOrName);
  if (!name) return;
  if (!isThumb(name) && fs.existsSync(path.join(UPLOADS_DIR, thumbName(name)))) removeFile(thumbName(name));
  fs.rmSync(path.join(UPLOADS_DIR, name), { force: true });
  const rec = cloudRecords().get(name);
  if (rec) {
    cloudRecords().delete(name);
    jsonStore.remove(CLOUD, name);
    const cfg = objectStorage.config();
    if (cfg.enabled) objectStorage.deleteObject(cfg, rec.bucket === "private" ? cfg.privateBucket : cfg.publicBucket, name).catch(() => {});
  }
  jsonStore.remove(PRIVATE, name);
}

// For the health check: is it on, and is anything waiting or failing.
const cloudStatus = () => ({ ...status, enabled: objectStorage.config().enabled });

function startCloudSync() {
  const run = () =>
    makeMissingThumbs()
      .catch((e) => console.error("[uploads] thumbnails:", e.message))
      .then(() => syncUploads())
      .catch((e) => (status.lastError = String(e.message || e).slice(0, 200)));
  setTimeout(run, 15 * 1000).unref();
  setInterval(run, 60 * 1000).unref();
}

module.exports = { upload, uploadPrivate, uploadEvidence, optimiseFile, makeMissingThumbs, thumbName, UPLOADS_DIR, PRIVATE_PREFIX, markPrivate, privateNames, syncUploads, serveUpload, removeFile, cloudStatus, startCloudSync, nameOf };
