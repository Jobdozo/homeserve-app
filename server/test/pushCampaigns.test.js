const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-push-"));
const pc = require("../src/pushCampaigns");
const access = require("../src/access");
const agents = require("../src/agents");

// 18 Oct 2026, 08:00 IST
const NOW = Date.parse("2026-10-18T08:00:00+05:30");
const msgs = [
  { title: "🏡 A clean home", message: "Book home cleaning on Tikdum." },
  { title: "⚡ Electrician", message: "Switches, wiring, fans: book an electrician." },
  { title: "🐜 Pest control", message: "Cockroaches or termites? Book pest control." },
];
const base = { name: "Jammu rotation", messages: msgs, times: ["09:00", "12:00", "15:00", "18:00"], days: 2, startDate: "2026-10-18" };

test("plan: every 3 hours for 2 days, rotating through the messages", () => {
  const p = pc.plan(base, { now: NOW });
  assert.equal(p.sends.length, 8);
  assert.equal(p.sends[0].at, "2026-10-18T03:30:00.000Z"); // 09:00 IST
  assert.deepEqual(p.sends.slice(0, 4).map((s) => s.title), ["🏡 A clean home", "⚡ Electrician", "🐜 Pest control", "🏡 A clean home"]);
  assert.ok(p.sends.every((s) => s.status === "scheduled"));
});

test("plan: times already past today are skipped", () => {
  const p = pc.plan(base, { now: Date.parse("2026-10-18T13:00:00+05:30") });
  assert.equal(p.sends.length, 6); // 15:00, 18:00 today + 4 tomorrow
  assert.equal(p.sends[0].title, "🏡 A clean home");
});

test("plan: refuses spammy or odd schedules", () => {
  assert.throws(() => pc.plan({ ...base, times: ["08:00"] }, { now: NOW }), /outside sending hours/);
  assert.throws(() => pc.plan({ ...base, times: ["21:00"] }, { now: NOW }), /outside sending hours/);
  assert.throws(() => pc.plan({ ...base, times: ["09:00", "10:00"] }, { now: NOW }), /less than 2 hours/);
  assert.throws(() => pc.plan({ ...base, times: ["09:00", "11:00", "13:00", "15:00", "17:00"] }, { now: NOW }), /1–4 send times/);
  assert.throws(() => pc.plan({ ...base, days: 31 }, { now: NOW }), /1–30 days/);
  assert.throws(() => pc.plan({ ...base, startDate: "2026-10-01" }, { now: NOW }), /Start date/);
  assert.throws(() => pc.plan({ ...base, messages: [{ title: "Hi", message: "" }] }, { now: NOW }), /Message 1/);
  assert.throws(() => pc.plan({ ...base, name: " " }, { now: NOW }), /name/);
  assert.throws(() => pc.plan({ ...base, audience: "providers" }, { now: NOW }), /all customers/);
});

test("plan: limits count across running campaigns", () => {
  const others = [{ at: "2026-10-18T05:30:00.000Z", campaignName: "Diwali" }]; // 11:00 IST
  assert.throws(() => pc.plan({ ...base, times: ["12:00"] }, { now: NOW, others }), /Clashes with campaign "Diwali"/);
  const busy = ["09:00", "11:00", "13:00", "15:00"].map((t) => ({ at: new Date(Date.parse(`2026-10-18T${t}:00+05:30`)).toISOString(), campaignName: "Diwali" }));
  assert.throws(() => pc.plan({ ...base, times: ["18:00"], days: 1 }, { now: NOW, others: busy }), /More than 4 notifications on 2026-10-18/);
  assert.equal(pc.plan({ ...base, times: ["18:00"], days: 1 }, { now: NOW, others }).sends.length, 1);
});

test("due + tick: sends on time, skips sends missed by more than 30 minutes, never twice", async () => {
  const c = pc.create({ ...base, days: 1 }, "Owner", NOW);
  assert.equal(c.status, "active");
  const sent = [];
  const sendToAll = async (title) => {
    sent.push(title);
    return 66;
  };
  // 09:01 IST: the 09:00 one goes out.
  let done = await pc.tick(sendToAll, { now: Date.parse("2026-10-18T09:01:00+05:30") });
  assert.deepEqual(done.map((d) => [d.title, d.reached]), [["🏡 A clean home", 66]]);
  done = await pc.tick(sendToAll, { now: Date.parse("2026-10-18T09:02:00+05:30") });
  assert.equal(done.length, 0);
  // Server down from 11:50 to 13:00: the 12:00 send is skipped, not sent late.
  done = await pc.tick(sendToAll, { now: Date.parse("2026-10-18T13:00:00+05:30") });
  assert.deepEqual(done, [{ campaign: "Jammu rotation", title: "⚡ Electrician", skipped: true }]);
  await pc.tick(sendToAll, { now: Date.parse("2026-10-18T15:00:30+05:30") });
  await pc.tick(sendToAll, { now: Date.parse("2026-10-18T18:00:30+05:30") });
  assert.deepEqual(sent, ["🏡 A clean home", "🐜 Pest control", "🏡 A clean home"]);
  const row = pc.list().find((x) => x.id === c.id);
  assert.equal(row.status, "finished");
  assert.deepEqual(row.sends.map((s) => s.status), ["sent", "skipped", "sent", "sent"]);
});

test("cancel stops the remaining sends", async () => {
  const c = pc.create({ ...base, name: "Stop me", times: ["10:00"], days: 3, startDate: "2026-10-25" }, "Owner", NOW);
  const after = pc.cancel(c.id, "Owner");
  assert.equal(after.status, "cancelled");
  assert.ok(after.sends.every((s) => s.status === "cancelled"));
  assert.equal(pc.due([after], Date.parse("2026-10-27T10:05:00+05:30")).length, 0);
});

test("access: viewing needs notifications.view, creating notifications.add; agents may only propose", () => {
  assert.equal(access.requiredFor("GET", "/admin/push-campaigns"), "notifications.view");
  assert.equal(access.requiredFor("POST", "/admin/push-campaigns"), "notifications.add");
  assert.equal(access.requiredFor("POST", "/admin/push-campaigns/pc_1/cancel"), "notifications.add");
  assert.ok(agents.PROPOSABLE_TYPES.includes("push.campaign"));
  const blocked = agents.policy({ method: "POST", body: {} }, { agentId: "a1" }, "/admin/push-campaigns");
  assert.equal(blocked.status, 403);
});
