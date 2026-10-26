const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-imagestudio-"));
process.env.JWT_SECRET = "test-secret";
process.env.IMAGE_STUDIO_LOGO = "off"; // the logo stamp has its own test below
const studio = require("../src/imageStudio");
const { UPLOADS_DIR } = require("../src/uploads");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const wait = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("timed out waiting");
};

// ---- a pretend Gemini ----
const calls = { image: [], text: 0 };
let qcAnswers = [];
function installFetch() {
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.includes("/models?")) {
      return ok({
        models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.0-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.1-flash-image", supportedGenerationMethods: ["generateContent"] },
          { name: "models/imagen-4.0", supportedGenerationMethods: ["predict"] },
          { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
        ],
      });
    }
    const body = JSON.parse(opts.body);
    if (/-image:generateContent/.test(u)) {
      calls.image.push({ url: u, prompt: body.contents[0].parts[0].text, ratio: body.generationConfig.imageConfig.aspectRatio, key: opts.headers["x-goog-api-key"] });
      return ok({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG.toString("base64") } }] } }] });
    }
    calls.text++;
    const answer = qcAnswers.shift() || { hasText: false, peopleCount: 1, personGender: "female", distorted: false, issues: [] };
    return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
  };
}
const files = () => fs.readdirSync(UPLOADS_DIR).filter((f) => /\.png$/.test(f)).length;

test("who is in the picture: women's grooming -> women, men's -> men, trades -> any, body services -> nobody", () => {
  const a = studio.audienceFor;
  assert.deepEqual(a({ name: "Vedic Valley Facial", category: "Salon & Spa" }), { audience: "female", people: true });
  assert.deepEqual(a({ name: "Bridal Makeup", category: "Salon & Spa" }), { audience: "female", people: true });
  assert.deepEqual(a({ name: "Haircut for Men", category: "Salon & Spa" }), { audience: "male", people: true });
  assert.deepEqual(a({ name: "Beard Trim", category: "Salon & Spa" }), { audience: "male", people: true });
  assert.deepEqual(a({ name: "Split AC Service", category: "AC Repair" }), { audience: "any", people: true });
  // intimate services never show a person
  assert.equal(a({ name: "Full Arms Waxing", category: "Salon & Spa", type: "Waxing" }).people, false);
  assert.equal(a({ name: "Body Massage – 30 minutes", category: "Salon & Spa" }).people, false);
  assert.equal(a({ name: "Bikini", category: "Salon & Spa", type: "Waxing" }).people, false);
  assert.equal(a({ name: "Ozone Body Polishing", category: "Salon & Spa" }).people, false);
  // an admin override picks the audience but can't put a person in an intimate picture
  assert.deepEqual(a({ name: "Hair Spa", category: "Salon & Spa", override: "male" }), { audience: "male", people: true });
  assert.equal(a({ name: "Full Legs Waxing", category: "Salon & Spa", override: "female" }).people, false);
});

test("the brief carries the brand style, the right person, and never brand names or text", () => {
  const person = studio.buildBrief({ kind: "service", name: "Facial", category: "Salon & Spa", audience: "female", people: true });
  assert.match(person, /Indian woman professional/);
  assert.match(person, /Accent colour soft purple with white/); // no category colour given: Tikdum purple
  assert.match(person, /no text/i);
  assert.match(person, /no logos, no brand names, no watermarks/i);
  const male = studio.buildBrief({ kind: "service", name: "Haircut", category: "Salon & Spa", audience: "male", people: true });
  assert.match(male, /Indian man professional/);
  const still = studio.buildBrief({ kind: "subcategory", name: "Waxing", category: "Salon & Spa", audience: "female", people: false });
  assert.match(still, /Product still life only/);
  assert.match(still, /No people and no body parts/);
  assert.doesNotMatch(still, /woman|man professional/);
  assert.match(studio.buildBrief({ kind: "category", name: "AC Repair", audience: "any", people: true }), /Wide composition/);
});

test("models are chosen automatically: newest flash image model for pictures, newest plain flash for the check", () => {
  const list = [
    { name: "gemini-2.5-flash", methods: ["generateContent"] },
    { name: "gemini-3.0-flash", methods: ["generateContent"] },
    { name: "gemini-3.0-flash-lite", methods: ["generateContent"] },
    { name: "gemini-2.5-flash-image", methods: ["generateContent"] },
    { name: "gemini-3.1-flash-image", methods: ["generateContent"] },
    { name: "imagen-4.0", methods: ["predict"] },
    { name: "gemini-3.0-flash-tts", methods: ["generateContent"] },
  ];
  const m = studio.pickModels(list);
  assert.equal(m.imageModel, "gemini-3.1-flash-image");
  assert.equal(m.textModel, "gemini-3.0-flash");
  assert.equal(studio.pickModels([]).imageModel, null);
});

test("without a key nothing is queued and the status says so", async () => {
  delete process.env.GEMINI_API_KEY;
  assert.throws(() => studio.enqueue([{ targetType: "service", targetId: "1", name: "x" }]), /GEMINI_API_KEY/);
  assert.equal((await studio.status()).configured, false);
});

test("a picture is drawn, checked, and kept as a candidate until a person decides", async () => {
  process.env.GEMINI_API_KEY = "test-key-123";
  installFetch();
  const before = files();
  const made = studio.enqueue(
    [{ targetType: "service", targetId: "svc-1", name: "Hydra Facial", category: "Salon & Spa", tagline: "Glow" }],
    "owner"
  );
  assert.equal(made.length, 1);
  assert.equal(made[0].audience, "female");
  const done = await wait(() => studio.listCandidates().find((c) => c.targetId === "svc-1" && c.status !== "generating"));
  assert.equal(done.status, "pending");
  assert.equal(done.qc.ok, true);
  assert.match(done.url, /^\/uploads\/[a-f0-9]{32}\.png$/);
  assert.equal(files(), before + 1);
  assert.equal(calls.image[0].key, "test-key-123");
  assert.match(calls.image[0].url, /gemini-3\.1-flash-image:generateContent/);
  assert.equal(calls.image[0].ratio, "1:1");
  // the same item can't be queued again while it waits for a decision
  assert.equal(studio.enqueue([{ targetType: "service", targetId: "svc-1", name: "Hydra Facial", category: "Salon & Spa" }]).length, 0);
  // approving (the page has uploaded its own resized copy) removes the temporary file
  const settled = studio.settle(done.id, "approved", "owner");
  assert.equal(settled.status, "approved");
  assert.equal(files(), before);
});

test("a picture that fails the check is retried once with the problems fed back; wrong gender and people in intimate pictures are caught", async () => {
  installFetch();
  calls.image.length = 0;
  qcAnswers = [
    { hasText: false, peopleCount: 1, personGender: "male", distorted: false, issues: [] }, // wanted a woman
    { hasText: false, peopleCount: 1, personGender: "female", distorted: false, issues: [] },
  ];
  studio.enqueue([{ targetType: "catalog", targetId: "cat-1", name: "Hair Spa", category: "Salon & Spa" }]);
  const c = await wait(() => studio.listCandidates().find((x) => x.targetId === "cat-1" && x.status !== "generating"));
  assert.equal(c.status, "pending");
  assert.equal(c.qc.ok, true);
  assert.equal(calls.image.length, 2, "tried twice");
  assert.match(calls.image[1].prompt, /Avoid these problems.*Shows male but female was wanted/);

  // a waxing picture with a person in it is never accepted, even after the retry
  qcAnswers = [
    { hasText: false, peopleCount: 1, personGender: "female", distorted: false, issues: [] },
    { hasText: false, peopleCount: 1, personGender: "female", distorted: false, issues: [] },
  ];
  studio.enqueue([{ targetType: "subcategory", targetId: "sub-1", name: "Waxing", category: "Salon & Spa" }]);
  const w = await wait(() => studio.listCandidates().find((x) => x.targetId === "sub-1" && x.status !== "generating"));
  assert.equal(w.people, false);
  assert.equal(w.qc.ok, false);
  assert.match(w.qc.issues.join(" "), /products only/);
  studio.settle(w.id, "rejected", "owner");
});

test("category banners ask for a wide picture; Gemini errors become a failed candidate, never a crash", async () => {
  installFetch();
  calls.image.length = 0;
  studio.enqueue([{ targetType: "category", targetId: "plumbing", name: "Plumbing" }]);
  await wait(() => studio.listCandidates().find((x) => x.targetId === "plumbing" && x.status !== "generating"));
  assert.equal(calls.image[0].ratio, "16:9");

  global.fetch = async (url) => (String(url).includes("/models?") ? { ok: true, status: 200, json: async () => ({ models: [{ name: "models/gemini-3.1-flash-image", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-3.0-flash", supportedGenerationMethods: ["generateContent"] }] }) } : { ok: false, status: 429, json: async () => ({ error: { message: "Quota exceeded for test-key-123" } }) });
  studio.enqueue([{ targetType: "service", targetId: "svc-err", name: "AC Gas Refill", category: "AC Repair" }]);
  const f = await wait(() => studio.listCandidates().find((x) => x.targetId === "svc-err" && x.status !== "generating"));
  assert.equal(f.status, "failed");
  assert.match(f.error, /Quota exceeded/);
  assert.doesNotMatch(f.error, /test-key-123/, "the key never leaks into a message");
});

test("batch size is capped and unknown targets are ignored", () => {
  assert.throws(() => studio.enqueue(Array.from({ length: 26 }, (_, i) => ({ targetType: "service", targetId: "n" + i, name: "x" }))), /at most 25/);
  assert.throws(() => studio.enqueue([]), /at least one/);
  assert.equal(studio.enqueue([{ targetType: "bogus", targetId: "1", name: "x" }, { targetType: "service", targetId: "", name: "x" }]).length, 0);
});

test("Cloudflare Workers AI: used when Gemini is out of quota, and on its own without a Gemini key", async () => {
  const cfCalls = [];
  const fakeCloudflare = (u, opts) => {
    cfCalls.push({ url: u, auth: opts.headers.Authorization, prompt: JSON.parse(opts.body).prompt });
    return { ok: true, status: 200, json: async () => ({ success: true, result: { image: PNG.toString("base64") } }) };
  };
  process.env.CF_AI_ACCOUNT_ID = "acc123";
  process.env.CF_AI_TOKEN = "cf-secret-token";
  process.env.GEMINI_API_KEY = "test-key-123";
  studio._resetGemini();
  let geminiImageCalls = 0;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("api.cloudflare.com")) return fakeCloudflare(u, opts);
    if (u.includes("/models?")) return { ok: true, status: 200, json: async () => ({ models: [{ name: "models/gemini-3.1-flash-image", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-3.0-flash", supportedGenerationMethods: ["generateContent"] }] }) };
    if (/-image:generateContent/.test(u)) geminiImageCalls++;
    return { ok: false, status: 429, json: async () => ({ error: { message: "You exceeded your current quota" } }) };
  };
  studio.enqueue([{ targetType: "service", targetId: "cf-1", name: "Tap Repair", category: "Plumbing" }]);
  const a = await wait(() => studio.listCandidates().find((x) => x.targetId === "cf-1" && x.status !== "generating"));
  assert.equal(a.status, "pending");
  assert.equal(a.imageModel, "cloudflare:@cf/black-forest-labs/flux-1-schnell");
  assert.equal(a.qc.checked, false); // no automatic check while Gemini is out of quota: a person checks it
  assert.equal(geminiImageCalls, 1);
  assert.match(cfCalls[0].url, /\/accounts\/acc123\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
  assert.equal(cfCalls[0].auth, "Bearer cf-secret-token");
  // Gemini rests for an hour after "quota exceeded": the next picture goes straight to Cloudflare.
  studio.enqueue([{ targetType: "service", targetId: "cf-2", name: "Fan Repair", category: "Electrician" }]);
  await wait(() => studio.listCandidates().find((x) => x.targetId === "cf-2" && x.status !== "generating"));
  assert.equal(geminiImageCalls, 1);
  assert.equal((await studio.status()).geminiResting, true);

  // Cloudflare only.
  delete process.env.GEMINI_API_KEY;
  const s = await studio.status();
  assert.equal(s.configured, true);
  assert.equal(s.imageModel, "cloudflare:@cf/black-forest-labs/flux-1-schnell");
  studio.enqueue([{ targetType: "service", targetId: "cf-3", name: "Sofa Cleaning", category: "Home Cleaning" }]);
  const c = await wait(() => studio.listCandidates().find((x) => x.targetId === "cf-3" && x.status !== "generating"));
  assert.equal(c.status, "pending");

  // A Cloudflare error is a failed candidate, and the token never shows in it.
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ success: false, errors: [{ message: "Authentication error for cf-secret-token" }] }) });
  studio.enqueue([{ targetType: "service", targetId: "cf-4", name: "Geyser Repair", category: "Appliance Repair" }]);
  const f = await wait(() => studio.listCandidates().find((x) => x.targetId === "cf-4" && x.status !== "generating"));
  assert.equal(f.status, "failed");
  assert.match(f.error, /Cloudflare AI: Authentication error/);
  assert.doesNotMatch(f.error, /cf-secret-token/);
  delete process.env.CF_AI_ACCOUNT_ID;
  delete process.env.CF_AI_TOKEN;
  studio._resetGemini();
});

test("brief: Tikdum's black uniform, plain (the logo is stamped on afterwards)", () => {
  const trade = studio.buildBrief({ kind: "service", name: "Fan Repair", category: "Electrician", audience: "any", people: true });
  assert.match(trade, /plain black polo T-shirt uniform and a plain black cap/);
  assert.match(trade, /no badges, patches, name tags, embroidery, logos or lettering/);
  assert.doesNotMatch(trade, /purple-and-white uniform/);
  assert.match(studio.buildBrief({ kind: "service", name: "Facial", category: "Salon & Spa", audience: "female", people: true }), /plain black salon uniform top/);
});

let sharpAvailable = true;
try {
  require("sharp");
} catch {
  sharpAvailable = false;
}
test("brief: Tikdum's facts and the category colour (a name, never a code)", () => {
  const b = studio.buildBrief({
    kind: "service", name: "Single Door Fridge Cleaning", category: "Appliance Repair", show: "service", people: false,
    includes: ["Inside shelves and trays", "Door gasket", "Outside body"], colour: { hex: "#8E44AD", name: "purple" },
  });
  assert.match(b, /The job includes: Inside shelves and trays; Door gasket; Outside body\./);
  assert.match(b, /Accent colour purple with white: use it in a few small details such as towels, cloths, a bottle or a backdrop/);
  assert.doesNotMatch(b, /#8E44AD|uniform/);
});

test("stampLogo: with a category colour the logo sits on a band of that colour", { skip: !sharpAvailable && "sharp isn't installed here" }, async () => {
  const sharp = require("sharp");
  const plain = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 30, g: 30, b: 30 } } }).jpeg().toBuffer();
  process.env.IMAGE_STUDIO_LOGO = "on";
  const out = await studio._stampLogo({ mime: "image/jpeg", data: plain }, { hex: "#27AE60", name: "green" });
  process.env.IMAGE_STUDIO_LOGO = "off";
  assert.equal(out.logo, true);
  assert.equal(`${out.width}×${out.height}`, "1024×1024");
  const [r, g, b] = [...(await sharp(out.data).extract({ left: 140, top: 678 - 4, width: 1, height: 1 }).raw().toBuffer())];
  assert.ok(g > 140 && r < 90 && b < 130, `green band just above the badge: ${[r, g, b]}`);
});

test("stampLogo: the Tikdum logo goes in the bottom-left corner", { skip: !sharpAvailable && "sharp isn't installed here" }, async () => {
  const sharp = require("sharp");
  const plain = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 30, g: 30, b: 30 } } }).jpeg().toBuffer();
  process.env.IMAGE_STUDIO_LOGO = "on";
  const out = await studio._stampLogo({ mime: "image/jpeg", data: plain });
  process.env.IMAGE_STUDIO_LOGO = "off";
  assert.equal(out.logo, true);
  const px = async (x, y) => [...(await sharp(out.data).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer())];
  // At 66–74% of the height (kept when the apps cut a square to 4:3 or 16:9), not in the corner.
  const badge = await px(262, 715); // the badge's white background, right of the "Tikdum" name
  const corner = await px(262, 958);
  const top = await px(900, 40);
  assert.ok(badge.every((v) => v > 200), `badge is white: ${badge}`);
  assert.ok(corner.every((v) => v < 60), `bottom corner unchanged: ${corner}`);
  assert.ok(top.every((v) => v < 60), `rest unchanged: ${top}`);
  assert.ok(715 > 1024 * 0.22 && 715 + 40 < 1024 * 0.78, "inside what a 16:9 cut keeps");
  assert.equal((await studio._stampLogo({ mime: "image/jpeg", data: plain })).logo, undefined); // off: as drawn
});

test("FLUX prompt: only what should be in the picture — no 'no logos', no prices, no colour codes", () => {
  const brief = studio.buildBrief({ kind: "service", name: "Ant Control", category: "Pest Control", tagline: "₹600–₹1000 per 2BHK", audience: "any", people: true });
  assert.match(brief, /Absolutely no text/); // Gemini keeps the full brief
  const flux = studio._forFlux(brief);
  assert.doesNotMatch(flux, /logo|lettering|badge|text|watermark|₹|\d|#5B3FE0/i);
  assert.match(flux, /plain black polo T-shirt uniform and a plain black cap, the fabric completely blank and solid/);
  assert.match(flux, /Ant Control in Pest Control/);
  assert.match(flux, /Accent colour soft purple with white/);
  const still = studio._forFlux(studio.buildBrief({ kind: "subcategory", name: "Waxing", category: "Salon & Spa", audience: "female", people: false }));
  assert.match(still, /Only objects in the scene\./);
  assert.doesNotMatch(still, /unbranded|people/i);
});

test("show 'service': the service itself, no people (body services stay products only)", async () => {
  const brief = studio.buildBrief({ kind: "service", name: "Bathroom Cleaning", category: "Home Cleaning", audience: "any", people: false, show: "service" });
  assert.match(brief, /The service itself, not a person/);
  assert.match(brief, /spotless, sparkling modern bathroom/);
  assert.doesNotMatch(brief, /uniform/);
  const flux = studio._forFlux(brief);
  assert.match(flux, /^Photorealistic/);
  assert.match(flux, /a spotless, sparkling modern bathroom/);
  assert.match(flux, /Only objects in the scene\./);
  assert.doesNotMatch(flux, /person|people/i);

  process.env.CF_AI_ACCOUNT_ID = "acc123";
  process.env.CF_AI_TOKEN = "cf-secret-token";
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: { image: PNG.toString("base64") } }) });
  const [a] = studio.enqueue([{ targetType: "service", targetId: "show-1", name: "Bathroom Cleaning", category: "Home Cleaning", show: "service" }]);
  assert.equal(a.show, "service");
  assert.equal(a.people, false);
  const [b] = studio.enqueue([{ targetType: "service", targetId: "show-2", name: "Full Body Waxing", category: "Salon & Spa", show: "person" }]);
  assert.equal(b.show, "products"); // body services: never a person
  const [c] = studio.enqueue([{ targetType: "service", targetId: "show-3", name: "Fan Repair", category: "Electrician" }]);
  assert.equal(c.show, "person"); // the API's old default
  await wait(() => ["show-1", "show-2", "show-3"].every((id) => studio.listCandidates().find((x) => x.targetId === id && x.status !== "generating")));
  delete process.env.CF_AI_ACCOUNT_ID;
  delete process.env.CF_AI_TOKEN;
});

test("each service gets its own scene — not the same AC or chimney for every one", async () => {
  const s = (name, category) => studio._builtInScene(`${name}`) || studio._builtInScene(category);
  assert.match(s("Cockroach Control", "Pest Control"), /pest control sprayer/);
  assert.match(s("Pest Control", ""), /pest control sprayer/);
  assert.match(s("Laundry Services", ""), /folded fresh laundry/);
  assert.match(s("Plumbing", ""), /chrome tap/);
  assert.match(s("Tap Repair", "Plumbing"), /chrome tap/);
  assert.match(s("AC Repair", ""), /split air conditioner/);
  assert.match(s("Water Tank Cleaning", ""), /water storage tank/);
  assert.match(s("RO/Water Purifier Services", ""), /RO water purifier/);
  assert.match(s("Computer Repair", ""), /laptop/);
  assert.match(s("Painting", ""), /freshly painted wall/);
  assert.match(s("Carpentry", ""), /wooden cabinet door/);
  assert.match(s("Masonry Services", ""), /tiled wall/);
  assert.match(s("Packers & Movers", ""), /moving boxes/);
  assert.match(s("Domestic Help", ""), /made bed/);
  assert.match(s("Electrician", ""), /distribution board/);
  assert.match(s("Electric Iron Repair", "Appliance Repair"), /electric iron/);
  assert.match(s("Gas Stove Inspection & Minor Repair", ""), /gas stove/);
  assert.match(s("Bathroom Cleaning", "Home Cleaning"), /bathroom/);
  assert.equal(studio._builtInScene("Installed things"), null, "'led' inside a word doesn't count as LED lights");
  // 16 different scenes for 16 categories: no two the same.
  const names = ["Pest Control", "Laundry", "Plumbing", "AC Repair", "Water Tank Cleaning", "RO Purifier", "Computer Repair", "Painting", "Carpentry", "Masonry", "Packers & Movers", "Domestic Help", "Electrician", "Gas Stove", "Bathroom Cleaning", "Sofa Cleaning"];
  assert.equal(new Set(names.map((n) => studio._builtInScene(n))).size, names.length);

  // No built-in scene for the name: Cloudflare's text model writes one; a reply about people is ignored.
  process.env.CF_AI_ACCOUNT_ID = "acc123";
  process.env.CF_AI_TOKEN = "cf-secret-token";
  let reply = "A large architectural floor plan with lighting symbols, sample pendant lamps and a tape measure on a drafting table.";
  const asked = [];
  global.fetch = async (url, opts) => {
    asked.push({ url: String(url), body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ success: true, result: { response: reply } }) };
  };
  const written = await studio._sceneFor({ name: "Vastu Consultation", category: "Interior Services" });
  assert.equal(written, "A large architectural floor plan with lighting symbols, sample pendant lamps and a tape measure on a drafting table");
  assert.match(asked[0].url, /\/ai\/run\/@cf\/meta\/llama-3\.1-8b-instruct$/);
  assert.match(asked[0].body.messages[0].content, /Vastu Consultation/);
  reply = "A friendly technician holding a lamp.";
  assert.match(await studio._sceneFor({ name: "Vastu Consultation", category: "Interior Services" }), /stylish modern living room/); // falls back to the category's scene
  delete process.env.CF_AI_ACCOUNT_ID;
  delete process.env.CF_AI_TOKEN;
});

test("a category tile: square, objects only, no logo stamped on (it's tiny on the home screen)", async () => {
  process.env.GEMINI_API_KEY = "test-key-123";
  installFetch();
  calls.image.length = 0;
  const made = studio.enqueue([{ targetType: "categoryTile", targetId: "ac-repair", name: "AC Repair", show: "service" }], "owner");
  assert.equal(made.length, 1);
  assert.match(made[0].prompt, /small square tile photo/);
  assert.match(made[0].prompt, /no text/i);
  const done = await wait(() => studio.listCandidates().find((c) => c.targetId === "ac-repair" && c.status !== "generating"));
  assert.equal(done.status, "pending");
  assert.equal(calls.image[0].ratio, "1:1");
  assert.equal(done.checks.logo, false); // no logo stamped on
  studio.settle(done.id, "rejected", "owner");
});
