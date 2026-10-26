const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-assign-service-"));
process.env.JWT_SECRET = "test-secret";
const store = require("../src/store");
const subs = require("../src/subcategories");
const agents = require("../src/agents");

test("the same kind of service: same name, or the same sub-category whatever it's called", () => {
  const sofa = subs.create({ categoryId: "home-cleaning", name: "Sofa cleaning" });
  const bath = subs.create({ categoryId: "home-cleaning", name: "Bathroom cleaning" });
  subs.link("svc-booked", sofa.id, "home-cleaning");
  subs.link("svc-sofa-shampoo", sofa.id, "home-cleaning");
  subs.link("svc-bathroom", bath.id, "home-cleaning");
  const same = store._sameServiceKind;
  assert.equal(same("x", "  sofa cleaning (1 seat) ", "svc-booked", "Sofa Cleaning (1 Seat)"), true); // same name
  assert.equal(same("svc-sofa-shampoo", "Sofa Shampoo Cleaning", "svc-booked", "Sofa Cleaning (1 Seat)"), true); // same sub-category
  assert.equal(same("svc-bathroom", "Bathroom Cleaning", "svc-booked", "Sofa Cleaning (1 Seat)"), false);
  assert.equal(same("svc-none", "Kitchen Cleaning", "svc-booked", "Sofa Cleaning (1 Seat)"), false); // no sub-category
  assert.equal(same("svc-a", "Kitchen Cleaning", "svc-unlinked", "Sofa Cleaning (1 Seat)"), false); // booked one has none either
});

test("assigning a provider without the booked service: refused unless a person confirms; then the change is described", () => {
  const booking = { id: "b1", service: { name: "Sofa Cleaning (1 Seat) × 5" } };
  assert.equal(store._otherServiceCheck(booking, { sameService: true, name: "Ravi", serviceName: "Sofa Shampoo" }, false), null);
  assert.throws(
    () => store._otherServiceCheck(booking, { sameService: false, name: "Ravi", serviceName: "Bathroom Cleaning" }, false),
    (e) => e.status === 409 && e.code === "other_service" && /Ravi doesn't offer Sofa Cleaning \(1 Seat\) × 5.*Bathroom Cleaning/.test(e.message)
  );
  assert.deepEqual(store._otherServiceCheck(booking, { sameService: false, name: "Ravi", serviceName: "Bathroom Cleaning" }, true), { from: "Sofa Cleaning (1 Seat) × 5", to: "Bathroom Cleaning" });
});

test("an agent can't propose changing a booking's service", () => {
  const admin = { agentId: "d1", name: "Dispatch Agent", rolePermissions: ["bookings.view", "bookings.edit", "bookings.assign", "bookings.add"] };
  const req = (body) => ({ title: "Assign", request: { method: "POST", path: "/admin/bookings/b1/assign", body } });
  assert.throws(() => agents.propose(admin, req({ providerId: "p1", allowOtherService: true })), /can't change a booking's service/);
});

test("Change service (Call bookings): a person with bookings.edit only, never an agent", () => {
  const access = require("../src/access");
  assert.equal(access.requiredFor("POST", "/admin/call-desk/bookings/b1/service"), "bookings.edit");
  assert.equal(access.requiredFor("GET", "/admin/call-desk/bookings/b1/services"), "bookings.edit");
  const agent = { agentId: "d1" };
  assert.match(agents.policy({ method: "POST", body: { serviceId: "s1", reason: "x" } }, agent, "/admin/call-desk/bookings/b1/service").error, /can't change a booking's service/);
  assert.match(agents.policy({ method: "POST", body: { providerId: "p1", allowOtherService: true } }, agent, "/admin/bookings/b1/assign").error, /can't change a booking's service/);
  assert.match(agents.policy({ method: "POST", body: { providerId: "p1", allowOtherService: true } }, agent, "/admin/call-desk/bookings/b1/provider").error, /can't change a booking's service/);
  assert.equal(agents.policy({ method: "POST", body: { providerId: "p1" } }, agent, "/admin/bookings/b1/assign"), null); // a same-service assignment is fine
});
