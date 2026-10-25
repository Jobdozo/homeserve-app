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

test("agents: may save drafts and publish (gated by Auto-publish in the policy), never edit", () => {
  const perms = agents.agentPermissions(["blog.view", "blog.add", "blog.approve", "blog.edit"]);
  assert.ok(perms.includes("blog.add"));
  assert.ok(perms.includes("blog.approve"));
  assert.ok(!perms.includes("blog.edit"));
  assert.ok(agents.PROPOSABLE_TYPES.includes("blog.publish"));
});

test("agents: publishing only with Auto-publish on, at most the day's number; never edit or unpublish", () => {
  const admin = { agentId: "seo1" };
  const pub = (id) => agents.policy({ method: "POST", body: {} }, admin, `/admin/blog/${id}/publish`);
  agents.setConfig({ blogAutoPublish: false }, "Owner");
  assert.match(pub("x").error, /auto-publish is off/);
  agents.setConfig({ blogAutoPublish: true, blogPerDay: 2 }, "Owner");
  assert.equal(pub("x"), null);
  for (const t of ["First automatic article here", "Second automatic article here"]) {
    const a = blog.create({ title: t, body: BODY }, "SEO Agent [AI agent]", { agent: true });
    blog.setStatus(a.id, "published", "SEO Agent [AI agent]");
  }
  assert.match(pub("x").error, /2 automatic articles are done/);
  assert.match(agents.policy({ method: "PATCH", body: {} }, admin, "/admin/blog/x").error, /Only a person/);
  assert.match(agents.policy({ method: "POST", body: {} }, admin, "/admin/blog/x/unpublish").error, /Only a person/);
  assert.equal(agents.policy({ method: "POST", body: {} }, admin, "/admin/blog/picture"), null);
  assert.equal(agents.policy({ method: "POST", body: {} }, admin, "/admin/blog"), null);
  assert.equal(agents.getConfig().blogPerDay, 2);
  agents.setConfig({ blogPerDay: 50 }, "Owner");
  assert.equal(agents.getConfig().blogPerDay, 10);
});

test("AdSense on the blog only: the ID from what's pasted, the script on blog pages only, ads.txt, who may change it", async () => {
  const ads = require("../src/blogAds");
  const access = require("../src/access");
  assert.equal(ads.clientFrom("ca-pub-1234567890123456"), "ca-pub-1234567890123456");
  assert.equal(ads.clientFrom("pub-1234567890123456"), "ca-pub-1234567890123456");
  assert.equal(ads.clientFrom('<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456" crossorigin="anonymous"></script>'), "ca-pub-1234567890123456");
  assert.equal(ads.clientFrom("G-ABC123"), null);
  assert.throws(() => ads.set({ client: "UA-12345" }, "Owner"), /isn't an AdSense publisher ID/);

  const shell = '<html><head><title>x</title></head><body><div id="root"></div></body></html>';
  const data = { categories: [], blog: blog.listPublished() };
  const blogPage = () => seo.injectHead(shell, seo.pageFor("/blog", data));
  assert.doesNotMatch(blogPage(), /adsbygoogle/); // no ID yet: nothing
  assert.equal(ads.adsTxt(), null);

  ads.set({ client: "ca-pub-1234567890123456" }, "Owner");
  assert.match(blogPage(), /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1234567890123456" crossorigin="anonymous"><\/script>/);
  assert.match(blogPage(), /<meta name="google-adsense-account" content="ca-pub-1234567890123456" \/>/);
  const article = blog.listPublished()[0];
  assert.match(seo.injectHead(shell, seo.pageFor(`/blog/${article.slug}`, data)), /adsbygoogle\.js/);
  for (const other of ["/", "/home", "/categories", "/blog/nope"]) assert.doesNotMatch(seo.injectHead(shell, seo.pageFor(other, data)), /adsbygoogle|google-adsense-account/, other);
  assert.equal(ads.adsTxt(), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");

  // Served at tikdum.com/ads.txt (the website's nginx hands unknown files to the page builder).
  const res = { headers: {}, statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, set(h, v) { if (typeof h === "string") this.headers[h] = v; else Object.assign(this.headers, h); return this; }, type(t) { this.headers["Content-Type"] = t; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  await seo.route({})({ get: (h) => (h.toLowerCase() === "x-original-uri" ? "/ads.txt" : undefined) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/plain");
  assert.match(res.body, /^google\.com, pub-1234567890123456, DIRECT/);

  // Paused: no script anywhere, ads.txt stays.
  assert.equal(ads.set({ on: false }, "Owner").on, false);
  assert.doesNotMatch(blogPage(), /adsbygoogle/);
  assert.ok(ads.adsTxt());
  assert.equal(ads.active(), null);

  // Changing it is blog.manage: not the SEO Agent's (management role: view/add/approve).
  assert.equal(access.requiredFor("GET", "/admin/blog-ads"), "blog.view");
  assert.equal(access.requiredFor("PUT", "/admin/blog-ads"), "blog.manage");
});
