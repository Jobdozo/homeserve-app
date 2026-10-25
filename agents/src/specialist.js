// Specialist agents (Marketing, SEO, Business Analyst, Research & Product …).
// One generic worker; what each one does comes from its instructions, set in
// Admin -> AI Agents (defaults in server/src/agentCatalog.js).
//
// It only works on tasks assigned to it on the task board:
//   - "To do" task           -> drafts the deliverable, posts it on the task,
//                                and moves the task to Review;
//   - task sent back to "In progress" with a comment from a person
//                             -> revises the draft using that feedback.
// It never publishes, sends, or changes anything else; a person reviews every
// draft and marks the task done.
// The Marketing Agent (role template "marketing") also proposes Facebook/Instagram
// posts: on schedule and for tasks titled "Post: …" (socialPosts.js), and scheduled
// push notification campaigns for tasks titled "Push: …" (pushPlans.js). The SEO Agent (template
// "seo") writes tikdum.com blog articles twice a week and for tasks titled "Blog: …" (blogPosts.js).
// The Video Studio Agent (template "video") writes the scripts for Admin → Video Studio and turns
// tasks titled "Video: …" into videos (videoStudio.js).
const state = require("./state");
const { complete, untrusted, BudgetExceeded } = require("./claude");
const socialPosts = require("./socialPosts");
const pushPlans = require("./pushPlans");
const blogPosts = require("./blogPosts");
const videoStudio = require("./videoStudio");

const MAX_PER_RUN = 2;
// Room for the draft (~1,000 words) on top of Claude's thinking room (config.anthropic.thinkingRoom).
// At Haiku 5.5 prices a full-length draft costs well under a cent.
const MAX_ANSWER_TOKENS = 4000;

// Pure: which tasks need work now. Exported for tests.
function tasksToWork(tasks, failed = {}) {
  return (tasks || [])
    .filter((t) => {
      if (failed[t.id] && failed[t.id] === t.updatedAt) return false; // already failed on this version
      if (t.status === "open") return true;
      if (t.status !== "in_progress") return false;
      const last = (t.messages || []).filter((m) => m.from.type !== "system").pop();
      return Boolean(last && last.from.type === "person"); // feedback waiting
    })
    .slice(0, MAX_PER_RUN);
}

function promptFor(task, context) {
  const thread = (task.messages || []).filter((m) => m.from.type !== "system").map((m) => `${m.from.type === "agent" ? "You (earlier draft)" : m.from.name}: ${m.text}`).join("\n\n");
  return [
    untrusted("company_data", JSON.stringify(context || {})),
    untrusted("task", `Title: ${task.title}\nPriority: ${task.priority}\n\n${task.description || "(no description)"}`),
    thread ? `Conversation on this task so far (latest last):\n${untrusted("conversation", thread)}` : "",
    "Write the deliverable now. Start with a one-line summary, then the content. If feedback was given, revise accordingly and say what changed. Keep it practical and ready to use, and under about 1,000 words — if the task needs more, deliver the most important part and list what you'd cover next.",
  ].filter(Boolean).join("\n\n");
}

async function tick(client, log, name = "specialist", { now = Date.now() } = {}) {
  const office = await client.get("/agents/office");
  const st = state.load(`specialist-${name}`);
  st.failed = st.failed || {};
  // Which specialist this is, refreshed hourly (it can be changed in Admin).
  if (!st.templateAt || now - st.templateAt > 3600 * 1000) {
    st.template = (await client.get("/agents/self")).template || null;
    st.templateAt = now;
  }
  const marketing = st.template === "marketing";
  const posted = marketing ? await socialPosts.run(client, log, { st, office, now }) : 0;
  const pushed = marketing ? await pushPlans.run(client, log, { st, office, now }) : 0;
  const seo = st.template === "seo";
  const drafted = seo ? await blogPosts.run(client, log, { st, office, now }) : 0;
  const videoAgent = st.template === "video";
  const scripted = videoAgent ? await videoStudio.run(client, log, { st, office }) : 0;
  const mine = marketing
    ? office.tasks.filter((t) => !pushPlans.isPushTask(t) && !(st.socialConnected && socialPosts.isPostTask(t)))
    : seo
      ? office.tasks.filter((t) => !blogPosts.isBlogTask(t))
      : videoAgent
        ? office.tasks.filter((t) => !videoStudio.isVideoTask(t))
        : office.tasks;
  const work = tasksToWork(mine, st.failed);
  const proposals = [posted && `${posted} social post(s) ${st.socialMode || "proposed for approval"}`, pushed && `${pushed} push campaign(s) proposed for approval`, drafted && `${drafted} blog article(s) ${st.blogMode || "drafted for approval"}`, scripted && `${scripted} video script(s) written`];
  if (!work.length) {
    state.save(`specialist-${name}`, st);
    const parts = proposals.filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  const self = await client.get("/agents/self");
  if (self.kind !== "specialist") throw new Error("This agent isn't set as a Specialist (Admin → AI Agents → Edit → Type)");
  const system = self.instructions || "You are an AI specialist at Tikdum. Draft the requested deliverable for a person to review. Never publish or send anything.";
  let done = 0;
  for (const t of work) {
    try {
      if (t.status === "open") await client.post(`/agents/office/tasks/${encodeURIComponent(t.id)}/status`, { status: "in_progress" });
      const draft = (await complete(client, { system, prompt: promptFor(t, office.context), maxTokens: MAX_ANSWER_TOKENS })).slice(0, 7900);
      await client.post(`/agents/office/tasks/${encodeURIComponent(t.id)}/messages`, { text: draft });
      await client.post(`/agents/office/tasks/${encodeURIComponent(t.id)}/status`, { status: "review", result: draft });
      done++;
    } catch (e) {
      const budget = e instanceof BudgetExceeded;
      log.warn(name, "task failed", { taskId: t.id, error: e.message });
      st.failed[t.id] = t.updatedAt;
      await client.post(`/agents/office/tasks/${encodeURIComponent(t.id)}/messages`, {
        text: budget ? "I've used today's AI budget, so I'll pick this up again when you comment or move the task (or tomorrow if you raise my budget)." : `I couldn't finish this draft (${e.message.slice(0, 160)}). Comment on the task to make me try again.`,
      }).catch(() => null);
      if (budget) break;
    }
  }
  for (const [id] of Object.entries(st.failed)) if (!office.tasks.some((t) => t.id === id)) delete st.failed[id];
  state.save(`specialist-${name}`, st);
  const parts = [done && `${done} task(s) drafted and sent for review`, ...proposals].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

module.exports = { tick, tasksToWork, promptFor };
