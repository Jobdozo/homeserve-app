// The tikdum.com blog (tikdum.com/blog): helpful articles — "How to get your geyser ready for
// winter", "Diwali deep-cleaning checklist" — that bring people from Google to Tikdum's own site.
// The SEO Agent (agents/src/blogPosts.js) writes a draft twice a week and proposes publishing it;
// a person reads it in Admin → Blog and approves (or edits, or deletes). People can also write
// and publish articles there themselves.
//
// An article's text is a small, safe subset of Markdown: "## " headings, paragraphs, "- " lists
// and **bold**. render() turns it into HTML with everything escaped, for the page the server
// sends search engines (seoPages.js); the website shows the same text with its own copy of the
// parser (local-service-app/src/utils/articleText.js).
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const COLL = "blogArticles";
const fail = (status, message) => Object.assign(new Error(message), { status });
const oneLine = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Pure: the article's text as blocks. [{ type: "h2"|"p"|"ul", text | items }]
function parse(body) {
  const blocks = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    if (list) blocks.push({ type: "ul", items: list });
    para = [];
    list = null;
  };
  for (const raw of String(body || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^#{2,3}\s+(.+)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: "h2", text: h[1] });
      continue;
    }
    const li = /^[-*•]\s+(.+)$/.exec(line);
    if (li) {
      if (para.length) {
        blocks.push({ type: "p", text: para.join(" ") });
        para = [];
      }
      (list = list || []).push(li[1]);
      continue;
    }
    if (list) flush();
    para.push(line.replace(/^#\s+/, ""));
  }
  flush();
  return blocks;
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

// Pure: escaped HTML of the article text.
function render(body) {
  return parse(body)
    .map((b) => (b.type === "h2" ? `<h2>${inline(b.text)}</h2>` : b.type === "ul" ? `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>` : `<p>${inline(b.text)}</p>`))
    .join("\n");
}

const words = (body) => String(body || "").split(/\s+/).filter(Boolean).length;

function clean(input, old = {}) {
  const out = { ...old };
  if ("title" in input || !old.title) out.title = oneLine(input.title, 90);
  if (!out.title || out.title.length < 10) throw fail(400, "Give the article a title (at least 10 characters)");
  if ("description" in input) out.description = oneLine(input.description, 170);
  if ("body" in input) out.body = String(input.body || "").replace(/\r/g, "").trim().slice(0, 20000);
  if (words(out.body) < 150) throw fail(400, "The article is too short — write at least 150 words");
  if ("category" in input) out.category = oneLine(input.category, 80) || null;
  if ("coverUrl" in input) {
    const u = String(input.coverUrl || "").trim();
    if (u && !/^https:\/\/([a-z0-9-]+\.)*tikdum\.com\//i.test(u) && !/^\/(uploads|category-photos)\//.test(u)) throw fail(400, "Use a picture from Tikdum's own images");
    out.coverUrl = u || null;
  }
  if ("faqs" in input) {
    out.faqs = (Array.isArray(input.faqs) ? input.faqs : [])
      .map((f) => ({ q: oneLine(f?.q, 160), a: oneLine(f?.a, 600) }))
      .filter((f) => f.q && f.a)
      .slice(0, 6);
  }
  if ("topic" in input) out.topic = oneLine(input.topic, 80) || null;
  out.description = out.description || oneLine(parse(out.body).find((b) => b.type === "p")?.text, 160);
  out.readMinutes = Math.max(1, Math.round(words(out.body) / 200));
  return out;
}

function uniqueSlug(base, exceptId) {
  const rows = jsonStore.readAll(COLL);
  let slug = base || `article-${Date.now().toString(36)}`;
  for (let i = 2; rows.some((r) => r.slug === slug && r.id !== exceptId); i++) slug = `${base}-${i}`;
  return slug;
}

// A person may publish straight away; an AI agent's article is always a draft until approved.
function create(input, actor, { agent = false } = {}) {
  const row = clean(input);
  const now = new Date().toISOString();
  const publish = !agent && input.publish === true;
  return jsonStore.insert(COLL, {
    id: `blog_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    ...row,
    slug: uniqueSlug(slugify(input.slug || row.title)),
    status: publish ? "published" : "draft",
    publishedAt: publish ? now : null,
    createdAt: now,
    updatedAt: now,
    by: actor || null,
  });
}

function edit(id, input, actor) {
  const old = jsonStore.readAll(COLL).find((r) => r.id === id);
  if (!old) throw fail(404, "Article not found");
  const row = clean(input, old);
  // The address stays once it's live (links and Google keep working); a draft follows its title.
  if (old.status !== "published" && ("title" in input || "slug" in input)) row.slug = uniqueSlug(slugify(input.slug || row.title), id);
  return jsonStore.update(COLL, id, { ...row, updatedAt: new Date().toISOString(), updatedBy: actor || null });
}

function setStatus(id, status, actor) {
  const old = jsonStore.readAll(COLL).find((r) => r.id === id);
  if (!old) throw fail(404, "Article not found");
  if (status === old.status) return old;
  const now = new Date().toISOString();
  // A first publish is dated now; re-publishing after an unpublish keeps the first date.
  return jsonStore.update(COLL, id, { status, publishedAt: status === "published" ? old.publishedAt || now : old.publishedAt, updatedAt: now, [status === "published" ? "publishedBy" : "unpublishedBy"]: actor || null });
}

function remove(id) {
  return jsonStore.remove(COLL, String(id));
}

const newestFirst = (a, b) => String(b.publishedAt || b.createdAt).localeCompare(String(a.publishedAt || a.createdAt));
function listAll() {
  return jsonStore.readAll(COLL).sort(newestFirst);
}
function listPublished() {
  return listAll().filter((r) => r.status === "published");
}
const summary = ({ id, slug, title, description, coverUrl, category, publishedAt, readMinutes }) => ({ id, slug, title, description, coverUrl, category, publishedAt, readMinutes });
function bySlug(slug) {
  return listPublished().find((r) => r.slug === String(slug)) || null;
}

module.exports = { create, edit, setStatus, remove, listAll, listPublished, summary, bySlug, parse, render, slugify };
