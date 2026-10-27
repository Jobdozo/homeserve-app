const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-indexnow-"));
delete process.env.INDEXNOW;
const indexNow = require("../src/indexNow");
const seo = require("../src/seoPages");

test("IndexNow: off unless INDEXNOW=on; new pages at once, the rest weekly; the key file proves it's Tikdum", async () => {
  const urls = ["https://tikdum.com/jammu", "https://tikdum.com/jammu/home-cleaning/sofa-cleaning"];
  const asked = [];
  const fetchImpl = async (url, opts) => (asked.push({ url, body: JSON.parse(opts.body) }), { status: 202 });
  assert.deepEqual(await indexNow.submit(urls, { fetchImpl }), { sent: 0, skipped: "off" });
  assert.equal(asked.length, 0, "local runs and tests never send");

  process.env.INDEXNOW = "on";
  const t0 = Date.parse("2026-10-27T00:00:00Z");
  assert.deepEqual(await indexNow.submit(urls, { fetchImpl, now: t0 }), { sent: 2 });
  const { body } = asked[0];
  assert.equal(body.host, "tikdum.com");
  assert.match(body.key, /^[a-f0-9]{32}$/);
  assert.equal(body.keyLocation, `https://tikdum.com/${body.key}.txt`);
  assert.deepEqual(body.urlList, urls);

  // Sent already: only a new page goes, until the weekly resend.
  assert.deepEqual(await indexNow.submit([...urls, "https://tikdum.com/blog/new"], { fetchImpl, now: t0 + 3600e3 }), { sent: 1 });
  assert.deepEqual(asked[1].body.urlList, ["https://tikdum.com/blog/new"]);
  assert.deepEqual(await indexNow.submit(urls, { fetchImpl, now: t0 + 2 * 3600e3 }), { sent: 0 });
  assert.deepEqual(await indexNow.submit(urls, { fetchImpl, now: t0 + indexNow.RESEND_MS + 1 }), { sent: 2 });

  // A refusal is reported, and nothing is marked as sent.
  await assert.rejects(indexNow.submit(["https://tikdum.com/x"], { fetchImpl: async () => ({ status: 403 }), now: t0 }), /IndexNow answered 403/);
  assert.deepEqual(indexNow.due(["https://tikdum.com/x"], {}, t0), ["https://tikdum.com/x"]);

  // tikdum.com/<key>.txt is served by the page builder (the website's nginx sends unknown files there).
  assert.equal(indexNow.keyFile(`/${body.key}.txt`), body.key);
  assert.equal(indexNow.keyFile("/0123456789abcdef0123456789abcdef.txt"), null);
  const res = { headers: {}, statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, set(h, v) { if (typeof h === "string") this.headers[h] = v; else Object.assign(this.headers, h); return this; }, type(t) { this.headers["Content-Type"] = t; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  await seo.route({})({ get: (h) => (h.toLowerCase() === "x-original-uri" ? `/${body.key}.txt` : undefined) }, res);
  assert.equal(res.body, body.key);
  assert.equal(res.headers["Content-Type"], "text/plain");
  delete process.env.INDEXNOW;
});

test("who Tikdum is, for search engines and AI assistants: phone, place, company, social profiles", () => {
  const org = seo.pageFor("/", { categories: [], services: [], providers: [] }).jsonLd.find((j) => j["@type"] === "Organization");
  assert.equal(org.telephone, "+91-94191-49336");
  assert.equal(org.legalName, "OAIA Electronics Private Limited");
  assert.equal(org.address.addressLocality, "Jammu");
  assert.ok(org.sameAs.includes("https://www.instagram.com/tikdum_com/"));
  assert.ok(org.sameAs.some((u) => u.includes("youtube.com/channel/UCn0rlzKfOomyi-g0oUOZDzg")));
  assert.doesNotMatch(org.description, /WhatsApp/);
});
