// Run: npm test  (throwaway DATA_DIR; real sharp, no network)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-optimise-"));
const sharp = require("sharp");
const uploads = require("../src/uploads");

// A 2400×1800 noisy photo, the way a phone camera would send it.
async function phonePhoto(name) {
  const w = 2400;
  const h = 1800;
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37 + (i >> 7) * 11) & 255;
  const file = path.join(uploads.UPLOADS_DIR, name);
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toFile(file);
  return { filename: name, path: file, mimetype: "image/jpeg", size: fs.statSync(file).size };
}

test("a public photo becomes a smaller WebP (max 1600 px) plus a 600 px thumbnail", async () => {
  const file = await phonePhoto("abc123.jpg");
  const before = file.size;
  await uploads.optimiseFile(file, { thumb: true });
  assert.equal(file.filename, "abc123.webp");
  assert.equal(file.mimetype, "image/webp");
  assert.ok(!fs.existsSync(path.join(uploads.UPLOADS_DIR, "abc123.jpg")), "the original is replaced");
  assert.ok(file.size < before, `smaller: ${file.size} < ${before}`);
  const meta = await sharp(file.path).metadata();
  assert.equal(Math.max(meta.width, meta.height), 1600);
  const thumb = path.join(uploads.UPLOADS_DIR, "abc123-t.webp");
  const tmeta = await sharp(thumb).metadata();
  assert.equal(Math.max(tmeta.width, tmeta.height), 600);
  assert.ok(fs.statSync(thumb).size < file.size / 2, "the thumbnail is much lighter");
});

test("documents keep more detail and get no thumbnail; PDFs are kept as sent", async () => {
  const doc = await phonePhoto("p-kyc1.jpg");
  await uploads.optimiseFile(doc, { thumb: false });
  assert.equal(doc.filename, "p-kyc1.webp");
  const meta = await sharp(doc.path).metadata();
  assert.equal(Math.max(meta.width, meta.height), 2000);
  assert.ok(!fs.existsSync(path.join(uploads.UPLOADS_DIR, "p-kyc1-t.webp")));

  const pdfPath = path.join(uploads.UPLOADS_DIR, "p-bill.pdf");
  fs.writeFileSync(pdfPath, "%PDF-1.4 test");
  const pdf = { filename: "p-bill.pdf", path: pdfPath, mimetype: "application/pdf", size: 13 };
  await uploads.optimiseFile(pdf, { thumb: false });
  assert.equal(pdf.filename, "p-bill.pdf");
  assert.equal(fs.readFileSync(pdfPath, "utf8"), "%PDF-1.4 test");
});

test("older public photos get thumbnails in the background; private files and thumbnails don't", async () => {
  await phonePhoto("old-photo.jpg");
  await phonePhoto("p-old-kyc.jpg");
  const made = await uploads.makeMissingThumbs();
  assert.ok(fs.existsSync(path.join(uploads.UPLOADS_DIR, "old-photo-t.webp")));
  assert.ok(!fs.existsSync(path.join(uploads.UPLOADS_DIR, "p-old-kyc-t.webp")));
  assert.ok(!fs.existsSync(path.join(uploads.UPLOADS_DIR, "abc123-t-t.webp")));
  assert.equal(made, 1);
  assert.equal(await uploads.makeMissingThumbs(), 0, "nothing twice");
});

test("deleting a photo deletes its thumbnail too", () => {
  uploads.removeFile("/uploads/abc123.webp");
  assert.ok(!fs.existsSync(path.join(uploads.UPLOADS_DIR, "abc123.webp")));
  assert.ok(!fs.existsSync(path.join(uploads.UPLOADS_DIR, "abc123-t.webp")));
});
