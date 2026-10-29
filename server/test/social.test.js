const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-social-"));
process.env.SOCIAL_IMAGE_BASE = "https://api.tikdum.com";
const social = require("../src/social");
const access = require("../src/access");

test("cleanPost: needs a caption and a picture, keeps Instagram's limits, defaults to both channels", () => {
  assert.throws(() => social.cleanPost({ imageUrl: "/x.jpg" }), /caption/);
  assert.throws(() => social.cleanPost({ caption: "Hello" }), /picture/);
  assert.throws(() => social.cleanPost({ caption: "x".repeat(2201), imageUrl: "/x.jpg" }), /2200/);
  assert.throws(() => social.cleanPost({ caption: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "), imageUrl: "/x.jpg" }), /30 hashtags/);
  assert.throws(() => social.cleanPost({ caption: "Hi there", imageUrl: "/x.jpg", channels: ["twitter"] }), /facebook, instagram, threads, youtube and pinterest/);
  assert.deepEqual(social.cleanPost({ caption: " Hi there ", imageUrl: "/x.jpg" }).channels, ["facebook", "instagram"]);
});

test("imageLibrary: category photos, live banners and service photos as public links, no duplicates", () => {
  const lib = social.imageLibrary({
    categories: [{ id: "plumbing", name: "Plumbing" }, { id: "x", name: "Masonry", imageUrl: "/uploads/m.webp" }, { id: "none", name: "No photo" }],
    banners: [{ title: "Diwali", imageUrl: "/uploads/b.webp" }],
    services: [{ name: "Tap repair", imageUrl: "/uploads/m.webp" }, { name: "No pic" }],
  });
  assert.deepEqual(lib.map((x) => x.url), ["https://tikdum.com/category-photos/plumbing.jpg", "https://api.tikdum.com/uploads/m.webp", "https://api.tikdum.com/uploads/b.webp"]);
  assert.equal(lib[2].label, "Diwali (home banner)");
});

test("prepareImage: only Tikdum's own pictures", async () => {
  await assert.rejects(social.prepareImage("https://evil.example.com/a.jpg"), /Tikdum's own images/);
  await assert.rejects(social.prepareImage("https://tikdum.com.evil.example/a.jpg"), /Tikdum's own images/);
});

test("publish refuses when Facebook/Instagram aren't connected (nothing is fetched)", async () => {
  delete process.env.META_PAGE_TOKEN;
  await assert.rejects(social.publish({ caption: "Hello Jammu", imageUrl: "/category-photos/plumbing.jpg" }), /isn't connected/);
});

test("access: posting needs social.add; the Marketing Team role has it, Management doesn't", () => {
  assert.equal(access.requiredFor("POST", "/admin/social/posts", {}), "social.add");
  assert.equal(access.requiredFor("GET", "/admin/social/posts", {}), "social.view");
  assert.equal(access.requiredFor("GET", "/admin/social/images", {}), "social.view");
  const roles = access.listRoles();
  const marketing = roles.find((r) => r.id === "marketing");
  assert.ok(marketing && marketing.permissions.includes("social.add"));
  assert.ok(!roles.find((r) => r.id === "management").permissions.includes("social.add"));
});
