const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-provadmin-"));
process.env.JWT_SECRET = "test-secret";
const pa = require("../src/providerAdmin");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-11T12:00:00Z");

test("documents: the newest of each type decides; required ones must be approved and not expired", () => {
  const docs = [
    { id: "1", docType: "id_proof", uploadedAt: "2026-10-01", status: "rejected" },
    { id: "2", docType: "id_proof", uploadedAt: "2026-10-05", status: "approved", expiresAt: "2027-01-01" },
    { id: "3", docType: "address_proof", uploadedAt: "2026-10-05" },
    { id: "4", docType: "pan_card", uploadedAt: "2026-10-05", status: "approved", expiresAt: "2026-10-01" },
  ];
  const k = pa.kycStatus(docs, ["id_proof", "address_proof"], NOW);
  const by = Object.fromEntries(k.types.map((t) => [t.type, t.status]));
  assert.equal(by.id_proof, "approved", "a newer approved upload replaces the rejected one");
  assert.equal(by.address_proof, "waiting");
  assert.equal(by.pan_card, "expired");
  assert.equal(by.bank_details, "missing");
  assert.equal(k.complete, false);
  assert.deepEqual(k.missing, ["Address proof"]);
  assert.equal(k.waiting, 1);
  assert.equal(pa.kycStatus([{ docType: "id_proof", uploadedAt: "x", status: "approved" }], ["id_proof"], NOW).complete, true);
});

test("expiry reminders go out at 30 days, 7 days and on expiry — once each", () => {
  const doc = (days, remindedStage) => ({ status: "approved", expiresAt: new Date(NOW + days * DAY).toISOString(), remindedStage });
  assert.equal(pa.expiryReminderStage(doc(45), NOW), null);
  assert.equal(pa.expiryReminderStage(doc(20), NOW), "30");
  assert.equal(pa.expiryReminderStage(doc(20, "30"), NOW), null, "already reminded at this stage");
  assert.equal(pa.expiryReminderStage(doc(5, "30"), NOW), "7");
  assert.equal(pa.expiryReminderStage(doc(-1, "7"), NOW), "expired");
  assert.equal(pa.expiryReminderStage({ status: "waiting", expiresAt: doc(5).expiresAt }, NOW), null);
});

test("performance: acceptance counts declines and time-outs; response time and monthly earnings", () => {
  const b = (status, extra = {}) => ({ status, amount: 500, createdAt: "2026-10-01T10:00:00Z", statusHistory: { Pending: "2026-10-01T10:00:00Z", ...(status !== "Pending" && status !== "Cancelled" ? { Accepted: "2026-10-01T10:04:00Z" } : {}), ...extra }, ...(extra.review ? { review: extra.review } : {}) });
  const bookings = [
    b("Completed", { Completed: "2026-10-02T10:00:00Z" }),
    b("Completed", { Completed: "2026-09-15T10:00:00Z" }),
    b("Accepted"),
    b("Cancelled"),
    b("Pending"),
  ];
  bookings[0].review = { rating: 5 };
  bookings[1].review = { rating: 3 };
  const perf = pa.computePerformance({ bookings, declines: [{ kind: "declined" }, { kind: "timeout" }], complaints: [{ status: "open" }, { status: "resolved" }], now: NOW });
  assert.equal(perf.completed, 2);
  assert.equal(perf.acceptanceRate, 60, "3 accepted of 5 asked (3 + 1 declined + 1 timed out)");
  assert.equal(perf.avgResponseSeconds, 240);
  assert.equal(perf.completionRate, 67);
  assert.equal(perf.complaints, 2);
  assert.equal(perf.openComplaints, 1);
  const oct = perf.earningsByMonth.find((m) => m.month === "2026-10");
  assert.deepEqual(oct, { month: "2026-10", jobs: 1, amount: 500 });
  assert.equal(perf.ratingByMonth.find((m) => m.month === "2026-09").average, 3);
  assert.equal(perf.earningsByMonth.length, 6);
});

test("requests left with the provider as Rejected (never accepted) count as declines, once", () => {
  const bookings = [
    { id: "x", status: "Rejected", statusHistory: { Pending: "2026-10-01T10:00:00Z", Rejected: "2026-10-01T10:02:00Z" } },
    { id: "y", status: "Rejected", statusHistory: { Pending: "2026-10-01T10:00:00Z", Rejected: "2026-10-01T10:02:00Z" } },
    { id: "z", status: "Cancelled", statusHistory: { Pending: "2026-10-01T10:00:00Z", Accepted: "2026-10-01T10:00:04Z" } },
  ];
  const perf = pa.computePerformance({ bookings, declines: [{ bookingId: "y", kind: "timeout" }], now: NOW });
  assert.equal(perf.declined, 1, "x is an older decline; y is already recorded as a time-out");
  assert.equal(perf.timedOut, 1);
  assert.equal(perf.acceptanceRate, 33);
  assert.equal(perf.avgResponseSeconds, 4);
});

test("prices scale by a percentage; a wallet is low at 20% of the last recharge or empty", () => {
  assert.equal(pa.scalePrice(499, 10), 549);
  assert.equal(pa.scalePrice(1000, -15), 850);
  assert.equal(pa.walletLow({ balance: 0, recharges: [] }), true);
  assert.equal(pa.walletLow({ balance: 150, recharges: [{ amount: 1000 }] }), true);
  assert.equal(pa.walletLow({ balance: 500, recharges: [{ amount: 1000 }] }), false);
});

test("provider search matches phone digits in any format, and filters combine", () => {
  const rows = [
    { id: "a", name: "Zipcon", phone: "+91 98765 43210", category: "Home Cleaning", verificationStatus: "approved", walletBalance: 0, walletLow: true, docsWaiting: 0, kycComplete: true, tags: ["Top rated"], rating: 4.8, reviews: 5, lastSeenAt: new Date(NOW - DAY).toISOString(), pincodes: ["110001"] },
    { id: "b", name: "Sparkle", phone: "+91 70000 11111", category: "Home Cleaning", verificationStatus: "pending", walletBalance: 900, walletLow: false, docsWaiting: 2, kycComplete: false, tags: [], rating: 3.2, reviews: 4, lastSeenAt: null, pincodes: ["1800"] },
  ];
  const ids = (f) => pa.filterProviders(rows, f, NOW).map((p) => p.id);
  assert.deepEqual(ids({ q: "9876543210" }), ["a"]);
  assert.deepEqual(ids({ q: "+91 98765 43210" }), ["a"]);
  assert.deepEqual(ids({ q: "919876543210" }), ["a"]);
  assert.deepEqual(ids({ q: "sparkle" }), ["b"]);
  assert.deepEqual(ids({ q: "top rated" }), ["a"], "tags are searchable");
  assert.deepEqual(ids({ status: "pending" }), ["b"]);
  assert.deepEqual(ids({ docs: "waiting" }), ["b"]);
  assert.deepEqual(ids({ wallet: "low" }), ["a"]);
  assert.deepEqual(ids({ inactiveDays: 14 }), ["b"]);
  assert.deepEqual(ids({ maxRating: 4 }), ["b"]);
  assert.deepEqual(ids({ pin: "180012" }), ["b"], "a PIN prefix the provider covers");
  assert.deepEqual(ids({ tag: "Top rated" }), ["a"]);
  assert.deepEqual(ids({ sort: "wallet" }), ["a", "b"]);
});

test("alerts: expired documents, empty wallets, inactivity and a falling rating", () => {
  const providers = [
    { id: "a", name: "A", verificationStatus: "approved", walletBalance: 0, walletLow: true, docsWaiting: 0, lastSeenAt: new Date(NOW - 20 * DAY).toISOString() },
    { id: "b", name: "B", verificationStatus: "approved", walletBalance: 900, walletLow: false, docsWaiting: 1, lastSeenAt: new Date(NOW).toISOString() },
    { id: "c", name: "C", verificationStatus: "pending", walletBalance: 0, walletLow: true, docsWaiting: 0, lastSeenAt: null },
  ];
  const docs = [{ providerId: "b", docType: "id_proof", status: "approved", expiresAt: new Date(NOW - DAY).toISOString() }];
  const ratings = new Map([["b", { recentCount: 3, recentAvg: 3.9, previousCount: 4, previousAvg: 4.6 }]]);
  const list = pa.computeAlerts({ providers, docs, ratingsByProvider: ratings, now: NOW });
  const has = (id, type) => list.some((x) => x.providerId === id && x.type === type);
  assert.ok(has("a", "wallet_empty"));
  assert.ok(has("a", "inactive"));
  assert.ok(has("b", "document_expired"));
  assert.ok(has("b", "documents_waiting"));
  assert.ok(has("b", "rating_drop"));
  assert.ok(!has("c", "wallet_empty"), "a provider not yet approved isn't flagged for wallet or inactivity");
  assert.equal(list[0].severity, "high", "the most serious first");
});

test("rating windows compare the last 30 days with the 60 before", () => {
  const b = (days, rating) => ({ providerId: "p", review: { rating }, statusHistory: { Completed: new Date(NOW - days * DAY).toISOString() } });
  const r = pa.ratingWindows([b(2, 3), b(10, 4), b(40, 5), b(70, 5), b(200, 1)], NOW).get("p");
  assert.equal(r.recentCount, 2);
  assert.equal(r.recentAvg, 3.5);
  assert.equal(r.previousCount, 2);
  assert.equal(r.previousAvg, 5);
});

test("notes and tags", () => {
  const n = pa.addNote("p1", "  Called — will recharge Monday ", "admin");
  assert.equal(pa.listNotes("p1")[0].text, "Called — will recharge Monday");
  assert.throws(() => pa.addNote("p1", "   "), (e) => e.status === 400);
  pa.deleteNote("p1", n.id);
  assert.equal(pa.listNotes("p1").length, 0);
  assert.deepEqual(pa.setTags("p1", ["Top rated", " top  rated ", "", "Often late"], "admin"), ["Top rated", "Often late"], "the same tag in other capitals is dropped");
  assert.deepEqual(pa.getTags("p1"), ["Top rated", "Often late"]);
  assert.ok(pa.allTags().includes("Often late"));
});
