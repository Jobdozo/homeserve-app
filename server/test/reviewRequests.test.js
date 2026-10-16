const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-reviews-"));
process.env.JWT_SECRET = "test-secret";
const jsonStore = require("../src/jsonStore");
const rr = require("../src/reviewRequests");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-17T10:00:00Z");
const done = (over = {}) => ({
  id: "b1", status: "Completed", reviewed: false, providerId: "p1", serviceId: "s1",
  statusHistory: { Completed: new Date(NOW - 3 * HOUR).toISOString() },
  customer: { name: "Rahul Kumar Sharma", phone: "+919811111111" }, service: { name: "AC Service" }, ...over,
});

test("rating links: only the booking they were made for, and can't be altered", () => {
  const token = rr.tokenFor("4f2a9c0d1e");
  assert.equal(rr.bookingIdFromToken(token), "4f2a9c0d1e");
  const [id, sig] = token.split(".");
  assert.equal(rr.bookingIdFromToken(`${Buffer.from("someone-else").toString("base64url")}.${sig}`), null, "another booking with this signature");
  assert.equal(rr.bookingIdFromToken(`${id}.${sig.slice(0, -1)}x`), null);
  assert.equal(rr.bookingIdFromToken("garbage"), null);
  assert.equal(rr.bookingIdFromToken(""), null);
});

test("a rating counts once, only for a completed job; links expire after 60 days", () => {
  assert.equal(rr.canReview(done(), NOW).ok, true);
  assert.equal(rr.canReview(done({ status: "Accepted" }), NOW).ok, false);
  const again = rr.canReview(done({ reviewed: true, review: { rating: 5 } }), NOW);
  assert.equal(again.ok, false);
  assert.equal(again.already, true);
  const old = done({ statusHistory: { Completed: new Date(NOW - 61 * DAY).toISOString() } });
  assert.equal(rr.canReview(old, NOW, { viaLink: true }).ok, false, "old link");
  assert.equal(rr.canReview(old, NOW).ok, true, "in the app it still works");
  assert.throws(() => rr.cleanReview({ rating: 6 }), /1 to 5/);
  assert.throws(() => rr.cleanReview({ rating: 2.5 }), /1 to 5/);
  assert.deepEqual(rr.cleanReview({ rating: "4", text: "  Good  " }), { rating: 4, text: "Good" });
});

test("WhatsApp requests: after the delay, within a week, never twice, only with a phone", () => {
  const list = [
    done({ id: "a" }),
    done({ id: "too-soon", statusHistory: { Completed: new Date(NOW - 1 * HOUR).toISOString() } }),
    done({ id: "too-old", statusHistory: { Completed: new Date(NOW - 8 * DAY).toISOString() } }),
    done({ id: "rated", reviewed: true }),
    done({ id: "sent" }),
    done({ id: "no-phone", customer: { name: "X" } }),
    done({ id: "open", status: "In Progress" }),
  ];
  assert.deepEqual(rr.dueForRequest(list, ["sent"], { delayHours: 2 }, NOW).map((b) => b.id), ["a"]);
  assert.deepEqual(rr.dueForRequest(list, [], { delayHours: 0 }, NOW).map((b) => b.id).sort(), ["a", "sent", "too-soon"]);
  const msg = rr.requestMessage({ ...done(), provider: { businessName: "Ravi Cooling" } });
  assert.match(msg, /^How was your AC Service with Ravi Cooling\? .*https:\/\/tikdum\.com\/rate\/[\w-]+\.[\w-]+ /);
});

test("public reviews: words only, newest first, first name and initial", () => {
  const list = rr.publicReviews([
    done({ id: "1", reviewed: true, review: { rating: 5, text: "Very good work" }, statusHistory: { Completed: "2026-10-10T00:00:00Z" } }),
    done({ id: "2", reviewed: true, review: { rating: 4, text: "" } }),
    done({ id: "3", reviewed: true, review: { rating: 3, text: "Late but ok" }, customer: { name: "Meena" }, statusHistory: { Completed: "2026-10-12T00:00:00Z" } }),
    done({ id: "4" }),
  ]);
  assert.deepEqual(list.map((r) => [r.bookingId, r.name]), [["3", "Meena"], ["1", "Rahul S."]]);
  assert.equal(rr.shortName(""), "A customer");
  assert.equal(rr.shortName("New Customer"), "A customer", "the placeholder name an account starts with");
  assert.equal(rr.firstNameOf("New Customer"), null);
  assert.equal(rr.firstNameOf("asha devi"), "asha");
});

test("the job sends each request once, and records a failed send so it isn't retried", async () => {
  const bookings = [done({ id: "x1" }), done({ id: "x2", customer: { name: "Asha Devi", phone: "+919822222222" } })];
  const store = {
    getSettings: () => ({ reviewRequestWhatsApp: true, reviewRequestDelayHours: 2 }),
    listBookings: async () => bookings,
    listProviders: async () => [{ id: "p1", name: "Ravi" }],
  };
  const sent = [];
  const whatsapp = async (phone, data) => {
    sent.push({ phone, ...data });
    return phone.endsWith("2222") ? { ok: false, error: "no template" } : { ok: true };
  };
  const r1 = await rr.runJob({ store, jsonStore, whatsapp, now: NOW });
  assert.equal(r1.sent, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].name, "Rahul");
  assert.match(sent[0].message, /with Ravi\?/);
  assert.equal(jsonStore.readAll("reviewRequests").find((r) => r.id === "x2").failed, "no template");
  await rr.runJob({ store, jsonStore, whatsapp, now: NOW + HOUR });
  assert.equal(sent.length, 2, "nothing is sent twice");
  const off = await rr.runJob({ store: { ...store, getSettings: () => ({ reviewRequestWhatsApp: false }) }, jsonStore, whatsapp, now: NOW });
  assert.equal(off.sent, 0);
});
