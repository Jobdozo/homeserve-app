const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-social-"));
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.SOCIAL_POST_DAYS_IST = "1,3,5"; // these tests use a Mon/Wed/Fri schedule (the default is every day)
const socialPosts = require("../src/socialPosts");
const specialist = require("../src/specialist");
const silent = { info() {}, warn() {}, error() {} };

const PICTURES = [
  { url: "https://tikdum.com/category-photos/plumbing.jpg", label: "Plumbing (category photo)" },
  { url: "https://api.tikdum.com/uploads/b.webp", label: "Diwali (home banner)" },
];
const CAPTION = "Leaky tap keeping you up? Book a verified Jammu plumber in a minute.\nTap tapakta hai? Abhi book karo!\nBook on tikdum.com or the Tikdum app.\n#Jammu #Plumber #Tikdum";

function fake(routes) {
  const calls = [];
  return {
    calls,
    async request(m, p, b) {
      calls.push([m, p, b]);
      const h = routes[`${m} ${p.split("?")[0]}`];
      return typeof h === "function" ? h(b) : h ?? {};
    },
    get(p) { return this.request("GET", p); },
    post(p, b) { return this.request("POST", p, b); },
    feed(x) { return this.post("/agents/feed", x); },
    propose(x) { return this.post("/agents/actions", x); },
  };
}
const writes = (c, p) => c.calls.filter(([m, path]) => m !== "GET" && path === p);
const realFetch = global.fetch;
function claudeAnswers(text) {
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 }, stop_reason: "end_turn" }) });
}
const routes = (extra = {}) => ({
  "GET /agents/self": { kind: "specialist", template: "marketing", budgetRemainingUsd: 1, dailyBudgetUsd: 1, instructions: "x" },
  "GET /admin/social/status": { facebook: true, instagram: true },
  "GET /admin/social/images": PICTURES,
  "GET /admin/social/posts": [],
  "GET /admin/offers": [{ code: "OLD", discountPercent: 10, active: true, expiresAt: "2020-01-01T00:00:00Z" }],
  "POST /agents/actions": { duplicate: false },
  ...extra,
});
const WED_11AM_IST = Date.parse("2026-10-21T05:30:00Z");

test("cleanAnswer: checks length, hashtags and the picture number", () => {
  assert.equal(socialPosts.cleanAnswer({ caption: "short", picture: 1 }, PICTURES), null);
  assert.equal(socialPosts.cleanAnswer({ caption: CAPTION, picture: 3 }, PICTURES), null);
  assert.equal(socialPosts.cleanAnswer({ caption: CAPTION, picture: 2 }, PICTURES).picture.label, "Diwali (home banner)");
  assert.equal(socialPosts.isPostTask({ title: "Post: Diwali cleaning" }), true);
  assert.equal(socialPosts.isPostTask({ title: "Plan posts for November" }), false);
});

test("marketing agent: proposes one scheduled post on Wednesday, with the picture and both channels", async () => {
  claudeAnswers(JSON.stringify({ caption: CAPTION, picture: 1, why: "Monsoon leaks are common." }));
  const c = fake(routes({ "GET /agents/office": { tasks: [] } }));
  const out = await specialist.tick(c, silent, "specialist-9", { now: WED_11AM_IST });
  global.fetch = realFetch;
  assert.match(out, /1 social post\(s\) proposed/);
  const [[, , p]] = writes(c, "/agents/actions");
  assert.deepEqual(p.request, { method: "POST", path: "/admin/social/posts", body: { caption: CAPTION, imageUrl: PICTURES[0].url, channels: ["facebook", "instagram"] } });
  assert.match(p.title, /^Post on Facebook \+ Instagram: "Leaky tap/);
  // An expired offer isn't passed to the AI; a second run the same day proposes nothing.
  assert.equal(await specialist.tick(c, silent, "specialist-9", { now: WED_11AM_IST + 3600000 }), null);
  assert.equal(writes(c, "/agents/actions").length, 1);
});

test("marketing agent: a 'Post: …' task becomes a proposal and goes to Review; nothing when not connected", async () => {
  claudeAnswers(JSON.stringify({ caption: CAPTION, picture: 2 }));
  const task = { id: "t1", title: "Post: Diwali deep cleaning", status: "open", updatedAt: "u1", messages: [] };
  const c = fake(routes({ "GET /agents/office": { tasks: [task] } }));
  await specialist.tick(c, silent, "specialist-8", { now: Date.parse("2026-10-20T05:30:00Z") }); // Tuesday: task only
  global.fetch = realFetch;
  assert.equal(writes(c, "/agents/actions").length, 1);
  assert.deepEqual(writes(c, "/agents/office/tasks/t1/status").map(([, , b]) => b.status), ["in_progress", "review"]);

  // Not connected: no proposal, the task is drafted like any other.
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "Draft caption…" }], usage: {}, stop_reason: "end_turn" }) });
  const off = fake(routes({ "GET /agents/office": { tasks: [{ ...task, id: "t2" }] }, "GET /admin/social/status": { facebook: false, instagram: false } }));
  await specialist.tick(off, silent, "specialist-7", { now: WED_11AM_IST });
  global.fetch = realFetch;
  assert.equal(writes(off, "/agents/actions").length, 0);
  assert.deepEqual(writes(off, "/agents/office/tasks/t2/status").map(([, , b]) => b.status), ["in_progress", "review"]);
});
