const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-watch-"));
const quality = require("../src/quality");
const retention = require("../src/retention");
const fraud = require("../src/fraud");
const silent = { info() {}, warn() {}, error() {} };

function fake(routes) {
  const calls = [];
  return {
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
}
const writes = (c, p) => c.calls.filter(([m, path]) => m !== "GET" && path === p);
const MONDAY_NOON_IST = Date.parse("2026-10-19T06:30:00Z");

test("quality: daily report, warnings proposed only for providers that need action, 14-day cooldown", async () => {
  const rows = [
    { providerId: "p1", name: "Ravi", phone: "+91981", severity: "high", completed30: 4, issues: [{ key: "rating_low", label: "Rating 2.7 over the last 30 days (3 reviews)" }], warning: "Hello Ravi…" },
    { providerId: "p2", name: "Sita", phone: "", severity: "medium", completed30: 9, issues: [{ key: "missed_rings", label: "Let 3 requests ring out in 7 days" }], warning: "Hello Sita…" },
  ];
  const c = fake({ "GET /admin/watch/provider-quality": rows, "POST /agents/actions": { duplicate: false }, "POST /agents/feed": { duplicate: false } });
  await quality.tick(c, silent, { force: true, now: MONDAY_NOON_IST });
  const props = writes(c, "/agents/actions");
  assert.equal(props.length, 1);
  assert.deepEqual(props[0][2].request, { method: "POST", path: "/admin/providers/p1/warn", body: { message: "Hello Ravi…" } });
  assert.match(writes(c, "/agents/feed")[0][2].title, /1 need action, 1 to watch/);

  await quality.tick(c, silent, { force: true, now: MONDAY_NOON_IST + 86400000 }); // next day: still in cooldown
  assert.equal(writes(c, "/agents/actions").length, 1);
});

test("quality: waits for its hour and runs once a day", async () => {
  const c = fake({ "GET /admin/watch/provider-quality": [] });
  assert.equal(await quality.tick(c, silent, { now: Date.parse("2026-10-22T02:00:00Z") }), null); // 7:30 IST
  assert.ok(await quality.tick(c, silent, { now: Date.parse("2026-10-22T06:00:00Z") }));
  assert.equal(await quality.tick(c, silent, { now: Date.parse("2026-10-22T08:00:00Z") }), null);
});

test("retention: one proposal per group with the offer, a customer not repeated within 30 days", async () => {
  const cust = (id) => ({ customerId: id, name: id, phone: `+91${id}`, lastBookingAt: "2026-08-01T00:00:00Z", lastService: "AC repair", completed: 2 });
  const data = {
    segments: [
      { key: "no_provider", label: "Couldn't get a provider last time", title: "Sorry", text: "Please try again.", customers: [cust("a")] },
      { key: "lapsed", label: "Regular customers who stopped booking", title: "We miss you", text: "It's been a while!", customers: [cust("b"), cust("c")] },
      { key: "first_timer", label: "Booked once", title: "Next job?", text: "Thanks!", customers: [] },
    ],
    offer: { code: "BACK10", discountPercent: 10 },
  };
  const c = fake({ "GET /admin/watch/retention": data, "POST /agents/actions": { duplicate: false }, "POST /agents/feed": { duplicate: false } });
  assert.equal(await retention.tick(c, silent, { now: MONDAY_NOON_IST - 86400000 }), null); // Sunday: not due
  await retention.tick(c, silent, { now: MONDAY_NOON_IST });
  const props = writes(c, "/agents/actions").map(([, , b]) => b);
  assert.equal(props.length, 2);
  assert.deepEqual(props[1].request.body, { audience: "customer-list", customerIds: ["b", "c"], title: "We miss you", message: "It's been a while! Use code BACK10 for 10% off." });
  assert.match(writes(c, "/agents/feed")[0][2].title, /3 customers/);

  await retention.tick(c, silent, { now: MONDAY_NOON_IST + 7 * 86400000 }); // next Monday: same people, still within 30 days
  assert.equal(writes(c, "/agents/actions").length, 2);
});

test("retention: big groups are split into proposals of 100", () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ customerId: `c${i}`, name: "", phone: "", lastBookingAt: "x", completed: 2 }));
  const out = retention.proposalsFor([{ key: "lapsed", label: "Lapsed", title: "T", text: "M", customers: many }], null, {}, Date.now(), "2026-10-19");
  assert.deepEqual(out.map((p) => p.customers.length), [100, 100, 30]);
  assert.ok(JSON.stringify(out[0].action.request.body).length < 5000);
});

test("fraud: each flag posted once; only critical ones go to the owner", async () => {
  const flags = [
    { id: "self:b1", severity: "critical", title: "Provider booked own service", detail: "…", refs: { bookingId: "b1" } },
    { id: "cancels:c7:4", severity: "warning", title: "4 cancels", detail: "…", refs: { customerId: "c7" } },
  ];
  const routes = { "GET /admin/watch/fraud": [flags[1]], "POST /agents/feed": { duplicate: false }, "POST /agents/notify-owner": {} };
  const c = fake(routes);
  // First run: what's already there goes into one quiet report, no WhatsApp.
  assert.match(await fraud.tick(c, silent), /1 existing patterns/);
  assert.equal(writes(c, "/agents/feed")[0][2].kind, "report");
  routes["GET /admin/watch/fraud"] = flags;
  assert.match(await fraud.tick(c, silent), /1 new flagged, 1 sent to the owner/);
  assert.equal(await fraud.tick(c, silent), null);
  assert.equal(writes(c, "/agents/feed").length, 2);
  assert.equal(writes(c, "/agents/notify-owner").length, 1);
  assert.equal(writes(c, "/agents/feed")[1][2].severity, "critical");
});
