const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-renewals-"));
const renewals = require("../src/renewals");
const silent = { info() {}, warn() {}, error() {} };

function fake(routes) {
  const calls = [];
  return {
    calls,
    async request(m, p, b) {
      calls.push([m, p, b]);
      const h = routes[`${m} ${p}`];
      return typeof h === "function" ? h(b) : h ?? {};
    },
    get(p) { return this.request("GET", p); },
    post(p, b) { return this.request("POST", p, b); },
    feed(x) { return this.post("/agents/feed", x); },
  };
}
const posts = (c, p) => c.calls.filter(([m, path]) => m === "POST" && path === p).map(([, , b]) => b);
const item = (id, renewsOn, daysLeft, stage, extra = {}) => ({ id, name: `Service ${id}`, vendor: "V", billing: "yearly", renewsOn, renewUrl: "https://example.com/renew", status: { daysLeft, stage, level: daysLeft < 0 ? "overdue" : daysLeft <= 7 ? "urgent" : "soon" }, ...extra });
const SAT = Date.parse("2026-10-24T06:00:00Z"); // Saturday 11:30 IST
const MON = Date.parse("2026-10-26T05:00:00Z"); // Monday 10:30 IST

test("each reminder goes out once (feed + WhatsApp); the first run also posts the whole list", async () => {
  const routes = {
    "GET /admin/watch/renewals": [item("a", "2026-10-31", 7, 7), item("b", "2026-12-30", 67, null), item("c", null, null, null)],
    "POST /agents/feed": { duplicate: false },
    "POST /agents/notify-owner": { delivered: 1 },
  };
  const c = fake(routes);
  assert.match(await renewals.tick(c, silent, { now: SAT }), /1 reminder, 1 on WhatsApp, list posted/);
  const [alert, list] = posts(c, "/agents/feed");
  assert.equal(alert.kind, "alert");
  assert.match(alert.title, /Service a ends in 7 days \(31 Oct 2026\)/);
  assert.match(alert.body, /https:\/\/example.com\/renew/);
  assert.equal(list.kind, "report");
  assert.match(list.body, /No date yet[\s\S]*Service c/);
  assert.match(posts(c, "/agents/notify-owner")[0].text, /Service a ends in 7 days/);

  // Same stage again: nothing new.
  assert.equal(await renewals.tick(c, silent, { now: SAT + 3 * 3600000 }), null);

  // A new stage (3 days) is a new reminder; Monday brings the weekly list.
  routes["GET /admin/watch/renewals"] = [item("a", "2026-10-31", 3, 3), item("b", "2026-12-30", 65, null)];
  assert.match(await renewals.tick(c, silent, { now: MON }), /1 reminder, 1 on WhatsApp, list posted/);
  const last = posts(c, "/agents/feed").slice(-2);
  assert.equal(last[0].severity, "critical");
  assert.match(last[1].title, /1 due in 60 days/);
  assert.equal(await renewals.tick(c, silent, { now: MON + 3 * 3600000 }), null); // weekly once
});

test("overdue reminds every 2 days; a renewed date starts fresh", () => {
  assert.equal(renewals.stageKey(item("x", "2026-10-20", -1, "overdue")), "overdue:0");
  assert.equal(renewals.stageKey(item("x", "2026-10-20", -2, "overdue")), "overdue:1");
  assert.equal(renewals.stageKey(item("x", "2026-10-20", -3, "overdue")), "overdue:1");
  assert.equal(renewals.stageKey(item("x", "2027-10-20", 361, null)), null);
  assert.match(renewals.message(item("x", "2026-10-20", -4, "overdue")).title, /ended 4 days ago/);
  assert.match(renewals.message(item("p", "2026-10-25", 1, 1, { billing: "prepaid" })).body, /^Check the balance \/ top up/);
});
