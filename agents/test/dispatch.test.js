const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-dispatch-"));
const dispatch = require("../src/dispatch");
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

const NOW = Date.parse("2026-10-17T06:00:00Z");
const option = (id, extra = {}) => ({
  providerId: id, name: `Provider ${id}`, sameService: true, available: true, passed: false, price: 400, customerPays: 400, cover: 0,
  match: { score: 80, reasons: ["online just now", "accepts 90% of requests"] }, ...extra,
});
const waiting = (id, options, suggestedProviderId) => ({
  booking: { id, ref: `R${id}`, service: { name: "AC repair" }, address: { line: "Gandhi Nagar, Jammu 180004" }, date: "2026-10-17", time: "2:00 PM – 4:00 PM" },
  since: "2026-10-17T05:50:00Z", deadline: "2026-10-17T07:30:00Z", responsible: { name: "Old provider" },
  options, suggestedProviderId,
});

test("dispatch: proposes the suggested provider once, guarded by onlyIfWaiting; warns when nobody is available", async () => {
  const items = [waiting("b1", [option("p1"), option("p2", { match: { score: 60, reasons: ["last seen 20 min ago"] } })], "p1"), waiting("b2", [option("p3", { available: false })], null)];
  const c = fake({ "GET /admin/assignments": { items }, "POST /agents/actions": { duplicate: false }, "POST /agents/feed": { duplicate: false } });
  const summary = await dispatch.tick(c, silent, NOW);
  assert.match(summary, /1 suggestions, 1 with nobody/);

  const [[, , p]] = writes(c, "/agents/actions");
  assert.equal(p.request.method, "POST");
  assert.equal(p.request.path, "/admin/bookings/b1/assign");
  assert.deepEqual(p.request.body, { providerId: "p1", onlyIfWaiting: true });
  assert.match(p.title, /Rb1.*Provider p1/);
  assert.match(p.summary, /waiting 10 min/);
  assert.match(p.reasoning, /Provider p2/);
  assert.match(writes(c, "/agents/feed")[0][2].title, /no provider available/);

  // Next run: nothing new.
  await dispatch.tick(c, silent, NOW + 60000);
  assert.equal(writes(c, "/agents/actions").length, 1);
  assert.equal(writes(c, "/agents/feed").length, 1);
});

test("dispatch: a booking that comes back to the desk later gets a fresh suggestion", async () => {
  const first = waiting("b9", [option("p1")], "p1");
  const routes = { "GET /admin/assignments": { items: [first] }, "POST /agents/actions": { duplicate: false } };
  const c = fake(routes);
  await dispatch.tick(c, silent, NOW);
  routes["GET /admin/assignments"] = { items: [{ ...first, since: "2026-10-17T06:10:00Z", options: [option("p2")], suggestedProviderId: "p2" }] };
  await dispatch.tick(c, silent, NOW + 20 * 60000);
  const sent = writes(c, "/agents/actions").map(([, , b]) => b.request.body.providerId);
  assert.deepEqual(sent, ["p1", "p2"]);
});
