const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-calldesk-"));
process.env.JWT_SECRET = "test-secret";
const callDesk = require("../src/callDesk");
const access = require("../src/access");

test("call desk: mobile numbers typed any way, wrong ones refused", () => {
  for (const raw of ["9876543210", "+91 98765 43210", "09876543210", "91-9876543210"]) assert.equal(callDesk.cleanMobile(raw), "9876543210");
  for (const raw of ["", "12345", "1234567890", "98765432101"]) assert.throws(() => callDesk.cleanMobile(raw), /10-digit mobile/);
});

test("call desk: date from today (India time) up to 60 days, and a time slot", () => {
  const now = Date.parse("2026-10-21T20:00:00Z"); // 22 Oct, 01:30 in India
  assert.deepEqual(callDesk.cleanSchedule({ date: "2026-10-22", time: " 10:00 AM – 12:00 PM " }, now), { date: "2026-10-22", time: "10:00 AM – 12:00 PM" });
  assert.throws(() => callDesk.cleanSchedule({ date: "2026-10-21", time: "x" }, now), /already passed/);
  assert.throws(() => callDesk.cleanSchedule({ date: "2027-01-30", time: "x" }, now), /within 60 days/);
  assert.throws(() => callDesk.cleanSchedule({ date: "22/10/2026", time: "x" }, now), /Pick a date/);
  assert.throws(() => callDesk.cleanSchedule({ date: "2026-10-23", time: "  " }, now), /time slot/);
});

test("call desk: address needs a line and a 6-digit PIN", () => {
  assert.deepEqual(callDesk.cleanAddress({ line: "House 12, Gandhi Nagar", pincode: "180 004" }), { label: "Home", line: "House 12, Gandhi Nagar", pincode: "180004" });
  assert.throws(() => callDesk.cleanAddress({ line: "x", pincode: "180004" }), /full address/);
  assert.throws(() => callDesk.cleanAddress({ line: "House 12, Gandhi Nagar", pincode: "1800" }), /PIN code/);
});

test("call desk: looking up needs bookings.view, booking and closing need bookings.edit", () => {
  assert.equal(access.requiredFor("GET", "/admin/call-desk/lookup"), "bookings.view");
  assert.equal(access.requiredFor("POST", "/admin/call-desk/bookings", {}), "bookings.edit");
  assert.equal(access.requiredFor("POST", "/admin/call-desk/bookings/b1/reschedule", {}), "bookings.edit");
  assert.equal(access.requiredFor("POST", "/admin/call-desk/bookings/b1/close", {}), "bookings.edit");
  assert.equal(access.requiredFor("GET", "/admin/call-desk/bookings/b1/providers"), "bookings.edit");
  assert.equal(access.requiredFor("POST", "/admin/call-desk/bookings/b1/provider", {}), "bookings.edit");
});

test("call desk: a regular customer's addresses — last booking first, then saved Home and Office, no repeats", () => {
  const bookings = [
    { createdAt: "2026-10-20T10:00:00Z", address: { label: "Home", line: "12 Gandhi Nagar, near park, 180004" } },
    { createdAt: "2026-10-28T10:00:00Z", address: { label: "Home", line: "45 Trikuta Nagar, lane 3, 180012" } },
    { createdAt: "2026-10-25T10:00:00Z", address: { label: "Home" } },
  ];
  const saved = { label: "Home", line: "12 Gandhi Nagar, near park", pincode: "180004", office: { line: "Office 2, Bahu Plaza", pincode: "180012" } };
  assert.deepEqual(callDesk.knownAddresses(bookings, saved), [
    { source: "last", label: "Home", line: "45 Trikuta Nagar, lane 3", pincode: "180012", lat: null, lng: null },
    { source: "home", label: "Home", line: "12 Gandhi Nagar, near park", pincode: "180004", lat: null, lng: null },
    { source: "office", label: "Office", line: "Office 2, Bahu Plaza", pincode: "180012", lat: null, lng: null },
  ]);
  // The saved Home is the same place as the last booking: listed once.
  assert.equal(callDesk.knownAddresses([bookings[0]], saved).filter((a) => a.line.startsWith("12 Gandhi")).length, 1);
  assert.deepEqual(callDesk.knownAddresses([], null), [], "a new caller has none");
  assert.deepEqual(callDesk.knownAddresses([{ createdAt: "x", address: { line: "no pin here" } }], null), [], "an address without a PIN isn't offered");
});

test("call desk: a known place keeps its map pin, so the provider gets directions; a bad pin is dropped", () => {
  const withPin = [{ createdAt: "2026-10-28T10:00:00Z", address: { label: "Home", line: "Preet Nagar, Jammu, 180020", lat: 32.71, lng: 74.86 } }];
  const [last] = callDesk.knownAddresses(withPin, { line: "Preet Nagar, Jammu", pincode: "180020" });
  assert.deepEqual([last.lat, last.lng], [32.71, 74.86]);
  // The saved Home has the pin and the last booking doesn't: the one entry gets it.
  const [merged] = callDesk.knownAddresses([{ createdAt: "x", address: { line: "Preet Nagar, Jammu, 180020" } }], { line: "Preet Nagar, Jammu", pincode: "180020", lat: 32.7, lng: 74.8 });
  assert.equal(merged.lat, 32.7);
  assert.deepEqual(callDesk.cleanAddress({ line: "Preet Nagar, Jammu", pincode: "180020", lat: 32.71, lng: 74.86 }), { label: "Home", line: "Preet Nagar, Jammu", pincode: "180020", lat: 32.71, lng: 74.86 });
  assert.equal(callDesk.cleanAddress({ line: "Preet Nagar, Jammu", pincode: "180020", lat: 0, lng: 0 }).lat, undefined, "outside India: no pin");
  assert.equal(callDesk.cleanAddress({ line: "Preet Nagar, Jammu", pincode: "180020" }).lat, undefined);
});
