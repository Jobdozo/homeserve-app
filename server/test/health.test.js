// Run: npm test  (throwaway DATA_DIR)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-health-"));
const { createLimiter } = require("../src/rateLimit");
const health = require("../src/health");

test("limiter: allows up to max per window, then refuses with a wait, then resets", () => {
  let t = 0;
  const l = createLimiter({ windowMs: 60000, max: 3, now: () => t });
  assert.equal(l.take("a").ok, true);
  assert.equal(l.take("a").ok, true);
  assert.equal(l.take("a").remaining, 0);
  t = 15000;
  const refused = l.take("a");
  assert.equal(refused.ok, false);
  assert.equal(refused.retryAfterSec, 45);
  assert.equal(l.take("b").ok, true); // another account is unaffected
  t = 60000;
  assert.equal(l.take("a").ok, true); // new window
  t = 200000;
  l.prune();
  assert.equal(l.size(), 0);
});

test("backup health: ok, failed, overdue, missing", () => {
  const file = path.join(process.env.DATA_DIR, "backup-status.json");
  const now = Date.parse("2026-10-12T12:00:00Z");
  const write = (o) => fs.writeFileSync(file, JSON.stringify(o));

  assert.equal(health.backupHealth({ file, now }).state, "unknown");

  write({ at: "2026-10-12T02:31:00Z", exitCode: 0, database: "ok", archive: "ok", offsite: "copied", note: "" });
  const ok = health.backupHealth({ file, now });
  assert.equal(ok.ok, true);
  assert.equal(ok.state, "ok");
  assert.equal(ok.ageHours, 9.5);

  write({ at: "2026-10-12T02:31:00Z", exitCode: 1, database: "ok", archive: "ok", offsite: "failed", note: "upload error" });
  assert.equal(health.backupHealth({ file, now }).state, "failed");

  write({ at: "2026-10-10T02:31:00Z", exitCode: 0, database: "ok", archive: "ok", offsite: "off" });
  assert.equal(health.backupHealth({ file, now }).state, "overdue");
});

test("database health: ok, error, timeout", async () => {
  assert.equal(await health.databaseHealth(async () => []), "ok");
  assert.equal(await health.databaseHealth(async () => { throw new Error("down"); }), "error");
  assert.equal(await health.databaseHealth(() => new Promise(() => {}), 20), "error");
});

test("server load: busy only on sustained high CPU or slow responses", () => {
  assert.equal(health.judgeLoad({ cpuPct: 12, loopP99Ms: 30 }), false);
  assert.equal(health.judgeLoad({ cpuPct: health.BUSY_CPU_PCT, loopP99Ms: 30 }), true);
  assert.equal(health.judgeLoad({ cpuPct: 20, loopP99Ms: health.BUSY_LOOP_P99_MS }), true);
  assert.equal(health.serverLoad(), null); // nothing until the first 5-minute window ends
});
