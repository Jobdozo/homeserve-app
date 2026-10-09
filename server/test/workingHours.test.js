const test = require("node:test");
const assert = require("node:assert/strict");
const { defaultSchedule, normalizeSchedule, isWithinSchedule } = require("../src/workingHours");

// 2026-10-05 is a Monday. 04:00 UTC = 09:30 IST.
const at = (iso) => new Date(iso);

test("no schedule or a disabled one never blocks requests", () => {
  assert.equal(isWithinSchedule(null), true);
  assert.equal(isWithinSchedule(defaultSchedule(), at("2026-10-05T20:00:00Z")), true);
});

test("inside and outside the hours, in Indian time", () => {
  const s = { ...defaultSchedule(), enabled: true };
  assert.equal(isWithinSchedule(s, at("2026-10-05T04:00:00Z")), true); // Mon 09:30 IST
  assert.equal(isWithinSchedule(s, at("2026-10-05T03:20:00Z")), false); // Mon 08:50 IST
  assert.equal(isWithinSchedule(s, at("2026-10-05T12:30:00Z")), false); // Mon 18:00 IST, closing time is exclusive
  assert.equal(isWithinSchedule(s, at("2026-10-05T12:29:00Z")), true); // Mon 17:59 IST
});

test("a closed day is closed all day, and the day follows IST not UTC", () => {
  const s = { ...defaultSchedule(), enabled: true }; // Sunday closed by default
  assert.equal(isWithinSchedule(s, at("2026-10-11T06:00:00Z")), false); // Sun 11:30 IST
  // Sat 22:00 UTC is already Sun 03:30 IST — closed because it is Sunday there
  assert.equal(isWithinSchedule(s, at("2026-10-10T22:00:00Z")), false);
  // Sun 20:00 UTC is Mon 01:30 IST — Monday, but before opening
  assert.equal(isWithinSchedule(s, at("2026-10-11T20:00:00Z")), false);
});

test("normalizeSchedule accepts a good schedule and rejects bad ones", () => {
  const good = { ...defaultSchedule(), enabled: true };
  assert.deepEqual(normalizeSchedule(good), good);
  assert.equal(normalizeSchedule(null), null);
  assert.throws(() => normalizeSchedule({ enabled: true, days: {} }), /seven days/);
  const bad = JSON.parse(JSON.stringify(good));
  bad.days.mon.to = "08:00";
  assert.throws(() => normalizeSchedule(bad), /after opening/);
  bad.days.mon.to = "25:00";
  assert.throws(() => normalizeSchedule(bad), /09:00/);
  // a closed day's leftover times don't matter
  const closed = JSON.parse(JSON.stringify(good));
  closed.days.tue = { open: false, from: "", to: "" };
  assert.equal(normalizeSchedule(closed).days.tue.open, false);
});
