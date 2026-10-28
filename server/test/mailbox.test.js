const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-mailbox-"));
process.env.POSTMARK_SERVER_TOKEN = "test-token";
process.env.EMAIL_WEBHOOK_SECRET = "s3cret-webhook";
const mailbox = require("../src/mailbox");
const access = require("../src/access");

const inbound = (over = {}) => ({
  FromFull: { Email: "Asha@Example.com", Name: "Asha Gupta" },
  To: "support@tikdum.com",
  Subject: "Sofa cleaning booking",
  MessageID: `pm-${Math.random()}`,
  Date: "Tue, 28 Oct 2026 10:00:00 +0530",
  TextBody: "Hello, my cleaner didn't come.",
  Headers: [{ Name: "Message-ID", Value: "<first@mail.example.com>" }],
  ...over,
});

test("Email inbox: an email starts a thread, retries are skipped, the customer is looked up once", async () => {
  let lookups = 0;
  const lookup = async (email) => {
    lookups++;
    return email === "asha@example.com" ? { customerId: "c1", name: "Asha G" } : {};
  };
  const raw = inbound({ MessageID: "pm-1" });
  const first = await mailbox.ingest(raw, { lookup });
  assert.equal((await mailbox.ingest(raw, { lookup })).duplicate, true, "Postmark retries are ignored");
  const [t] = mailbox.listThreads({ queue: "needs_reply" });
  assert.equal(t.id, first.threadId);
  assert.equal(t.email, "asha@example.com");
  assert.equal(t.customerId, "c1");
  assert.equal(t.name, "Asha Gupta");
  assert.equal(t.unread, 1);
  assert.equal(lookups, 1);

  // A reply quoting our subject, without threading headers, joins by person + subject.
  await mailbox.ingest(inbound({ MessageID: "pm-2", Subject: "RE: Sofa cleaning booking", Headers: [] }), { lookup });
  assert.equal(mailbox.listThreads({}).length, 1);
  const opened = mailbox.getThread(first.threadId, { markRead: true });
  assert.equal(opened.messages.length, 2);
  assert.equal(opened.thread.unread, 0, "opening it marks it read");
  assert.equal(mailbox.listThreads({ queue: "unread" }).length, 0);
  assert.equal(lookups, 1);
});

test("Email inbox: HTML-only emails become plain text; spam goes to the spam folder", async () => {
  const out = await mailbox.ingest(
    inbound({
      MessageID: "pm-html", FromFull: { Email: "promo@spam.example", Name: "" }, Subject: "WIN",
      TextBody: "", HtmlBody: "<style>p{}</style><p>Hi &amp; welcome<br>Line two</p><script>alert(1)</script>",
      Headers: [{ Name: "X-Spam-Status", Value: "Yes, score=9" }],
    }),
  );
  const { messages, thread } = mailbox.getThread(out.threadId);
  assert.equal(messages[0].text, "Hi & welcome\nLine two");
  assert.equal(thread.folder, "spam");
  assert.ok(!mailbox.listThreads({}).some((t) => t.id === out.threadId), "spam stays out of the inbox");
  assert.ok(mailbox.listThreads({ queue: "spam" }).some((t) => t.id === out.threadId));
  assert.equal(mailbox.setFolder(out.threadId, "inbox").folder, "inbox");
  assert.equal(mailbox.htmlToText("A&#8377;5 &nbsp;x"), "A₹5  x");
  assert.equal(mailbox.subjectKey("Re: Fwd: RE: Booking"), "booking");
});

test("Email inbox: attachments are saved and served only from the email folder", async () => {
  const out = await mailbox.ingest(
    inbound({
      MessageID: "pm-att", FromFull: { Email: "ravi@example.com", Name: "Ravi" }, Subject: "Invoice",
      Attachments: [{ Name: "../../bill.pdf", Content: Buffer.from("%PDF-1").toString("base64"), ContentType: "application/pdf" }],
    }),
  );
  const { messages } = mailbox.getThread(out.threadId);
  const [a] = messages[0].attachments;
  assert.equal(a.size, 6);
  assert.ok(!a.name.includes("/"), "no path in the saved name");
  const f = mailbox.attachmentFile(messages[0].id, 0);
  assert.equal(fs.readFileSync(f.path, "utf8"), "%PDF-1");
  assert.equal(mailbox.attachmentFile(messages[0].id, 5), null);
});

test("Email inbox: replies go through Postmark with threading headers, a signature and the quoted email", async () => {
  const calls = [];
  mailbox._setFetch(async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ ErrorCode: 0, MessageID: "pm-out-1" }) };
  });
  const out = await mailbox.ingest(inbound({ MessageID: "pm-r", FromFull: { Email: "neha@example.com", Name: "Neha" }, Subject: "Refund", Headers: [{ Name: "Message-ID", Value: "<n1@mail.example.com>" }] }));
  const msg = await mailbox.reply(out.threadId, { text: "We're on it.", files: [{ name: "note.txt", type: "text/plain", base64: Buffer.from("hi").toString("base64") }] }, "Asha (+91…)");
  const { body, opts } = calls[0];
  assert.equal(calls[0].url, "https://api.postmarkapp.com/email");
  assert.equal(opts.headers["X-Postmark-Server-Token"], "test-token");
  assert.equal(body.To, "neha@example.com");
  assert.equal(body.Subject, "Re: Refund");
  assert.equal(body.From, "Tikdum Support <support@tikdum.com>");
  assert.match(body.TextBody, /^We're on it\.\n\n--\nTikdum Support/);
  assert.match(body.TextBody, /Neha wrote:\n> Hello, my cleaner didn't come\./);
  assert.ok(!/<script/i.test(body.HtmlBody));
  const h = Object.fromEntries(body.Headers.map((x) => [x.Name, x.Value]));
  assert.equal(h["In-Reply-To"], "<n1@mail.example.com>");
  assert.match(h["Message-ID"], /^<em_[a-z0-9]+@tikdum\.com>$/);
  assert.equal(body.Attachments[0].Name, "note.txt");
  assert.equal(msg.providerMessageId, "pm-out-1");
  const t = mailbox.getThread(out.threadId).thread;
  assert.equal(t.lastDirection, "out");
  assert.equal(t.needsReply, false);

  // Their answer to our reply joins the thread by In-Reply-To even with a new subject.
  await mailbox.ingest(inbound({ MessageID: "pm-r2", FromFull: { Email: "neha@example.com", Name: "Neha" }, Subject: "thanks", Headers: [{ Name: "In-Reply-To", Value: `<${msg.messageId}>` }] }));
  assert.equal(mailbox.getThread(out.threadId).messages.length, 3);
});

test("Email inbox: compose checks the address and reports Postmark errors", async () => {
  mailbox._setFetch(async () => ({ ok: false, status: 422, json: async () => ({ ErrorCode: 406, Message: "Inactive recipient" }) }));
  await assert.rejects(mailbox.compose({ to: "not-an-email", subject: "x", text: "y" }, "me"), /doesn't look right/);
  await assert.rejects(mailbox.compose({ to: "a@b.co", subject: "", text: "y" }, "me"), /subject/);
  await assert.rejects(mailbox.compose({ to: "a@b.co", subject: "Hi", text: "y" }, "me"), /Inactive recipient/);
  await assert.rejects(
    mailbox.compose({ to: "a@b.co", subject: "Hi", text: "y", files: [{ name: "big", base64: "A".repeat(15 * 1024 * 1024) }] }, "me"),
    /over 10 MB/,
  );
  mailbox._setFetch(async () => ({ ok: true, status: 200, json: async () => ({ ErrorCode: 0, MessageID: "pm-new" }) }));
  const out = await mailbox.compose({ to: "Vendor@Example.com", subject: "Quote", text: "Please send a quote.", providerId: "p9", name: "Vendor" }, "me");
  const t = mailbox.getThread(out.threadId).thread;
  assert.equal(t.email, "vendor@example.com");
  assert.equal(t.providerId, "p9");
});

test("Email inbox: webhook credentials and permissions", () => {
  const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  assert.equal(mailbox.webhookAuthorized(basic("postmark", "s3cret-webhook")), true);
  assert.equal(mailbox.webhookAuthorized(basic("postmark", "wrong")), false);
  assert.equal(mailbox.webhookAuthorized(undefined), false);
  assert.deepEqual(mailbox.status(), { sending: true, receiving: true, from: "support@tikdum.com", fromName: "Tikdum Support" });
  assert.equal(access.requiredFor("GET", "/admin/email"), "email.view");
  assert.equal(access.requiredFor("POST", "/admin/email/threads/et_1/reply"), "email.add");
});
