const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-state3-"));
process.env.REGISTRATION_DIGEST_HOUR_IST = "0";
process.env.PAYMENTS_REPORT_HOUR_IST = "0";
const registration = require("../src/registration");
const verification = require("../src/verification");
const payments = require("../src/payments");
const silent = { info() {}, warn() {}, error() {} };

function fake(routes) {
  const calls = [];
  const c = {
    calls,
    async request(m, p, b) {
      calls.push([m, p, b]);
      const h = routes[`${m} ${p.split("?")[0]}`];
      return typeof h === "function" ? h(b) : h ?? {};
    },
    get(p) { return this.request("GET", p); },
    post(p, b) { return this.request("POST", p, b); },
    feed(x) { return this.post("/agents/feed", x); },
    propose(x) { return this.post("/agents/actions", x); },
  };
  return c;
}
const writes = (c, p) => c.calls.filter(([m, path]) => m !== "GET" && (!p || path === p));

const incomplete = { providerId: "p1", name: "Ravi", phone: "+91981", ready: false, missing: ["business_id", "agreement"], checks: [], docs: [], waitingDays: 2 };
const ready = { providerId: "p2", name: "Sita", category: "cleaning", phone: "+91982", ready: true, missing: [], waitingDays: 1,
  checks: [{ key: "id_proof", label: "ID proof uploaded", ok: true, required: true }], docs: [{ docType: "id_proof", url: "/uploads/a.jpg" }] };
const dupe = { ...incomplete, providerId: "p3", missing: ["duplicate"], checks: [{ key: "duplicate", label: "No duplicate", ok: false, required: true, detail: "Looks like: Ravi (approved)" }] };

test("registration: nudge rules (cooldown, max, only fixable items)", () => {
  const now = Date.now();
  assert.equal(registration.dueForNudge([incomplete], {}, now).length, 1);
  assert.equal(registration.dueForNudge([incomplete], { p1: { count: 1, last: now - 3600000 } }, now).length, 0);
  assert.equal(registration.dueForNudge([incomplete], { p1: { count: 3, last: 0 } }, now).length, 0);
  assert.equal(registration.dueForNudge([dupe], {}, now).length, 0);
  assert.match(registration.nudgeText(incomplete), /Udyam registration number or GST number \(any one\).*agreement/);
  const rows = [
    { role: "provider", phone: "+911", hasAccount: false, lastAt: new Date().toISOString() },
    { role: "admin", phone: "+912", hasAccount: false, lastAt: new Date().toISOString() },
    { role: "customer", phone: "+913", hasAccount: false, status: "contacted", lastAt: new Date().toISOString() },
    { role: "customer", phone: "+914", hasAccount: false, lastAt: "2020-01-01" },
  ];
  assert.deepEqual(registration.unfinishedSignups(rows, Date.now()).map((r) => r.phone), ["+911"]);
});

test("registration tick: nudges only with permission; posts the daily call list once", async () => {
  const routes = {
    "GET /admin/verification/precheck": [incomplete, ready],
    "GET /agents/self": { agent: { permissions: ["providers.view"] } },
    "GET /admin/customers/login-attempts": [{ role: "customer", phone: "+919999", hasAccount: false, lastAt: new Date().toISOString(), requests: 2 }],
  };
  let c = fake(routes);
  await registration.tick(c, silent);
  assert.equal(writes(c, "/admin/notifications/broadcast").length, 0);
  const digest = writes(c, "/agents/feed")[0][2];
  assert.match(digest.body, /\+919999/);
  assert.match(digest.body, /Notifications → Add/);

  routes["GET /agents/self"] = { agent: { permissions: ["notifications.add"] } };
  c = fake(routes);
  await registration.tick(c, silent);
  const n = writes(c, "/admin/notifications/broadcast");
  assert.equal(n.length, 1);
  assert.equal(n[0][2].audience, "single");
  assert.equal(writes(c, "/agents/feed").length, 0); // digest already sent today
  c = fake(routes);
  await registration.tick(c, silent);
  assert.equal(writes(c, "/admin/notifications/broadcast").length, 0); // cooldown
});

test("verification: proposes approval only for complete applications, never rejection", async () => {
  const c = fake({ "GET /admin/verification/precheck": [incomplete, ready, dupe], "POST /agents/actions": { duplicate: false }, "POST /agents/feed": { duplicate: false } });
  await verification.tick(c, silent);
  const props = writes(c, "/agents/actions");
  assert.equal(props.length, 1);
  assert.deepEqual(props[0][2].request, { method: "PATCH", path: "/providers/p2/verification", body: { status: "approved" } });
  assert.match(props[0][2].summary, /check the Udyam or GST number/);
  assert.ok(writes(c, "/agents/feed").some(([, , b]) => /duplicate/.test(b.title)));
  await verification.tick(c, silent);
  assert.equal(writes(c, "/agents/actions").length, 1); // not re-proposed
});

test("payments: one alert per issue, daily summary, never touches money", async () => {
  const seen = new Set();
  const c = fake({
    "GET /admin/payments/reconciliation": {
      totals: { wallets: 2, totalBalanceInr: 430, totalRechargedInr: 1000, totalCommissionInr: 120, completedJobs: 5, negativeWallets: 1 },
      issueCount: 2,
      issues: [
        { key: "wallet-mismatch:p1:999", type: "wallet_mismatch", severity: "critical", providerId: "p1", providerName: "Ravi", detail: "Balance is ₹999 but …", amountInr: 549 },
        { key: "negative:p2:-20", type: "negative_balance", severity: "warning", providerId: "p2", providerName: "Sita", detail: "Wallet is negative", amountInr: -20 },
      ],
    },
    "POST /agents/feed": (b) => { const d = seen.has(b.dedupeKey); seen.add(b.dedupeKey); return { duplicate: d }; },
  });
  assert.match(await payments.tick(c), /2 new alerts.*summary/);
  assert.equal(await payments.tick(c), null); // same issues, summary already sent today
  assert.ok(!c.calls.some(([m, p]) => m !== "GET" && /wallet|recharge/.test(p)));
});

test("verification WhatsApp: who and when (after a day, every 3 days, max 3, 10:00–19:00 IST, fixable items only)", () => {
  const at = (h) => Date.parse(`2026-10-20T${String(h).padStart(2, "0")}:00:00+05:30`);
  const fresh = { ...incomplete, providerId: "p4", waitingDays: 0 };
  const noPhone = { ...incomplete, providerId: "p5", phone: "" };
  assert.deepEqual(verification.dueForWhatsApp([incomplete, ready, dupe, fresh, noPhone], {}, at(11)).map((p) => p.providerId), ["p1"]);
  assert.equal(verification.dueForWhatsApp([incomplete], {}, at(8)).length, 0); // too early
  assert.equal(verification.dueForWhatsApp([incomplete], {}, at(19)).length, 0); // too late
  assert.equal(verification.dueForWhatsApp([incomplete], { p1: { count: 1, last: at(11) - 24 * 3600000 } }, at(11)).length, 0); // 3-day gap
  assert.equal(verification.dueForWhatsApp([incomplete], { p1: { count: 1, last: at(11) - 73 * 3600000 } }, at(11)).length, 1);
  assert.equal(verification.dueForWhatsApp([incomplete], { p1: { count: 3, last: 0 } }, at(11)).length, 0); // max 3
  const text = verification.whatsAppText(incomplete, 0, "");
  assert.equal(
    text,
    "Your Tikdum Business ID is almost ready ✅ Complete the registration and start getting job requests. Registration is free! Tikdum Business app → Profile."
  );
  assert.equal(
    verification.whatsAppText(incomplete, 1, ""),
    "Reminder: your Tikdum Business ID is still pending. Complete the registration and start getting job requests. Registration is free! Tikdum Business app → Profile."
  );
  assert.match(verification.whatsAppText(incomplete, 1, "10 November"), /Free registration till 10 November!/);
});

test("verification WhatsApp tick: sends with 'WhatsApp inbox → Add', otherwise says so once", async () => {
  const at11 = Date.parse("2026-10-21T11:00:00+05:30");
  const routes = {
    "GET /admin/verification/precheck": [{ ...incomplete, providerId: "w1" }],
    "GET /agents/self": { agent: { permissions: ["providers.view"] } },
    "POST /agents/feed": { duplicate: false },
  };
  let c = fake(routes);
  await verification.tick(c, silent, { now: at11 });
  assert.equal(writes(c, "/admin/inbox/send").length, 0);
  assert.match(writes(c, "/agents/feed").find(([, , b]) => b.dedupeKey === "verification-wa-permission")[2].body, /WhatsApp inbox → Add/);
  c = fake(routes);
  await verification.tick(c, silent, { now: at11 });
  assert.equal(writes(c, "/agents/feed").filter(([, , b]) => b.dedupeKey === "verification-wa-permission").length, 0); // said once

  routes["GET /agents/self"] = { agent: { permissions: ["inbox.add"] } };
  c = fake(routes);
  await verification.tick(c, silent, { now: at11 });
  const sent = writes(c, "/admin/inbox/send");
  assert.equal(sent.length, 1);
  assert.equal(sent[0][2].providerId, "w1");
  assert.match(sent[0][2].message, /Complete the registration and start getting job requests/);
  c = fake(routes);
  await verification.tick(c, silent, { now: at11 + 3600000 });
  assert.equal(writes(c, "/admin/inbox/send").length, 0); // not again within 3 days
  c = fake(routes);
  await verification.tick(c, silent, { now: at11 + 73 * 3600000 });
  assert.match(writes(c, "/admin/inbox/send")[0][2].message, /^Reminder:/);
});
