// Image Studio: draws pictures for services, catalog items, service types and categories with
// Google Gemini, in Tikdum's look, and lets a person approve each one before it is used.
//
// What it does, in order, for one target:
//   1. works out who (if anyone) should be in the picture — women for women's grooming, men for
//      men's, and NO people at all for intimate services (waxing, massage, body polishing):
//      those get a product still life instead;
//   2. writes the picture brief from Tikdum's style guide (brand purple, clean, no text/logos);
//   3. asks the Gemini image model for the picture;
//   4. has a Gemini text model look at the result (text/watermark? wrong gender? people where
//      there should be none?) and tries again, up to MAX_TRIES;
//   5. keeps it as a *candidate* — nothing is published until an admin approves it.
//
// Needs GEMINI_API_KEY. GEMINI_IMAGE_MODEL / GEMINI_TEXT_MODEL are optional: when unset the studio
// asks Google which models the key can use and picks the newest image model and flash text model.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jsonStore = require("./jsonStore");
const { UPLOADS_DIR } = require("./uploads");

const CANDIDATES = "imageCandidates";
const USAGE = "imageStudioUsage";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MAX_TRIES = 2;
const DAILY_LIMIT = Number(process.env.IMAGE_STUDIO_DAILY_LIMIT) || 80;
const MAX_QUEUE = 25;
const STALE_MS = 6 * 60 * 1000;

const fail = (status, message) => Object.assign(new Error(message), { status });
const key = () => process.env.GEMINI_API_KEY || "";
const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// ---------------- who is in the picture ----------------
const MEN = /\b(men|men's|mens|gents?|male|barber|beard|shav(?:e|ing)|groom(?:ing)?\s+for\s+men)\b/i;
const WOMEN = /\b(women|women's|ladies|lady|female|bridal|bride|facial|bleach|d-?\s?tan|clean\s?-?ups?|threading|manicure|pedicure|mani-?pedi|nail|hair\s?spa|blow\s?dry|makeup|mehendi|mehndi)\b/i;
// Services on the body: the picture shows products and tools, never a person.
const INTIMATE = /\b(wax(?:ing)?|bikini|brazilian|underarms?|buttocks|body\s?polish(?:ing)?|body\s?massage|massage|body\s?spa|full\s?body|hair\s?removal|stomach|full\s?legs?|half\s?legs?)\b/i;

function audienceFor({ name = "", category = "", type = "", override = "auto" }) {
  if (["female", "male", "any"].includes(override)) return { audience: override, people: !INTIMATE.test(`${name} ${type}`) };
  const text = `${name} ${type}`;
  const salon = /salon|spa|beauty|grooming/i.test(category);
  let audience = "any";
  if (MEN.test(text) || /for men/i.test(category)) audience = "male";
  else if (WOMEN.test(text) || (salon && !MEN.test(text))) audience = "female";
  return { audience, people: !INTIMATE.test(text) };
}

// ---------------- the brief ----------------
const STYLE =
  "Photorealistic, bright, clean commercial photograph for a home-services app in India. Soft natural light, shallow depth of field, warm and trustworthy mood. " +
  "Use soft purple (#5B3FE0) and white as accent colours in the props, uniform or background. " +
  "Absolutely no text, no letters, no numbers, no logos, no brand names, no watermarks, no borders. Natural proportions, correct hands, no distortion.";

function personLine(audience) {
  const who = audience === "female" ? "an Indian woman professional in her late twenties" : audience === "male" ? "an Indian man professional in his thirties" : "a friendly Indian home-service professional";
  return `${who}, wearing a neat purple-and-white uniform, smiling warmly, working with the tools of the job.`;
}

const KINDS = {
  service: { ratio: "1:1", label: "a service" },
  catalog: { ratio: "1:1", label: "a service" },
  subcategory: { ratio: "1:1", label: "a type of service" },
  category: { ratio: "16:9", label: "a service category banner (wide)" },
};

function buildBrief({ kind, name, category, type, tagline, audience, people }) {
  const subject = [name, type && type !== name ? `(${type})` : "", category ? `in ${category}` : ""].filter(Boolean).join(" ");
  const scene = people
    ? personLine(audience)
    : "Product still life only: the generic, unbranded products and tools used for this service, neatly arranged on a soft lavender surface in a spotless bright treatment room. No people and no body parts.";
  const wide = KINDS[kind]?.ratio === "16:9" ? " Wide composition with calm space on the left for a heading." : " Square composition, subject centred with breathing room.";
  return `${STYLE} Subject — ${KINDS[kind]?.label || "a service"}: ${subject}${tagline ? `. ${tagline}` : ""}. ${scene}${wide}`;
}

// ---------------- talking to Gemini ----------------
async function gemini(pathPart, body, { method = "POST", timeoutMs = 90000 } = {}) {
  if (!key()) throw fail(400, "Gemini isn't set up yet — add GEMINI_API_KEY to the server settings.");
  const res = await fetch(`${API}/${pathPart}`, {
    method,
    headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.error?.message || `Gemini returned ${res.status}`).replace(key(), "***").slice(0, 300);
    throw fail(res.status === 429 ? 429 : 502, msg);
  }
  return data;
}

let modelCache = { at: 0, models: [] };
async function listModels() {
  if (Date.now() - modelCache.at < 3600 * 1000 && modelCache.models.length) return modelCache.models;
  const out = [];
  let token = "";
  for (let i = 0; i < 4; i++) {
    const data = await gemini(`models?pageSize=200${token ? `&pageToken=${token}` : ""}`, null, { method: "GET", timeoutMs: 20000 });
    out.push(...(data.models || []));
    token = data.nextPageToken;
    if (!token) break;
  }
  modelCache = { at: Date.now(), models: out.map((m) => ({ name: String(m.name).replace(/^models\//, ""), methods: m.supportedGenerationMethods || [] })) };
  return modelCache.models;
}

function newestFirst(a, b) {
  return b.localeCompare(a, undefined, { numeric: true });
}
function pickModels(models) {
  const can = models.filter((m) => m.methods.includes("generateContent")).map((m) => m.name);
  const image = can.filter((n) => /image/i.test(n) && !/tts|live|audio|embedding/i.test(n));
  const preferred = image.filter((n) => /flash-image/i.test(n));
  const text = can.filter((n) => /^gemini-/i.test(n) && /flash/i.test(n) && !/image|tts|live|audio|embedding|thinking|lite/i.test(n));
  return {
    imageModel: process.env.GEMINI_IMAGE_MODEL || [...(preferred.length ? preferred : image)].sort(newestFirst)[0] || null,
    textModel: process.env.GEMINI_TEXT_MODEL || [...text].sort(newestFirst)[0] || null,
  };
}

async function models() {
  if (process.env.GEMINI_IMAGE_MODEL && process.env.GEMINI_TEXT_MODEL) return { imageModel: process.env.GEMINI_IMAGE_MODEL, textModel: process.env.GEMINI_TEXT_MODEL };
  return pickModels(await listModels());
}

// One picture. Returns { mime, data (Buffer) }.
async function drawImage(imageModel, prompt, ratio) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ratio } },
  };
  const data = await gemini(`models/${imageModel}:generateContent`, body);
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const blob = img?.inlineData || img?.inline_data;
  if (!blob) {
    const why = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "no picture came back";
    throw fail(422, `Gemini didn't return a picture (${why})`);
  }
  return { mime: blob.mimeType || blob.mime_type || "image/png", data: Buffer.from(blob.data, "base64") };
}

// A second look, by a text model that can see the picture.
async function inspect(textModel, image, expect) {
  const ask =
    "You check pictures for a home-services marketplace. Look at the picture and answer with ONLY a JSON object: " +
    '{"hasText": boolean (any readable text, logo or watermark), "peopleCount": number, "personGender": "female"|"male"|"none"|"mixed", "distorted": boolean (bad hands/face/limbs or strange objects), "issues": string[]}';
  const data = await gemini(`models/${textModel}:generateContent`, {
    contents: [{ parts: [{ text: ask }, { inlineData: { mimeType: image.mime, data: image.data.toString("base64") } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
  let r;
  try {
    r = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim());
  } catch {
    return { ok: false, issues: ["The checker's answer couldn't be read"], checked: false };
  }
  const issues = Array.isArray(r.issues) ? r.issues.map(String).slice(0, 5) : [];
  if (r.hasText) issues.push("Has text, a logo or a watermark");
  if (r.distorted) issues.push("Looks distorted");
  if (!expect.people && Number(r.peopleCount) > 0) issues.push("Shows a person but this service should show products only");
  if (expect.people && (expect.audience === "female" || expect.audience === "male") && Number(r.peopleCount) > 0 && r.personGender !== expect.audience && r.personGender !== "none") {
    issues.push(`Shows ${r.personGender} but ${expect.audience} was wanted`);
  }
  if (expect.people && Number(r.peopleCount) === 0 && expect.audience !== "any") issues.push("No person in the picture");
  return { ok: issues.length === 0, issues, checked: true, peopleCount: Number(r.peopleCount) || 0, personGender: r.personGender || "none" };
}

// ---------------- candidates ----------------
const extFor = (mime) => (/jpe?g/.test(mime) ? ".jpg" : /webp/.test(mime) ? ".webp" : ".png");

function deleteFile(url) {
  if (!url || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(url)) return;
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, url.slice("/uploads/".length)));
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Image studio: couldn't remove a file", e.message);
  }
}

function usageToday() {
  return jsonStore.readAll(USAGE).find((u) => u.id === istDay())?.count || 0;
}
function addUsage() {
  const id = istDay();
  const row = jsonStore.readAll(USAGE).find((u) => u.id === id);
  if (row) jsonStore.update(USAGE, id, { count: row.count + 1 });
  else jsonStore.insert(USAGE, { id, count: 1 });
}

function listCandidates({ status, targetType, targetId } = {}) {
  const now = Date.now();
  return jsonStore
    .readAll(CANDIDATES)
    .map((c) => (c.status === "generating" && now - new Date(c.createdAt).getTime() > STALE_MS ? { ...c, status: "failed", error: "Timed out — try again" } : c))
    .filter((c) => (!status || c.status === status) && (!targetType || c.targetType === targetType) && (!targetId || c.targetId === targetId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// The worker: strictly one picture at a time per process, so a big batch can't flood Gemini.
let running = false;
const queue = [];
async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await processJob(job);
    } catch (e) {
      jsonStore.update(CANDIDATES, job.id, { status: "failed", error: String(e.message || e).slice(0, 300) });
    }
  }
  running = false;
}

async function processJob(job) {
  const { imageModel, textModel } = await models();
  if (!imageModel) throw fail(400, "This Gemini key can't use any image model");
  let last = null;
  let qc = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    if (usageToday() >= DAILY_LIMIT) throw fail(429, `Daily limit of ${DAILY_LIMIT} pictures reached — try again tomorrow`);
    addUsage();
    const brief = attempt === 1 ? job.prompt : `${job.prompt} Avoid these problems seen in the previous try: ${(qc?.issues || []).join("; ") || "none"}.`;
    const image = await drawImage(imageModel, brief, job.ratio);
    qc = textModel ? await inspect(textModel, image, job.expect).catch((e) => ({ ok: false, issues: [`The check couldn't run: ${e.message}`], checked: false })) : { ok: true, issues: [], checked: false };
    if (last) deleteFile(last.url);
    const file = `${crypto.randomBytes(16).toString("hex")}${extFor(image.mime)}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, file), image.data);
    last = { url: `/uploads/${file}` };
    if (qc.ok) break;
  }
  jsonStore.update(CANDIDATES, job.id, { status: "pending", url: last.url, qc, imageModel, tries: MAX_TRIES });
}

// targets: [{ targetType, targetId, name, category, type, tagline, audience? }]
function enqueue(targets, actor) {
  if (!key()) throw fail(400, "Gemini isn't set up yet — add GEMINI_API_KEY to the server settings.");
  const list = Array.isArray(targets) ? targets : [];
  if (list.length === 0) throw fail(400, "Choose at least one item");
  if (list.length > MAX_QUEUE) throw fail(400, `Choose at most ${MAX_QUEUE} items at a time`);
  const open = new Set(listCandidates().filter((c) => ["generating", "pending"].includes(c.status)).map((c) => `${c.targetType}:${c.targetId}`));
  const made = [];
  for (const t of list) {
    if (!KINDS[t.targetType] || !t.targetId || !t.name) continue;
    const k = `${t.targetType}:${t.targetId}`;
    if (open.has(k)) continue; // already being drawn, or waiting for approval
    const who = audienceFor({ name: t.name, category: t.category, type: t.type, override: t.audience });
    const prompt = buildBrief({ kind: t.targetType, name: t.name, category: t.category, type: t.type, tagline: t.tagline, ...who });
    const row = jsonStore.insert(CANDIDATES, {
      targetType: t.targetType,
      targetId: String(t.targetId),
      name: String(t.name).slice(0, 120),
      category: String(t.category || "").slice(0, 80),
      type: String(t.type || "").slice(0, 80),
      tagline: String(t.tagline || "").slice(0, 120),
      audience: who.audience,
      people: who.people,
      prompt,
      status: "generating",
      createdAt: new Date().toISOString(),
      requestedBy: actor || null,
    });
    queue.push({ id: row.id, prompt, ratio: KINDS[t.targetType].ratio, expect: who });
    made.push(row);
    open.add(k);
  }
  pump();
  return made;
}

// Admin decided: the picture was used (the page uploads the final, resized copy) or thrown away.
function settle(id, status, actor) {
  const c = jsonStore.readAll(CANDIDATES).find((x) => x.id === id);
  if (!c) return null;
  deleteFile(c.url);
  return jsonStore.update(CANDIDATES, id, { status, url: null, decidedBy: actor || null, decidedAt: new Date().toISOString() });
}

async function status() {
  const out = { configured: Boolean(key()), usedToday: usageToday(), dailyLimit: DAILY_LIMIT, imageModel: null, textModel: null, error: null };
  if (!out.configured) return out;
  try {
    Object.assign(out, await models());
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

module.exports = { audienceFor, buildBrief, pickModels, enqueue, settle, listCandidates, status, MAX_QUEUE, DAILY_LIMIT, _inspect: inspect, _drawImage: drawImage };
