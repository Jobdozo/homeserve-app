const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-subcategories-"));
process.env.JWT_SECRET = "test-secret";
const subs = require("../src/subcategories");
const access = require("../src/access");

test("create: trims, rejects blanks, keeps names unique inside a category but not across categories", () => {
  const window = subs.create({ categoryId: "ac-repair", name: "  Window   AC " });
  assert.equal(window.name, "Window AC");
  assert.equal(window.active, true);
  assert.throws(() => subs.create({ categoryId: "ac-repair", name: "" }), /name/);
  assert.throws(() => subs.create({ categoryId: "", name: "X" }), /category/);
  assert.throws(() => subs.create({ categoryId: "ac-repair", name: "window ac" }), /already has/);
  const other = subs.create({ categoryId: "cleaning", name: "Window AC" }); // different category: fine
  assert.equal(other.categoryId, "cleaning");
});

test("list: ordered, filtered by category, hides inactive for the public", () => {
  const split = subs.create({ categoryId: "ac-repair", name: "Split AC" });
  const vrf = subs.create({ categoryId: "ac-repair", name: "VRF AC" });
  assert.deepEqual(subs.list({ categoryId: "ac-repair" }).map((s) => s.name), ["Window AC", "Split AC", "VRF AC"]);
  subs.update(vrf.id, { active: false });
  assert.deepEqual(subs.list({ categoryId: "ac-repair" }).map((s) => s.name), ["Window AC", "Split AC"]);
  assert.equal(subs.list({ categoryId: "ac-repair", includeInactive: true }).length, 3);
  subs.update(split.id, { sortOrder: 0 });
  assert.equal(subs.list({ categoryId: "ac-repair" })[0].name, "Split AC");
  assert.throws(() => subs.update(split.id, { name: "Window AC" }), /already has/);
  assert.equal(subs.update("nope", { name: "x" }), null);
});

test("link: a service can sit in a sub-category of its own category only", () => {
  const split = subs.list({ categoryId: "ac-repair" }).find((s) => s.name === "Split AC");
  const cleaningSub = subs.list({ categoryId: "cleaning" })[0];
  assert.equal(subs.subcategoryOf("svc1"), null);
  subs.link("svc1", split.id, "ac-repair");
  assert.equal(subs.subcategoryOf("svc1"), split.id);
  assert.throws(() => subs.link("svc1", cleaningSub.id, "ac-repair"), /different category/);
  assert.throws(() => subs.link("svc1", "missing", "ac-repair"), /Unknown/);
  assert.equal(subs.subcategoryOf("svc1"), split.id, "a rejected change leaves the old value");
  // validate() is the same check without writing (used before the service exists)
  assert.equal(subs.validate(split.id, "ac-repair"), split.id);
  assert.equal(subs.validate("", "ac-repair"), null);
  assert.throws(() => subs.validate(split.id, "cleaning"), /different category/);
  subs.link("svc1", null, "ac-repair");
  assert.equal(subs.subcategoryOf("svc1"), null);
});

test("moving a service to another category drops a sub-category that no longer fits", () => {
  const split = subs.list({ categoryId: "ac-repair" }).find((s) => s.name === "Split AC");
  subs.link("svc2", split.id, "ac-repair");
  subs.reconcile("svc2", "ac-repair");
  assert.equal(subs.subcategoryOf("svc2"), split.id, "same category: kept");
  subs.reconcile("svc2", "cleaning");
  assert.equal(subs.subcategoryOf("svc2"), null, "other category: dropped");
});

test("deleting a sub-category (or its whole category) leaves services in place, unsorted", () => {
  const split = subs.list({ categoryId: "ac-repair" }).find((s) => s.name === "Split AC");
  subs.link("svc3", split.id, "ac-repair");
  assert.equal(subs.remove(split.id), true);
  assert.equal(subs.subcategoryOf("svc3"), null);
  assert.equal(subs.remove(split.id), false);
  const extra = subs.create({ categoryId: "plumbing", name: "Bathroom" });
  subs.link("svc4", extra.id, "plumbing");
  subs.removeForCategory("plumbing");
  assert.equal(subs.get(extra.id), null);
  assert.equal(subs.subcategoryOf("svc4"), null);
});

test("permissions: managing sub-categories follows the services permissions", () => {
  assert.equal(access.requiredFor("POST", "/admin/subcategories", {}), "services.add");
  assert.equal(access.requiredFor("PATCH", "/admin/subcategories/x", {}), "services.edit");
  assert.equal(access.requiredFor("DELETE", "/admin/subcategories/x", {}), "services.delete");
});

test("picture: set, replace and remove; unknown ids do nothing; the file goes when the sub-category does", () => {
  const { UPLOADS_DIR } = require("../src/uploads");
  const sub = subs.create({ categoryId: "painting", name: "Interior" });
  const touch = (name) => fs.writeFileSync(path.join(UPLOADS_DIR, name), "x");
  touch("pic-one.jpg");
  touch("pic-two.jpg");
  assert.equal(subs.setImage("nope", "/uploads/pic-one.jpg"), null);
  assert.equal(subs.setImage(sub.id, "/uploads/pic-one.jpg").imageUrl, "/uploads/pic-one.jpg");
  assert.equal(subs.list({ categoryId: "painting" })[0].imageUrl, "/uploads/pic-one.jpg");
  subs.setImage(sub.id, "/uploads/pic-two.jpg");
  assert.equal(fs.existsSync(path.join(UPLOADS_DIR, "pic-one.jpg")), false, "replaced picture is deleted");
  assert.equal(subs.setImage(sub.id, null).imageUrl, null);
  assert.equal(fs.existsSync(path.join(UPLOADS_DIR, "pic-two.jpg")), false, "removed picture is deleted");
  touch("pic-three.jpg");
  subs.setImage(sub.id, "/uploads/pic-three.jpg");
  subs.remove(sub.id);
  assert.equal(fs.existsSync(path.join(UPLOADS_DIR, "pic-three.jpg")), false, "deleting the sub-category deletes its picture");
  // only plain /uploads/<name> paths are ever deleted
  const other = subs.create({ categoryId: "painting", name: "Exterior" });
  subs.setImage(other.id, "/uploads/../../etc/passwd");
  subs.setImage(other.id, null);
});
