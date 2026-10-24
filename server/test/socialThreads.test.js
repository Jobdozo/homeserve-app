const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-threads-"));
delete process.env.THREADS_TOKEN;
delete process.env.THREADS_USER_ID;
const threads = require("../src/socialThreads");
const social = require("../src/social");

test("threadsText: the post's own text, else the caption without hashtags (one tag kept), within 500", () => {
  assert.equal(threads.threadsText({ threadsText: "Short one #Jammu", caption: "x" }), "Short one #Jammu");
  const caption = "Is your geyser ready for winter? Here are three checks.\nBook on tikdum.com or the Tikdum app.\n#Tikdum #Jammu #GeyserRepair";
  assert.equal(threads.threadsText({ caption }), "Is your geyser ready for winter? Here are three checks.\nBook on tikdum.com or the Tikdum app.\n\n#Jammu");
  const long = `${"Winter mornings in Jammu need hot water. ".repeat(20)}#Jammu`;
  const t = threads.threadsText({ caption: long });
  assert.ok(t.length <= 500, `${t.length}`);
  assert.match(t, /\.\n\n#Jammu$/); // cut at a sentence
});

test("not configured without the token; Stories never go to Threads; Threads in the score", () => {
  assert.equal(threads.configured(), false);
  const s = social.cleanPost({ imageUrl: "https://tikdum.com/category-photos/plumbing.jpg", format: "story", storyLine: "Hi", channels: ["facebook", "threads"] });
  assert.deepEqual(s.channels, ["facebook"]);
  assert.throws(() => social.cleanPost({ imageUrl: "https://tikdum.com/x.jpg", format: "story", storyLine: "Hi", channels: ["threads"] }), /Facebook and Instagram/);
  assert.equal(social.cleanPost({ caption: "Hello", imageUrl: "https://tikdum.com/x.jpg", channels: ["threads"], threadsText: "Hi Threads" }).threadsText, "Hi Threads");
  assert.equal(social.score({ threads: { likes: 2, replies: 1, reposts: 1, quotes: 1 } }), 2 + 3 + 4 + 4);
});

test("renewIfDue: a new token starts the clock, then it's renewed after a week", async () => {
  process.env.THREADS_TOKEN = "env-token";
  process.env.THREADS_USER_ID = "123";
  const realFetch = global.fetch;
  let asked = 0;
  global.fetch = async () => (asked++, { ok: true, json: async () => ({ access_token: "renewed-token", expires_in: 5184000 }) });
  const t0 = Date.parse("2026-10-24T00:00:00Z");
  assert.equal(await threads.renewIfDue(t0), false); // just saved
  assert.equal(await threads.renewIfDue(t0 + 3 * 86400000), false); // too soon
  assert.equal(asked, 0);
  assert.equal(await threads.renewIfDue(t0 + 8 * 86400000), true);
  assert.equal(asked, 1);
  global.fetch = realFetch;
  // The script saving a new token in .env wins over the renewed one.
  process.env.THREADS_TOKEN = "newer-env-token";
  assert.equal(await threads.renewIfDue(t0 + 9 * 86400000), false);
  delete process.env.THREADS_TOKEN;
  delete process.env.THREADS_USER_ID;
});
