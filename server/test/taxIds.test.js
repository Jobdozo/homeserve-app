// Run: npm test
const { test } = require("node:test");
const assert = require("node:assert");
const t = require("../src/taxIds");

test("GST numbers: real ones pass, typos and wrong shapes don't", () => {
  for (const g of ["27AAACR5055K1Z7", "29AAGCB7383J1Z4", "27aadcb2230m1zt", "27 AADCB 2230M 1ZT"]) assert.equal(t.checkGstin(g).ok, true, g);
  const r = t.checkGstin("27AAACR5055K1Z7");
  assert.equal(r.stateName, "Maharashtra");
  assert.equal(r.pan, "AAACR5055K");
  assert.match(t.checkGstin("27AAACR5055K1Z8").error, /typo/); // one character off
  assert.match(t.checkGstin("27AAACR5055K1Z").error, /15 characters/);
  assert.match(t.checkGstin("55AAACR5055K1Z7").error, /state code/);
  assert.match(t.checkGstin("27AAACR5055K1Z7!").error, /15 characters/);
  assert.equal(t.checkGstin("").ok, true); // optional
});

test("Udyam numbers are tidied into UDYAM-XX-00-0000000", () => {
  assert.equal(t.checkUdyam("udyam pb 03 0012345").value, "UDYAM-PB-03-0012345");
  assert.equal(t.checkUdyam("UDYAM-JK-01-0000001").ok, true);
  assert.equal(t.checkUdyam("UDYAM-PB-3-12345").ok, false);
  assert.equal(t.checkUdyam("UAM123").ok, false);
});

test("cleanTaxIds tidies a profile patch or throws a 400", () => {
  const p = t.cleanTaxIds({ name: "A", gstNumber: "27aaacr5055k1z7", udyamNumber: "udyam-pb-03-0012345" });
  assert.equal(p.gstNumber, "27AAACR5055K1Z7");
  assert.equal(p.udyamNumber, "UDYAM-PB-03-0012345");
  assert.throws(() => t.cleanTaxIds({ gstNumber: "27AAACR5055K1Z8" }), (e) => e.status === 400);
  assert.deepEqual(t.cleanTaxIds({ gstNumber: "" }), { gstNumber: "" }); // clearing is allowed
  assert.equal(t.taxIdStatus({ gstNumber: "27AAACR5055K1Z8" }).gst.valid, false); // saved before these checks
});
