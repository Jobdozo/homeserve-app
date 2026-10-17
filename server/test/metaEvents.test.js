const { test } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-meta-"));
const meta = require("../src/metaEvents");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

test("normPhone: Indian numbers with the country code, digits only", () => {
  assert.equal(meta.normPhone("+91 98765 43210"), "919876543210");
  assert.equal(meta.normPhone("09876543210"), "919876543210");
  assert.equal(meta.normPhone("9876543210"), "919876543210");
  assert.equal(meta.normPhone(""), null);
});

test("buildEvent: only hashed identifiers; website events carry the page and browser ids", () => {
  const e = meta.buildEvent({
    name: "Schedule", eventId: "order:o1:schedule", time: Date.parse("2026-10-17T06:00:00Z"),
    phone: "+919876543210", customerId: "C1", pincode: "180004", value: 499, contentName: "AC repair", orderId: "o1",
    src: { web: true, url: "https://tikdum.com/cart", ip: "1.2.3.4", ua: "Mozilla", fbp: "fb.1.1700000000.123", fbc: null },
  });
  assert.equal(e.action_source, "website");
  assert.equal(e.event_source_url, "https://tikdum.com/cart");
  assert.equal(e.event_time, 1792216800);
  assert.deepEqual(e.user_data.ph, [sha("919876543210")]);
  assert.deepEqual(e.user_data.external_id, [sha("c1")]);
  assert.deepEqual(e.user_data.zp, [sha("180004")]);
  assert.deepEqual(e.user_data.country, [sha("in")]);
  assert.equal(e.user_data.fbp, "fb.1.1700000000.123");
  assert.ok(!("fbc" in e.user_data));
  assert.deepEqual(e.custom_data, { currency: "INR", value: 499, content_name: "AC repair", order_id: "o1" });
  assert.ok(!JSON.stringify(e).includes("9876543210"), "no raw phone number");
});

test("buildEvent: app bookings are 'other' with no page URL", () => {
  const e = meta.buildEvent({ name: "Purchase", eventId: "booking:b1:purchase", phone: "9876543210", value: 300, src: { web: false } });
  assert.equal(e.action_source, "other");
  assert.ok(!("event_source_url" in e));
});

test("sourceOf: trusts Meta cookies only from tikdum.com, and only well-formed ones", () => {
  const web = meta.sourceOf({ headers: { origin: "https://tikdum.com", "x-meta-fbp": "fb.1.1700000000.42", "x-meta-fbc": "<script>", "x-meta-url": "https://tikdum.com/service/x", "user-agent": "UA" } }, "1.1.1.1");
  assert.deepEqual([web.web, web.fbp, web.fbc, web.url], [true, "fb.1.1700000000.42", null, "https://tikdum.com/service/x"]);
  const app = meta.sourceOf({ headers: { origin: "https://localhost", "x-meta-fbp": "fb.1.1700000000.42" } }, "1.1.1.1");
  assert.deepEqual([app.web, app.fbp, app.url], [false, null, null]);
});

test("off until configured: nothing is sent and the pixel id is null", async () => {
  delete process.env.META_PIXEL_ID;
  delete process.env.META_CAPI_TOKEN;
  let called = false;
  const real = global.fetch;
  global.fetch = async () => ((called = true), { ok: true, json: async () => ({}) });
  meta.schedule([{ id: "b1", amount: 100, customerId: "c" }], { web: false });
  meta.purchase({ id: "b1", amount: 100 });
  await new Promise((r) => setTimeout(r, 10));
  global.fetch = real;
  assert.equal(called, false);
  assert.equal(meta.pixelId(), null);
  assert.equal(meta.status().enabled, false);
});

test("configured: a cart order is one Schedule event; completion sends Purchase with the website source kept", async () => {
  process.env.META_PIXEL_ID = "1234567890";
  process.env.META_CAPI_TOKEN = "token";
  const bodies = [];
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    bodies.push({ url, data: JSON.parse(new URLSearchParams(opts.body).get("data")) });
    return { ok: true, json: async () => ({ events_received: 1 }) };
  };
  const src = { web: true, url: "https://tikdum.com/cart", ua: "UA", ip: "1.1.1.1", fbp: "fb.1.1.1" };
  meta.schedule([{ id: "b1", orderId: "o9", amount: 200, customerId: "c", customer: { phone: "9876543210" } }, { id: "b2", orderId: "o9", amount: 300, customerId: "c" }], src);
  await new Promise((r) => setTimeout(r, 10));
  meta.purchase({ id: "b2", orderId: "o9", amount: 300, customerId: "c", customer: { phone: "9876543210" } });
  await new Promise((r) => setTimeout(r, 10));
  global.fetch = real;
  assert.equal(bodies.length, 2);
  assert.match(bodies[0].url, /\/1234567890\/events$/);
  assert.equal(bodies[0].data[0].event_id, "order:o9:schedule");
  assert.equal(bodies[0].data[0].custom_data.value, 500);
  assert.equal(bodies[1].data[0].event_name, "Purchase");
  assert.equal(bodies[1].data[0].action_source, "website");
  assert.equal(bodies[1].data[0].user_data.fbp, "fb.1.1.1");
  assert.equal(meta.status().sent, 2);
});
