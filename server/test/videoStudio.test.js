const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-studio-"));
const studio = require("../src/videoStudio");
const tts = require("../src/socialTts");
const agents = require("../src/agents");

const SCRIPT = {
  title: "Sofa tired before winter guests?",
  caption: "Winter guests are coming — get your sofa deep-cleaned by a verified Tikdum professional. Book on tikdum.com or the Tikdum app. #Jammu",
  threads: "Sofa ready for guests?",
  scenes: [
    { video: "A family looks at a stained beige sofa in a bright Jammu living room, slow push-in.", line: "Sardi aa rahi hai, sofa thaka hua lag raha hai?" },
    { video: "A Tikdum technician steam-cleans the sofa carefully, close-up of the nozzle lifting dirt.", line: "Tikdum ke verified pro, steam se gehri safai." },
    { video: "The family sits on the fresh sofa with guests, smiling, warm evening light.", line: "Book karo tikdum.com par ya Tikdum app se." },
  ],
};

function deps(over = {}) {
  const made = [];
  return {
    made,
    categories: [{ id: "home-cleaning", name: "Home Cleaning" }],
    imageStyle: { colourFor: () => ({ hex: "#2F80ED", name: "fresh blue" }) },
    aiVideo: { makeClip: async (x) => (made.push(x), Buffer.from("clip")) },
    tts: { speak: async () => Buffer.from("wav") },
    cards: { subtitlePng: async () => Buffer.from("s"), logoPng: async () => Buffer.from("l"), reelTitleOverlay: async () => Buffer.from("t"), wideTitleOverlay: async () => Buffer.from("t"), reelCta: async () => Buffer.from("c"), wideCta: async () => Buffer.from("c") },
    video: { compose: async (parts) => ((deps.lastParts = parts), { file: "/x/v.mp4", name: "a".repeat(32) + ".mp4", seconds: 30.2 }), thumbnail: async (f, out) => out },
    publicBase: "https://api.tikdum.com",
    dir: os.tmpdir(),
    ...over,
  };
}

test("jobs and scripts: scene counts, lines in Latin letters, queued once the script is in", () => {
  assert.throws(() => studio.addJob({ idea: "hi" }), /Describe/);
  const job = studio.addJob({ idea: "Sofa cleaning before winter guests", category: "Home Cleaning" }, "Owner");
  assert.equal(job.status, "script");
  assert.equal(job.length, "story");
  assert.equal(job.voice, "hinglish");
  assert.equal(job.estimateInr, studio.estimate("story"));
  assert.throws(() => studio.setScript(job.id, { ...SCRIPT, scenes: SCRIPT.scenes.slice(0, 2) }), /3 scenes/);
  assert.throws(() => studio.setScript(job.id, { ...SCRIPT, scenes: SCRIPT.scenes.map((s) => ({ ...s, line: "" })) }), /voice \/ subtitle line/);
  assert.throws(() => studio.setScript(job.id, { ...SCRIPT, scenes: SCRIPT.scenes.map((s) => ({ ...s, line: "सर्दी आ रही है" })) }), /Latin letters/);
  const ready = studio.setScript(job.id, SCRIPT, "Video Studio Agent [AI agent]");
  assert.equal(ready.status, "queued");
  assert.equal(ready.script.scenes.length, 3);
  const short = studio.addJob({ idea: "Quick AC tip", length: "short", aspect: "wide", voice: "none", subtitles: false });
  assert.equal(studio.setScript(short.id, { ...SCRIPT, scenes: [{ video: SCRIPT.scenes[0].video }] }).script.scenes.length, 1); // no line needed without voice or subtitles
});

test("making: one at a time, every scene a clip, voice + subtitles, within the daily limit; failures kept", async () => {
  studio.setConfig({ perDay: 2, voiceGender: "male" }, "Owner");
  const d = deps();
  const first = await studio.makeNext(d);
  assert.equal(first.status, "ready");
  assert.equal(first.video.url, `https://api.tikdum.com/api/social-videos/${"a".repeat(32)}.mp4`);
  assert.equal(d.made.length, 3);
  assert.equal(d.made[0].wide, false);
  assert.equal(deps.lastParts.voices.length, 3);
  assert.equal(deps.lastParts.subtitles.length, 3);
  // The second (wide, no voice, no subtitles) uses today's second slot.
  const second = await studio.makeNext(d);
  assert.equal(second.status, "ready");
  assert.equal(d.made.at(-1).wide, true);
  assert.equal(deps.lastParts.voices.length, 0);
  // Limit reached: a third waits.
  const third = studio.addJob({ idea: "Pest control before the rains", length: "short" });
  studio.setScript(third.id, { ...SCRIPT, scenes: SCRIPT.scenes.slice(0, 1) });
  assert.equal(await studio.makeNext(d), null);
  assert.equal(studio.getJob(third.id).status, "queued");
  // Next day (limit raised here instead): a failing clip marks it failed with the reason.
  studio.setConfig({ perDay: 3 }, "Owner");
  const broken = deps({ aiVideo: { makeClip: async () => { throw new Error("Gemini video: Billing required"); } } });
  const out = await studio.makeNext(broken);
  assert.equal(out.status, "failed");
  assert.match(out.error, /Billing required/);
  // A voice line that fails doesn't stop the video.
  studio.remake(third.id, {}, "Owner");
  studio.setConfig({ perDay: 4 }, "Owner");
  const noVoice = await studio.makeNext(deps({ tts: { speak: async () => { throw new Error("tts down"); } } }));
  assert.equal(noVoice.status, "ready");
  assert.equal(noVoice.voiceMissing, true);
});

test("publish, remake with a new script, sets, and what agents may not do", async () => {
  const ready = studio.list({ status: "ready" })[0];
  let sent = null;
  const social = { publishVideo: async (x) => ((sent = x), { id: "post1" }) };
  const pub = await studio.publish(ready.id, { channels: ["instagram", "youtube"] }, "Owner", social);
  assert.equal(pub.status, "published");
  assert.equal(sent.name, ready.video.name);
  assert.equal(sent.caption, ready.script.caption);
  assert.deepEqual(sent.channels, ["instagram", "youtube"]);
  const again = studio.remake(ready.id, { newScript: true }, "Owner");
  assert.equal(again.status, "script");
  assert.equal(again.script, null);

  const cats = [{ id: "plumbing", name: "Plumbing", active: true }, { id: "x", name: "Old", active: false }];
  assert.equal(studio.addSet("categories", { categories: cats }, "Owner").length, 1);
  assert.equal(studio.addSet("categories", { categories: cats }, "Owner").length, 0); // not twice while open
  const fest = studio.addSet("festivals", { calendar: [{ name: "Diwali", date: "2026-11-08", ideas: "Deep cleaning" }], aspect: "wide" }, "Owner");
  assert.match(fest[0].idea, /Diwali/);
  assert.equal(fest[0].aspect, "wide");

  const admin = { agentId: "v1" };
  const p = (m, url) => agents.policy({ method: m, body: {} }, admin, url);
  assert.equal(p("POST", "/admin/video-studio/jobs"), null);
  assert.equal(p("PATCH", "/admin/video-studio/jobs/x/script"), null);
  assert.match(p("POST", "/admin/video-studio/jobs/x/publish").error, /Only a person/);
  assert.match(p("POST", "/admin/video-studio/sets").error, /Only a person/);
  assert.match(p("PATCH", "/admin/video-studio/config").error, /Only a person/);
  assert.match(p("DELETE", "/admin/video-studio/jobs/x").error, /Only a person/);
});

test("voice: reading the audio out of Gemini's answer, and the reading instruction", () => {
  assert.equal(tts.audioFrom({ steps: [{ type: "model_output", content: [{ type: "audio", data: "QUJD" }] }] }), "QUJD");
  assert.equal(tts.audioFrom({ steps: [] }), null);
  assert.match(tts.instruction("Book karo", "hinglish"), /Hinglish.*Book karo$/);
  assert.match(tts.instruction("Book now", "english"), /Indian English/);
});
