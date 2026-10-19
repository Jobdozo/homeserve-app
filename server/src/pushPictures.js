// Pictures on push notifications (broadcasts and scheduled push campaigns): the big
// banner Android shows under the text, like the shopping apps' offers. Two kinds:
//   - uploaded in Admin: re-saved as a 1024×512 JPEG ("/uploads/push-<hex>.jpg"), the
//     shape Android's big-picture notification shows without cropping, well under the
//     1 MB push limit;
//   - Tikdum's ready-made banners on the website ("/push-banners/<name>.jpg").
// Nothing else is accepted, so a notification can't carry a link to any other site.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { UPLOADS_DIR } = require("./uploads");

const SIZE = { width: 1024, height: 512 };
const UPLOADS_BASE = (process.env.UPLOADS_PUBLIC_BASE || "https://api.tikdum.com").replace(/\/$/, "");
const SITE = "https://tikdum.com";
const UPLOADED = /^\/uploads\/push-[a-f0-9]{32}\.(jpg|png)$/;
const BUILT_IN = /^\/push-banners\/[a-z0-9-]{1,60}\.jpg$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}

// "" / null -> null; a valid picture path -> itself; anything else -> 400.
function clean(image) {
  if (image == null || image === "") return null;
  const s = String(image).trim();
  if (UPLOADED.test(s) || BUILT_IN.test(s)) return s;
  throw fail(400, "Use a picture uploaded in Admin or one of Tikdum's banners");
}

// The full address phones download the picture from.
function abs(image) {
  if (!image) return null;
  return `${image.startsWith("/uploads/") ? UPLOADS_BASE : SITE}${image}`;
}

// An uploaded file (multer's req.file, saved as sent) -> "/uploads/push-<hex>.jpg".
async function makeBanner(file) {
  const name = `push-${crypto.randomBytes(16).toString("hex")}`;
  try {
    if (sharp) {
      const out = await sharp(file.path, { failOn: "none" })
        .rotate()
        .resize({ ...SIZE, fit: "cover", position: "attention" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      fs.writeFileSync(path.join(UPLOADS_DIR, `${name}.jpg`), out);
      return `/uploads/${name}.jpg`;
    }
    // No image library (local development): keep a JPEG or PNG as sent.
    const ext = { "image/jpeg": "jpg", "image/png": "png" }[file.mimetype];
    if (!ext) throw fail(400, "Upload a JPEG or PNG picture");
    fs.copyFileSync(file.path, path.join(UPLOADS_DIR, `${name}.${ext}`));
    return `/uploads/${name}.${ext}`;
  } finally {
    fs.rm(file.path, { force: true }, () => {});
  }
}

module.exports = { clean, abs, makeBanner, SIZE };
