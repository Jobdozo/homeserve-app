const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const APP = path.join(__dirname, "..", "..", "local-service-app");
const load = () => import(pathToFileURL(path.join(APP, "src", "utils", "illustrations.js")).href);
const exists = (p) => fs.existsSync(path.join(APP, "public", p.replace(/^\//, "")));

test("salon types get the matching drawing; unknown names get none", async () => {
  const { typeIllustration: t } = await load();
  const cases = {
    Waxing: "waxing", "Bleach & D-Tan": "bleach-detan", Facials: "facial", "Clean Ups": "cleanup", "Manicure & Pedicure": "manicure-pedicure",
    Massage: "massage", "Body Polishing": "body-polishing", Threading: "threading", Haircut: "haircut",
  };
  for (const [name, key] of Object.entries(cases)) assert.equal(t(name, "salon-spa"), `/illustrations/type-${key}.svg`, name);
  assert.equal(t("Something else", "salon-spa"), null);
  assert.equal(t("", "salon-spa"), null);
});

test("AC types are matched only inside the AC category", async () => {
  const { typeIllustration: t } = await load();
  assert.equal(t("Service", "ac-repair"), "/illustrations/type-ac-service.svg");
  assert.equal(t("Repair & gas refill", "ac-repair"), "/illustrations/type-ac-repair-gas.svg");
  assert.equal(t("Installation/uninstallation", "ac-repair"), "/illustrations/type-ac-installation.svg");
  assert.equal(t("Service", "plumbing"), null, "a plain Service tile elsewhere gets no air-conditioner");
});

test("every drawing the code can point to exists on disk", async () => {
  const { typeIllustration: t, categoryIllustration: c } = await load();
  const slugs = ["home-maintenance", "gas-chimney-services", "water-tank-cleaning", "masonry-services", "interior-services", "domestic-help", "ro-water-purifier-services", "laundry-services", "security-services", "gardening-services"];
  for (const s of slugs) assert.ok(exists(c(s)), c(s));
  assert.equal(c("plumbing"), null, "categories that already have photos keep them");
  for (const n of ["Waxing", "Bleach", "Facial", "Clean Up", "Manicure", "Massage", "Polishing", "Threading", "Haircut"]) assert.ok(exists(t(n, "salon-spa")), n);
  for (const n of ["Service", "Repair", "Installation"]) assert.ok(exists(t(n, "ac-repair")), n);
});

test("the drawings are valid, small SVG files", () => {
  const dir = path.join(APP, "public", "illustrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));
  assert.ok(files.length >= 22);
  for (const f of files) {
    const s = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(s.startsWith("<svg") && s.trim().endsWith("</svg>"), f);
    assert.ok(s.length < 6000, `${f} is ${s.length} bytes`);
    assert.equal((s.match(/</g) || []).length, (s.match(/>/g) || []).length, `${f}: balanced angle brackets`);
  }
});
