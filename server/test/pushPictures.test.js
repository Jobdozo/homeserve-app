const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-push-pictures-"));
const pictures = require("../src/pushPictures");
const { UPLOADS_DIR } = require("../src/uploads");

test("clean: only Tikdum's banners and pictures uploaded in Admin", () => {
  assert.equal(pictures.clean(null), null);
  assert.equal(pictures.clean(""), null);
  assert.equal(pictures.clean("/push-banners/home-cleaning.jpg"), "/push-banners/home-cleaning.jpg");
  const up = `/uploads/push-${"a".repeat(32)}.jpg`;
  assert.equal(pictures.clean(up), up);
  for (const bad of ["https://evil.example/x.jpg", "/uploads/p-secret.jpg", "/uploads/abc.webp", "/push-banners/../x.jpg", "javascript:alert(1)"]) {
    assert.throws(() => pictures.clean(bad), (e) => e.status === 400);
  }
});

test("abs: uploads come from the API host, banners from the website", () => {
  assert.equal(pictures.abs(null), null);
  assert.equal(pictures.abs("/push-banners/electrician.jpg"), "https://tikdum.com/push-banners/electrician.jpg");
  assert.match(pictures.abs(`/uploads/push-${"b".repeat(32)}.jpg`), /^https:\/\/api\.tikdum\.com\/uploads\/push-b{32}\.jpg$/);
});

test("makeBanner: saves a push-<hex> picture and removes the upload as sent", async () => {
  const src = path.join(UPLOADS_DIR, "upload-as-sent.png");
  // A 1×1 PNG.
  fs.writeFileSync(src, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  const image = await pictures.makeBanner({ path: src, mimetype: "image/png" });
  assert.match(image, /^\/uploads\/push-[a-f0-9]{32}\.(jpg|png)$/);
  assert.ok(fs.existsSync(path.join(UPLOADS_DIR, image.slice("/uploads/".length))));
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!fs.existsSync(src));
  assert.equal(pictures.clean(image), image);
});
