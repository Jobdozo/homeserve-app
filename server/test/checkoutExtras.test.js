// Run: npm test  (throwaway DATA_DIR)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-checkout-"));
const serviceOptions = require("../src/serviceOptions");
const orderExtras = require("../src/orderExtras");
const workingHours = require("../src/workingHours");

const AC = { id: "svc-ac", name: "AC Service", price: 450 };

test("options: cleaned on save, priced on booking, required and max enforced", () => {
  const groups = serviceOptions.setOptions(
    [AC.id, "svc-ac-2"],
    [
      { name: " AC type ", required: true, max: 1, choices: [{ name: "Split", price: 50 }, { name: "Window", price: 0 }] },
      { name: "Make it better", max: 3, choices: [{ name: "Jet wash", price: 299 }, { name: "Outdoor unit", price: 149 }] },
    ]
  );
  assert.equal(groups[0].name, "AC type");
  assert.equal(serviceOptions.getOptions("svc-ac-2").length, 2); // copied to the same-name service
  const [type, extras] = groups;
  const split = type.choices[0].id;
  const jet = extras.choices[0].id;
  const out = serviceOptions.priceSelection(AC, { [type.id]: [split], [extras.id]: [jet] });
  assert.equal(out.extra, 349);
  assert.deepEqual(out.lines.map((l) => l.choice), ["Split", "Jet wash"]);
  assert.throws(() => serviceOptions.priceSelection(AC, {}), (e) => e.status === 400 && /ac type/i.test(e.message));
  assert.throws(() => serviceOptions.priceSelection(AC, { [type.id]: [split, type.choices[1].id] }), /at most 1/);
  // unknown choice ids are ignored, not priced
  assert.equal(serviceOptions.priceSelection(AC, { [type.id]: [split], [extras.id]: ["nope"] }).extra, 50);
  // a service without options costs nothing extra
  assert.deepEqual(serviceOptions.priceSelection({ id: "plain", name: "Plain", price: 100 }, { x: ["y"] }), { extra: 0, lines: [] });
});

test("options: bad input is refused with a reason", () => {
  assert.throws(() => serviceOptions.normalizeGroups([{ name: "", choices: [{ name: "A" }] }]), /needs a name/);
  assert.throws(() => serviceOptions.normalizeGroups([{ name: "G", choices: [] }]), /at least one choice/);
  assert.throws(() => serviceOptions.normalizeGroups([{ name: "G", choices: [{ name: "A" }, { name: "a" }] }]), /twice/);
  assert.throws(() => serviceOptions.normalizeGroups([{ name: "G", choices: [{ name: "A", price: -5 }] }]), /between/);
  const [g] = serviceOptions.normalizeGroups([{ name: "G", max: 9, choices: [{ name: "A" }, { name: "B" }] }]);
  assert.equal(g.max, 2); // never more than the number of choices
  serviceOptions.setOptions(["svc-clear"], [{ name: "G", choices: [{ name: "A" }] }]);
  serviceOptions.setOptions(["svc-clear"], []);
  assert.equal(serviceOptions.getOptions("svc-clear").length, 0);
});

test("booking option lines are kept per booking", () => {
  serviceOptions.saveBookingLines("b1", [{ group: "AC type", choice: "Split", price: 50 }]);
  assert.equal(serviceOptions.bookingLines("b1")[0].choice, "Split");
  assert.equal(serviceOptions.bookingLines("b2"), null);
});

test("booking for someone else: name and a real mobile number", () => {
  assert.equal(orderExtras.cleanContact(null), null);
  assert.equal(orderExtras.cleanContact({ name: "", phone: "" }), null);
  assert.deepEqual(orderExtras.cleanContact({ name: " Ravi  Kumar ", phone: "98111 12222" }), { name: "Ravi Kumar", phone: "+919811112222" });
  assert.deepEqual(orderExtras.cleanContact({ name: "Ravi", phone: "+91 98111 12222" }), { name: "Ravi", phone: "+919811112222" });
  assert.throws(() => orderExtras.cleanContact({ name: "Ravi", phone: "12345" }), /10-digit/);
  assert.throws(() => orderExtras.cleanContact({ phone: "9811112222" }), /name/);
  orderExtras.saveContact("ORD-1", { name: "Ravi", phone: "+919811112222" });
  assert.equal(orderExtras.contactFor("ORD-1").name, "Ravi");
  assert.equal(orderExtras.cleanNote("  ring   the bell  "), "ring the bell");
});

test("availability label follows working hours in IST", () => {
  const days = {};
  for (const d of workingHours.DAYS) days[d] = { open: d !== "sun", from: "09:00", to: "18:00" };
  const sched = { enabled: true, days };
  // Monday 2026-10-12 10:00 IST = 04:30 UTC
  assert.equal(workingHours.availabilityLabel(sched, true, new Date("2026-10-12T04:30:00Z")), "Taking requests till 6 PM");
  // Monday 07:00 IST
  assert.equal(workingHours.availabilityLabel(sched, true, new Date("2026-10-12T01:30:00Z")), "Opens today 9 AM");
  // Saturday 19:00 IST -> Sunday closed -> Monday
  assert.equal(workingHours.availabilityLabel(sched, true, new Date("2026-10-17T13:30:00Z")), "Opens Mon 9 AM");
  // Monday 19:00 IST -> tomorrow
  assert.equal(workingHours.availabilityLabel(sched, true, new Date("2026-10-12T13:30:00Z")), "Opens tomorrow 9 AM");
  assert.equal(workingHours.availabilityLabel(sched, false), null);
  assert.equal(workingHours.availabilityLabel(null, true), "Taking requests now");
});
