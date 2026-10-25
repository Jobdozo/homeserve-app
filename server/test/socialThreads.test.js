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

test("Reels: points required, YouTube only for Reels, video arguments, Short title, daily limit", () => {
  const video = require("../src/socialVideo");
  const youtube = require("../src/socialYoutube");
  const agents = require("../src/agents");
  const base = { caption: "Geyser care #Jammu #Geyser", imageUrl: "https://tikdum.com/category-photos/plumbing.jpg" };
  const r = social.cleanPost({ ...base, format: "reel", title: "Is your geyser ready?", slides: [{ title: "Slow heating" }, { title: "Leaks", text: "Fix early" }], channels: ["instagram", "youtube"] });
  assert.equal(r.format, "reel");
  assert.deepEqual(r.channels, ["instagram", "youtube"]);
  assert.throws(() => social.cleanPost({ ...base, format: "reel", title: "T", slides: [{ title: "one" }] }), /A Reel needs at least 2 points/);
  assert.deepEqual(social.cleanPost({ ...base, channels: ["facebook", "youtube"] }).channels, ["facebook"]); // a picture post doesn't go to YouTube
  assert.throws(() => social.cleanPost({ ...base, channels: ["youtube"] }), /Choose Facebook/);

  const args = video.reelArgs(["a.jpg", "b.jpg"], [3.5, 3], "out.mp4");
  const filter = args[args.indexOf("-filter_complex") + 1];
  assert.match(filter, /\[0:v\].*d=105:s=1080x1920.*\[v0\];\[1:v\].*d=90:/);
  assert.match(filter, /\[v0\]\[v1\]concat=n=2:v=1:a=0,format=yuv420p\[v\]$/);
  assert.equal(args[args.indexOf("-t") + 1], "6.5"); // the silent track is as long as the video
  assert.equal(args.at(-1), "out.mp4");

  const m = youtube.metadata({ title: "x".repeat(120), caption: "Hello #Jammu #GeyserRepair <b>" });
  assert.ok(m.title.length <= 100 && m.title.endsWith(" #Shorts"));
  assert.deepEqual(m.tags, ["Jammu", "GeyserRepair"]);
  assert.doesNotMatch(m.description, /</);
  assert.equal(youtube.configured(), false);

  agents.setConfig({ socialAutoPost: true, socialReels: true }, "Owner");
  const admin = { agentId: "mk" };
  const reelReq = { method: "POST", body: { format: "reel" } };
  assert.equal(agents.policy(reelReq, admin, "/admin/social/posts"), null);
  require("../src/jsonStore").insert("socialPosts", { by: "Marketing Agent [AI agent]", format: "reel", at: new Date().toISOString() });
  assert.match(agents.policy(reelReq, admin, "/admin/social/posts").error, /Today's Reel is done/);
  agents.setConfig({ socialReels: false }, "Owner");
  assert.match(agents.policy(reelReq, admin, "/admin/social/posts").error, /Reels are switched off/);
});
