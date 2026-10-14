const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-phone-"));
process.env.JWT_SECRET = "test-secret";
const store = require("../src/store");

test("the same mobile number matches however it was typed", () => {
  const key = store.phoneKey("+91 9797327707");
  for (const typed of ["9797327707", "+919797327707", "919797327707", "09797327707", "+91-97973-27707"]) {
    assert.equal(store.phoneKey(typed), key, typed);
  }
  assert.notEqual(store.phoneKey("9797327708"), key);
  assert.equal(store.phoneKey(""), "");
});

test("a number typed without the country code is stored with +91", () => {
  assert.equal(store.canonicalPhone("9797327707"), "+919797327707");
  assert.equal(store.canonicalPhone("97973 27707"), "+919797327707");
  assert.equal(store.canonicalPhone("919797327707"), "+919797327707");
  assert.equal(store.canonicalPhone("+91 9797327707"), "+919797327707");
  assert.equal(store.canonicalPhone("+44 20 7946 0958"), "+44 20 7946 0958");
});
