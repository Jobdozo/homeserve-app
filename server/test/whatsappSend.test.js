// Run: npm test  (throwaway DATA_DIR; MSG91 calls are stubbed)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-wasend-"));
process.env.JWT_SECRET = "test-secret";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const store = require("../src/store");
store.getCustomerByPhone = async () => null; // no database in tests
const whatsapp = require("../src/whatsapp");
const inbox = require("../src/inbox");

const sent = [];
whatsapp.isConfigured = true;
whatsapp.sendWhatsAppText = async (phone, text) => (sent.push({ kind: "text", phone, text }), { ok: true });
whatsapp.sendNoticeTemplate = async (phone, v) => (sent.push({ kind: "template", phone, ...v }), { ok: true });
let template = null;
whatsapp.noticeTemplate = () => template;

test("notice template payload: one variable per configured slot, no new lines", () => {
  const p = whatsapp.buildNoticePayload("+919811112222", { message: "Line one\nLine two\t end", name: "Ravi" });
  const comps = p.payload.template.to_and_components[0];
  assert.deepEqual(comps.to, ["919811112222"]);
  assert.equal(comps.components.body_1.value, "Line one · Line two · end");
  assert.equal(p.content_type, "template");
});

test("outside the 24h window with no template: refused, nothing sent or stored", async () => {
  const status = inbox.phoneStatus("98111 12222");
  assert.equal(status.windowOpen, false);
  assert.equal(status.canSend, false);
  await assert.rejects(inbox.sendToPhone({ phone: "9811112222", text: "Hello" }, "Admin"), (e) => e.status === 409);
  assert.equal(sent.length, 0);
  assert.equal(inbox.listConversations().length, 0);
});

test("outside the window with a template: sent as the template and kept in the inbox thread", async () => {
  template = { name: "provider_notice", vars: ["message"] };
  assert.equal(inbox.phoneStatus("9811112222").canSend, true);
  const out = await inbox.sendToPhone({ phone: "9811112222", name: "Ravi Services", text: "Please upload your ID", link: { providerId: "p1" } }, "Admin");
  assert.equal(out.via, "template");
  assert.equal(sent.at(-1).kind, "template");
  assert.equal(sent.at(-1).message, "Please upload your ID");
  const conv = inbox.listConversations()[0];
  assert.equal(conv.mode, "human"); // the AI stays out of chats staff started
  assert.equal(conv.providerId, "p1");
  assert.equal(conv.name, "Ravi Services");
  const status = inbox.phoneStatus("+91 98111 12222");
  assert.equal(status.messages.length, 1);
  assert.equal(status.messages[0].template, "provider_notice");
});

test("within 24h of their last message: plain text", async () => {
  template = null;
  await inbox.ingest({ customerNumber: "919811112222", text: "ok will do", uuid: "x1" }, {});
  const status = inbox.phoneStatus("9811112222");
  assert.equal(status.windowOpen, true);
  assert.ok(status.windowClosesAt);
  const out = await inbox.sendToPhone({ phone: "9811112222", text: "Thanks!" }, "Admin");
  assert.equal(out.via, "text");
  assert.equal(sent.at(-1).kind, "text");
  assert.equal(inbox.phoneStatus("9811112222").messages.length, 3);
});

test("MSG91 refusing it is reported, not stored", async () => {
  whatsapp.sendWhatsAppText = async () => ({ ok: false, error: "MSG91 refused it: bad number" });
  await assert.rejects(inbox.sendToPhone({ phone: "9811112222", text: "Again" }, "Admin"), (e) => e.status === 502 && /bad number/.test(e.message));
  assert.equal(inbox.phoneStatus("9811112222").messages.length, 3);
  await assert.rejects(inbox.sendToPhone({ phone: "12", text: "x" }, "Admin"), (e) => e.status === 400);
});
