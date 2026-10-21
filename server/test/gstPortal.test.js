const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-gstportal-"));
process.env.JWT_SECRET = "test-secret";
const gstPortal = require("../src/gstPortal");
const { providerChecklist } = require("../src/backoffice");

const GSTIN = "27AAPFU0939F1ZV";
const answer = {
  gstin: GSTIN, lgnm: "UMA ELECTRICALS PRIVATE LIMITED", tradeNam: "Uma Electricals", sts: "Active", rgdt: "01/07/2017",
  ctb: "Private Limited Company", dty: "Regular", pradr: { addr: { bnm: "Shiv Plaza", st: "MG Road", loc: "Pune", stcd: "Maharashtra", pncd: "411001" } },
};
const reply = (status, json) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => json });

test("gst portal: parses GSTN's short field names (and a wrapped answer)", () => {
  const r = gstPortal.parse(GSTIN, answer);
  assert.equal(r.found, true);
  assert.equal(r.active, true);
  assert.equal(r.legalName, "UMA ELECTRICALS PRIVATE LIMITED");
  assert.equal(r.tradeName, "Uma Electricals");
  assert.equal(r.pincode, "411001");
  assert.match(r.address, /Shiv Plaza, MG Road, Pune/);
  assert.equal(gstPortal.parse(GSTIN, { taxpayerInfo: { ...answer, sts: "Cancelled" } }).active, false);
  assert.equal(gstPortal.parse(GSTIN, {}).found, false);
});

test("gst portal: needs the key, sends API Setu headers, keeps the answer a week", async () => {
  await assert.rejects(gstPortal.lookup(GSTIN, { fetchImpl: reply(200, answer) }), (e) => e.status === 503);
  process.env.APISETU_CLIENT_ID = "com.tikdum.provider";
  process.env.APISETU_API_KEY = "k".repeat(32);
  let seen;
  const fetchImpl = async (url, opts) => ((seen = { url, headers: opts.headers }), reply(200, answer)());
  const r = await gstPortal.lookup(" 27aapfu0939f1zv ", { fetchImpl });
  assert.equal(seen.url, `https://apisetu.gov.in/gstn/v2/taxpayers/${GSTIN}`);
  assert.equal(seen.headers["X-APISETU-CLIENTID"], "com.tikdum.provider");
  assert.equal(seen.headers["X-APISETU-APIKEY"], "k".repeat(32));
  assert.equal(r.active, true);
  assert.equal(gstPortal.cached(GSTIN).legalName, r.legalName);

  let calls = 0;
  const counting = async () => (calls++, reply(200, { ...answer, sts: "Suspended" })());
  assert.equal((await gstPortal.lookup(GSTIN, { fetchImpl: counting })).active, true); // from the week's cache
  assert.equal(calls, 0);
  assert.equal((await gstPortal.lookup(GSTIN, { fetchImpl: counting, refresh: true })).status, "Suspended");
  assert.equal((await gstPortal.lookup(GSTIN, { fetchImpl: counting, now: Date.now() + 8 * 86400000 })).status, "Suspended");
  assert.equal(calls, 2);
});

test("gst portal: not found, refused key, bad numbers", async () => {
  const nf = await gstPortal.lookup("29AAGCB7383J1Z4", { fetchImpl: reply(404, { error: "not found" }) });
  assert.equal(nf.found, false);
  await assert.rejects(gstPortal.lookup("07AAACI1681G1ZR", { fetchImpl: reply(401, { errorDescription: "Invalid API key" }) }), /refused the key \(Invalid API key\)/);
  await assert.rejects(gstPortal.lookup("12ABC", { fetchImpl: reply(200, answer) }), (e) => e.status === 400);
});

test("checklist: an inactive or unknown GST number on the portal blocks readiness", () => {
  const p = {
    id: "p1", name: "Ravi Kumar", category: "plumbing", serviceArea: "Gandhi Nagar", agreementAccepted: true, experience: "5", gstNumber: GSTIN,
  };
  const opts = { docs: [{ docType: "gst_certificate" }], services: [{}] };
  assert.equal(providerChecklist(p, opts).checks.some((c) => c.key === "gst_portal"), false); // not checked yet
  const ok = providerChecklist(p, { ...opts, gst: gstPortal.parse(GSTIN, answer) });
  assert.equal(ok.ready, true);
  assert.equal(ok.checks.find((c) => c.key === "gst_portal").detail, "UMA ELECTRICALS PRIVATE LIMITED / Uma Electricals · Active");
  const cancelled = providerChecklist(p, { ...opts, gst: gstPortal.parse(GSTIN, { ...answer, sts: "Cancelled" }) });
  assert.deepEqual(cancelled.missing, ["gst_portal"]);
  assert.equal(providerChecklist(p, { ...opts, gst: gstPortal.parse(GSTIN, {}) }).checks.find((c) => c.key === "gst_portal").detail, "Not found on the GST portal");
});
