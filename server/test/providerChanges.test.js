const test = require("node:test");
const assert = require("node:assert/strict");
const access = require("../src/access");

test("profile change requests are seen with providers.view and decided with approve / reject rights", () => {
  assert.equal(access.requiredFor("GET", "/admin/provider-changes"), "providers.view");
  assert.equal(access.requiredFor("POST", "/admin/provider-changes/abc/review", { decision: "approved" }), "providers.approve");
  assert.equal(access.requiredFor("POST", "/admin/provider-changes/abc/review", { decision: "rejected" }), "providers.reject");
});

test("service change requests (now including photos) keep their own approve / reject rights", () => {
  assert.equal(access.requiredFor("GET", "/admin/service-changes"), "services.view");
  assert.equal(access.requiredFor("POST", "/admin/service-changes/abc/review", { decision: "approved" }), "services.approve");
});
