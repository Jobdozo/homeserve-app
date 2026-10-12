// Run: npm test  (throwaway DATA_DIR)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-partner-"));
const hub = require("../src/partnerHub");

// Mon 12 Oct 2026, 3:30 PM IST
const NOW = Date.parse("2026-10-12T10:00:00Z");
const H = 3600000;
const D = 24 * H;
const iso = (ms) => new Date(ms).toISOString();

test("provider offers: percent with a cap, flat, minimum booking", () => {
  const pct = { kind: "percent", value: 15, maxDiscount: 150, minOrder: 0 };
  assert.equal(hub.offerDiscount(pct, 600), 90);
  assert.equal(hub.offerDiscount(pct, 2000), 150); // capped
  const flat = { kind: "flat", value: 100, minOrder: 999 };
  assert.equal(hub.offerDiscount(flat, 998), 0);
  assert.equal(hub.offerDiscount(flat, 1200), 100);
  assert.equal(hub.offerDiscount({ kind: "flat", value: 500, minOrder: 0 }, 300), 300); // never below zero
  assert.equal(hub.describeOffer({ ...pct, audience: "new" }), "15% off up to ₹150 · your first booking");
});

test("provider offers: create, code, limits, end", () => {
  const a = hub.createProviderOffer("p1", "Sharma Home Services", { kind: "percent", value: 15, maxDiscount: 150, audience: "new" }, ["SHARMA15"]);
  assert.equal(a.code, "SHARMA15B"); // the plain code is taken by a Tikdum offer
  assert.throws(() => hub.createProviderOffer("p1", "Sharma", { kind: "percent", value: 70 }), /between 5% and 50%/);
  assert.throws(() => hub.createProviderOffer("p1", "Sharma", { kind: "flat", value: 200, minOrder: 150 }), /more than the amount off/);
  hub.createProviderOffer("p1", "Sharma", { kind: "flat", value: 100, minOrder: 999 });
  hub.createProviderOffer("p1", "Sharma", { kind: "percent", value: 10 });
  assert.throws(() => hub.createProviderOffer("p1", "Sharma", { kind: "percent", value: 20 }), /up to 3 offers/);
  hub.setProviderOfferActive("p1", a.id, false);
  assert.equal(hub.liveProviderOffers({ providerIds: ["p1"] }).length, 2);
  assert.equal(hub.findProviderOffer("sharma15b").id, a.id);
  hub.countOfferUse(a.id);
  assert.equal(hub.listProviderOffers("p1").find((o) => o.id === a.id).uses, 1);
});

test("three unanswered requests in a row trip the switch; any answer resets it", () => {
  assert.equal(hub.noteTimeout("p2"), false);
  assert.equal(hub.noteTimeout("p2"), false);
  hub.noteResponse("p2");
  assert.equal(hub.noteTimeout("p2"), false);
  assert.equal(hub.noteTimeout("p2"), false);
  assert.equal(hub.noteTimeout("p2"), true);
  hub.logOnline("p2", false, "missed");
  assert.equal(hub.offlineReason("p2", false).reason, "missed");
  hub.logOnline("p2", true);
  assert.equal(hub.streakOf("p2"), 0);
  assert.equal(hub.offlineReason("p2", true), null);
});

test("online share counts only working hours", () => {
  // 8 AM–8 PM every day (no schedule). Switched off for the last 2 days at 8 AM IST, on now.
  const offAt = Date.parse("2026-10-10T02:30:00Z"); // Sat 8:00 AM IST
  const onAt = Date.parse("2026-10-12T02:30:00Z"); // Mon 8:00 AM IST
  const log = [
    { accepting: false, at: iso(offAt) },
    { accepting: true, at: iso(onAt) },
  ];
  const r = hub.onlineShare({ log, now: NOW, days: 7 });
  // offline: Sat 12h + Sun 12h = 24h of working time
  assert.equal(r.offlineHours, 24);
  assert.ok(r.pct > 65 && r.pct < 75, `got ${r.pct}`);
  assert.equal(hub.onlineShare({ log: [], acceptingNow: true, now: NOW }).pct, 100);
});

test("quality: missed, declined, accept time, on time, ratings", () => {
  const b = (id, extra) => ({ id, customerId: "c1", serviceId: "s1", status: "Completed", amount: 500, createdAt: iso(NOW - 2 * D), ...extra });
  const bookings = [
    b("a", { statusHistory: { Pending: iso(NOW - 2 * D), Accepted: iso(NOW - 2 * D + 40000), "In Progress": iso(Date.parse("2026-10-10T06:00:00Z")) }, date: "2026-10-10", time: "10:00 AM - 12:00 PM", review: { rating: 5 } }),
    b("b", { statusHistory: { Pending: iso(NOW - 3 * D), Accepted: iso(NOW - 3 * D + 20000), "In Progress": iso(Date.parse("2026-10-09T08:00:00Z")) }, date: "2026-10-09", time: "10:00 AM - 12:00 PM", review: { rating: 2 } }),
  ];
  const declines = [
    { kind: "timeout", at: iso(NOW - D) },
    { kind: "declined", at: iso(NOW - D) },
  ];
  const q = hub.qualityFor({ bookings, declines, from: NOW - 7 * D, to: NOW });
  assert.equal(q.missed, 1);
  assert.equal(q.declined, 1);
  assert.equal(q.requests, 4);
  assert.equal(q.declinedPct, 25);
  assert.equal(q.avgAcceptSec, 30);
  assert.equal(q.onTimePct, 50); // b started 1:30 PM, slot ended noon
  assert.equal(q.lowRated, 1);
});

test("insights: today's earnings by hour and the customer mix", () => {
  const done = (id, at, amount, customerId, createdAt) => ({ id, customerId, status: "Completed", amount, createdAt: iso(createdAt), statusHistory: { Completed: iso(at) } });
  const bookings = [
    done("t1", Date.parse("2026-10-12T05:00:00Z"), 1190, "c-new", NOW - 3 * H), // 10:30 IST
    done("t2", Date.parse("2026-10-12T08:00:00Z"), 600, "c-rep", NOW - 4 * H), // 13:30 IST
    done("o1", NOW - 40 * D, 400, "c-rep", NOW - 40 * D),
    done("o2", NOW - 100 * D, 400, "c-quiet", NOW - 100 * D),
  ];
  const r = hub.computeInsights({ bookings, now: NOW });
  assert.equal(r.today.earned, 1790);
  assert.equal(r.today.jobs, 2);
  assert.equal(r.today.hourly[10], 1190);
  assert.equal(r.today.hourly[13], 600);
  assert.deepEqual(r.customers, { new: 1, repeat: 1, quiet: 1 });
});

test("money: Monday–Sunday weeks with fees and how customers paid", () => {
  const done = (id, at, amount) => ({ id, status: "Completed", amount, createdAt: iso(at), statusHistory: { Completed: iso(at) } });
  const bookings = [done("x", NOW - H, 1000), done("y", NOW - 2 * D, 500), done("z", NOW - 6 * D, 700)];
  const weeks = hub.weeklyCycles({ bookings, fees: new Map([["x", 40], ["z", 40]]), payments: new Map([["x", "upi"]]), now: NOW, weeks: 2 });
  assert.equal(weeks[0].from, "2026-10-12");
  assert.equal(weeks[0].jobs, 1);
  assert.equal(weeks[0].collected, 1000);
  assert.equal(weeks[0].upi, 1000);
  assert.equal(weeks[0].kept, 960);
  assert.equal(weeks[1].from, "2026-10-05");
  assert.equal(weeks[1].jobs, 2);
  assert.equal(weeks[1].unmarked, 1200);
});

test("service score: own photo, description, options, fair price; top pros", () => {
  const svc = (id, providerId, extra) => ({ id, providerId, categoryId: "cleaning", price: 500, status: "active", ...extra });
  const all = [
    svc("a", "me", { imageUrl: "/u/a.jpg", tagline: "Deep clean of tiles, taps and drains", options: [{}] }),
    svc("b", "me", { imageUrl: "/stock.jpg", imageFromCatalog: true }),
    svc("c", "pro", { imageUrl: "/u/c.jpg", tagline: "Everything sparkling, guaranteed", options: [{}] }),
    svc("d", "pro2", { imageUrl: "/u/d.jpg", includes: ["Floor", "Walls"] }),
  ];
  const r = hub.scoreReport({ myServices: all.filter((s) => s.providerId === "me"), allServices: all, bookings: [{ serviceId: "a", status: "Completed", createdAt: iso(NOW - D) }], now: NOW });
  assert.equal(r.score, Math.round((100 + 15) / 2));
  assert.equal(r.top, 100);
  assert.equal(r.noPhoto[0].id, "b");
  assert.equal(r.photoGain, 20);
  assert.deepEqual(r.unbooked.map((s) => s.id), ["b"]);
  assert.equal(r.bookings60.a, 1);
});

test("invoice months net credit notes", () => {
  const m = hub.invoiceMonths([
    { type: "invoice", date: "2026-09-10T06:00:00Z", taxableValue: 33.9, cgst: 3.05, sgst: 3.05, igst: 0, total: 40 },
    { type: "invoice", date: "2026-09-20T06:00:00Z", taxableValue: 33.9, cgst: 3.05, sgst: 3.05, igst: 0, total: 40 },
    { type: "credit_note", date: "2026-09-21T06:00:00Z", taxableValue: 33.9, cgst: 3.05, sgst: 3.05, igst: 0, total: 40 },
  ]);
  assert.equal(m.length, 1);
  assert.equal(m[0].month, "2026-09");
  assert.equal(m[0].total, 40);
  assert.equal(m[0].gst, 6.1);
});
