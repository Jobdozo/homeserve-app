const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-reviews-"));
delete process.env.ANTHROPIC_API_KEY; // weekly summary falls back to numbers only
const reviews = require("../src/reviews");
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
const feeds = (c) => c.calls.filter(([m, p]) => m === "POST" && p === "/agents/feed").map(([, , b]) => b);
const review = (id, rating, extra = {}) => ({ bookingId: id, ref: `R${id}`, rating, text: "", service: "AC repair", customerName: "Asha Devi", customerPhone: "+919800000001", providerId: "p1", providerName: "Ravi", ...extra });
const SAT = Date.parse("2026-10-17T06:00:00Z");
const MONDAY_1PM_IST = Date.parse("2026-10-19T07:30:00Z");

test("reviews: first run only notes existing reviews; then each new 1–2★ review alerts once", async () => {
  const routes = { "GET /admin/watch/reviews": [review("old", 1)], "POST /agents/feed": { duplicate: false } };
  const c = fake(routes);
  assert.match(await reviews.tick(c, silent, { now: SAT }), /1 existing reviews/);
  assert.equal(feeds(c).length, 0);

  routes["GET /admin/watch/reviews"] = [review("old", 1), review("n1", 1, { text: "Came 3 hours late" }), review("n2", 5), review("n3", 2)];
  assert.match(await reviews.tick(c, silent, { now: SAT + 600000 }), /2 low-rating alerts/);
  const [a, b] = feeds(c);
  assert.equal(a.severity, "critical");
  assert.match(a.title, /★☆☆☆☆ for Ravi/);
  assert.match(a.body, /"Came 3 hours late"/);
  assert.equal(b.severity, "warning");
  assert.equal(await reviews.tick(c, silent, { now: SAT + 1200000 }), null);
  assert.equal(feeds(c).length, 2);
});

test("reviews: Monday report counts this week's new reviews, best and weakest providers", async () => {
  const routes = { "GET /admin/watch/reviews": [], "POST /agents/feed": { duplicate: false } };
  const c = fake(routes);
  // (state carries over from the test above: already baselined)
  routes["GET /admin/watch/reviews"] = [
    review("w1", 5, { text: "Very neat work", providerId: "p2", providerName: "Sita" }),
    review("w2", 5, { providerId: "p2", providerName: "Sita" }),
    review("w3", 3, { text: "ok" }),
    review("w4", 3),
  ];
  await reviews.tick(c, silent, { now: MONDAY_1PM_IST });
  const report = feeds(c).find((f) => f.kind === "report");
  assert.match(report.title, /4 new reviews, 4\.0★ average/);
  assert.match(report.body, /Best: Sita 5\.0★ \(2\)/);
  assert.match(report.body, /Needs attention: Ravi 3\.0★ \(2\)/);
  assert.match(report.body, /"Very neat work" — Asha/);
  assert.equal(await reviews.tick(c, silent, { now: MONDAY_1PM_IST + 3600000 }), null); // once per Monday
});

test("weekly: averages and star split", () => {
  const w = reviews.weekly([review("a", 5), review("b", 4), review("c", 1)]);
  assert.equal(w.n, 3);
  assert.equal(w.avg.toFixed(2), "3.33");
  assert.equal(w.split, "5★ 1 · 4★ 1 · 3★ 0 · 2★ 0 · 1★ 1");
});
