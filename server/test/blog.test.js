const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-blog-"));
const blog = require("../src/blog");
const seo = require("../src/seoPages");
const agents = require("../src/agents");

const BODY = [
  "Winter in Jammu & Kashmir means cold mornings, and a geyser that works is a must. Here is how to get yours ready <now>.",
  "",
  "## Signs your geyser needs a check",
  "- Water takes **longer** to heat",
  "- Strange noises from the tank",
  "- Drips around the pipes",
  "",
  "## What a technician does",
  ...Array.from({ length: 30 }, () => "A verified technician checks the heating element, thermostat, safety valve and the pipes, and cleans out the sediment that builds up over the year."),
].join("\n");

test("parse and render: headings, lists, paragraphs and bold, all escaped", () => {
  const blocks = blog.parse(BODY);
  assert.deepEqual(blocks.slice(0, 3).map((b) => b.type), ["p", "h2", "ul"]);
  assert.equal(blocks[2].items.length, 3);
  const html = blog.render(BODY);
  assert.match(html, /<h2>Signs your geyser needs a check<\/h2>/);
  assert.match(html, /<li>Water takes <strong>longer<\/strong> to heat<\/li>/);
  assert.match(html, /ready &lt;now&gt;\./);
  assert.doesNotMatch(html, /<now>/);
  assert.equal(blog.slugify("Geyser Repair in Jammu: 5 Signs!"), "geyser-repair-in-jammu-5-signs");
});

test("articles: an agent's article stays a draft, slugs are unique, a live address doesn't change", () => {
  assert.throws(() => blog.create({ title: "Short", body: BODY }), /title/);
  assert.throws(() => blog.create({ title: "A long enough title", body: "too short" }), /too short/);
  assert.throws(() => blog.create({ title: "A long enough title", body: BODY, coverUrl: "https://evil.example/x.jpg" }), /Tikdum's own/);
  const a = blog.create({ title: "Get your geyser ready for winter", body: BODY, publish: true, faqs: [{ q: "How often?", a: "Once a year." }, { q: "" }] }, "SEO Agent [AI agent]", { agent: true });
  assert.equal(a.status, "draft");
  assert.equal(a.slug, "get-your-geyser-ready-for-winter");
  assert.equal(a.faqs.length, 1);
  assert.ok(a.readMinutes >= 1);
  assert.match(a.description, /^Winter in Jammu/);
  const b = blog.create({ title: "Get your geyser ready for winter", body: BODY, publish: true }, "Owner");
  assert.equal(b.status, "published");
  assert.equal(b.slug, "get-your-geyser-ready-for-winter-2");
  assert.equal(blog.listPublished().length, 1);
  assert.equal(blog.bySlug(a.slug), null); // drafts aren't public

  const live = blog.setStatus(a.id, "published", "Owner");
  assert.ok(live.publishedAt);
  assert.equal(blog.edit(a.id, { title: "Geyser care before winter in Jammu" }, "Owner").slug, a.slug);
  assert.equal(blog.listPublished().length, 2);
  assert.equal(blog.setStatus(b.id, "draft", "Owner").status, "draft");
  assert.ok(blog.remove(b.id));
});

test("search pages: /blog and an article carry their head and the article text; unknown is 404", () => {
  const a = blog.listPublished()[0];
  const data = { categories: [{ id: "appliance-repair", name: "Appliance Repair", active: true }], blog: blog.listPublished() };
  blog.edit(a.id, { category: "Appliance Repair" }, "Owner");
  data.blog = blog.listPublished();
  const list = seo.pageFor("/blog", data);
  assert.equal(list.status, 200);
  assert.match(list.bodyHtml, /href="\/blog\/get-your-geyser-ready-for-winter"/);
  const p = seo.pageFor(`/blog/${a.slug}`, data);
  assert.equal(p.status, 200);
  assert.equal(p.canonical, `/blog/${a.slug}`);
  assert.ok(p.jsonLd.some((j) => j["@type"] === "BlogPosting" && j.about?.name === "Appliance Repair"));
  assert.match(p.bodyHtml, /<h2>Signs your geyser needs a check<\/h2>/);
  assert.match(p.bodyHtml, /Book Appliance Repair on Tikdum/);
  assert.equal(seo.pageFor("/blog/nope", data).status, 404);
  const html = seo.injectHead('<html><head><title>x</title></head><body><div id="root"><div id="initial-loader"></div></div></body></html>', p);
  assert.match(html, /<div id="root">\s*<main><article><h1>Geyser care before winter in Jammu<\/h1>/);
  assert.match(html, /property="og:type" content="article"/);
});

test("agents: may save drafts, may only propose publishing", () => {
  const perms = agents.agentPermissions(["blog.view", "blog.add", "blog.approve", "blog.edit"]);
  assert.ok(perms.includes("blog.add"));
  assert.ok(!perms.includes("blog.approve"));
  assert.ok(!perms.includes("blog.edit"));
  assert.ok(agents.PROPOSABLE_TYPES.includes("blog.publish"));
});
