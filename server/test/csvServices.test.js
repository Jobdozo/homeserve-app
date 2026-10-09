const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-csvservices-"));
process.env.JWT_SECRET = "test-secret";
const store = require("../src/store");
const subs = require("../src/subcategories");
const csvImport = require("../src/csvImport");

// Replace the database calls; everything else (parsing, validation, sub-categories) is real.
const created = [];
const updated = [];
store.listProviders = async () => [{ id: "prov1", name: "Glamornate", phone: "+919876500001" }];
store.listCategories = async () => [{ id: "salon-spa", name: "Salon & Spa" }, { id: "ac-repair", name: "AC Repair" }];
store.adminCreateService = async (providerId, data) => {
  const svc = { id: `svc${created.length + 1}`, providerId, ...data };
  created.push(svc);
  return svc;
};
store.adminUpdateService = async (id, patch) => {
  updated.push({ id, patch });
  return { id, ...patch };
};

const HEADER = "provider_phone,category,name,price,original_price,sub_category,tagline,includes\n";

test("a salon price list imports in one go: types are created once, extras are saved", async () => {
  const csv =
    HEADER +
    '9876500001,Salon & Spa,Classic Haircut,299,399,Hair,Cut and style at home,Consultation|Haircut|Blow dry\n' +
    '9876500001,Salon & Spa,Hair Spa,799,,hair,,\n' + // same type, different case: reused
    '9876500001,Salon & Spa,Full Arms Waxing,349,,Waxing,Smooth wax finish,"Disposable strips|Skin-safe wax"\n' +
    "9876500001,AC Repair,AC Gas Refilling,599,699,,,\n";
  const dry = await csvImport.run("services", csv, true);
  assert.equal(dry.imported ?? 0, 0);
  assert.equal(created.length, 0, "a dry run creates nothing");
  assert.equal(subs.list({ includeInactive: true }).length, 0, "a dry run creates no types");

  const res = await csvImport.run("services", csv, false);
  assert.equal(res.imported, 4);
  assert.deepEqual(res.errors || [], []);
  assert.equal(created.length, 4);
  const salonTypes = subs.list({ categoryId: "salon-spa" }).map((s) => s.name);
  assert.deepEqual(salonTypes.sort(), ["Hair", "Waxing"], "Hair is reused, not duplicated");
  const hair = subs.list({ categoryId: "salon-spa" }).find((s) => s.name === "Hair");
  assert.equal(created[0].subcategoryId, hair.id);
  assert.equal(created[1].subcategoryId, hair.id);
  assert.equal(created[3].subcategoryId, null, "no sub_category: left without a type");
  assert.equal(created[0].price, 299);
  assert.equal(created[0].originalPrice, 399);
  assert.deepEqual(updated[0].patch, { tagline: "Cut and style at home", includes: ["Consultation", "Haircut", "Blow dry"] });
  assert.deepEqual(updated.find((u) => u.id === "svc3").patch.includes, ["Disposable strips", "Skin-safe wax"]);
  assert.equal(updated.some((u) => u.id === "svc4"), false, "no extras: no second update");
});

test("old-style files without the new columns still import", async () => {
  const before = created.length;
  const res = await csvImport.run("services", "provider_phone,category,name,price\n9876500001,AC Repair,AC Installation,799\n", false);
  assert.equal(res.imported, 1);
  assert.equal(created.length, before + 1);
});

test("bad rows are reported by line and nothing from them is created", async () => {
  const before = created.length;
  const csv =
    HEADER +
    "9876500001,Salon & Spa,Good One,100,,Hair,,\n" +
    "9876500001,Salon & Spa,Bad Price,abc,,Hair,,\n" +
    "9876500001,Nope Category,Whatever,100,,,,\n" +
    "9111111111,Salon & Spa,Unknown Provider,100,,,,\n" +
    "9876500001,Salon & Spa,Too Many Items,100,,,," + `"${Array.from({ length: 13 }, (_, i) => "item" + i).join("|")}"` + "\n";
  const res = await csvImport.run("services", csv, false);
  assert.equal(res.imported, 1);
  assert.equal(created.length, before + 1);
  const lines = res.errors.map((e) => e.row).sort();
  assert.deepEqual(lines, [3, 4, 5, 6]);
  assert.match(res.errors.find((e) => e.row === 6).message, /more than 12/);
});
