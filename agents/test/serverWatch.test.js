const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-watch-state-"));
const serverWatch = require("../src/serverWatch");

// Each test starts with nothing remembered.
const stateFile = () => path.join(process.env.AGENT_STATE_DIR, "server-watch.json");
const reset = () => fs.writeFileSync(stateFile(), JSON.stringify({ helloAt: "2026-10-13T00:00:00Z" }));
const silent = { info() {}, warn() {}, error() {} };
const cfg = { healthRemindHours: 6, refusedAlert: 300 };
const good = { ok: true, database: "ok", backup: { state: "ok", ageHours: 3 }, load: { busy: false, cpuPct: 2, loopP99Ms: 20, requestsPerMin: 40 }, uploads: { enabled: true, failed: 0, lastError: null }, limits: { refused: 0 } };
const with_ = (patch) => ({ ...good, ...patch });

// A stand-in for the agent's API client: records WhatsApp texts and feed posts;
// `down` makes every call fail like an unreachable API.
function fakeClient() {
  const c = { texts: [], feed: [], down: false };
  c.post = async (p, body) => {
    if (c.down) throw new Error("connect ECONNREFUSED");
    if (p === "/agents/notify-owner") c.texts.push(body.text);
    return { delivered: 1, attempted: 1 };
  };
  c.feed = async (item) => {
    if (c.down) throw new Error("connect ECONNREFUSED");
    c.feed.push(item);
    return {};
  };
  c.feedItems = c.feed;
  return c;
}

test("server watch: healthy server raises nothing", () => {
  assert.deepEqual(serverWatch.problems(good, {}, cfg), {});
});

test("server watch: says hello once, the first time it reaches the API", async () => {
  fs.rmSync(stateFile(), { force: true });
  const c = fakeClient();
  await serverWatch.check(c, silent, { now: Date.now(), health: null, cfg });
  assert.equal(c.texts.length, 0);
  await serverWatch.check(c, silent, { now: Date.now(), health: good, cfg });
  await serverWatch.check(c, silent, { now: Date.now(), health: good, cfg });
  assert.equal(c.texts.length, 1);
  assert.match(c.texts[0], /^✅ Server watch is on/);
});

test("server watch: finds database, backup, load, upload and refused-request problems", () => {
  const p = serverWatch.problems(
    with_({ database: "error", backup: { state: "failed", note: "disk full" }, load: { busy: true, cpuPct: 85, loopP99Ms: 300, requestsPerMin: 900 }, uploads: { enabled: true, failed: 3, lastError: "403 AccessDenied" } }),
    { refusedDelta: 450 },
    cfg
  );
  assert.deepEqual(Object.keys(p).sort(), ["backup", "database", "limits", "load", "uploads"]);
  assert.equal(p.database.severity, "critical");
  assert.match(p.backup.text, /disk full/);
  assert.match(p.load.text, /CPU 85%/);
  assert.match(p.load.text, /scaling step 4/);
  assert.equal(p.limits.fixed, null);
  assert.equal(serverWatch.problems(with_({ backup: { state: "overdue", ageHours: 40 } }), {}, cfg).backup.severity, "critical");
  assert.equal(serverWatch.problems(with_({ backup: { state: "unknown" } }), {}, cfg).backup, undefined);
});

test("server watch: one missed check is ignored, two in a row is an outage", () => {
  assert.deepEqual(serverWatch.problems(null, { missed: 1 }, cfg), {});
  assert.equal(serverWatch.problems(null, { missed: 2 }, cfg).api.severity, "critical");
});

test("server watch: alerts once, reminds after 6h, and says when it's fixed", async () => {
  reset();
  const c = fakeClient();
  const t0 = Date.parse("2026-10-13T08:00:00Z");
  const busy = with_({ load: { busy: true, cpuPct: 90, loopP99Ms: 250, requestsPerMin: 1200 } });
  await serverWatch.check(c, silent, { now: t0, health: busy, cfg });
  assert.equal(c.texts.length, 1);
  assert.match(c.texts[0], /^🟠 Server alert: The server has been busy/);
  assert.equal(c.feedItems.length, 1);
  await serverWatch.check(c, silent, { now: t0 + 5 * 60000, health: busy, cfg });
  assert.equal(c.texts.length, 1, "no repeat 5 minutes later");
  await serverWatch.check(c, silent, { now: t0 + 6 * 3600000 + 1, health: busy, cfg });
  assert.equal(c.texts.length, 2);
  assert.match(c.texts[1], /Still not fixed/);
  const out = await serverWatch.check(c, silent, { now: t0 + 7 * 3600000, health: good, cfg });
  assert.equal(c.texts.length, 3);
  assert.match(c.texts[2], /^✅ The server is no longer busy\. The problem started .* and lasted 7h 0m\.$/);
  assert.equal(out, "server ok");
});

test("server watch: an API outage is reported once the API is reachable again", async () => {
  reset();
  const c = fakeClient();
  const t0 = Date.parse("2026-10-13T10:00:00Z");
  c.down = true;
  await serverWatch.check(c, silent, { now: t0, health: null, cfg });
  const out = await serverWatch.check(c, silent, { now: t0 + 5 * 60000, health: null, cfg });
  assert.equal(out, "server: api");
  assert.equal(c.texts.length, 0, "can't send while the API is down");
  c.down = false;
  await serverWatch.check(c, silent, { now: t0 + 25 * 60000, health: good, cfg });
  assert.equal(c.texts.length, 1);
  assert.match(c.texts[0], /^✅ The Tikdum API is answering again\. The problem started .* and lasted 20 min\.$/);
});

test("server watch: refused requests are counted per check, and a restart resets the counter", async () => {
  reset();
  const c = fakeClient();
  const t0 = Date.parse("2026-10-13T12:00:00Z");
  await serverWatch.check(c, silent, { now: t0, health: with_({ limits: { refused: 1000 } }), cfg });
  assert.equal(c.texts.length, 0, "the first reading is only a baseline");
  await serverWatch.check(c, silent, { now: t0 + 5 * 60000, health: with_({ limits: { refused: 1500 } }), cfg });
  assert.equal(c.texts.length, 1);
  assert.match(c.texts[0], /500 requests were refused/);
  await serverWatch.check(c, silent, { now: t0 + 10 * 60000, health: with_({ limits: { refused: 20 } }), cfg });
  assert.equal(c.texts.length, 1, "a spike ending (or a restart) sends nothing");
});
