const { test } = require("node:test");
const assert = require("node:assert");
const { buildStats, scoreProvider, rank } = require("../src/dispatchRank");

const NOW = Date.parse("2026-10-17T06:00:00Z"); // 11:30 IST
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

test("buildStats: accepted in the window, declines vs timeouts, today's requests, open complaints", () => {
  const stats = buildStats({
    now: NOW,
    bookings: [
      { providerId: "a", status: "Completed", createdAt: daysAgo(3) },
      { providerId: "a", status: "Accepted", createdAt: daysAgo(0.1) },
      { providerId: "a", status: "Completed", createdAt: daysAgo(90) }, // outside 60 days
      { providerId: "b", status: "Pending", createdAt: daysAgo(0.05) },
      { providerId: "b", status: "Cancelled", createdAt: daysAgo(5) },
    ],
    declines: [
      { providerId: "b", kind: "declined", at: daysAgo(2) },
      { providerId: "b", kind: "timeout", at: daysAgo(1) },
      { providerId: "b", kind: "timeout", at: daysAgo(70) }, // too old
    ],
    complaints: [
      { providerId: "b", status: "investigating", createdAt: daysAgo(4) },
      { providerId: "b", status: "resolved", createdAt: daysAgo(4) },
      { providerId: "a", status: "new", createdAt: daysAgo(100) }, // too old
    ],
  });
  assert.deepEqual(stats.a, { accepted: 2, declined: 0, timedOut: 0, today: 1, openComplaints: 0 });
  assert.deepEqual(stats.b, { accepted: 0, declined: 1, timedOut: 1, today: 1, openComplaints: 1 });
});

test("scoreProvider: an online, reliable, free provider beats an offline one who ignores requests", () => {
  const good = scoreProvider({ now: NOW, lastSeenMs: NOW - 2 * 60000, rating: 4.8, openJobs: 0, stat: { accepted: 9, declined: 1, timedOut: 0, today: 0 } });
  const poor = scoreProvider({ now: NOW, lastSeenMs: NOW - 10 * 3600000, rating: 3.2, openJobs: 3, stat: { accepted: 1, declined: 2, timedOut: 5, today: 3, openComplaints: 2 } });
  assert.ok(good.score > poor.score);
  assert.ok(good.score <= 100 && poor.score >= 0);
  assert.deepEqual(good.reasons, ["online 2 min ago", "accepts 90% of requests", "★ 4.8", "no open jobs", "no requests yet today"]);
  assert.ok(poor.reasons.includes("2 open complaints"));
  assert.ok(poor.reasons.includes("accepts 13% of requests"));
});

test("scoreProvider: a new provider gets a fair middle score, not zero", () => {
  const fresh = scoreProvider({ now: NOW, lastSeenMs: NOW - 60000, stat: undefined });
  assert.ok(fresh.reasons.includes("new — few requests so far"));
  assert.ok(fresh.score >= 50);
});

test("rank: best match first; equal scores keep the cheaper price, then the original order", () => {
  const inputs = {
    x: { now: NOW, lastSeenMs: null },
    y: { now: NOW, lastSeenMs: NOW - 60000 },
    z: { now: NOW, lastSeenMs: NOW - 60000 },
  };
  const out = rank(
    [
      { id: "x", price: 100 },
      { id: "y", price: 500 },
      { id: "z", price: 300 },
    ],
    (it) => inputs[it.id]
  );
  assert.deepEqual(out.map((o) => o.id), ["z", "y", "x"]);
  assert.ok(out[0].match.reasons.length > 0);
});
