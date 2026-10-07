// Run: npm test  (throwaway DATA_DIR; no WhatsApp or database calls succeed here)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-inbox-"));
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_PHONES = "+919876543210";
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

const store = require("../src/store");
store.getCustomerByPhone = async () => null; // no database in tests
const inbox = require("../src/inbox");
const auth = require("../src/auth");
const access = require("../src/access");
const agents = require("../src/agents");
access.setAgentHooks({ resolve: agents.resolveAgent, policy: agents.policy });

const guard = (token, method, url, body) => access.guard({ method, originalUrl: `/api${url}`, body }, auth.verifyToken(token));

test("parses MSG91 inbound payloads defensively", () => {
  const out = inbox.parseInbound([
    { customerNumber: "919811112222", customerName: "Asha", text: "Hi, where is my plumber?", contentType: "text", uuid: "w1", ts: "1791273600", integratedNumber: "919999900000" },
    { customerNumber: "9811112222", contentType: "image", uuid: "w2" },
    { text: "no sender" },
    { customerNumber: "12", text: "bad number" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].phone, "+919811112222");
  assert.equal(out[1].phone, "+919811112222");
  assert.equal(out[1].text, "[image received]");
  assert.equal(new Date(out[0].at).getUTCFullYear(), 2026);
});

test("ingest dedupes retries, ignores other business numbers, and queues for AI", async () => {
  const a = await inbox.ingest({ customerNumber: "919811112222", text: "hello", uuid: "u1", integratedNumber: "919999900000" }, { businessNumber: "+91 99999 00000" });
  const b = await inbox.ingest({ customerNumber: "919811112222", text: "hello", uuid: "u1" }, {});
  const c = await inbox.ingest({ customerNumber: "919811112222", text: "other", uuid: "u9", integratedNumber: "918888800000" }, { businessNumber: "+919999900000" });
  assert.equal(a.length, 1);
  assert.equal(b.length, 0);
  assert.equal(c.length, 0);
  const q = inbox.listConversations({ queue: "ai" });
  assert.equal(q.length, 1);
  assert.equal(q[0].mode, "ai");
  assert.equal(q[0].needsReply, true);
});

test("replies: AI only while mode=ai; a person replying takes over", async () => {
  const id = "wa_919811112222";
  const m1 = await inbox.reply(id, "Your booking is confirmed.", "Support Agent [AI agent]", { agent: true });
  assert.equal(m1.sender, "ai");
  assert.equal(inbox.listConversations({ queue: "ai" }).length, 0); // answered
  await inbox.ingest({ customerNumber: "919811112222", text: "thanks, one more thing", uuid: "u2" });
  await inbox.reply(id, "Hi, this is Ravi from Tikdum.", "Ravi (+91...)", { agent: false });
  assert.equal(inbox.getConversation(id).conversation.mode, "human");
  await assert.rejects(inbox.reply(id, "AI again", "bot", { agent: true }), /taken over/);
});

test("review mode: AI drafts leave the AI queue; a person sending the draft keeps AI mode", async () => {
  const id = "wa_919822223333";
  await inbox.ingest({ customerNumber: "919822223333", text: "is my cleaner coming?", uuid: "d1" });
  assert.ok(inbox.listConversations({ queue: "ai" }).some((c) => c.id === id));
  inbox.saveDraft(id, { text: "Yes, your cleaner is booked for 4 PM.", intent: "booking_status" }, "Support Agent [AI agent]");
  assert.equal(inbox.listConversations({ queue: "ai" }).some((c) => c.id === id), false); // not drafted twice
  assert.ok(inbox.listConversations({ queue: "drafts" }).some((c) => c.id === id));
  const sent = await inbox.reply(id, "Yes, your cleaner is booked for 4 PM today.", "Ravi", { fromDraft: true });
  assert.equal(sent.aiDraft, true);
  assert.equal(sent.editedDraft, true);
  const c = inbox.getConversation(id).conversation;
  assert.equal(c.mode, "ai");
  assert.equal(c.draft, null);

  // A new customer message makes any draft stale; discarding hands the chat to the team.
  await inbox.ingest({ customerNumber: "919822223333", text: "and the price?", uuid: "d2" });
  inbox.saveDraft(id, { text: "It's shown in the app.", intent: "how_to" }, "bot");
  await inbox.ingest({ customerNumber: "919822223333", text: "hello??", uuid: "d3" });
  assert.equal(inbox.getConversation(id).conversation.draft, null);
  assert.ok(inbox.listConversations({ queue: "ai" }).some((x) => x.id === id));
  inbox.saveDraft(id, { text: "Hi!", intent: "greeting" }, "bot");
  assert.equal(inbox.discardDraft(id, "Ravi").mode, "human");
  assert.throws(() => inbox.saveDraft(id, { text: "x" }, "bot"), /taken over/);
});

test("support auto-send is off unless switched on", () => {
  assert.equal(agents.getConfig().supportAutoSend, false);
  assert.equal(agents.setConfig({ supportAutoSend: true }, "owner").supportAutoSend, true);
  assert.equal(agents.setConfig({ supportAutoSend: "yes" }, "owner").supportAutoSend, false); // only literal true
});

test("no free-form reply outside WhatsApp's 24h window", async () => {
  await inbox.ingest({ customerNumber: "919800000001", text: "old", uuid: "old1", ts: String(Math.floor(Date.now() / 1000) - 26 * 3600) });
  await assert.rejects(inbox.reply("wa_919800000001", "late reply", "x"), /24 hours/);
  assert.equal(inbox.listConversations({ queue: "ai" }).some((c) => c.id === "wa_919800000001"), false);
});

test("role migration gives Customer Support the inbox; agents can't hand chats back to AI or message from complaints", () => {
  const support = access.listRoles().find((r) => r.id === "support");
  assert.ok(support.permissions.includes("inbox.view") && support.permissions.includes("inbox.add"));
  const { apiKey } = agents.createAgent({ name: "Support Bot", roleId: "support" }, "t");
  const { token } = agents.issueToken(apiKey);
  assert.equal(guard(token, "GET", "/admin/inbox"), null);
  assert.equal(guard(token, "POST", "/admin/inbox/wa_1/reply", { text: "hi" }), null);
  assert.equal(guard(token, "POST", "/admin/inbox/wa_1/mode", { mode: "human" }), null);
  assert.equal(guard(token, "POST", "/admin/inbox/wa_1/mode", { mode: "ai" }).status, 403);
  assert.equal(guard(token, "POST", "/admin/complaints", { subject: "x" }), null);
  assert.equal(guard(token, "POST", "/admin/complaints/C1/entries", { type: "note", text: "n" }), null);
  assert.equal(guard(token, "POST", "/admin/complaints/C1/entries", { type: "customer_comm", text: "n" }).status, 403);
});

test("complaint messages can be proposed by the complaints agent", () => {
  const { apiKey } = agents.createAgent({ name: "Triage", roleId: "complaints" }, "t");
  const admin = agents.resolveAgent(auth.verifyToken(agents.issueToken(apiKey).token).agentId);
  const out = agents.propose(admin, { title: "Reply to CMP-0001", request: { method: "POST", path: "/admin/complaints/CMP-0001/entries", body: { type: "customer_comm", direction: "outbound", channel: "In-app notification", text: "Sorry…" } } });
  assert.equal(out.action.type, "complaint.message");
});

test("support knowledge is stored with a size limit", () => {
  agents.setConfig({ supportKnowledge: "Hours: 8am-8pm" }, "t");
  assert.equal(agents.getConfig().supportKnowledge, "Hours: 8am-8pm");
  assert.equal(agents.getConfig().enabled, true);
  assert.throws(() => agents.setConfig({ supportKnowledge: "x".repeat(9000) }, "t"), /limited/);
});
