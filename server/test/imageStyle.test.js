const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-imagestyle-"));
process.env.JWT_SECRET = "test-secret";
const style = require("../src/imageStyle");
const { UPLOADS_DIR } = require("../src/uploads");

const CATS = [
  { id: "home-cleaning", name: "Home Cleaning" },
  { id: "pest-control", name: "Pest Control" },
  { id: "salon-spa", name: "Salon & Spa" },
  { id: "garden-care", name: "Garden Care" }, // not in the starting list: gets a spare colour
  { id: "car-wash", name: "Car Wash" },
];
const slugs = CATS.map((c) => c.id);

test("every category gets its own colour; new ones get an unused spare", () => {
  const list = style.list(CATS);
  assert.equal(list.find((c) => c.slug === "pest-control").name, "green");
  const hexes = list.map((c) => c.hex.toLowerCase());
  assert.equal(new Set(hexes).size, hexes.length);
  assert.ok(list.every((c) => /^#[0-9a-f]{6}$/i.test(c.hex) && c.name));
});

test("a type uses a lighter shade of its category's colour", () => {
  const cat = style.colourFor("pest-control", slugs);
  const type = style.colourFor("pest-control", slugs, { shade: true });
  assert.equal(type.name, "light green");
  assert.notEqual(type.hex, cat.hex);
  assert.equal(style.lighter("#000000", 0.5), "#808080");
});

test("Admin can change a colour, but not to one another category uses", () => {
  assert.throws(() => style.setColour("salon-spa", { hex: "#27AE60", name: "green" }, slugs, "t"), /Another category already uses/);
  assert.throws(() => style.setColour("salon-spa", { hex: "pink", name: "pink" }, slugs, "t"), /Choose a colour/);
  assert.throws(() => style.setColour("salon-spa", { hex: "#FF00AA", name: " " }, slugs, "t"), /Give the colour a name/);
  style.setColour("salon-spa", { hex: "#ff00aa", name: "hot pink" }, slugs, "t");
  assert.deepEqual(style.colourFor("salon-spa", slugs), { hex: "#FF00AA", name: "hot pink" });
});

test("logo: the built-in badge until one is uploaded; a missing upload falls back", () => {
  assert.equal(style.logoFile(), style.BUILT_IN_LOGO);
  fs.writeFileSync(path.join(UPLOADS_DIR, "brandlogo1.png"), "x");
  assert.equal(style.setLogo("/uploads/brandlogo1.png", "t").custom, true);
  assert.equal(style.logoFile(), path.join(UPLOADS_DIR, "brandlogo1.png"));
  fs.rmSync(path.join(UPLOADS_DIR, "brandlogo1.png"));
  assert.equal(style.logoFile(), style.BUILT_IN_LOGO);
  assert.equal(style.clearLogo().custom, false);
});

test("the replaced picture is kept (last 3 per item) and can be copied back", () => {
  fs.writeFileSync(path.join(UPLOADS_DIR, "old1.jpg"), "old picture");
  const kept = style.keep({ targetType: "service", targetId: "s1", name: "Ant Control", currentUrl: "/uploads/old1.jpg" }, "t");
  assert.match(kept.url, /^\/uploads\/kept-[0-9a-f]{24}\.jpg$/);
  fs.rmSync(path.join(UPLOADS_DIR, "old1.jpg")); // the replacing upload deletes the original
  const { url } = style.restoreCopy(kept.id);
  assert.equal(fs.readFileSync(path.join(UPLOADS_DIR, url.slice(9)), "utf8"), "old picture");
  assert.ok(fs.existsSync(path.join(UPLOADS_DIR, kept.url.slice(9)))); // still kept for another restore
  assert.equal(style.keep({ targetType: "service", targetId: "s1", currentUrl: null }), null); // nothing to keep
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(path.join(UPLOADS_DIR, `p${i}.jpg`), String(i));
    style.keep({ targetType: "service", targetId: "s1", currentUrl: `/uploads/p${i}.jpg` });
  }
  assert.equal(style.listKept().filter((r) => r.targetId === "s1").length, 3);
});
