const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-social2-"));
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SOCIAL_POST_DAYS_IST = "0,1,2,3,4,5,6";
const socialPosts = require("../src/socialPosts");
const specialist = require("../src/specialist");
const silent = { info() {}, warn() {}, error() {} };

const PICTURES = [{ url: "https://tikdum.com/category-photos/ac-repair.jpg", label: "AC repair (category photo)" }];
const CAPTION = "Is your AC blowing warm air? Get it serviced before summer by a verified Jammu technician.\nAC thanda nahi? Abhi book karo!\nBook on tikdum.com or the Tikdum app.\n#Jammu #ACService #Tikdum";
const at = (day, h, m = 0) => Date.parse(`2026-10-${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
const post = (h, score, extra = {}) => ({ at: new Date(at(10, h)).toISOString(), format: "single", caption: "x", metrics: { score }, ...extra });

function fake(routes) {
  const calls = [];
  return {
    calls,
    async request(m, p, b, opts) {
      calls.push([m, p, b, opts]);
      const h = routes[`${m} ${p.split("?")[0]}`];
      return typeof h === "function" ? h(b, p) : h ?? {};
    },
    get(p) { return this.request("GET", p); },
    post(p, b) { return this.request("POST", p, b); },
    feed(x) { return this.post("/agents/feed", x); },
    propose(x) { return this.post("/agents/actions", x); },
  };
}
const writes = (c, p) => c.calls.filter(([m, path]) => m !== "GET" && path === p);
const realFetch = global.fetch;
function claudeAnswers(...texts) {
  let i = 0;
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: texts[Math.min(i++, texts.length - 1)] }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }) });
}

test("chooseSlots: defaults until 10 posts have results, then the best hours 2 h apart plus one to try", () => {
  assert.deepEqual(socialPosts.chooseSlots(5, [post(9, 50)], "2026-10-24"), [9, 11, 13, 16, 19]);
  const history = [
    ...[1, 2, 3].map(() => post(19, 40)),
    ...[1, 2, 3].map(() => post(20, 35)), // close to 19: skipped
    ...[1, 2].map(() => post(13, 20)),
    ...[1, 2].map(() => post(9, 5)),
    ...[1, 2].map(() => post(16, 15)),
    post(11, 1), // only one post at 11: not counted
  ];
  const slots = socialPosts.chooseSlots(5, history, "2026-10-24");
  assert.equal(slots.length, 5);
  for (const h of [19, 13, 16]) assert.ok(slots.includes(h), `keeps ${h}`);
  assert.ok(!slots.includes(20));
  for (let i = 1; i < slots.length; i++) assert.ok(slots[i] - slots[i - 1] >= 2, "2 h apart");
  // One a day: just the best hour.
  assert.deepEqual(socialPosts.chooseSlots(1, history, "2026-10-24"), [19]);
  // Stories don't count as results.
  assert.deepEqual(socialPosts.chooseSlots(2, history.map((p) => ({ ...p, format: "story" })), "2026-10-24"), [10, 17]);
});

test("cleanAnswer: a carousel needs a title and 3+ points in Latin letters, else it's a single picture", () => {
  const raw = { caption: CAPTION, picture: 1, format: "carousel", title: "5 signs your AC needs service", slides: [{ title: "Warm air", text: "Filters are dirty." }, { title: "Noise", text: "Loose parts." }, { title: "Water drip", text: "Blocked drain." }], storyLine: "AC ready for summer?" };
  const ok = socialPosts.cleanAnswer(raw, PICTURES, { carousel: true });
  assert.equal(ok.format, "carousel");
  assert.equal(ok.slides.length, 3);
  assert.equal(socialPosts.cleanAnswer(raw, PICTURES, { carousel: false }).format, "single"); // not allowed today
  assert.equal(socialPosts.cleanAnswer({ ...raw, slides: raw.slides.slice(0, 2) }, PICTURES, { carousel: true }).format, "single");
  assert.equal(socialPosts.cleanAnswer({ ...raw, title: "गर्मी से पहले" }, PICTURES, { carousel: true }).format, "single");
  assert.equal(socialPosts.cleanAnswer({ ...raw, storyLine: "गर्मी" }, PICTURES).storyLine, "");
});

test("resultsFor and weeklyNumbers: best and worst posts, totals, formats and unread results", () => {
  const now = at(24, 12);
  const m = (likes, comments, shares) => ({ facebook: { reactions: likes, comments, shares }, instagram: { likes: 0 }, score: likes + 3 * comments + 4 * shares });
  const posts = [
    { at: new Date(at(20, 9)).toISOString(), format: "carousel", topic: "AC signs", metrics: m(30, 4, 2) },
    { at: new Date(at(21, 13)).toISOString(), format: "single", topic: "Plumbing", metrics: m(5, 0, 0) },
    { at: new Date(at(22, 19)).toISOString(), format: "single", topic: "Diwali cleaning", metrics: m(20, 2, 1) },
    { at: new Date(at(23, 11)).toISOString(), format: "single", topic: "Pest control", metrics: { ...m(1, 0, 0), errors: ["instagram: Meta: no permission"] } },
    { at: new Date(at(23, 18)).toISOString(), format: "story", storyLine: "Hi" },
  ];
  const r = socialPosts.resultsFor(posts, now);
  assert.match(r, /Did best:\n- \[carousel\] AC signs: 30 likes, 4 comments, 2 shares/);
  assert.match(r, /Did worst:[\s\S]*Pest control/);
  const w = socialPosts.weeklyNumbers(posts, now);
  assert.equal(w.feed, 4);
  assert.match(w.text, /^4 posts and 1 Story in the last 7 days: 56 likes, 6 comments, 3 shares\./);
  assert.match(w.text, /By format[\s\S]*carousel: 50\.0/);
  assert.match(w.text, /couldn't be read: instagram: Meta: no permission/);
});

test("auto-post: fresh picture, carousel with the calendar in the prompt, a Story in the evening, Monday report", async () => {
  const answer = JSON.stringify({ format: "carousel", topic: "AC before summer", category: "AC Repair", caption: CAPTION, title: "5 signs your AC needs service", slides: [{ title: "Warm air", text: "a" }, { title: "Noise", text: "b" }, { title: "Drip", text: "c" }], scene: "a technician cleaning a split AC", show: "person", picture: 1, storyLine: "AC ready for summer?" });
  claudeAnswers(answer);
  let prompt = "";
  const anthropicFetch = global.fetch;
  global.fetch = async (url, opts) => {
    prompt = JSON.parse(opts.body).messages[0].content;
    return anthropicFetch(url, opts);
  };
  const self = { kind: "specialist", template: "marketing", budgetRemainingUsd: 1, dailyBudgetUsd: 1, instructions: "x", socialAutoPost: true, socialPostsPerDay: 5, socialStories: true, socialCarousels: true, socialReels: false };
  const published = { results: { facebook: { ok: true, link: "https://www.facebook.com/1" } } };
  const c = fake({
    "GET /agents/self": self,
    "GET /agents/office": { tasks: [] },
    "GET /admin/social/status": { facebook: true, instagram: true },
    "GET /admin/social/images": PICTURES,
    "GET /admin/social/posts": [],
    "GET /admin/offers": [],
    "GET /admin/social/calendar": { events: [{ name: "Diwali", date: "2026-11-08", daysAway: 15, ideas: "Deep cleaning" }], seasons: [{ name: "Festive autumn", ideas: "Painting" }] },
    "GET /admin/images/colours": [{ category: "AC Repair", hex: "#6EC1E4", name: "ice blue" }],
    "POST /admin/social/picture": { url: "https://api.tikdum.com/uploads/new.jpg", colour: { hex: "#6EC1E4", name: "ice blue" }, category: "AC Repair" },
    "POST /admin/social/posts": published,
    "POST /agents/feed": { duplicate: false },
  });
  await specialist.tick(c, silent, "specialist-u1", { now: at(24, 16, 5) }); // Saturday 16:05
  global.fetch = realFetch;
  assert.match(prompt, /Format: single or carousel \(allowed today\)/);
  assert.match(prompt, /Diwali: in 15 days \(2026-11-08\)\. Ideas: Deep cleaning/);
  assert.match(prompt, /Season — Festive autumn/);
  const [pic] = writes(c, "/admin/social/picture");
  assert.deepEqual(pic[2], { topic: "AC before summer", category: "AC Repair", scene: "a technician cleaning a split AC", show: "person" });
  assert.deepEqual(pic[3], { timeoutMs: 240000, retries: 0 });
  const [feedPost, story] = writes(c, "/admin/social/posts").map(([, , b]) => b);
  assert.equal(feedPost.format, "carousel");
  assert.equal(feedPost.imageUrl, "https://api.tikdum.com/uploads/new.jpg");
  assert.equal(feedPost.fresh, true);
  assert.deepEqual(feedPost.colour, { hex: "#6EC1E4", name: "ice blue" });
  assert.deepEqual(story, { format: "story", caption: "", imageUrl: "https://api.tikdum.com/uploads/new.jpg", storyLine: "AC ready for summer?", channels: ["facebook", "instagram"], topic: "AC before summer", colour: { hex: "#6EC1E4", name: "ice blue" } });

  // Next slot: no second carousel today, no second Story; the picture failing falls back to the library.
  claudeAnswers(answer);
  c.calls.length = 0;
  const answerRoutes = c.request;
  c.request = async function (m, p, b, o) {
    if (p === "/admin/social/picture") throw new Error("Today's 8 new post pictures are done");
    return answerRoutes.call(this, m, p, b, o);
  };
  await specialist.tick(c, silent, "specialist-u1", { now: at(24, 19, 5) });
  global.fetch = realFetch;
  const second = writes(c, "/admin/social/posts").map(([, , b]) => b);
  assert.equal(second.length, 1);
  assert.equal(second[0].format, undefined); // single
  assert.equal(second[0].imageUrl, PICTURES[0].url);
  assert.deepEqual(second[0].colour, { hex: "#6EC1E4", name: "ice blue" });

  // Monday 11:00: the weekly report goes to Alerts & reports once.
  const m = (s) => ({ facebook: { reactions: s }, score: s });
  const week = [1, 2, 3].map((i) => ({ at: new Date(at(24, 9 + i)).toISOString(), format: "single", topic: `T${i}`, metrics: m(i * 10) }));
  claudeAnswers("Carousels did well. Plumbing posts were quiet. Post more tips.");
  const r = fake({ ...Object.fromEntries(Object.entries({ "GET /agents/self": { ...self, socialAutoPost: false }, "GET /agents/office": { tasks: [] }, "GET /admin/social/status": { facebook: true }, "POST /agents/feed": { duplicate: false } })), "GET /admin/social/posts": week });
  await specialist.tick(r, silent, "specialist-u2", { now: Date.parse("2026-10-26T11:10:00+05:30") });
  await specialist.tick(r, silent, "specialist-u2", { now: Date.parse("2026-10-26T12:10:00+05:30") });
  global.fetch = realFetch;
  const reports = writes(r, "/agents/feed").map(([, , b]) => b);
  assert.equal(reports.length, 1);
  assert.match(reports[0].title, /^Social media this week: 3 posts, 60 likes, 0 comments/);
  assert.match(reports[0].body, /^Carousels did well\./);
});

test("Reels: one a day from 18:00, a title and 3+ points, to every channel incl. YouTube; nothing when switched off", async () => {
  const answer = JSON.stringify({ format: "reel", topic: "Geyser care", category: "Appliance Repair", caption: CAPTION, title: "Is your geyser winter-ready?", slides: [{ title: "Slow heating", text: "Sediment builds up." }, { title: "Strange noises", text: "Get it checked." }, { title: "Leaks", text: "Fix drips early." }], scene: "a geyser", show: "service", picture: 1, storyLine: "x", videoScene: "A technician checks a geyser in a bathroom." });
  let prompt = "";
  global.fetch = async (url, opts) => ((prompt = JSON.parse(opts.body).messages[0].content), { ok: true, json: async () => ({ content: [{ type: "text", text: answer }], usage: {}, stop_reason: "end_turn" }) });
  const self = { kind: "specialist", template: "marketing", budgetRemainingUsd: 1, dailyBudgetUsd: 1, instructions: "x", socialAutoPost: true, socialPostsPerDay: 5, socialStories: false, socialCarousels: true, socialReels: true };
  const routes = {
    "GET /agents/self": self,
    "GET /agents/office": { tasks: [] },
    "GET /admin/social/status": { facebook: true, instagram: true, threads: true, youtube: true, video: true },
    "GET /admin/social/images": PICTURES,
    "GET /admin/social/posts": [],
    "GET /admin/offers": [],
    "POST /admin/social/picture": { url: "https://api.tikdum.com/uploads/r.jpg", colour: null },
    "POST /admin/social/posts": { id: "r1", format: "reel", status: "publishing", results: {} },
  };
  const c = fake(routes);
  await specialist.tick(c, silent, "specialist-reel", { now: at(24, 18, 3) });
  global.fetch = realFetch;
  assert.match(prompt, /Format: "reel"/);
  const [[, , body]] = writes(c, "/admin/social/posts");
  assert.equal(body.format, "reel");
  assert.equal(body.title, "Is your geyser winter-ready?");
  assert.equal(body.slides.length, 3);
  assert.deepEqual(body.channels, ["facebook", "instagram", "threads", "youtube"]);
  assert.equal(body.videoScene, "A technician checks a geyser in a bathroom."); // AI video is on by default
  assert.equal(body.category, "Appliance Repair");
  // Same day: no second Reel (the next run makes the slot's post instead).
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ caption: CAPTION, picture: 1 }) }], usage: {}, stop_reason: "end_turn" }) });
  await specialist.tick(c, silent, "specialist-reel", { now: at(24, 19, 3) });
  global.fetch = realFetch;
  const bodies = writes(c, "/admin/social/posts").map(([, , b]) => b);
  assert.equal(bodies.filter((b) => b.format === "reel").length, 1);
  assert.ok(!bodies[1].channels.includes("youtube")); // ordinary posts don't go to YouTube

  // Switched off (or the server can't make videos): no Reel.
  const off = fake({ ...routes, "GET /agents/self": { ...self, socialReels: false } });
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ caption: CAPTION, picture: 1 }) }], usage: {}, stop_reason: "end_turn" }) });
  await specialist.tick(off, silent, "specialist-reel2", { now: at(24, 18, 3) });
  global.fetch = realFetch;
  assert.equal(writes(off, "/admin/social/posts").filter(([, , b]) => b.format === "reel").length, 0);
});
