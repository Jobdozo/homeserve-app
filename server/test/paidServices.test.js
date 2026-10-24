const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-paid-"));
const paid = require("../src/paidServices");

// 24 Oct 2026, 09:00 IST
const NOW = Date.parse("2026-10-24T03:30:00Z");

test("status: days left in India time, the reminder stage due, and auto-renew gets fewer reminders", () => {
  assert.deepEqual(paid.status({ renewsOn: "2026-12-30" }, NOW), { level: "ok", daysLeft: 67, stage: null });
  assert.deepEqual(paid.status({ renewsOn: "2026-11-20" }, NOW), { level: "soon", daysLeft: 27, stage: 30 });
  assert.deepEqual(paid.status({ renewsOn: "2026-10-30" }, NOW), { level: "urgent", daysLeft: 6, stage: 7 });
  assert.deepEqual(paid.status({ renewsOn: "2026-10-24" }, NOW), { level: "urgent", daysLeft: 0, stage: 0 });
  assert.deepEqual(paid.status({ renewsOn: "2026-10-20" }, NOW), { level: "overdue", daysLeft: -4, stage: "overdue" });
  assert.equal(paid.status({ renewsOn: "2026-11-10", autoRenew: true }, NOW).stage, null); // 17 days: no reminder yet
  assert.equal(paid.status({ renewsOn: "2026-10-27", autoRenew: true }, NOW).stage, 7);
  assert.deepEqual(paid.status({ renewsOn: null }, NOW), { level: "no-date", daysLeft: null, stage: null });
  // 23:30 IST on the 23rd is still the 23rd: the 30th is 7 days away.
  assert.equal(paid.status({ renewsOn: "2026-10-30" }, Date.parse("2026-10-23T18:00:00Z")).daysLeft, 7);
});

test("the starting list is added once, with the domain's known date; add, edit, renew and remove", () => {
  const first = paid.list(NOW);
  assert.ok(first.length >= 8);
  assert.equal(first.find((s) => s.check === "domain").renewsOn, "2026-12-30");
  paid.remove(first.find((s) => s.vendor === "Cloudflare").id);
  assert.equal(paid.list(NOW).length, first.length - 1); // not seeded again

  const row = paid.add({ name: "Zoho Mail", billing: "yearly", every: 12, renewsOn: "2026-11-01", cost: "1200", renewUrl: "https://mail.zoho.in" }, "Owner");
  assert.equal(row.cost, 1200);
  assert.throws(() => paid.add({ name: "" }), /name/);
  assert.throws(() => paid.add({ name: "X", renewsOn: "31/12/2026" }), /date/);
  assert.throws(() => paid.add({ name: "X", renewUrl: "javascript:alert(1)" }), /https/);

  assert.equal(paid.edit(row.id, { autoRenew: true }, "Owner").autoRenew, true);
  assert.equal(paid.markRenewed(row.id, "Owner", NOW).renewsOn, "2027-11-01");
  const monthly = paid.add({ name: "Old bill", every: 1, renewsOn: "2026-01-15" });
  assert.equal(paid.markRenewed(monthly.id, "Owner", NOW).renewsOn, "2026-11-24"); // long overdue: a month from today
  const once = paid.add({ name: "One-off", every: 0, renewsOn: "2026-11-01" });
  assert.equal(paid.markRenewed(once.id, "Owner", NOW).renewsOn, null);
});

test("refresh reads the domain expiry from the registry and keeps the error when it fails", async () => {
  const domain = paid.list(NOW).find((s) => s.check === "domain");
  const ssl = paid.list(NOW).find((s) => s.check === "ssl");
  if (ssl) paid.edit(ssl.id, { check: "" }); // no network in tests
  const rdap = async () => ({ ok: true, json: async () => ({ events: [{ eventAction: "expiration", eventDate: "2027-12-30T06:40:52Z" }], entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["fn", {}, "text", "GoDaddy.com, LLC"]]] }] }) });
  await paid.refresh({ fetchImpl: rdap });
  let d = paid.list(NOW).find((s) => s.id === domain.id);
  assert.equal(d.renewsOn, "2027-12-30");
  assert.equal(d.lastCheck.ok, true);
  assert.match(d.lastCheck.detail, /GoDaddy/);

  await paid.refresh({ fetchImpl: async () => ({ ok: false, status: 503 }) });
  d = paid.list(NOW).find((s) => s.id === domain.id);
  assert.equal(d.renewsOn, "2027-12-30"); // the last good date stays
  assert.equal(d.lastCheck.ok, false);
  assert.match(d.lastCheck.error, /503/);
  assert.ok(d.lastCheck.lastOkAt);
});
