const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-crm-"));
process.env.JWT_SECRET = "test-secret";
process.env.ADMIN_PHONES = "+919000000001";
const jsonStore = require("../src/jsonStore");
const store = require("../src/store");
const crm = require("../src/providerCrm");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-16T06:30:00Z"); // 12:00 noon in India
const OWNER = "admin:+919000000001";

// The CRM only reads providers, services and settings from the store; these stand in for the database.
let providers = [];
let services = [];
store.listProviders = async () => providers;
store.listServices = async () => services;
store.getProvider = async (id) => providers.find((p) => p.id === id) || null;
store.listBookings = async () => [];
store.getSettings = () => ({ kycRequiredDocs: ["id_proof"] });
store.listKycDocuments = (id) => jsonStore.readAll("kycDocuments").filter((d) => d.providerId === id);
store.listAdminChanges = () => [];

const reset = () => {
  for (const c of ["crmLeads", "crmProviders", "crmTasks", "crmActivity", "crmSettings", "crmDigests", "kycDocuments"]) {
    for (const r of jsonStore.readAll(c)) jsonStore.remove(c, r.id);
  }
  providers = [];
  services = [];
};
beforeEach(reset);

const provider = (over = {}) => ({
  id: "p1", name: "Ravi", businessName: "Ravi Electric", phone: "+919876543210", category: "Electrician",
  verificationStatus: "pending", live: true, joinedAt: new Date(NOW - 10 * DAY).toISOString(),
  agreementAccepted: false, coverage: { pincodes: [], serveAllAreas: false }, photoUrl: null, ...over,
});

test("stage follows the account: documents → review → onboarding → active; rejected is lost; a hold wins", () => {
  const kyc = (status) => ({ complete: status === "approved", missing: status === "approved" ? [] : ["ID proof"], types: [{ type: "id_proof", required: true, status }] });
  const p = provider();
  assert.equal(crm.providerStage(p, { kyc: kyc("missing") }), "documents");
  assert.equal(crm.providerStage(p, { kyc: kyc("rejected") }), "documents");
  assert.equal(crm.providerStage(p, { kyc: kyc("waiting") }), "review", "everything uploaded → it's our turn to review");
  const approved = provider({ verificationStatus: "approved" });
  const half = crm.checklist(approved, { kyc: kyc("approved"), activeServices: 0 });
  assert.equal(crm.providerStage(approved, { kyc: kyc("approved"), list: half }), "onboarding");
  const ready = provider({ verificationStatus: "approved", agreementAccepted: true, coverage: { pincodes: ["180001"] }, photoUrl: "/x.webp" });
  const full = crm.checklist(ready, { kyc: kyc("approved"), activeServices: 3, completedJobs: 0 });
  assert.equal(full.complete, true);
  assert.equal(full.firstJob, false, "the first job is shown but not required");
  assert.equal(crm.providerStage(ready, { kyc: kyc("approved"), list: full }), "active");
  assert.equal(crm.providerStage(provider({ verificationStatus: "rejected" }), { kyc: kyc("missing") }), "lost");
  assert.equal(crm.providerStage(ready, { kyc: kyc("approved"), list: full, hold: "at_risk" }), "at_risk");
  assert.deepEqual(half.missing, ["Agreement accepted", "Services and prices added", "Areas (PIN codes) set", "Profile photo"]);
});

test("follow-ups are overdue / today / upcoming by the India calendar day", () => {
  const at = (iso) => ({ status: "open", dueAt: iso });
  assert.equal(crm.bucketOf(at("2026-10-16T05:00:00Z"), NOW), "overdue", "earlier today and already past");
  assert.equal(crm.bucketOf(at("2026-10-16T12:00:00Z"), NOW), "today", "17:30 India time today");
  assert.equal(crm.bucketOf(at("2026-10-16T19:00:00Z"), NOW), "upcoming", "00:30 India time tomorrow");
  assert.equal(crm.bucketOf(at("2026-10-15T18:00:00Z"), NOW), "overdue", "23:30 India time yesterday");
  assert.equal(crm.bucketOf({ status: "done", dueAt: "2026-10-16T12:00:00Z" }, NOW), "done");
});

test("automatic follow-ups: welcome once, then one at a time, never on hold", () => {
  const card = { type: "provider", subject: "provider:p1", stage: "documents", joinedAt: new Date(NOW - 2 * DAY).toISOString(), missing: ["ID proof"] };
  const first = crm.autoTaskFor(card, [], NOW);
  assert.equal(first.auto, "welcome");
  const open = [{ subject: "provider:p1", auto: "welcome", status: "open", createdAt: new Date(NOW).toISOString() }];
  assert.equal(crm.autoTaskFor(card, open, NOW), null, "nothing new while one is open");
  const done = [{ ...open[0], status: "done" }];
  const second = crm.autoTaskFor(card, done, NOW);
  assert.equal(second.auto, "documents");
  assert.match(second.title, /ID proof/);
  const docsDone = [...done, { subject: "provider:p1", auto: "documents", status: "done", createdAt: new Date(NOW - DAY).toISOString() }];
  assert.equal(crm.autoTaskFor(card, docsDone, NOW), null, "not again within 3 days");
  assert.equal(crm.autoTaskFor(card, docsDone, NOW + 3 * DAY).auto, "documents", "again after 3 days if still stuck");
  assert.equal(crm.autoTaskFor({ ...card, stage: "at_risk" }, [], NOW), null);
  assert.equal(crm.autoTaskFor({ ...card, type: "lead", subject: "lead:x" }, [], NOW), null, "leads get follow-ups from people, not automatically");
  const review = crm.autoTaskFor({ ...card, stage: "review", joinedAt: new Date(NOW - 9 * DAY).toISOString() }, [], NOW);
  assert.equal(review.auto, "review");
});

test("leads: duplicates by phone are refused, imports skip them, contacts move the lead forward", async () => {
  providers = [provider()];
  await assert.rejects(crm.createLead({ name: "Ravi again", phone: "98765 43210" }, "me"), (e) => e.status === 409 && e.existing.type === "provider");
  const lead = await crm.createLead({ name: "Sunil", phone: "9123456780", category: "Plumber", source: "Field visit", note: "Met at market" }, "me");
  assert.equal(lead.phone, "+919123456780");
  assert.equal(lead.stage, "lead");
  await assert.rejects(crm.createLead({ name: "Sunil 2", phone: "+91 91234 56780" }, "me"), (e) => e.status === 409 && e.existing.type === "lead");

  const result = await crm.importLeads(
    [
      { name: "Amit", phone: "9000011111" },
      { name: "Amit twice", phone: "+919000011111" },
      { name: "Ravi", phone: "9876543210" },
      { name: "", phone: "9000022222" },
      { name: "Short", phone: "12345" },
    ],
    { source: "News / advert" },
    "me"
  );
  assert.equal(result.added, 1);
  assert.deepEqual(result.skipped.map((s) => s.row), [2, 3, 4, 5]);
  assert.match(result.skipped[1].reason, /provider/);

  crm.logContact({ subject: `lead:${lead.id}`, kind: "call", outcome: "Not reachable" }, "me");
  assert.equal(jsonStore.readAll("crmLeads").find((l) => l.id === lead.id).stage, "contacted");
  const { nextTask } = crm.logContact({ subject: `lead:${lead.id}`, kind: "call", outcome: "Interested", next: { title: "Send joining link", dueAt: new Date(NOW + DAY).toISOString() } }, "me");
  assert.equal(jsonStore.readAll("crmLeads").find((l) => l.id === lead.id).stage, "interested");
  assert.equal(nextTask.title, "Send joining link");
  assert.throws(() => crm.updateLead(lead.id, { stage: "active" }, "me"), /Lead, Contacted, Interested or Lost/);
  assert.throws(() => crm.updateProvider("p1", { hold: "onboarding" }, "me"), /At risk, Inactive or Lost/);
});

test("a lead who signs up becomes that provider, bringing owner, calls and follow-ups", async () => {
  const lead = await crm.createLead({ name: "Sunil", phone: "9123456780", source: "Referral", ownerId: OWNER }, "me");
  crm.logContact({ subject: `lead:${lead.id}`, kind: "call", outcome: "Interested", next: { title: "Check sign-up", dueAt: new Date(NOW + HOUR).toISOString() } }, "me");
  providers = [provider({ id: "p9", phone: "+91 91234 56780", name: "Sunil" })];
  const board = await crm.pipeline({}, NOW);
  assert.ok(!board.cards.some((c) => c.subject === `lead:${lead.id}`), "the lead card is replaced by the provider");
  const card = board.cards.find((c) => c.subject === "provider:p9");
  assert.equal(card.ownerId, OWNER);
  assert.equal(card.source, "Referral");
  assert.equal(card.openTasks, 1);
  assert.ok(jsonStore.readAll("crmActivity").filter((a) => a.subject === "provider:p9").length >= 2);
  const d = await crm.detail(`lead:${lead.id}`, NOW);
  assert.equal(d.card.subject, "provider:p9", "opening the old lead opens the provider");
});

test("the minute job creates automatic follow-ups, rings once when due, and sends one morning digest", async () => {
  providers = [provider({ joinedAt: new Date(NOW - 5 * DAY).toISOString() })];
  crm.updateSettings({ defaultOwnerId: OWNER, digestHourIst: 12 });
  const pushes = [];
  const messages = [];
  const notify = async (to, data) => pushes.push({ to, ...data });
  const whatsapp = async (phone, data) => messages.push({ phone, ...data });

  const r1 = await crm.runJobs({ now: NOW, notify, whatsapp });
  assert.equal(r1.created, 1);
  const task = jsonStore.readAll("crmTasks")[0];
  assert.equal(task.auto, "documents");
  assert.equal(task.assigneeId, OWNER, "goes to the default owner");
  assert.equal(Date.parse(task.dueAt), NOW + 2 * HOUR, "automatic follow-ups give the team two hours");
  assert.equal(pushes.length, 0, "not due yet");
  assert.equal(messages.length, 1, "noon is the digest hour here");
  assert.match(messages[0].message, /1 follow-up due today/);

  const r2 = await crm.runJobs({ now: NOW + 2 * HOUR + 1000, notify, whatsapp });
  assert.equal(r2.created, 0);
  assert.equal(pushes.length, 1, "due → one push");
  assert.equal(pushes[0].to, OWNER);
  assert.equal(messages.length, 1, "one digest a day");
  await crm.runJobs({ now: NOW + 2 * HOUR + 61 * 1000, notify, whatsapp });
  assert.equal(pushes.length, 1, "no second push for the same follow-up");

  crm.updateTask(task.id, { dueAt: new Date(NOW + 4 * HOUR).toISOString() }, "me");
  await crm.runJobs({ now: NOW + 4 * HOUR + 1000, notify, whatsapp });
  assert.equal(pushes.length, 2, "a new due time gets its own reminder");
  assert.equal(crm.summary(OWNER, NOW + 4 * HOUR + 1000).mineDue, 1);
});
