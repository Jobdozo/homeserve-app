// Scheduled push notification campaigns: a set of messages sent to all customers at
// fixed times (IST) over a number of days, rotating through the messages. A person
// creates one — directly, or by approving a Marketing Agent proposal in Admin → AI
// Agents → Approvals — and the server sends each one on time (index.js runs tick()
// every minute). Each send is an ordinary announcement notification: it shows in the
// app's notification list and goes out as a phone/web push (store.addNotification).
//
// Rules that keep this from becoming spam:
//   - at most 4 sends a day, at least 2 hours apart, across ALL running campaigns;
//   - only between 09:00 and 20:30 IST;
//   - a send whose time passed more than 30 minutes ago (server down) is skipped,
//     never sent late at an odd hour.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");
const pushPictures = require("./pushPictures");

const COLL = "pushCampaigns";
const LIMITS = {
  maxMessages: 20,
  maxDays: 30,
  maxPerDay: 4,
  minGapMin: 120,
  firstMin: 9 * 60, // 09:00
  lastMin: 20 * 60 + 30, // 20:30
  titleMax: 65,
  messageMax: 240,
  nameMax: 80,
  lateMs: 30 * 60 * 1000,
};
const IST_MS = 5.5 * 3600 * 1000;
const istDate = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const atOf = (day, time) => Date.parse(`${day}T${time}:00+05:30`);
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

// Pure: checks a campaign request and works out every send. `others` = sends already
// scheduled by running campaigns, [{ at, campaignName }]. Throws a 400 explaining the
// first problem, so a person (or the agent) can fix it.
function plan(input, { now = Date.now(), others = [] } = {}) {
  const body = input && typeof input === "object" ? input : {};
  const name = clean(body.name, LIMITS.nameMax);
  if (!name) throw fail(400, "Give the campaign a name");
  if ((body.audience || "customers") !== "customers") throw fail(400, "Campaigns can only go to all customers for now");

  const raw = Array.isArray(body.messages) ? body.messages : [];
  if (!raw.length || raw.length > LIMITS.maxMessages) throw fail(400, `A campaign needs 1–${LIMITS.maxMessages} messages`);
  // image: an optional picture (pushPictures.js), shown as the big banner on phones.
  const messages = raw.map((m, i) => {
    let image;
    try {
      image = pushPictures.clean(m?.image);
    } catch (e) {
      throw fail(400, `Message ${i + 1}: ${e.message}`);
    }
    return { title: clean(m?.title, LIMITS.titleMax), message: clean(m?.message, LIMITS.messageMax), ...(image ? { image } : {}) };
  });
  const bad = messages.findIndex((m) => !m.title || !m.message);
  if (bad >= 0) throw fail(400, `Message ${bad + 1} needs a title and a message`);

  const times = [...new Set((Array.isArray(body.times) ? body.times : []).map(String))].sort();
  if (!times.length || times.length > LIMITS.maxPerDay) throw fail(400, `Pick 1–${LIMITS.maxPerDay} send times a day`);
  for (const t of times) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw fail(400, `"${t}" isn't a time like 09:00`);
    const m = minutesOf(t);
    if (m < LIMITS.firstMin || m > LIMITS.lastMin) throw fail(400, `${t} is outside sending hours (09:00–20:30)`);
  }
  for (let i = 1; i < times.length; i++) {
    if (minutesOf(times[i]) - minutesOf(times[i - 1]) < LIMITS.minGapMin) throw fail(400, `${times[i - 1]} and ${times[i]} are less than 2 hours apart`);
  }

  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > LIMITS.maxDays) throw fail(400, `Run for 1–${LIMITS.maxDays} days`);
  const today = istDate(now);
  const startDate = body.startDate ? String(body.startDate) : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < today || startDate > addDays(today, LIMITS.maxDays)) {
    throw fail(400, `Start date must be between ${today} and ${addDays(today, LIMITS.maxDays)}`);
  }

  // Every send, skipping times already (nearly) past on the first day.
  const sends = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(startDate, d);
    for (const time of times) {
      const at = atOf(day, time);
      if (at <= now + 5 * 60 * 1000) continue;
      const msg = messages[sends.length % messages.length];
      sends.push({ at: new Date(at).toISOString(), title: msg.title, message: msg.message, ...(msg.image ? { image: msg.image } : {}), status: "scheduled" });
    }
  }
  if (!sends.length) throw fail(400, "Every send time is already in the past — pick a later start date");

  // Together with what's already running: per day and gap limits.
  const all = [...others.map((o) => ({ at: Date.parse(o.at), who: o.campaignName })), ...sends.map((s) => ({ at: Date.parse(s.at), who: null }))].sort((a, b) => a.at - b.at);
  const perDay = {};
  for (let i = 0; i < all.length; i++) {
    const day = istDate(all[i].at);
    perDay[day] = (perDay[day] || 0) + 1;
    if (perDay[day] > LIMITS.maxPerDay) {
      const other = all.find((x) => x.who && istDate(x.at) === day);
      throw fail(400, `More than ${LIMITS.maxPerDay} notifications on ${day}${other ? ` (campaign "${other.who}" already sends that day)` : ""}`);
    }
    if (i && all[i].at - all[i - 1].at < LIMITS.minGapMin * 60000 && (all[i].who || all[i - 1].who)) {
      const who = all[i].who || all[i - 1].who;
      throw fail(400, `Clashes with campaign "${who}" around ${new Date(all[i].at + IST_MS).toISOString().slice(0, 16).replace("T", " ")} IST — keep 2 hours between notifications`);
    }
  }
  return { name, audience: "customers", messages, times, days, startDate, sends };
}

const scheduledOf = (rows) =>
  rows.filter((c) => c.status === "active").flatMap((c) => c.sends.filter((s) => s.status === "scheduled").map((s) => ({ at: s.at, campaignName: c.name })));

function create(input, actor, now = Date.now()) {
  const p = plan(input, { now, others: scheduledOf(jsonStore.readAll(COLL)) });
  return jsonStore.insert(COLL, {
    id: `pc_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    ...p,
    status: "active",
    createdAt: new Date(now).toISOString(),
    createdBy: actor,
  });
}

function list(limit = 30) {
  return jsonStore
    .readAll(COLL)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

function cancel(id, actor) {
  const c = jsonStore.readAll(COLL).find((x) => x.id === id);
  if (!c) throw fail(404, "Campaign not found");
  if (c.status !== "active") return c;
  const sends = c.sends.map((s) => (s.status === "scheduled" ? { ...s, status: "cancelled" } : s));
  return jsonStore.update(COLL, id, { status: "cancelled", sends, cancelledAt: new Date().toISOString(), cancelledBy: actor });
}

// Pure: what to do now. Returns [{ campaignId, index, action: "send" | "skip" }].
function due(rows, now = Date.now()) {
  const out = [];
  for (const c of rows) {
    if (c.status !== "active") continue;
    c.sends.forEach((s, index) => {
      if (s.status !== "scheduled" || Date.parse(s.at) > now) return;
      out.push({ campaignId: c.id, index, action: now - Date.parse(s.at) > LIMITS.lateMs ? "skip" : "send" });
    });
  }
  return out;
}

let running = false;
// Called every minute. sendToAll(title, message, image) -> number of customers reached.
async function tick(sendToAll, { now = Date.now(), log = console } = {}) {
  if (running) return [];
  running = true;
  const done = [];
  try {
    for (const job of due(jsonStore.readAll(COLL), now)) {
      const c = jsonStore.readAll(COLL).find((x) => x.id === job.campaignId);
      const s = c?.sends[job.index];
      if (!s || s.status !== "scheduled") continue;
      const mark = (patch) => {
        const sends = c.sends.map((x, i) => (i === job.index ? { ...x, ...patch } : x));
        const finished = sends.every((x) => x.status !== "scheduled");
        jsonStore.update(COLL, c.id, { sends, ...(finished ? { status: "finished" } : {}) });
        c.sends = sends;
      };
      if (job.action === "skip") {
        mark({ status: "skipped", note: "the server was down at send time" });
        done.push({ campaign: c.name, title: s.title, skipped: true });
        continue;
      }
      mark({ status: "sending" }); // so an overlapping tick can't send it twice
      try {
        const reached = await sendToAll(s.title, s.message, s.image || null);
        mark({ status: "sent", sentAt: new Date().toISOString(), reached });
        done.push({ campaign: c.name, title: s.title, reached });
      } catch (e) {
        mark({ status: "failed", error: String(e.message || e).slice(0, 200) });
        log.error?.(`push campaign "${c.name}" send failed:`, e.message);
      }
    }
  } finally {
    running = false;
  }
  return done;
}

module.exports = { plan, create, list, cancel, due, tick, LIMITS };
