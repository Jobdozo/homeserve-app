// Run: npm test  (throwaway DATA_DIR; a fake cloud, no network)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-cloud-"));
process.env.DATA_DIR = dir;
const jsonStore = require("../src/jsonStore");
const uploads = require("../src/uploads");
const objectStorage = require("../src/objectStorage");

const NOW = Date.parse("2026-10-12T12:00:00Z");
const put = (name, ageMs = 5 * 60 * 1000) => {
  const f = path.join(uploads.UPLOADS_DIR, name);
  fs.writeFileSync(f, `bytes of ${name}`);
  const t = new Date(NOW - ageMs);
  fs.utimesSync(f, t, t);
};
const cfg = objectStorage.config({
  STORAGE_S3_ENDPOINT: "https://x.example/s3", STORAGE_S3_REGION: "r", STORAGE_S3_ACCESS_KEY_ID: "k", STORAGE_S3_SECRET_ACCESS_KEY: "s",
  STORAGE_PUBLIC_BUCKET: "pub", STORAGE_PRIVATE_BUCKET: "priv", STORAGE_PUBLIC_BASE_URL: "https://cdn.example/pub",
});
const sent = [];
const fakeCloud = { putObject: async (c, bucket, key, body, type) => sent.push({ bucket, key, type, size: body.length }) };

test("config: off until every setting is present", () => {
  assert.equal(objectStorage.config({}).enabled, false);
  assert.equal(objectStorage.config({ STORAGE_S3_ENDPOINT: "https://x" }).enabled, false);
  assert.equal(cfg.enabled, true);
  assert.equal(objectStorage.publicUrl(cfg, "a b.jpg"), "https://cdn.example/pub/a%20b.jpg");
});

test("sync: photos to public, KYC / p- files to private, brand-new files wait", async () => {
  put("service.jpg");
  put("p-kyc-new.jpg"); // named private at upload
  put("old-kyc.png"); // uploaded before private names existed, referenced by a KYC record
  jsonStore.insert("kycDocuments", { providerId: "p1", docType: "aadhaar", url: "/uploads/old-kyc.png" });
  put("evidence.pdf");
  jsonStore.insert("complaintEvents", { complaintId: "C1", type: "evidence", attachment: { url: "/uploads/evidence.pdf" } });
  put("fresh.jpg", 5000); // 5 s old: its record may not exist yet
  put("../escape.jpg".replace("../", "x")); // odd but safe name

  const s = await uploads.syncUploads({ cfg, client: fakeCloud, now: NOW });
  const where = Object.fromEntries(sent.map((x) => [x.key, x.bucket]));
  assert.equal(where["service.jpg"], "pub");
  assert.equal(where["p-kyc-new.jpg"], "priv");
  assert.equal(where["old-kyc.png"], "priv");
  assert.equal(where["evidence.pdf"], "priv");
  assert.equal(where["fresh.jpg"], undefined);
  assert.equal(sent.find((x) => x.key === "evidence.pdf").type, "application/pdf");
  assert.equal(s.pending, 1);

  // a second run copies nothing again, then the fresh file once it settles
  sent.length = 0;
  await uploads.syncUploads({ cfg, client: fakeCloud, now: NOW });
  assert.equal(sent.length, 0);
  await uploads.syncUploads({ cfg, client: fakeCloud, now: NOW + 2 * 60 * 1000 });
  assert.deepEqual(sent.map((x) => x.key), ["fresh.jpg"]);
});

test("sync does nothing while storage is off", async () => {
  sent.length = 0;
  put("another.jpg");
  const s = await uploads.syncUploads({ cfg: objectStorage.config({}), client: fakeCloud, now: NOW });
  assert.equal(s.enabled, false);
  assert.equal(sent.length, 0);
});

test("removeFile deletes the local file and forgets the cloud copy", () => {
  uploads.removeFile("/uploads/service.jpg");
  assert.equal(fs.existsSync(path.join(uploads.UPLOADS_DIR, "service.jpg")), false);
  assert.equal(jsonStore.readAll("cloudUploads").some((r) => r.id === "service.jpg"), false);
  uploads.removeFile("/uploads/../../etc/passwd"); // ignored
});

test("nameOf only accepts plain upload names", () => {
  assert.equal(uploads.nameOf("/uploads/abc.jpg"), "abc.jpg");
  assert.equal(uploads.nameOf("/uploads/../x"), null);
  assert.equal(uploads.nameOf("a/b.jpg"), null);
});
