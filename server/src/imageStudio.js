// Image Studio: draws pictures for services, catalog items, service types and categories with
// Google Gemini, in Tikdum's look, and lets a person approve each one before it is used.
//
// What it does, in order, for one target:
//   0. index.js looks the target up in Tikdum's own records first (name, category, type, what's
//      included) — the server never draws from names a browser sent, and skips anything not found;
//   1. works out who (if anyone) should be in the picture — women for women's grooming, men for
//      men's, and NO people at all for intimate services (waxing, massage, body polishing):
//      those get a product still life instead;
//   2. writes the picture brief from Tikdum's style guide (clean, no text/logos) with the
//      category's colour as an accent (imageStyle.js);
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
const { UPLOADS_DIR, removeFile } = require("./uploads");
const imageStyle = require("./imageStyle");

const CANDIDATES = "imageCandidates";
const USAGE = "imageStudioUsage";
const API = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MAX_TRIES = 2;
const DAILY_LIMIT = Number(process.env.IMAGE_STUDIO_DAILY_LIMIT) || 80;
const MAX_QUEUE = 25;
const STALE_MS = 6 * 60 * 1000;

const fail = (status, message) => Object.assign(new Error(message), { status });
const key = () => process.env.GEMINI_API_KEY || "";
// Second picture maker: Cloudflare Workers AI (FLUX). Used when Gemini isn't set up, is out of
// quota, or fails; IMAGE_PROVIDER=gemini|cloudflare forces one. Set with deploy/set-cloudflare-ai.sh.
const CF_API = process.env.CF_API_BASE || "https://api.cloudflare.com/client/v4";
const cf = () => ({ account: process.env.CF_AI_ACCOUNT_ID || "", token: process.env.CF_AI_TOKEN || "", model: process.env.CF_AI_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell" });
const cfReady = () => Boolean(cf().account && cf().token);
const provider = () => String(process.env.IMAGE_PROVIDER || "auto").toLowerCase();
const configured = () => Boolean(key()) || cfReady();
const NOT_SET_UP = "No picture maker is set up yet — add Cloudflare Workers AI (deploy/set-cloudflare-ai.sh) or GEMINI_API_KEY to the server settings.";
// After Gemini says "quota exceeded", it isn't asked again for an hour.
const GEMINI_REST_MS = 60 * 60 * 1000;
let geminiRestUntil = 0;
const geminiResting = () => Date.now() < geminiRestUntil;
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
  "Absolutely no text, no letters, no numbers, no logos, no brand names, no watermarks, no borders. Natural proportions, correct hands, no distortion.";

function personLine(audience) {
  const who = audience === "female" ? "an Indian woman professional in her late twenties" : audience === "male" ? "an Indian man professional in his thirties" : "a friendly Indian home-service professional";
  // Tikdum's uniform is a black polo (trades add a black cap), as in the category photos. "Plain … no
  // badges": picture models otherwise invent name tags and logos with gibberish lettering; the real
  // Tikdum logo is stamped on afterwards (stampLogo).
  const outfit =
    audience === "female"
      ? "a neat plain black salon uniform top"
      : "a neat plain black polo T-shirt uniform and a plain black cap";
  return `${who}, wearing ${outfit} with no badges, patches, name tags, embroidery, logos or lettering, smiling warmly, working with the tools of the job.`;
}

const KINDS = {
  service: { ratio: "1:1", label: "a service" },
  catalog: { ratio: "1:1", label: "a service" },
  subcategory: { ratio: "1:1", label: "a type of service" },
  category: { ratio: "16:9", label: "a service category banner (wide)" },
};

// What the picture shows:
//   person   — a professional at work (personLine);
//   service  — the service itself, no people: the place, appliance or finished result, described
//              for THIS service (sceneFor) — the default in Admin;
//   products — a still life of products and tools: always for body services (waxing, massage …).
// A shared list of examples ("a bathroom for cleaning, an AC for AC repair …") made every picture
// an AC or a chimney: each service gets its own description instead, with no examples.
const PRODUCTS_SCENE =
  "Product still life only: the generic, unbranded products and tools used for this service, neatly arranged on a soft lavender surface in a spotless bright treatment room. No people and no body parts.";

// Built-in scenes, most specific first; matched on the service name, then its category.
const SCENES = [
  [/water\s?tank|overhead tank|sump/i, "a clean blue plastic water storage tank on a sunny rooftop, its lid open, with a hose, a long brush and a bucket beside it"],
  [/\bro\b|purifier|water filter|candle/i, "a wall-mounted RO water purifier in a clean kitchen, with new filter cartridges and a glass of clear water on the counter below it"],
  [/chimney|gas stove|hob|burner/i, "a gleaming stainless-steel kitchen chimney above a spotless gas stove, with service tools and a cloth on the counter"],
  [/bathroom|toilet|washroom/i, "a spotless, sparkling modern bathroom with shining white tiles, a gleaming washbasin and toilet, with cleaning bottles and a scrub brush placed neatly in a corner"],
  [/sofa|upholster|chair cleaning|mattress/i, "a fresh, clean fabric sofa in a bright living room with an upholstery cleaning machine and its wand beside it"],
  [/carpet|rug/i, "a freshly cleaned carpet with bright colours in a living room, a carpet cleaning machine parked at its edge"],
  [/kitchen clean|kitchen deep|cabinets? clean/i, "a spotless modern Indian kitchen with gleaming countertops and cabinet fronts, cleaning sprays and microfibre cloths placed neatly"],
  [/cockroach|termite|bed ?bug|mosquito|lizard|rodent|\brat\b|\bant\b|pest/i, "a pest control sprayer canister and a gel bait applicator beside the base of clean kitchen cabinets in a spotless kitchen"],
  [/\bac\b|air ?condition|split ac|window ac/i, "a modern white split air conditioner mounted high on a clean wall with its front panel open, a gauge manifold and tools on a step stool below"],
  [/geyser|water heater/i, "a white electric water geyser on a bathroom wall with its cover off, a multimeter and screwdrivers on a shelf beside it"],
  [/washing machine/i, "a front-loading washing machine in a clean utility area with its back panel removed, a multimeter and tools laid out beside it"],
  [/fridge|refrigerator/i, "a double-door refrigerator in a clean kitchen with its lower service panel open and repair tools on a mat in front of it"],
  [/microwave|oven/i, "a microwave oven on a kitchen counter with its outer cover removed and a screwdriver set beside it"],
  [/\btv\b|television|led tv/i, "a large flat-screen TV lying face down on a soft mat with its back cover open and repair tools beside it"],
  [/mixer|grinder|iron\b|kettle|toaster|small appliance/i, "a mixer grinder and an electric iron opened up on a tidy repair bench with screwdrivers and spare parts"],
  [/inverter|battery|ups\b/i, "a home inverter and battery in a neat corner with fresh wiring, a multimeter and terminal tools"],
  [/fan\b|ceiling fan|exhaust/i, "a new ceiling fan being fitted to a clean white ceiling, with its blades and a screwdriver set on a step ladder"],
  [/\b(lights?|led|lamps?|bulbs?|lighting)\b/i, "a bright modern room with new ceiling lights and LED fittings, a box of bulbs and a screwdriver on a table"],
  [/electric|switch|socket|wiring|mcb|doorbell/i, "an open electrical distribution board with neat colour-coded wiring, a multimeter, insulated screwdrivers and a new switch plate on a workbench"],
  [/plumb|tap|faucet|pipe|leak|drain|basin|sink|flush/i, "a gleaming chrome tap over a clean sink with a pipe wrench, plumber's tape and new pipe fittings laid out on the counter"],
  [/laptop|computer|\bpc\b|desktop|printer|data recovery|virus/i, "an open laptop and a desktop tower on a tidy repair desk with a precision screwdriver set, memory sticks and an anti-static mat"],
  [/cctv|camera|security/i, "a white CCTV security camera mounted on the corner of a clean house wall, with a coil of cable and tools below"],
  [/paint|whitewash|texture/i, "a freshly painted wall in a soft colour with paint rollers, a paint tray and paint buckets on a drop cloth"],
  [/wallpaper|interior|false ceiling|ceiling|curtain|blind|modular/i, "a stylish modern living room with fresh wallpaper, a false ceiling with warm lights and new curtains"],
  [/carpent|furniture|wood|door|cabinet|\bbed\b|wardrobe|\block\b/i, "a solid wooden cabinet door being fitted on a workbench, with a drill, chisels, a measuring tape and wood shavings"],
  [/mason|brick|tile|tiling|grout|cement|plaster|wall repair/i, "a freshly tiled wall and floor with a trowel, tile spacers and a bucket of grout beside it"],
  [/pack|mover|shifting|relocat|transport|vehicle/i, "neatly stacked, taped cardboard moving boxes and bubble-wrapped furniture in a bright empty room, a moving truck visible through the window"],
  [/laundry|dry clean|ironing|press/i, "neatly folded fresh laundry and crisp pressed shirts on hangers beside a steam iron"],
  [/domestic|maid|house ?help|cook|babysit|elder|caretaker/i, "a tidy, freshly organised home: a made bed with folded towels, a clean floor and a neat kitchen in the background"],
  [/clean|sanitis|disinfect/i, "a bright, spotless living room with shining floors, with a mop, a bucket and cleaning supplies neatly placed"],
  [/garden|lawn|plant/i, "a neatly trimmed home garden with fresh green plants, a lawn mower and gardening tools"],
];
function builtInScene(text) {
  const hit = SCENES.find(([re]) => re.test(String(text || "")));
  return hit ? hit[1] : null;
}

// One sentence written by Cloudflare's text model for a service no built-in scene fits.
const CF_TEXT_MODEL = () => process.env.CF_AI_TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
const PEOPLE_WORDS = /\b(person|people|man|men|woman|women|worker|technician|professional|customer|he|she|hands?|someone)\b/i;
async function writeScene({ name, category, type }) {
  if (!cfReady()) return null;
  const { account, token } = cf();
  const ask =
    `Describe in ONE sentence of at most 40 words a photograph that clearly shows the home service "${name}"${type ? ` (${type})` : ""}${category ? ` in the category ${category}` : ""}, ` +
    "using only objects: the specific room, appliance, item or finished result, and the tools of the job. No people. No text or signs. Reply with the sentence only.";
  try {
    const res = await fetch(`${CF_API}/accounts/${encodeURIComponent(account)}/ai/run/${CF_TEXT_MODEL()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: ask }], max_tokens: 90, temperature: 0.3 }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    const text = String(data?.result?.response || "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ").slice(0, 300);
    if (!res.ok || text.length < 20 || PEOPLE_WORDS.test(text)) return null;
    return text.replace(/\.?$/, "");
  } catch {
    return null;
  }
}

// The scene for a "service" picture: a built-in one for the service name, else one written for it,
// else the category's built-in one, else a plain description.
async function sceneFor(t) {
  return (
    builtInScene(`${t.name} ${t.type || ""}`) ||
    (await writeScene(t)) ||
    builtInScene(t.category) ||
    `the room, items and tools involved in ${t.name}, shown clean and finished`
  );
}

function buildBrief({ kind, name, category, type, tagline, audience, people, show, scene: sceneText, includes, colour }) {
  const subject = [name, type && type !== name ? `(${type})` : "", category ? `in ${category}` : ""].filter(Boolean).join(" ");
  // What the customer actually books (Tikdum's own "what's included"), so the picture shows that job.
  const facts = Array.isArray(includes) && includes.length ? ` The job includes: ${includes.slice(0, 4).join("; ")}.` : "";
  // A colour name only (picture makers draw hex codes as text): small details, the rest natural.
  const details = (show || (people ? "person" : "products")) === "person" ? "towels, cloths, the uniform's trim or a backdrop" : "towels, cloths, a bottle or a backdrop";
  const accent = ` Accent colour ${colour?.name || "soft purple"} with white: use it in a few small details such as ${details}; everything else in natural colours.`;
  const what = show || (people ? "person" : "products");
  const serviceScene = `The service itself, not a person: ${sceneText || builtInScene(`${name} ${type || ""}`) || builtInScene(category) || `the room, items and tools involved in ${name}, shown clean and finished`}, in a bright, tidy Indian home. No people and no body parts.`;
  const scene = what === "person" ? personLine(audience) : what === "service" ? serviceScene : PRODUCTS_SCENE;
  const wide = KINDS[kind]?.ratio === "16:9" ? " Wide composition with calm space on the left for a heading." : " Square composition, subject centred with breathing room.";
  return `${STYLE} Subject — ${KINDS[kind]?.label || "a service"}: ${subject}${tagline ? `. ${tagline}` : ""}.${facts} ${scene}${accent}${wide}`;
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

// One picture from Cloudflare Workers AI. FLUX draws a square; a wide (16:9) picture is cut
// from its middle. Returns { mime, data (Buffer) }.
let sharp = null;
try {
  sharp = require("sharp");
} catch {
  sharp = null;
}
// FLUX has no negative prompt: naming text or logos — even as "no logos" — makes it draw them (it
// put made-up badges on uniforms). Its prompt keeps only what should be in the picture: no "no …"
// sentences, no prices or numbers (a ₹ in the prompt becomes a sign in the picture).
function forFlux(prompt) {
  return String(prompt)
    .replace(/\s*\(#[0-9A-Fa-f]{6}\)/g, "")
    .replace(/Absolutely no text[^.]*\.\s*/g, "")
    .replace(/ with no badges, patches, name tags, embroidery, logos or lettering/g, ", the fabric completely blank and solid")
    .replace(/the generic, unbranded products/g, "the plain products")
    .replace(/No people and no body parts\./g, "Only objects in the scene.")
    .replace(/The service itself, not a person: /g, "")
    .replace(/[^.]*[₹\d][^.]*\.\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function drawWithCloudflare(prompt, ratio) {
  const { account, token, model } = cf();
  const res = await fetch(`${CF_API}/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: forFlux(prompt).slice(0, 2000), steps: 8 }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = String(data?.errors?.[0]?.message || `Cloudflare returned ${res.status}`).replace(token, "***").slice(0, 300);
    throw fail(res.status === 429 ? 429 : 502, `Cloudflare AI: ${msg}`);
  }
  const b64 = data?.result?.image;
  if (!b64) throw fail(422, "Cloudflare AI didn't return a picture");
  let out = Buffer.from(b64, "base64");
  if (ratio === "16:9" && sharp) out = await sharp(out).resize({ width: 1344, height: 756, fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  if (ratio === "9:16" && sharp) out = await sharp(out).resize({ width: 756, height: 1344, fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
  return { mime: "image/jpeg", data: out };
}

// The real Tikdum logo (icon + name, src/assets/tikdum-badge.png) on the left, about a quarter of the
// picture wide. AI models can't draw the exact logo, so it goes on afterwards. It sits at 66–74% of
// the height, not in the corner: the apps show square pictures cut to 4:3 or 16:9 from the middle,
// which removes up to 22% at the top and bottom.
// IMAGE_STUDIO_LOGO=off leaves pictures as drawn. Without the image library, pictures stay as drawn.
// The logo file is the one uploaded in Admin, else the built-in badge (imageStyle.logoFile); with a
// category colour it sits on a rounded band of that colour, so it stands out on any photo.
async function stampLogo(image, colour) {
  const logo = imageStyle.logoFile();
  if (!sharp || String(process.env.IMAGE_STUDIO_LOGO || "on").toLowerCase() === "off" || !fs.existsSync(logo)) return image;
  try {
    const base = sharp(image.data, { failOn: "none" });
    const { width, height } = await base.metadata();
    if (!width || !height) return image;
    // A wide picture (category banner) is shown narrower in places, cut at both sides: its logo sits
    // 14% in from the left and is sized by the height, so it stays whole.
    const wide = width / height > 1.3;
    const badgeW = Math.round(wide ? height * 0.42 : width * 0.27);
    const badge = await sharp(logo).resize({ width: badgeW }).png().toBuffer();
    const badgeH = (await sharp(badge).metadata()).height;
    const margin = Math.round(width * 0.025);
    const left = wide ? Math.round(width * 0.14) : margin;
    const top = Math.min(Math.round(height * 0.66), Math.max(0, height - badgeH - margin));
    const layers = [];
    if (/^#[0-9a-f]{6}$/i.test(colour?.hex || "")) {
      const pad = Math.max(3, Math.round(badgeH * 0.09));
      const w = badgeW + pad * 2;
      const h = badgeH + pad * 2;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="${colour.hex}"/></svg>`;
      layers.push({ input: Buffer.from(svg), left: Math.max(0, left - pad), top: Math.max(0, top - pad) });
    }
    layers.push({ input: badge, left, top });
    const data = await base.composite(layers).jpeg({ quality: 90 }).toBuffer();
    return { mime: "image/jpeg", data, logo: true, width, height };
  } catch (e) {
    console.error("Image studio: couldn't add the logo", e.message);
    return image;
  }
}

// The picture makers to try, in order: Gemini first (unless resting after "quota exceeded"),
// then Cloudflare. [{ name, imageModel, textModel? }]
async function makers() {
  const out = [];
  const p = provider();
  if (key() && p !== "cloudflare" && !geminiResting()) {
    try {
      const m = await models();
      if (m.imageModel) out.push({ name: "gemini", imageModel: m.imageModel, textModel: m.textModel });
    } catch (e) {
      if (e.status === 429) geminiRestUntil = Date.now() + GEMINI_REST_MS;
      if (!cfReady()) throw e;
    }
  }
  if (cfReady() && p !== "gemini") out.push({ name: "cloudflare", imageModel: cf().model });
  return out;
}

async function draw(list, prompt, ratio) {
  let lastError = null;
  for (const m of list) {
    try {
      const image = m.name === "gemini" ? await drawImage(m.imageModel, prompt, ratio) : await drawWithCloudflare(prompt, ratio);
      return { image, maker: m };
    } catch (e) {
      lastError = e;
      if (m.name === "gemini" && (e.status === 429 || /quota/i.test(e.message))) geminiRestUntil = Date.now() + GEMINI_REST_MS;
    }
  }
  throw lastError || fail(400, NOT_SET_UP);
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
    removeFile(url);
  } catch (e) {
    console.error("Image studio: couldn't remove a file", e.message);
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
  const list = await makers();
  if (!list.length) throw fail(400, key() ? "This Gemini key can't use any image model" : NOT_SET_UP);
  // The automatic check needs a Gemini text model; without one, a person checks it when approving.
  const checker = list.find((m) => m.name === "gemini" && m.textModel)?.textModel || null;
  if (job.brief) {
    const scene = await sceneFor(job.brief);
    job.prompt = buildBrief({ ...job.brief, scene });
    jsonStore.update(CANDIDATES, job.id, { prompt: job.prompt, scene });
  }
  let last = null;
  let qc = null;
  let used = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    if (usageToday() >= DAILY_LIMIT) throw fail(429, `Daily limit of ${DAILY_LIMIT} pictures reached — try again tomorrow`);
    addUsage();
    const brief = attempt === 1 ? job.prompt : `${job.prompt} Avoid these problems seen in the previous try: ${(qc?.issues || []).join("; ") || "none"}.`;
    const { image, maker } = await draw(list, brief, job.ratio);
    used = maker;
    // A check that can't run (e.g. Gemini out of quota) doesn't cost a second picture.
    qc = checker && !geminiResting()
      ? await inspect(checker, image, job.expect).catch((e) => ({ ok: true, issues: [`Not checked automatically: ${e.message}`.slice(0, 160)], checked: false }))
      : { ok: true, issues: [], checked: false };
    if (last) deleteFile(last.url);
    // The check looks at the picture as drawn; the logo goes on the copy that is kept.
    const kept = await stampLogo(image, job.colour);
    const file = `${crypto.randomBytes(16).toString("hex")}${extFor(kept.mime)}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, file), kept.data);
    last = { url: `/uploads/${file}`, logo: Boolean(kept.logo), size: kept.width ? `${kept.width}×${kept.height}` : null };
    if (qc.ok) break;
  }
  // The checklist shown with the preview: what Tikdum knew, and what was done to the picture.
  const checks = { ...(job.checks || {}), logo: last.logo, size: last.size, autoChecked: qc.checked !== false, autoOk: qc.ok };
  jsonStore.update(CANDIDATES, job.id, { status: "pending", url: last.url, qc, checks, imageModel: used.name === "cloudflare" ? `cloudflare:${used.imageModel}` : used.imageModel, tries: MAX_TRIES });
}

// targets: [{ targetType, targetId, name, category, type, tagline, includes?, colour?, audience?, show? }],
// as looked up from Tikdum's records by index.js (imageTarget) — never as sent by a browser.
function enqueue(targets, actor) {
  if (!configured()) throw fail(400, NOT_SET_UP);
  const list = Array.isArray(targets) ? targets : [];
  if (list.length === 0) throw fail(400, "Choose at least one item");
  if (list.length > MAX_QUEUE) throw fail(400, `Choose at most ${MAX_QUEUE} items at a time`);
  const open = new Set(listCandidates().filter((c) => ["generating", "pending"].includes(c.status)).map((c) => `${c.targetType}:${c.targetId}`));
  const made = [];
  for (const t of list) {
    if (!KINDS[t.targetType] || !t.targetId || !t.name) continue;
    const k = `${t.targetType}:${t.targetId}`;
    if (open.has(k)) continue; // already being drawn, or waiting for approval
    const found = audienceFor({ name: t.name, category: t.category, type: t.type, override: t.audience });
    // t.show: "service" (no people — Admin's default) or "person"; body services are always products.
    const show = !found.people ? "products" : t.show === "service" ? "service" : "person";
    const who = { audience: found.audience, people: show === "person" };
    const includes = Array.isArray(t.includes) ? t.includes.map((x) => String(x).slice(0, 80)).slice(0, 6) : [];
    const colour = t.colour?.hex ? { hex: String(t.colour.hex), name: String(t.colour.name || "").slice(0, 30) } : null;
    const facts = { includes, colour };
    const prompt = buildBrief({ kind: t.targetType, name: t.name, category: t.category, type: t.type, tagline: t.tagline, ...who, show, ...facts });
    const checks = { record: true, category: String(t.category || "").slice(0, 80), type: String(t.type || "").slice(0, 80), includes: includes.length, colour };
    const row = jsonStore.insert(CANDIDATES, {
      targetType: t.targetType,
      targetId: String(t.targetId),
      name: String(t.name).slice(0, 120),
      category: String(t.category || "").slice(0, 80),
      type: String(t.type || "").slice(0, 80),
      tagline: String(t.tagline || "").slice(0, 120),
      audience: who.audience,
      people: who.people,
      show,
      prompt,
      checks,
      status: "generating",
      createdAt: new Date().toISOString(),
      requestedBy: actor || null,
    });
    // A "service" picture gets its own scene (sceneFor) when it's drawn: that can call a text model.
    const brief = { kind: t.targetType, name: t.name, category: t.category, type: t.type, tagline: t.tagline, ...who, show, ...facts };
    queue.push({ id: row.id, prompt, ratio: KINDS[t.targetType].ratio, expect: who, brief: show === "service" ? brief : null, colour, checks });
    made.push(row);
    open.add(k);
  }
  pump();
  return made;
}

// A fresh picture for one Facebook/Instagram post (social.js, the Marketing Agent): drawn and
// checked like a service picture, the logo stamped on, and used straight away — a post is reviewed
// as a whole (Approvals) or published by the agent when Auto-post is on. At most
// SOCIAL_PICTURES_PER_DAY a day, inside the studio's daily limit. Returns { url: "/uploads/…", maker }.
// Blog covers (kind "blog") have their own count, BLOG_PICTURES_PER_DAY.
const SOCIAL_PICTURES_PER_DAY = Number(process.env.SOCIAL_PICTURES_PER_DAY) || 8;
const BLOG_PICTURES_PER_DAY = Number(process.env.BLOG_PICTURES_PER_DAY) || 10;
// Video Studio's picture stories (kind "studio") too, STUDIO_PICTURES_PER_DAY: drawn upright or wide
// (ratio) and without the stamped logo (the video carries it).
const STUDIO_PICTURES_PER_DAY = Number(process.env.STUDIO_PICTURES_PER_DAY) || 24;
const SOCIAL_USAGE = "socialPictureUsage";
const CAPS = { blog: [BLOG_PICTURES_PER_DAY, "blog cover"], studio: [STUDIO_PICTURES_PER_DAY, "video"], post: [SOCIAL_PICTURES_PER_DAY, "post"] };
async function drawForSocial({ topic, category = "", scene = "", show = "service", colour = null, kind = "post", ratio = "1:1", stamp = true }) {
  if (!configured()) throw fail(400, NOT_SET_UP);
  const [cap, what0] = CAPS[kind] || CAPS.post;
  const dayId = kind === "post" ? istDay() : `${kind}:${istDay()}`;
  const today = jsonStore.readAll(SOCIAL_USAGE).find((u) => u.id === dayId);
  if ((today?.count || 0) >= cap) throw fail(429, `Today's ${cap} new ${what0} pictures are done`);
  if (usageToday() >= DAILY_LIMIT) throw fail(429, `Daily limit of ${DAILY_LIMIT} pictures reached`);
  const list = await makers();
  if (!list.length) throw fail(400, NOT_SET_UP);
  const name = String(topic || "").slice(0, 120);
  const found = audienceFor({ name, category });
  const person = found.people && show === "person";
  const expect = { audience: found.audience, people: person };
  // The scene comes from the agent's own writing; prices and numbers would be drawn as text.
  const sceneText = String(scene || "").replace(/[₹$\d]+/g, "").replace(/\s+/g, " ").trim().slice(0, 400);
  const what = person ? personLine(found.audience) : `${sceneText || builtInScene(name) || builtInScene(category) || `the room, items and tools involved in ${name}, shown clean and finished`}, in a bright, tidy Indian home. No people and no body parts.`;
  const accent = ` Accent colour ${colour?.name || "soft purple"} with white in a few small details; everything else in natural colours.`;
  const prompt = `${STYLE} Subject — a picture for a social media post about ${name}${category ? ` (${category})` : ""}. ${person && sceneText ? `Setting: ${sceneText}. ` : ""}${what}${accent} ${ratio === "9:16" ? "Tall upright composition, subject in the middle third" : ratio === "16:9" ? "Wide composition" : "Square composition"}, subject centred with breathing room.`;
  const checker = list.find((m) => m.name === "gemini" && m.textModel)?.textModel || null;
  let kept = null;
  let used = null;
  let qc = null;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    addUsage();
    const brief = attempt === 1 ? prompt : `${prompt} Avoid these problems seen in the previous try: ${(qc?.issues || []).join("; ") || "none"}.`;
    const { image, maker } = await draw(list, brief, ratio);
    used = maker;
    qc = checker && !geminiResting() ? await inspect(checker, image, expect).catch(() => ({ ok: true, issues: [] })) : { ok: true, issues: [] };
    kept = stamp ? await stampLogo(image, colour) : image;
    if (qc.ok) break;
  }
  if (!qc.ok) throw fail(422, `The new picture didn't pass the check (${qc.issues.join("; ").slice(0, 160)})`);
  if (today) jsonStore.update(SOCIAL_USAGE, today.id, { count: today.count + 1 });
  else jsonStore.insert(SOCIAL_USAGE, { id: dayId, count: 1 });
  const file = `${crypto.randomBytes(16).toString("hex")}${extFor(kept.mime)}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), kept.data);
  return { url: `/uploads/${file}`, maker: used.name, people: person };
}

// Admin decided: the picture was used (the page uploads the final, resized copy) or thrown away.
function settle(id, status, actor) {
  const c = jsonStore.readAll(CANDIDATES).find((x) => x.id === id);
  if (!c) return null;
  deleteFile(c.url);
  return jsonStore.update(CANDIDATES, id, { status, url: null, decidedBy: actor || null, decidedAt: new Date().toISOString() });
}

async function status() {
  const out = {
    configured: configured(),
    usedToday: usageToday(),
    dailyLimit: DAILY_LIMIT,
    provider: provider(),
    gemini: Boolean(key()),
    geminiResting: geminiResting(),
    cloudflare: cfReady() ? cf().model : null,
    imageModel: null,
    textModel: null,
    error: null,
  };
  if (!key()) {
    if (cfReady()) out.imageModel = `cloudflare:${cf().model}`;
    return out;
  }
  try {
    Object.assign(out, await models());
  } catch (e) {
    out.error = e.message;
    if (cfReady()) out.imageModel = `cloudflare:${cf().model}`;
  }
  return out;
}

module.exports = { personLine, audienceFor, buildBrief, pickModels, enqueue, settle, drawForSocial, SOCIAL_PICTURES_PER_DAY, listCandidates, status, MAX_QUEUE, DAILY_LIMIT, _inspect: inspect, _drawImage: drawImage, _stampLogo: stampLogo, _forFlux: forFlux, _sceneFor: sceneFor, _builtInScene: builtInScene, _resetGemini: () => { geminiRestUntil = 0; } };
