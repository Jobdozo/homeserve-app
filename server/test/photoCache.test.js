// Run: npm test  (throwaway DATA_DIR; a fake cloud, no network)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-photocache-"));
process.env.DATA_DIR = dir;
const jsonStore = require("../src/jsonStore");
const uploads = require("../src/uploads");
const objectStorage = require("../src/objectStorage");

const NOW = Date.parse("2026-10-13T12:00:00Z");
const put = (name) => {
  const f = path.join(uploads.UPLOADS_DIR, name);
  fs.writeFileSync(f, `bytes of ${name}`);
  const t = new Date(NOW - 5 * 60 * 1000);
  fs.utimesSync(f, t, t);
};
const cfg = objectStorage.config({
  STORAGE_S3_ENDPOINT: "https://x.example/s3", STORAGE_S3_REGION: "r", STORAGE_S3_ACCESS_KEY_ID: "k", STORAGE_S3_SECRET_ACCESS_KEY: "s",
  STORAGE_PUBLIC_BUCKET: "pub", STORAGE_PRIVATE_BUCKET: "priv", STORAGE_PUBLIC_BASE_URL: "https://cdn.example/pub",
});
const sent = [];
const fakeCloud = { putObject: async (c, bucket, key, body, type, cacheControl) => sent.push({ bucket, key, cacheControl }) };

test("photos go up with a one-year cache; private files never do; older photos are re-copied once", async () => {
  // copied before the cache setting existed
  put("old-photo.jpg");
  jsonStore.insert("cloudUploads", { id: "old-photo.jpg", bucket: "public", at: "2026-10-12T10:00:00Z" });
  put("old-kyc.png");
  jsonStore.insert("cloudUploads", { id: "old-kyc.png", bucket: "private", at: "2026-10-12T10:00:00Z" });
  // new files
  put("new-photo.jpg");
  put("p-new-doc.jpg");

  await uploads.syncUploads({ cfg, client: fakeCloud, now: NOW });
  const by = Object.fromEntries(sent.map((x) => [x.key, x]));
  assert.match(by["new-photo.jpg"].cacheControl, /max-age=31536000/);
  assert.equal(by["p-new-doc.jpg"].cacheControl, undefined);
  assert.equal(by["old-photo.jpg"].bucket, "pub");
  assert.match(by["old-photo.jpg"].cacheControl, /immutable/);
  assert.equal(by["old-kyc.png"], undefined, "private files are not re-copied");
  assert.equal(jsonStore.readAll("cloudUploads").find((r) => r.id === "old-photo.jpg").cached, true);

  sent.length = 0;
  const s = await uploads.syncUploads({ cfg, client: fakeCloud, now: NOW + 60000 });
  assert.equal(sent.length, 0, "nothing is copied twice");
  assert.equal(s.failed, 0);
});

test("a failed copy shows on the health page and is tried again next run", async () => {
  put("later.jpg");
  const failing = { putObject: async () => { throw new Error("503 SlowDown: try later"); } };
  const s1 = await uploads.syncUploads({ cfg, client: failing, now: NOW + 120000 });
  assert.equal(s1.failed, 1);
  assert.match(s1.lastError, /SlowDown/);
  sent.length = 0;
  const s2 = await uploads.syncUploads({ cfg, client: fakeCloud, now: NOW + 180000 });
  assert.deepEqual(sent.map((x) => x.key), ["later.jpg"]);
  assert.equal(s2.failed, 0);
  assert.equal(s2.lastError, null);
});
