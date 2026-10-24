// The Marketing Agent's calendar (Admin -> Social Media -> Calendar): festivals and days to post
// about, and the seasons of the year in Jammu & Kashmir with the services people need then. The
// agent plans special posts a few days before each event (leadDays) and keeps to the season's
// ideas; it may only name a festival that is in this calendar, so a wrong date is fixed here.
//
//   event   one date ("2026-11-08"), or every year on the same day (yearly: "01-13")
//   season  months of the year ([12, 1, 2]) with the services that fit
// Moon-sighting festivals (Eid) are marked `confirm`: check the date nearer the time.
const crypto = require("crypto");
const jsonStore = require("./jsonStore");

const COLL = "marketingCalendar";
const META = "marketingCalendarMeta";
const DAY = 24 * 60 * 60 * 1000;
const fail = (status, message) => Object.assign(new Error(message), { status });
const istToday = (now) => new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
const isMonthDay = (s) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s || ""));

// Dates checked against published 2026–27 festival calendars on 24 Oct 2026.
const SEED = [
  { name: "Dhanteras", date: "2026-11-06", ideas: "Appliance repair and buying-season checks, kitchen chimney and gas stove service." },
  { name: "Diwali", date: "2026-11-08", leadDays: 10, ideas: "Diwali deep cleaning, painting and touch-ups, electrician for festive lights, carpentry and sofa cleaning." },
  { name: "Bhai Dooj", date: "2026-11-11", ideas: "Salon at home for the family get-together." },
  { name: "Guru Nanak Jayanti", date: "2026-11-24", ideas: "Home cleaning before guests; greetings to the community." },
  { name: "Maha Shivratri", date: "2027-03-06", ideas: "Home cleaning before puja; greetings." },
  { name: "Eid al-Fitr", date: "2027-03-10", confirm: true, ideas: "Deep cleaning and salon at home before Eid; greetings." },
  { name: "Holi", date: "2027-03-22", ideas: "After-Holi deep cleaning, sofa and carpet cleaning, salon (skin and hair care after colours)." },
  { name: "Baisakhi", date: "2027-04-14", ideas: "Spring cleaning, AC service before summer; greetings." },
  { name: "Ram Navami", date: "2027-04-15", ideas: "Home cleaning before puja; greetings." },
  { name: "Eid al-Adha", date: "2027-05-17", confirm: true, ideas: "Deep cleaning, kitchen and bathroom cleaning; greetings." },
  { name: "Raksha Bandhan", date: "2027-08-17", ideas: "Salon at home; gift a home service to a sibling." },
  { name: "Janmashtami", date: "2027-08-25", ideas: "Home cleaning and decoration lights; greetings." },
  { name: "Diwali", date: "2027-10-29", leadDays: 10, ideas: "Diwali deep cleaning, painting, electrician for festive lights." },
  { name: "Guru Nanak Jayanti", date: "2027-11-14", ideas: "Home cleaning before guests; greetings." },
  { name: "New Year", yearly: "01-01", leadDays: 5, ideas: "Fresh start: deep cleaning, home repairs you've been putting off." },
  { name: "Lohri", yearly: "01-13", ideas: "Electrician and heater checks for the bonfire night gathering; deep cleaning before guests." },
  { name: "Republic Day", yearly: "01-26", leadDays: 3, ideas: "Greetings; support local, verified professionals." },
  { name: "Independence Day", yearly: "08-15", leadDays: 3, ideas: "Greetings; support local, verified professionals." },
  { name: "Christmas", yearly: "12-25", ideas: "Deep cleaning and decoration lights; salon at home for parties." },
  { kind: "season", name: "Winter", months: [12, 1, 2], ideas: "Geyser and room heater repair, frozen or burst pipes (plumbing), electrical safety with heaters, chimney service." },
  { kind: "season", name: "Wedding season", months: [11, 12, 1, 2], ideas: "Salon, bridal and party makeup at home, home painting and deep cleaning before functions." },
  { kind: "season", name: "Spring", months: [3, 4], ideas: "AC service before summer, painting, deep cleaning after winter, early pest control." },
  { kind: "season", name: "Summer", months: [5, 6], ideas: "AC repair and service, RO water purifier service, water tank cleaning, fridge repair." },
  { kind: "season", name: "Monsoon", months: [7, 8, 9], ideas: "Waterproofing and seepage, pest control (mosquitoes, termites), electrical safety in the rain, appliance repair." },
  { kind: "season", name: "Festive autumn", months: [10, 11], ideas: "Festival deep cleaning, painting, electrician for lights, carpentry and sofa cleaning." },
];

function clean(input, old = {}) {
  const s = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const out = { ...old };
  out.kind = (input.kind ?? old.kind) === "season" ? "season" : "event";
  if ("name" in input || !old.name) out.name = s(input.name, 60);
  if (!out.name) throw fail(400, "Give it a name");
  if ("ideas" in input) out.ideas = s(input.ideas, 400);
  if ("confirm" in input) out.confirm = Boolean(input.confirm);
  if ("active" in input) out.active = input.active !== false;
  if (out.active === undefined) out.active = true;
  if (out.kind === "season") {
    if ("months" in input) out.months = [...new Set((Array.isArray(input.months) ? input.months : []).map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
    if (!out.months?.length) throw fail(400, "Pick the months of the season");
    out.date = null; // update() merges: clear, don't delete
    out.yearly = null;
  } else {
    if ("date" in input) out.date = input.date || null;
    if ("yearly" in input) out.yearly = input.yearly || null;
    if (out.date && !isDate(out.date)) throw fail(400, "Pick a valid date");
    if (out.yearly && !isMonthDay(out.yearly)) throw fail(400, "Every year needs a month and day like 01-13");
    if (!out.date && !out.yearly) throw fail(400, "Pick a date, or the day it falls on every year");
    if (out.date) out.yearly = null;
    if ("leadDays" in input) out.leadDays = Math.min(30, Math.max(1, Math.round(Number(input.leadDays)) || 7));
    out.leadDays = out.leadDays || 7;
    out.months = null;
  }
  return out;
}

function seedOnce() {
  if (jsonStore.readAll(META).some((r) => r.id === "seed")) return;
  const at = new Date().toISOString();
  SEED.forEach((row, i) => jsonStore.insert(COLL, { id: `cal_seed${i + 1}`, ...clean(row), createdAt: at, updatedBy: "Tikdum (starting calendar)" }));
  jsonStore.insert(META, { id: "seed", at });
}

// Pure: the next date an event happens on or after today (IST), and how many days away it is.
function nextOccurrence(e, now = Date.now()) {
  const today = istToday(now);
  let date = e.date || null;
  if (!date && e.yearly) {
    const year = Number(today.slice(0, 4));
    date = `${year}-${e.yearly}`;
    if (date < today) date = `${year + 1}-${e.yearly}`;
  }
  if (!date) return null;
  return { date, daysAway: Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) };
}

function list(now = Date.now()) {
  seedOnce();
  return jsonStore
    .readAll(COLL)
    .map((e) => ({ ...e, next: e.kind === "event" ? nextOccurrence(e, now) : null }))
    .sort((a, b) => (a.kind === b.kind ? (a.next?.date || "9").localeCompare(b.next?.date || "9") || a.name.localeCompare(b.name) : a.kind === "event" ? -1 : 1));
}

// Pure: what the agent should know about today — events within their lead time (not past) and
// the seasons of this month.
function upcoming(entries, now = Date.now()) {
  const month = Number(istToday(now).slice(5, 7));
  const events = entries
    .filter((e) => e.kind === "event" && e.active !== false)
    .map((e) => ({ e, next: nextOccurrence(e, now) }))
    .filter(({ e, next }) => next && next.daysAway >= 0 && next.daysAway <= (e.leadDays || 7))
    .map(({ e, next }) => ({ name: e.name, date: next.date, daysAway: next.daysAway, ideas: e.ideas || "", confirm: Boolean(e.confirm) }));
  const seasons = entries.filter((e) => e.kind === "season" && e.active !== false && (e.months || []).includes(month)).map((e) => ({ name: e.name, ideas: e.ideas || "" }));
  return { events, seasons };
}

function add(input, actor) {
  seedOnce();
  return jsonStore.insert(COLL, { id: `cal_${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`, ...clean(input), createdAt: new Date().toISOString(), updatedBy: actor || null });
}

function edit(id, input, actor) {
  const old = jsonStore.readAll(COLL).find((r) => r.id === id);
  if (!old) throw fail(404, "Not in the calendar");
  return jsonStore.update(COLL, id, { ...clean(input, old), updatedAt: new Date().toISOString(), updatedBy: actor || null });
}

function remove(id) {
  return jsonStore.remove(COLL, String(id));
}

module.exports = { list, upcoming, nextOccurrence, add, edit, remove };
