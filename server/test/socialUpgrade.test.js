const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-social2-"));
const social = require("../src/social");
const cal = require("../src/marketingCalendar");
const cards = require("../src/socialCards");

const NOW = Date.parse("2026-10-24T06:00:00Z"); // 24 Oct 2026, 11:30 IST

test("cleanPost: single, carousel and story formats", () => {
  const base = { caption: "Hello Jammu!", imageUrl: "https://tikdum.com/category-photos/ac-repair.jpg" };
  assert.equal(social.cleanPost(base).format, "single");
  const c = social.cleanPost({ ...base, format: "carousel", title: "  5 signs  your AC needs service ", slides: [{ title: "Warm air", text: "x" }, { title: "Noise" }, { title: "" }], colour: { hex: "#6EC1E4", name: "ice blue" } });
  assert.equal(c.title, "5 signs your AC needs service");
  assert.equal(c.slides.length, 2);
  assert.deepEqual(c.colour, { hex: "#6EC1E4", name: "ice blue" });
  assert.throws(() => social.cleanPost({ ...base, format: "carousel", title: "T", slides: [{ title: "one" }] }), /at least 2 points/);
  assert.throws(() => social.cleanPost({ ...base, format: "carousel", slides: [{ title: "a" }, { title: "b" }] }), /title/);
  const s = social.cleanPost({ imageUrl: base.imageUrl, format: "story", storyLine: "AC ready for summer?" });
  assert.equal(s.caption, "");
  assert.throws(() => social.cleanPost({ imageUrl: base.imageUrl, format: "story" }), /one short line/);
  assert.throws(() => social.cleanPost({ imageUrl: base.imageUrl }), /caption/);
  assert.equal(social.cleanPost({ ...base, colour: { hex: "red" } }).colour, null);
});

test("score: comments and shares count for more than likes", () => {
  assert.equal(social.score({ facebook: { reactions: 10, comments: 2, shares: 1 }, instagram: { likes: 5, comments: 1, saved: 2 } }), 10 + 5 + 3 * 3 + 4 + 4);
  assert.equal(social.score({}), 0);
});

test("calendar: starting list once, next dates for yearly events, what's coming up and the season", () => {
  const all = cal.list(NOW);
  assert.ok(all.length > 20);
  const diwali = all.find((e) => e.name === "Diwali" && e.date === "2026-11-08");
  assert.deepEqual(diwali.next, { date: "2026-11-08", daysAway: 15 });
  assert.deepEqual(cal.nextOccurrence({ yearly: "01-13" }, NOW), { date: "2027-01-13", daysAway: 81 });
  assert.deepEqual(cal.nextOccurrence({ yearly: "10-24" }, NOW), { date: "2026-10-24", daysAway: 0 });

  // Diwali's lead time is 10 days: not yet on 24 Oct, yes on 29 Oct (10 days before).
  assert.equal(cal.upcoming(all, NOW).events.some((e) => e.name === "Diwali"), false);
  const soon = cal.upcoming(all, Date.parse("2026-10-29T06:00:00Z"));
  assert.ok(soon.events.some((e) => e.name === "Diwali" && e.daysAway === 10));
  assert.deepEqual(cal.upcoming(all, NOW).seasons.map((s) => s.name), ["Festive autumn"]);
  assert.deepEqual(cal.upcoming(all, Date.parse("2026-12-10T06:00:00Z")).seasons.map((s) => s.name).sort(), ["Wedding season", "Winter"]);
  // Eid's date depends on the moon: marked to confirm.
  assert.equal(all.find((e) => e.name === "Eid al-Fitr").confirm, true);

  const row = cal.add({ name: "Tikdum birthday", yearly: "12-01", ideas: "Thank-you post", leadDays: 3 }, "Owner");
  assert.equal(row.leadDays, 3);
  const switched = cal.edit(row.id, { date: "2026-12-01", yearly: null }, "Owner");
  assert.equal(switched.date, "2026-12-01");
  assert.equal(switched.yearly, null);
  assert.throws(() => cal.add({ name: "Bad", date: "1 Dec" }), /valid date/);
  assert.throws(() => cal.add({ name: "No date" }), /Pick a date/);
  assert.throws(() => cal.add({ kind: "season", name: "No months", months: [] }), /months/);
  const season = cal.add({ kind: "season", name: "Exams", months: [3, 2, 2, 13] });
  assert.deepEqual(season.months, [2, 3]);
  assert.ok(cal.remove(season.id));
  assert.equal(cal.list(NOW).length, all.length + 1); // not seeded again
});

test("cards: slides are 1080×1080 and Stories 1080×1920", { skip: !hasSharp() }, async () => {
  const sharp = require("sharp");
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#88aacc" } }).jpeg().toBuffer();
  const colour = { hex: "#6EC1E4", name: "ice blue" };
  const size = async (buf) => {
    const m = await sharp(buf).metadata();
    return `${m.width}x${m.height}`;
  };
  assert.equal(await size(await cards.coverSlide(photo, "5 signs your AC needs service & a check <now>", colour)), "1080x1080");
  assert.equal(await size(await cards.textSlide({ title: "Warm air", text: "Dirty filters", n: 2, total: 5, colour })), "1080x1080");
  assert.equal(await size(await cards.ctaSlide(null)), "1080x1080");
  assert.equal(await size(await cards.storyImage(photo, "AC ready for summer?", colour)), "1080x1920");
  assert.equal(cards.deep("#6EC1E4"), "#2e5160");
  assert.equal(cards.deep("nope"), "#2A1A7A");
});

function hasSharp() {
  try {
    require("sharp");
    return true;
  } catch {
    return false;
  }
}
