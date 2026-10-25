const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-agent-video-"));
process.env.ANTHROPIC_API_KEY = "test-key";
const specialist = require("../src/specialist");
const videoStudio = require("../src/videoStudio");
const silent = { info() {}, warn() {}, error() {} };

function fake(routes) {
  const calls = [];
  return {
    calls,
    async request(m, p, b) {
      calls.push([m, p, b]);
      const h = routes[`${m} ${p.split("?")[0]}`] ?? routes[`${m} ${p}`];
      if (h instanceof Error) throw h;
      return typeof h === "function" ? h(b, p) : h ?? {};
    },
    get(p) { return this.request("GET", p); },
    post(p, b) { return this.request("POST", p, b); },
    feed(x) { return this.post("/agents/feed", x); },
  };
}
const writes = (c, p) => c.calls.filter(([m, path]) => m !== "GET" && path === p);
const realFetch = global.fetch;

test("Video Studio Agent: writes the script for a waiting video, and turns a 'Video: …' task into one", async () => {
  let prompt = "";
  const script = { title: "AC ready for summer?", scenes: [{ video: "A family sweats in a hot Jammu room.", line: "Garmi aa gayi, AC thanda nahi?" }, { video: "A technician cleans the AC filter.", line: "Tikdum ke pro, poori servicing." }, { video: "The family relaxes in a cool room.", line: "Book karo tikdum.com par." }], caption: "AC ready? Book on tikdum.com or the Tikdum app. #Jammu", threads: "AC ready?" };
  global.fetch = async (url, opts) => ((prompt = JSON.parse(opts.body).messages[0].content), { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(script) }], usage: {}, stop_reason: "end_turn" }) });
  const task = { id: "t1", title: "Video: Diwali cleaning ad for YouTube", status: "open", updatedAt: "u1", messages: [] };
  const c = fake({
    "GET /agents/self": { kind: "specialist", template: "video", budgetRemainingUsd: 1, dailyBudgetUsd: 1 },
    "GET /agents/office": { tasks: [task] },
    "GET /admin/video-studio": [{ id: "vid_1", idea: "AC service before summer", length: "story", aspect: "upright", voice: "hinglish", status: "script", updatedAt: "x" }],
    "PATCH /admin/video-studio/jobs/vid_1/script": { status: "queued" },
    "POST /admin/video-studio/jobs": (b) => ({ id: "vid_2", ...b, estimateInr: 230 }),
  });
  const out = await specialist.tick(c, silent, "specialist-video", { now: Date.parse("2026-10-25T12:00:00+05:30") });
  global.fetch = realFetch;
  assert.match(out, /1 video script\(s\) written/);
  assert.match(prompt, /Make 3 scenes, upright 9:16/);
  assert.match(prompt, /Lines in Hinglish/);
  const [[, , sent]] = writes(c, "/admin/video-studio/jobs/vid_1/script");
  assert.equal(sent.title, "AC ready for summer?");
  const [[, , job]] = writes(c, "/admin/video-studio/jobs");
  assert.equal(job.aspect, "wide"); // "YouTube" in the task
  assert.equal(job.length, "story");
  assert.deepEqual(writes(c, "/agents/office/tasks/t1/status").map(([, , b]) => b.status), ["review"]);
  assert.equal(videoStudio.isVideoTask({ title: "Video - festival greeting" }), true);
});

test("Video Studio Agent: failed videos don't hold up the queue, and are tried again after 6 hours or a Remake", () => {
  const now = Date.parse("2026-10-25T16:00:00Z");
  // Newest first, as the server lists them.
  const waiting = ["v5", "v4", "v3", "v2", "v1"].map((id) => ({ id, updatedAt: `u-${id}` }));
  const ids = (failed, at = now) => videoStudio.jobsToScript(waiting, failed, at).map((j) => j.id);
  assert.deepEqual(ids({}), ["v1", "v2"]); // oldest first, two a run
  const failed = { v1: { v: "u-v1", at: now - 60000 }, v2: { v: "u-v2", at: now - 60000 } };
  assert.deepEqual(ids(failed), ["v3", "v4"]); // the two failures are skipped, not blocking
  assert.deepEqual(ids(failed, now + 6 * 3600 * 1000), ["v1", "v2"]); // tried again later
  assert.deepEqual(ids({ ...failed, v1: { v: "u-old", at: now } }), ["v1", "v3"]); // remade since
  assert.deepEqual(ids({ v1: "u-v1", v2: "u-v2" }), ["v1", "v2"]); // marks from the old version: retried
});
