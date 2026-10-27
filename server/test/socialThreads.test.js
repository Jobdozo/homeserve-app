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

test("AI video Reels: the prompt's rules, reading Gemini's answer, branding arguments, fallback to frames", async () => {
  const ai = require("../src/socialAiVideo");
  const video = require("../src/socialVideo");
  const p = ai.promptFor({ scene: "A technician deep-cleans a sofa ₹499", topic: "Sofa cleaning", category: "Home Cleaning" });
  assert.match(p, /9:16/);
  assert.match(p, /plain black polo/);
  assert.match(p, /no text, captions/);
  assert.doesNotMatch(p, /₹/);
  assert.match(ai.promptFor({ scene: "x", topic: "Full body waxing", category: "Salon" }), /No people and no body parts/);
  assert.deepEqual(ai.videoFrom({ steps: [{ type: "thought" }, { type: "model_output", content: [{ type: "text" }, { type: "video", uri: "https://g/files/abc" }] }] }), { data: null, uri: "https://g/files/abc" });
  assert.equal(ai.videoFrom({ steps: [] }), null);

  const withSound = video.brandArgs({ clip: "c.mp4", logo: "l.png", title: "t.png", cta: "e.jpg", out: "o.mp4", clipSeconds: 9, clipAudio: true });
  const f1 = withSound[withSound.indexOf("-filter_complex") + 1];
  assert.match(f1, /\[0:a\]aresample/);
  assert.match(f1, /enable='between\(t,0,3.5\)'/);
  assert.match(f1, /\[m\]\[a0\]\[e\]\[4:a\]concat=n=2:v=1:a=1\[v\]\[a\]/);
  const silent = video.brandArgs({ clip: "c.mp4", logo: "l.png", title: "t.png", cta: "e.jpg", out: "o.mp4", clipSeconds: 9, clipAudio: false });
  assert.match(silent[silent.indexOf("-filter_complex") + 1], /\[5:a\]anull\[a0\]/);
  assert.equal(silent.filter((a) => a.startsWith("anullsrc")).length, 2);

  // cleanPost keeps the scene only for Reels.
  const base = { caption: "x", imageUrl: "https://tikdum.com/a.jpg", title: "Title here", slides: [{ title: "a" }, { title: "b" }] };
  assert.equal(social.cleanPost({ ...base, format: "reel", videoScene: "A scene" }).videoScene, "A scene");
  assert.equal(social.cleanPost({ ...base, format: "carousel", videoScene: "A scene" }).videoScene, undefined);
});

test("publish: Meta's passing errors are tried again, but never the final publish (it could post twice)", async () => {
  process.env.THREADS_TOKEN = "t";
  process.env.THREADS_USER_ID = "123";
  process.env.THREADS_RETRY_MS = "1";
  const realFetch = global.fetch;
  const asked = [];
  let failCreate = 1;
  let failPublish = false;
  const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
  global.fetch = async (url, opts) => {
    const where = `${opts.method} ${new URL(url).pathname.replace(/^\/v[\d.]+/, "")}`;
    asked.push(where);
    if (where === "POST /123/threads") return failCreate-- > 0 ? reply(500, { error: { message: "An unknown error occurred", code: 1, is_transient: false } }) : reply(200, { id: "c1" });
    if (where === "GET /c1") return reply(200, { status: "FINISHED" });
    if (where === "POST /123/threads_publish") return failPublish ? reply(500, { error: { message: "An unknown error occurred", code: 1 } }) : reply(200, { id: "p1" });
    return reply(200, { permalink: "https://www.threads.com/@tikdum_com/post/x" });
  };
  try {
    const out = await threads.publish({ caption: "Hello #Jammu" }, [{ url: "https://api.tikdum.com/a.jpg" }]);
    assert.equal(out.id, "p1");
    assert.equal(asked.filter((a) => a === "POST /123/threads").length, 2); // failed once, then worked
    failPublish = true;
    asked.length = 0;
    await assert.rejects(threads.publish({ caption: "Hello" }, [{ url: "https://api.tikdum.com/a.jpg" }]), /unknown error/);
    assert.equal(asked.filter((a) => a === "POST /123/threads_publish").length, 1);
    failCreate = 5; // keeps failing: gives up after 3 tries
    asked.length = 0;
    await assert.rejects(threads.publish({ caption: "Hello" }, [{ url: "https://api.tikdum.com/a.jpg" }]), /unknown error/);
    assert.equal(asked.filter((a) => a === "POST /123/threads").length, 3);
  } finally {
    global.fetch = realFetch;
    delete process.env.THREADS_TOKEN;
    delete process.env.THREADS_USER_ID;
    delete process.env.THREADS_RETRY_MS;
  }
});

test("Reels a day (1–6): the server allows that many, and YouTube takes at most 6 uploads a Pacific day", async () => {
  const agents = require("../src/agents");
  const jsonStore = require("../src/jsonStore");
  const youtube = require("../src/socialYoutube");
  agents.setConfig({ socialAutoPost: true, socialReels: true, socialReelsPerDay: 9 }, "Owner");
  assert.equal(agents.getConfig().socialReelsPerDay, 6, "at most 6");
  const admin = { agentId: "mk" };
  const reelReq = { method: "POST", body: { format: "reel" } };
  for (const r of jsonStore.readAll("socialPosts")) jsonStore.remove("socialPosts", r.id);
  for (let i = 0; i < 6; i++) {
    assert.equal(agents.policy(reelReq, admin, "/admin/social/posts"), null, `Reel ${i + 1}`);
    jsonStore.insert("socialPosts", { by: "Marketing Agent [AI agent]", format: "reel", at: new Date().toISOString() });
  }
  assert.match(agents.policy(reelReq, admin, "/admin/social/posts").error, /Today's 6 Reels are done/);

  // YouTube: the 7th upload of the day is stopped before it reaches YouTube.
  process.env.YOUTUBE_CLIENT_ID = "id";
  process.env.YOUTUBE_CLIENT_SECRET = "secret";
  process.env.YOUTUBE_REFRESH_TOKEN = "refresh";
  for (let i = 0; i < youtube.UPLOADS_PER_DAY; i++) jsonStore.insert("youtubeUploads", { id: `v${i}`, day: youtube.pacificDay(), at: new Date().toISOString() });
  assert.equal(youtube.uploadsToday(), 6);
  const realFetch = global.fetch;
  let called = 0;
  global.fetch = async () => (called++, { ok: false, status: 500, json: async () => ({}) });
  try {
    await assert.rejects(youtube.publish({ title: "T", caption: "C" }, __filename), /6 uploads for today are used/);
    assert.equal(called, 0, "YouTube isn't asked at all");
  } finally {
    global.fetch = realFetch;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
    delete process.env.YOUTUBE_REFRESH_TOKEN;
  }
  assert.match(youtube.pacificDay(Date.parse("2026-10-27T06:30:00Z")), /^2026-10-26$/, "11:30 PM Pacific is still the 26th there");
  agents.setConfig({ socialReelsPerDay: 1 }, "Owner");
});
