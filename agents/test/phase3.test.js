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

const incomplete = { providerId: "p1", name: "Ravi", phone: "+91981", ready: false, missing: ["id_proof", "agreement"], checks: [], docs: [], waitingDays: 2 };
const ready = { providerId: "p2", name: "Sita", category: "cleaning", phone: "+91982", ready: true, missing: [], waitingDays: 1,
  checks: [{ key: "id_proof", label: "ID proof uploaded", ok: true, required: true }], docs: [{ docType: "id_proof", url: "/uploads/a.jpg" }] };
const dupe = { ...incomplete, providerId: "p3", missing: ["duplicate"], checks: [{ key: "duplicate", label: "No duplicate", ok: false, required: true, detail: "Looks like: Ravi (approved)" }] };

test("registration: nudge rules (cooldown, max, only fixable items)", () => {
  const now = Date.now();
  assert.equal(registration.dueForNudge([incomplete], {}, now).length, 1);
  assert.equal(registration.dueForNudge([incomplete], { p1: { count: 1, last: now - 3600000 } }, now).length, 0);
  assert.equal(registration.dueForNudge([incomplete], { p1: { count: 3, last: 0 } }, now).length, 0);
  assert.equal(registration.dueForNudge([dupe], {}, now).length, 0);
  assert.match(registration.nudgeText(incomplete), /ID proof.*agreement/);
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
  assert.match(props[0][2].summary, /open the ID proof/);
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
