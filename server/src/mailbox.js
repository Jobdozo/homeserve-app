// Email inbox (Admin -> Email Inbox): support@tikdum.com in the admin, sent and
// received through Postmark (https://postmarkapp.com). Flat records (jsonStore);
// attachments as files under DATA_DIR/email.
//
// Receiving: tikdum.com's mail is forwarded by ImprovMX; support@ also forwards
// to the Postmark inbound address, and Postmark posts each email as JSON to
// /api/webhooks/email/postmark (Basic auth: any user name, EMAIL_WEBHOOK_SECRET
// as the password). Sending: Postmark's API with POSTMARK_SERVER_TOKEN, from
// EMAIL_FROM (the domain must be verified in Postmark: DKIM + Return-Path DNS).
//
// Threads: an email joins the thread holding the message it replies to
// (In-Reply-To / References), else an open thread with the same person and
// subject from the last 30 days, else a new thread. Only plain text is shown —
// an email's HTML is turned into text, never rendered in the admin.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const THREADS = "emailThreads";
const MESSAGES = "emailMessages";
const MAX_MESSAGES = 20000;
const MAX_TEXT = 100000;
const MAX_ATTACHMENT = 10 * 1024 * 1024; // per file, received or sent
const MAX_SEND_ATTACHMENTS = 10 * 1024 * 1024; // all files on one sent email
const SAME_SUBJECT_MS = 30 * 24 * 3600 * 1000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILES_DIR = path.join(DATA_DIR, "email");

const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;

let fetchImpl = (...args) => fetch(...args);
const config = () => ({
  token: process.env.POSTMARK_SERVER_TOKEN || "",
  from: (process.env.EMAIL_FROM || "support@tikdum.com").trim().toLowerCase(),
  fromName: process.env.EMAIL_FROM_NAME || "Tikdum Support",
  webhookSecret: process.env.EMAIL_WEBHOOK_SECRET || "",
});

// ---- small helpers ----
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
const cleanEmail = (e) => {
  const v = String(e || "").trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
};
const cleanId = (v) => String(v || "").trim().replace(/^<|>$/g, "").toLowerCase().slice(0, 300) || null;
const idList = (v) => String(v || "").match(/<[^>]+>/g)?.map(cleanId).filter(Boolean) || (cleanId(v) ? [cleanId(v)] : []);
// "Re: Fwd: RE: Booking" -> "booking"
const subjectKey = (s) => String(s || "").replace(/^(\s*(re|fwd?|aw|sv)\s*(\[\d+\])?\s*:\s*)+/i, "").trim().toLowerCase();
const header = (headers, name) => (Array.isArray(headers) ? headers.find((h) => String(h?.Name || "").toLowerCase() === name.toLowerCase())?.Value : undefined);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, e) => {
      if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeFileName = (n) => String(n || "file").replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";

function saveAttachment(messageId, index, { name, contentType, base64 }) {
  const buf = Buffer.from(String(base64 || ""), "base64");
  if (!buf.length) return null;
  const meta = { name: safeFileName(name), type: String(contentType || "application/octet-stream").slice(0, 100), size: buf.length };
  if (buf.length > MAX_ATTACHMENT) return { ...meta, skipped: "over 10 MB" };
  const dir = path.join(FILES_DIR, messageId);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${index}-${meta.name}`;
  fs.writeFileSync(path.join(dir, file), buf);
  return { ...meta, file };
}

// Tikdum customer or provider for an address (looked up once per thread).
async function whoIs(email, lookup) {
  if (!lookup) return {};
  try {
    return (await lookup(email)) || {};
  } catch {
    return {};
  }
}

// ---- receiving (Postmark inbound webhook) ----
// Postmark's inbound JSON: FromFull {Email, Name}, To, Cc, Subject, MessageID
// (Postmark's own id, used to skip retries), Date, TextBody, HtmlBody, Headers
// [{Name, Value}] and Attachments [{Name, Content (base64), ContentType, ContentLength}].
async function ingest(raw, { lookup } = {}) {
  const p = raw && typeof raw === "object" ? raw : {};
  const email = cleanEmail(p.FromFull?.Email || p.From);
  if (!email) throw fail(400, "No sender address");
  const providerMessageId = String(p.MessageID || "").slice(0, 200) || null;
  const messages = jsonStore.readAll(MESSAGES);
  if (providerMessageId && messages.some((m) => m.providerMessageId === providerMessageId)) return { duplicate: true };

  const headers = p.Headers;
  const messageId = cleanId(header(headers, "Message-ID")) || cleanId(providerMessageId && `${providerMessageId}@inbound.postmarkapp.com`);
  const refs = [...new Set([...idList(header(headers, "In-Reply-To")), ...idList(header(headers, "References"))])];
  const subject = String(p.Subject || "").trim().slice(0, 300) || "(no subject)";
  const spam = /^yes/i.test(String(header(headers, "X-Spam-Status") || ""));
  const auto = /^auto-/i.test(String(header(headers, "Auto-Submitted") || "")) || Boolean(header(headers, "X-Autoreply") || header(headers, "X-Autorespond"));
  const text = (String(p.TextBody || "").trim() || htmlToText(p.HtmlBody)).slice(0, MAX_TEXT) || "(empty email)";
  const at = Number.isFinite(Date.parse(p.Date)) ? new Date(p.Date).toISOString() : nowIso();
  const name = String(p.FromFull?.Name || p.FromName || "").replace(/^"|"$/g, "").trim().slice(0, 120);

  // Which thread?
  const threads = jsonStore.readAll(THREADS);
  const byRef = refs.length ? messages.filter((m) => m.messageId && refs.includes(m.messageId)).pop() : null;
  let thread = byRef ? threads.find((t) => t.id === byRef.threadId) : null;
  if (!thread) {
    const key = subjectKey(subject);
    thread = threads
      .filter((t) => t.email === email && t.subjectKey === key && Date.now() - Date.parse(t.lastMessageAt || t.createdAt) < SAME_SUBJECT_MS)
      .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))[0];
  }
  if (!thread) {
    const who = await whoIs(email, lookup);
    thread = jsonStore.insert(THREADS, {
      id: newId("et"), email, name: name || who.name || "", subject, subjectKey: subjectKey(subject),
      customerId: who.customerId || null, providerId: who.providerId || null,
      folder: spam ? "spam" : "inbox", unread: 0, createdAt: nowIso(), lastMessageAt: null, lastDirection: null, lastPreview: "",
    });
  }

  const id = newId("em");
  const attachments = (Array.isArray(p.Attachments) ? p.Attachments : [])
    .slice(0, 20)
    .map((a, i) => saveAttachment(id, i, { name: a.Name, contentType: a.ContentType, base64: a.Content }))
    .filter(Boolean);
  const msg = {
    id, threadId: thread.id, direction: "in", from: email, fromName: name, to: String(p.To || "").slice(0, 500), cc: String(p.Cc || "").slice(0, 500),
    subject, text, attachments, messageId, references: refs.slice(-20), providerMessageId, spam, auto, at,
  };
  messages.push(msg);
  jsonStore.writeAll(MESSAGES, messages.slice(-MAX_MESSAGES));
  jsonStore.update(THREADS, thread.id, {
    lastMessageAt: at, lastDirection: "in", lastPreview: text.replace(/\s+/g, " ").slice(0, 140), unread: (thread.unread || 0) + 1,
    ...(name && !thread.name ? { name } : {}),
    // a real person writing back pulls a thread out of spam
    ...(thread.folder === "spam" && !spam ? { folder: "inbox" } : {}),
  });
  return { message: msg, threadId: thread.id };
}

// ---- reading ----
const publicThread = (t) => ({ ...t, needsReply: t.lastDirection === "in" });

// queue: needs_reply | unread | spam | sent | all (all = everything but spam)
function listThreads({ queue, q, limit } = {}) {
  const term = String(q || "").trim().toLowerCase();
  return jsonStore
    .readAll(THREADS)
    .filter((t) => {
      if (queue === "spam") return t.folder === "spam";
      if (t.folder === "spam") return false;
      if (queue === "needs_reply" && t.lastDirection !== "in") return false;
      if (queue === "unread" && !t.unread) return false;
      if (queue === "sent" && t.lastDirection !== "out") return false;
      if (term && !`${t.name} ${t.email} ${t.subject}`.toLowerCase().includes(term)) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.lastMessageAt || b.createdAt) - Date.parse(a.lastMessageAt || a.createdAt))
    .slice(0, Math.min(Number(limit) || 100, 500))
    .map(publicThread);
}

function getThread(id, { markRead = false } = {}) {
  let thread = jsonStore.readAll(THREADS).find((t) => t.id === id);
  if (!thread) return null;
  if (markRead && thread.unread) thread = jsonStore.update(THREADS, id, { unread: 0 });
  const messages = jsonStore.readAll(MESSAGES).filter((m) => m.threadId === id).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { thread: publicThread(thread), messages: messages.slice(-200) };
}

function attachmentFile(messageId, index) {
  const msg = jsonStore.readAll(MESSAGES).find((m) => m.id === messageId);
  const a = msg?.attachments?.[Number(index)];
  if (!a?.file) return null;
  const full = path.join(FILES_DIR, msg.id, a.file);
  if (!full.startsWith(FILES_DIR + path.sep) || !fs.existsSync(full)) return null;
  return { path: full, name: a.name, type: a.type };
}

function setFolder(id, folder) {
  if (!["inbox", "spam"].includes(folder)) throw fail(400, "folder must be inbox or spam");
  const t = jsonStore.readAll(THREADS).find((x) => x.id === id);
  return t ? publicThread(jsonStore.update(THREADS, id, { folder })) : null;
}

// ---- sending ----
function signature() {
  return "\n\n--\nTikdum Support\nhttps://tikdum.com · +91 94191 49336";
}
function quoteOf(m) {
  if (!m) return "";
  const when = new Date(m.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const lines = String(m.text).split("\n").slice(0, 40).map((l) => `> ${l}`);
  return `\n\nOn ${when}, ${m.fromName || m.from} wrote:\n${lines.join("\n")}`;
}
const textToHtml = (t) => `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(t).replace(/\n/g, "<br>")}</div>`;

// files: [{ name, type, base64 }] from the admin composer.
function checkFiles(files) {
  const list = (Array.isArray(files) ? files : []).slice(0, 5).map((f) => ({ name: safeFileName(f?.name), type: String(f?.type || "application/octet-stream").slice(0, 100), base64: String(f?.base64 || "") }));
  const total = list.reduce((n, f) => n + Math.floor((f.base64.length * 3) / 4), 0);
  if (total > MAX_SEND_ATTACHMENTS) throw fail(413, "Attachments are over 10 MB in total");
  return list.filter((f) => f.base64);
}

async function postmarkSend({ to, subject, text, messageId, inReplyTo, references, files }) {
  const cfg = config();
  if (!cfg.token) throw fail(503, "Email sending isn't set up on the server (POSTMARK_SERVER_TOKEN)");
  const headers = [{ Name: "Message-ID", Value: `<${messageId}>` }];
  if (inReplyTo) headers.push({ Name: "In-Reply-To", Value: `<${inReplyTo}>` });
  if (references?.length) headers.push({ Name: "References", Value: references.map((r) => `<${r}>`).join(" ") });
  const res = await fetchImpl("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": cfg.token },
    body: JSON.stringify({
      From: `${cfg.fromName} <${cfg.from}>`, To: to, Subject: subject, TextBody: text, HtmlBody: textToHtml(text),
      ReplyTo: cfg.from, Headers: headers, MessageStream: "outbound", TrackOpens: false,
      Attachments: files.map((f) => ({ Name: f.name, Content: f.base64, ContentType: f.type })),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ErrorCode) throw fail(502, `Postmark didn't send it: ${body.Message || `HTTP ${res.status}`}`);
  return String(body.MessageID || "");
}

function recordOut(thread, { to, subject, text, files, messageId, providerMessageId, refs, actor }) {
  const id = newId("em");
  const attachments = files.map((f, i) => saveAttachment(id, i, f)).filter(Boolean);
  const msg = {
    id, threadId: thread.id, direction: "out", from: config().from, fromName: config().fromName, to, subject, text,
    attachments, messageId, references: refs, providerMessageId, actor, at: nowIso(),
  };
  const messages = jsonStore.readAll(MESSAGES);
  messages.push(msg);
  jsonStore.writeAll(MESSAGES, messages.slice(-MAX_MESSAGES));
  jsonStore.update(THREADS, thread.id, { lastMessageAt: msg.at, lastDirection: "out", lastPreview: text.replace(/\s+/g, " ").slice(0, 140), unread: 0, folder: "inbox" });
  return msg;
}

async function reply(threadId, { text, files } = {}, actor) {
  const found = getThread(threadId);
  if (!found) return null;
  const body = String(text || "").trim().slice(0, 20000);
  if (!body) throw fail(400, "Write a message first");
  const sendFiles = checkFiles(files);
  const { thread, messages } = found;
  const lastIn = [...messages].reverse().find((m) => m.direction === "in");
  const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
  const full = `${body}${signature()}${quoteOf(lastIn)}`;
  const messageId = `${newId("em")}@tikdum.com`;
  const refs = [...new Set(messages.flatMap((m) => [...(m.references || []), m.messageId]).filter(Boolean))].slice(-20);
  const providerMessageId = await postmarkSend({ to: thread.email, subject, text: full, messageId, inReplyTo: lastIn?.messageId, references: refs, files: sendFiles });
  return recordOut(thread, { to: thread.email, subject, text: full, files: sendFiles, messageId, providerMessageId, refs, actor });
}

async function compose({ to, subject, text, files, customerId, providerId, name } = {}, actor, { lookup } = {}) {
  const email = cleanEmail(to);
  if (!email) throw fail(400, "That email address doesn't look right");
  const subj = String(subject || "").trim().slice(0, 300);
  if (!subj) throw fail(400, "Add a subject");
  const body = String(text || "").trim().slice(0, 20000);
  if (!body) throw fail(400, "Write a message first");
  const sendFiles = checkFiles(files);
  const full = `${body}${signature()}`;
  const messageId = `${newId("em")}@tikdum.com`;
  const providerMessageId = await postmarkSend({ to: email, subject: subj, text: full, messageId, files: sendFiles });
  const who = customerId || providerId ? {} : await whoIs(email, lookup);
  const thread = jsonStore.insert(THREADS, {
    id: newId("et"), email, name: String(name || who.name || "").slice(0, 120), subject: subj, subjectKey: subjectKey(subj),
    customerId: customerId || who.customerId || null, providerId: providerId || who.providerId || null,
    folder: "inbox", unread: 0, createdAt: nowIso(), lastMessageAt: null, lastDirection: null, lastPreview: "",
  });
  const msg = recordOut(thread, { to: email, subject: subj, text: full, files: sendFiles, messageId, providerMessageId, refs: [], actor });
  return { message: msg, threadId: thread.id };
}

function status() {
  const cfg = config();
  return { sending: Boolean(cfg.token), receiving: Boolean(cfg.webhookSecret), from: cfg.from, fromName: cfg.fromName };
}

// Basic auth on the webhook: any user name, the secret as the password.
function webhookAuthorized(authorization) {
  const secret = config().webhookSecret;
  if (!secret) return false;
  const m = /^Basic\s+(.+)$/i.exec(String(authorization || ""));
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const given = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const want = Buffer.from(secret);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

module.exports = {
  ingest, listThreads, getThread, attachmentFile, setFolder, reply, compose, status, webhookAuthorized,
  htmlToText, subjectKey, cleanEmail,
  _setFetch: (f) => { fetchImpl = f; },
};
