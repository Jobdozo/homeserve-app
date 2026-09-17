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

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — the client compresses first, but some formats (e.g. HEIC) fall through uncompressed
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) return cb(new Error("Only image uploads (JPEG, PNG, WebP, HEIC) are allowed"));
    cb(null, true);
  },
});

module.exports = { upload, UPLOADS_DIR };
