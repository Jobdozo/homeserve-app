// WhatsApp inbox: customer conversations that arrive through MSG91's inbound
// webhook ("On Inbound Request Received"), answered by people or by the
// Customer Support AI agent. Flat-JSON storage (see jsonStore.js).
//
// A conversation is in one of two modes:
//   ai    — the support agent may reply (it's the default for new chats);
//   human — only people reply. A person replying, or the agent handing off,
//           switches to human; only a person can switch it back.
// WhatsApp lets a business send free-form text only within 24 hours of the
// customer's last message, so replies outside that window are refused here.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");
const store = require("./store");
const { sendWhatsAppMessage } = require("./whatsapp");

const CONVERSATIONS = "waConversations";
const MESSAGES = "waMessages";
const MAX_MESSAGES = 20000;
const WINDOW_MS = 24 * 3600 * 1000;
const AI_REPLIES_PER_DAY = 20; // per conversation; beyond this a person takes over
const MAX_TEXT = 4000;

const fail = (status, message) => Object.assign(new Error(message), { status });
const nowIso = () => new Date().toISOString();
const digits = (p) => String(p || "").replace(/\D/g, "");
// India-first normalisation: a bare 10-digit number gets +91.
const normalise = (p) => {
  const d = digits(p);
  if (d.length === 10) return `+91${d}`;
  return d.length >= 11 && d.length <= 15 ? `+${d}` : null;
};
const convId = (phone) => `wa_${digits(phone)}`;

// ---- webhook ingestion ----
// MSG91 payload fields (per their webhook docs): customerNumber, customerName,
// text, contentType, uuid, ts, integratedNumber, eventName. Parsed
// defensively — anything without a sender number is ignored.
function parseInbound(raw) {
  const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const out = [];
  for (const it of items) {
    const phone = normalise(it.customerNumber || it.customer_number || it.from);
    if (!phone) continue;
    const contentType = String(it.contentType || it.content_type || "text").toLowerCase().slice(0, 30);
    let text = typeof it.text === "string" ? it.text : typeof it.text?.body === "string" ? it.text.body : "";
    if (!text && contentType !== "text") text = `[${contentType} received]`;
    if (!text) continue;
    const tsNum = Number(it.ts);
    const at = Number.isFinite(tsNum) && tsNum > 0 ? new Date(tsNum < 1e12 ? tsNum * 1000 : tsNum).toISOString() : nowIso();
    out.push({
      phone,
      name: String(it.customerName || it.customer_name || "").trim().slice(0, 80),
      text: text.slice(0, MAX_TEXT),
      contentType,
      waId: String(it.uuid || it.messageId || it.id || "").slice(0, 200) || null,
      integratedNumber: digits(it.integratedNumber || it.integrated_number),
      at,
    });
  }
  return out;
}

async function ingest(raw, { businessNumber } = {}) {
  const parsed = parseInbound(raw);
  const messages = jsonStore.readAll(MESSAGES);
  const seen = new Set(messages.filter((m) => m.waId).map((m) => m.waId));
  const added = [];
  for (const p of parsed) {
    // Ignore events for some other number on the same MSG91 account.
    if (businessNumber && p.integratedNumber && !digits(businessNumber).endsWith(p.integratedNumber.slice(-10))) continue;
    if (p.waId && seen.has(p.waId)) continue; // MSG91 retries
    const id = convId(p.phone);
    let conv = jsonStore.readAll(CONVERSATIONS).find((c) => c.id === id);
    if (!conv) {
      const customer = await store.getCustomerByPhone(p.phone).catch(() => null);
      conv = jsonStore.insert(CONVERSATIONS, {
        id, phone: p.phone, name: p.name || customer?.name || "", customerId: customer?.id || null,
        mode: "ai", createdAt: nowIso(), lastInboundAt: null, lastMessageAt: null, lastDirection: null, handoffReason: null,
      });
    }
    const msg = { id: `wam_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`, conversationId: id, direction: "in", sender: "customer", text: p.text, contentType: p.contentType, waId: p.waId, at: p.at };
    messages.push(msg);
    if (p.waId) seen.add(p.waId);
    // A customer who signed up after their first message gets linked now.
    let customerId = conv.customerId;
    if (!customerId) customerId = (await store.getCustomerByPhone(p.phone).catch(() => null))?.id || null;
    jsonStore.update(CONVERSATIONS, id, {
      lastInboundAt: msg.at, lastMessageAt: msg.at, lastDirection: "in", lastPreview: p.text.slice(0, 120),
      ...(p.name && !conv.name ? { name: p.name } : {}), ...(customerId ? { customerId } : {}),
    });
    added.push(msg);
  }
  if (added.length) jsonStore.writeAll(MESSAGES, messages.slice(-MAX_MESSAGES));
  return added;
}

// ---- reading ----
const withinWindow = (c) => Boolean(c.lastInboundAt && Date.now() - new Date(c.lastInboundAt).getTime() < WINDOW_MS);
const needsReply = (c) => c.lastDirection === "in";
const publicConv = (c) => ({ ...c, needsReply: needsReply(c), canReply: withinWindow(c) });

// queue: "ai" = chats the support agent should answer now; "needs_reply" = any unanswered.
function listConversations({ queue, mode, q, limit } = {}) {
  const term = String(q || "").trim().toLowerCase();
  return jsonStore
    .readAll(CONVERSATIONS)
    .filter((c) => {
      if (queue === "ai" && !(c.mode === "ai" && needsReply(c) && withinWindow(c))) return false;
      if (queue === "needs_reply" && !needsReply(c)) return false;
      if (mode && c.mode !== mode) return false;
      if (term && !`${c.name} ${c.phone}`.toLowerCase().includes(term)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
    .slice(0, Math.min(Number(limit) || 100, 500))
    .map(publicConv);
}

function getConversation(id, { limit = 50 } = {}) {
  const conv = jsonStore.readAll(CONVERSATIONS).find((c) => c.id === id);
  if (!conv) return null;
  const messages = jsonStore.readAll(MESSAGES).filter((m) => m.conversationId === id).sort((a, b) => new Date(a.at) - new Date(b.at));
  return { conversation: publicConv(conv), messages: messages.slice(-Math.min(Number(limit) || 50, 500)) };
}

// ---- writing ----
async function reply(id, text, actor, { agent = false } = {}) {
  const conv = jsonStore.readAll(CONVERSATIONS).find((c) => c.id === id);
  if (!conv) return null;
  const body = String(text || "").trim().slice(0, 1500);
  if (!body) throw fail(400, "Write a message first");
  if (!withinWindow(conv)) throw fail(409, "It's been over 24 hours since this customer last wrote — WhatsApp only allows approved template messages now");
  const messages = jsonStore.readAll(MESSAGES);
  if (agent) {
    if (conv.mode !== "ai") throw fail(409, "A person has taken over this conversation");
    const since = Date.now() - 24 * 3600 * 1000;
    const recent = messages.filter((m) => m.conversationId === id && m.sender === "ai" && new Date(m.at).getTime() > since).length;
    if (recent >= AI_REPLIES_PER_DAY) throw fail(429, "AI reply limit reached for this conversation today — hand it to a person");
  }
  const delivered = await sendWhatsAppMessage(conv.phone, body).catch(() => false);
  const msg = {
    id: `wam_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    conversationId: id, direction: "out", sender: agent ? "ai" : "staff", actor, text: body, delivered: Boolean(delivered), at: nowIso(),
  };
  messages.push(msg);
  jsonStore.writeAll(MESSAGES, messages.slice(-MAX_MESSAGES));
  jsonStore.update(CONVERSATIONS, id, {
    lastMessageAt: msg.at, lastDirection: "out", lastPreview: body.slice(0, 120),
    // A person replying takes the chat over so the AI doesn't talk over them.
    ...(agent ? {} : { mode: "human" }),
  });
  return msg;
}

function setMode(id, mode, reason, actor) {
  if (!["ai", "human"].includes(mode)) throw fail(400, "mode must be ai or human");
  const conv = jsonStore.readAll(CONVERSATIONS).find((c) => c.id === id);
  if (!conv) return null;
  return publicConv(jsonStore.update(CONVERSATIONS, id, {
    mode,
    handoffReason: mode === "human" ? String(reason || "").slice(0, 300) || null : null,
    modeChangedAt: nowIso(),
    modeChangedBy: actor,
  }));
}

module.exports = { parseInbound, ingest, listConversations, getConversation, reply, setMode, normalise };
