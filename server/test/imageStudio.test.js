const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-imagestudio-"));
process.env.JWT_SECRET = "test-secret";
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
  assert.match(person, /#5B3FE0/);
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
