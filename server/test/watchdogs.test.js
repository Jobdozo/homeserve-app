const { test } = require("node:test");
const assert = require("node:assert");
const w = require("../src/watchdogs");

const NOW = Date.parse("2026-10-17T06:00:00Z");
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const done = (id, providerId, customerId, days, rating, extra = {}) => ({
  id, providerId, customerId, status: "Completed", createdAt: ago(days + 0.1),
  statusHistory: { Accepted: ago(days + 0.05), Completed: ago(days) }, ...(rating ? { review: { rating } } : {}), customer: { name: "Asha", phone: "+919800000001" }, ...extra,
});

test("providerQuality: low rating, dropped jobs and complaints flag a provider; a good one isn't listed", () => {
  const providers = [
    { id: "bad", name: "Ravi Kumar", phone: "+919811111111", verificationStatus: "approved" },
    { id: "good", name: "Sita", verificationStatus: "approved" },
    { id: "new", name: "Pending one", verificationStatus: "pending" },
  ];
  const bookings = [
    done("b1", "bad", "c1", 2, 2), done("b2", "bad", "c2", 5, 3), done("b3", "bad", "c3", 9, 2),
    { id: "b4", providerId: "bad", status: "Swapped", createdAt: ago(3), statusHistory: { Accepted: ago(3) } },
    { id: "b5", providerId: "bad", status: "Rejected", createdAt: ago(4), statusHistory: { Accepted: ago(4) } },
    done("g1", "good", "c1", 2, 5), done("g2", "good", "c2", 3, 5), done("g3", "good", "c3", 4, 4),
    done("p1", "new", "c1", 2, 1), done("p2", "new", "c1", 2, 1), done("p3", "new", "c1", 2, 1),
  ];
  const complaints = [1, 2, 3].map((i) => ({ providerId: "bad", status: i === 1 ? "resolved" : "investigating", createdAt: ago(i) }));
  const rows = w.providerQuality({ providers, bookings, complaints, now: NOW });
  assert.deepEqual(rows.map((r) => r.providerId), ["bad"]);
  assert.equal(rows[0].severity, "high");
  assert.deepEqual(rows[0].issues.map((i) => i.key).sort(), ["complaints", "handed_back", "rating_low"]);
  assert.match(w.warningText(rows[0]), /^Hello Ravi, this is the Tikdum team/);
});

test("providerQuality: missed rings and low acceptance come from recorded declines", () => {
  const providers = [{ id: "p", name: "Mohan", verificationStatus: "approved" }];
  const declines = [1, 2, 3, 4, 5].map((d) => ({ providerId: "p", kind: "timeout", at: ago(d / 2) }));
  const rows = w.providerQuality({ providers, bookings: [done("x", "p", "c", 1)], declines, now: NOW });
  assert.deepEqual(rows[0].issues.map((i) => i.key), ["low_acceptance", "missed_rings"]);
});

test("retention: each customer lands in at most one group; recent or open bookings are left alone", () => {
  const customers = ["nobody", "once", "regular", "recent", "open", "never"].map((id) => ({ id, name: id, phone: `+91${id}` }));
  const bookings = [
    { id: "n1", customerId: "nobody", status: "Rejected", createdAt: ago(5), statusHistory: {} },
    done("o1", "p", "once", 20),
    done("r1", "p", "regular", 60), done("r2", "p", "regular", 90),
    done("x1", "p", "recent", 5), done("x2", "p", "recent", 100),
    { id: "y1", customerId: "open", status: "Pending", createdAt: ago(30) }, done("y2", "p", "open", 90), done("y3", "p", "open", 95),
  ];
  const seg = Object.fromEntries(w.retention({ customers, bookings, now: NOW }).map((s) => [s.key, s.customers.map((c) => c.customerId)]));
  assert.deepEqual(seg, { no_provider: ["nobody"], first_timer: ["once"], lapsed: ["regular"] });
});

test("usableOffer: active, unexpired, no minimum order", () => {
  const offers = [
    { code: "OLD", active: true, discountPercent: 10, expiresAt: ago(1) },
    { code: "MIN", active: true, discountPercent: 10, minOrder: 500 },
    { code: "OFF", active: false, discountPercent: 10 },
    { code: "BACK10", active: true, discountPercent: 10 },
  ];
  assert.equal(w.usableOffer(offers, NOW).code, "BACK10");
  assert.equal(w.usableOffer([], NOW), null);
});

test("fraud: self-booking, repeat pairs, refund-heavy, mass cancels and instant completions", () => {
  const providers = [{ id: "p1", name: "Ravi", phone: "+91 98000 00001" }, { id: "p2", name: "Sita", phone: "+919811111111" }];
  const fast = (id, d) => ({ ...done(id, "p2", `c-${id}`, d, 0, { customer: { name: "X", phone: "+919822222222" } }), statusHistory: { Accepted: ago(d), Completed: new Date(Date.parse(ago(d)) + 60000).toISOString() } });
  const bookings = [
    done("s1", "p1", "c1", 1, 5), // customer phone == Ravi's
    ...[1, 2, 3, 4].map((d) => done(`pr${d}`, "p2", "c9", d, 5, { customer: { name: "Loyal", phone: "+919833333333" } })),
    ...[1, 2, 3, 4].map((d) => ({ id: `cx${d}`, customerId: "c7", status: "Cancelled", createdAt: ago(d), cancelledAt: ago(d), customer: { name: "Canceller" } })),
    fast("f1", 1), fast("f2", 2), fast("f3", 3),
  ];
  const refundClaims = [{ customerId: "c9", createdAt: ago(2) }, { customerId: "c9", createdAt: ago(3) }, { customerId: "c9", createdAt: ago(40) }];
  const flags = w.fraud({ providers, bookings, refundClaims, now: NOW });
  const kinds = flags.map((f) => f.id.split(":")[0]);
  assert.deepEqual(kinds.sort(), ["cancels", "fast", "pair", "refunds", "self"]);
  assert.equal(flags.find((f) => f.id.startsWith("self")).severity, "critical");
  assert.equal(flags.find((f) => f.id.startsWith("pair")).severity, "critical"); // 4 jobs, all 5★
  assert.equal(flags.find((f) => f.id.startsWith("refunds")).severity, "warning"); // 2 in 30 days
  assert.equal(flags[0].severity, "critical");
  assert.equal(flags.find((f) => f.id.startsWith("self")).id, "self:p1"); // one flag per person, not per count

  // Providers tagged "test" (staff test accounts) are left out with their bookings.
  const quiet = w.fraud({ providers, bookings, refundClaims: [], ignore: new Set(["p1", "p2"]), now: NOW });
  assert.deepEqual(quiet.map((f) => f.id.split(":")[0]), ["cancels"]);
});
