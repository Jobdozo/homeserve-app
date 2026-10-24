const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-blog-"));
process.env.ANTHROPIC_API_KEY = "test-key";
process.env.BLOG_DAYS_IST = "2,5";
process.env.SOCIAL_POST_DAYS_IST = "0,1,2,3,4,5,6";
const blogPosts = require("../src/blogPosts");
const specialist = require("../src/specialist");
const silent = { info() {}, warn() {}, error() {} };

const body = ["Winter is coming to Jammu.", "", "## Signs your geyser needs a check", "- Slow heating", "", "## What to do", ...Array(60).fill("A verified technician checks the element, thermostat and valve, and cleans out sediment.")].join("\n");
const ARTICLE = { title: "How to get your geyser ready for winter in Jammu", description: "Signs to look for and what a technician checks.", topic: "Geyser winter care", category: "Appliance Repair", body, faqs: [{ q: "How often?", a: "Once a year." }], scene: "a technician checking a geyser", show: "person", why: "Winter is near." };

function fake(routes) {
  const calls = [];
  return {
    calls,
    async request(m, p, b, opts) {
      calls.push([m, p, b, opts]);
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
const claude = (text) => (global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text }], usage: {}, stop_reason: "end_turn" }) }));

test("cleanArticle: needs a real title, 400+ words and sections", () => {
  assert.equal(blogPosts.cleanArticle(ARTICLE).category, "Appliance Repair");
  assert.equal(blogPosts.cleanArticle({ ...ARTICLE, title: "Geysers" }), null);
  assert.equal(blogPosts.cleanArticle({ ...ARTICLE, body: "Too short." }), null);
  assert.equal(blogPosts.cleanArticle({ ...ARTICLE, body: body.replace(/^## .*$/gm, "Heading") }), null);
  assert.equal(blogPosts.isBlogTask({ title: "Blog: Diwali cleaning checklist" }), true);
});

test("SEO Agent: on Tuesday it saves a draft with a cover and proposes publishing it, once a day", async () => {
  claude(JSON.stringify(ARTICLE));
  const c = fake({
    "GET /agents/office": { tasks: [] },
    "GET /agents/self": { kind: "specialist", template: "seo", budgetRemainingUsd: 1, dailyBudgetUsd: 1 },
    "GET /admin/blog": [{ title: "Diwali cleaning checklist" }],
    "GET /admin/social/calendar": { events: [], seasons: [{ name: "Winter", ideas: "Geysers" }] },
    "GET /admin/images/colours": [{ category: "Appliance Repair" }],
    "POST /admin/blog/picture": { url: "https://api.tikdum.com/uploads/cover.jpg" },
    "POST /admin/blog": (b) => ({ id: "blog_1", slug: "how-to-get-your-geyser-ready-for-winter-in-jammu", readMinutes: 4, ...b }),
    "POST /agents/actions": { duplicate: false },
  });
  const TUE_11AM = Date.parse("2026-10-27T11:00:00+05:30");
  const out = await specialist.tick(c, silent, "specialist-seo", { now: TUE_11AM });
  global.fetch = realFetch;
  assert.match(out, /1 blog article\(s\) drafted for approval/);
  const [[, , draft]] = writes(c, "/admin/blog");
  assert.equal(draft.coverUrl, "https://api.tikdum.com/uploads/cover.jpg");
  assert.equal(draft.scene, undefined); // picture notes aren't saved on the article
  const [[, , p]] = writes(c, "/agents/actions");
  assert.deepEqual(p.request, { method: "POST", path: "/admin/blog/blog_1/publish", body: {} });
  assert.match(p.title, /^Publish on the tikdum.com blog: "How to get your geyser/);
  assert.match(p.reasoning, /tikdum\.com\/blog\/how-to-get-your-geyser-ready-for-winter-in-jammu/);
  assert.equal(await specialist.tick(c, silent, "specialist-seo", { now: TUE_11AM + 3600000 }), null);
  // Wednesday: not a blog day.
  assert.equal(await specialist.tick(c, silent, "specialist-seo", { now: Date.parse("2026-10-28T11:00:00+05:30") }), null);
});

test("Marketing Agent: a new article is shared once, with its link and cover picture", async () => {
  let prompt = "";
  global.fetch = async (url, opts) => {
    prompt = JSON.parse(opts.body).messages[0].content;
    return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ caption: "Winter is coming — is your geyser ready? Three quick checks.\nhttps://tikdum.com/blog/geyser\nBook on tikdum.com or the Tikdum app. #Jammu", picture: 1, category: "Appliance Repair" }) }], usage: {}, stop_reason: "end_turn" }) };
  };
  const now = Date.parse("2026-10-27T12:00:00+05:30");
  const c = fake({
    "GET /agents/office": { tasks: [] },
    "GET /agents/self": { kind: "specialist", template: "marketing", budgetRemainingUsd: 1, dailyBudgetUsd: 1, socialAutoPost: false },
    "GET /admin/social/status": { facebook: true, instagram: true },
    "GET /admin/social/images": [{ url: "https://tikdum.com/category-photos/plumbing.jpg", label: "Plumbing" }],
    "GET /admin/social/posts": [],
    "GET /admin/offers": [],
    "GET /blog": [{ id: "blog_1", slug: "geyser", title: "Geyser care", description: "Checks", coverUrl: "https://api.tikdum.com/uploads/cover.jpg", publishedAt: new Date(now - 3600000).toISOString() }],
    "POST /agents/actions": { duplicate: false },
  });
  await specialist.tick(c, silent, "specialist-mkt", { now });
  global.fetch = realFetch;
  assert.match(prompt, /Share our new blog article "Geyser care"/);
  assert.match(prompt, /https:\/\/tikdum\.com\/blog\/geyser/);
  const [[, , p]] = writes(c, "/agents/actions");
  assert.equal(p.request.body.imageUrl, "https://api.tikdum.com/uploads/cover.jpg");
  assert.equal(p.request.body.format, undefined);
  assert.equal(writes(c, "/admin/social/picture").length, 0); // the cover is used, no new picture
});

test("auto-publish: articles spread through the day, each published by the agent, repeats skipped", async () => {
  assert.deepEqual(blogPosts.blogSlots(10), [7, 9, 10, 12, 13, 15, 16, 18, 19, 21]);
  assert.deepEqual(blogPosts.blogSlots(2), [10, 17]);
  assert.ok(blogPosts.similarity("How to get your geyser ready for winter in Jammu", "Geyser ready for winter: a Jammu guide") >= 0.75);
  assert.ok(blogPosts.similarity("Diwali deep cleaning checklist", "Pest control after the monsoon") < 0.2);

  claude(JSON.stringify(ARTICLE));
  const existing = [];
  const c = fake({
    "GET /agents/office": { tasks: [] },
    "GET /agents/self": { kind: "specialist", template: "seo", budgetRemainingUsd: 1, dailyBudgetUsd: 1, blogAutoPublish: true, blogPerDay: 10 },
    "GET /admin/blog": existing,
    "GET /admin/social/calendar": { events: [], seasons: [] },
    "GET /admin/images/colours": [],
    "POST /admin/blog/picture": { url: "https://api.tikdum.com/uploads/c.jpg" },
    "POST /admin/blog": (b) => (existing.push({ title: b.title }), { id: `blog_${existing.length}`, slug: "s", ...b }),
    "POST /admin/blog/blog_1/publish": { id: "blog_1", slug: "geyser", title: ARTICLE.title, readMinutes: 4 },
  });
  const SUN = (h, m = 5) => Date.parse(`2026-10-25T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
  assert.equal(await specialist.tick(c, silent, "specialist-auto", { now: SUN(6) }), null); // before 7:00
  assert.match(await specialist.tick(c, silent, "specialist-auto", { now: SUN(7) }), /1 blog article\(s\) published/);
  assert.equal(writes(c, "/admin/blog/blog_1/publish").length, 1);
  assert.equal(writes(c, "/agents/actions").length, 0); // nothing waits for approval
  // 9:00 slot: the same topic again is skipped, nothing new saved or published.
  await specialist.tick(c, silent, "specialist-auto", { now: SUN(9) });
  global.fetch = realFetch;
  assert.equal(writes(c, "/admin/blog").length, 1);
  // The 9:00 slot is used up; 9:30 does nothing more.
  assert.equal(await specialist.tick(c, silent, "specialist-auto", { now: SUN(9, 30) }), null);
});
