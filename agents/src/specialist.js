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
const state = require("./state");
const { complete, untrusted, BudgetExceeded } = require("./claude");

const MAX_PER_RUN = 2;

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
    "Write the deliverable now. Start with a one-line summary, then the content. If feedback was given, revise accordingly and say what changed. Keep it practical and ready to use.",
  ].filter(Boolean).join("\n\n");
}

async function tick(client, log, name = "specialist") {
  const office = await client.get("/agents/office");
  const st = state.load(`specialist-${name}`);
  st.failed = st.failed || {};
  const work = tasksToWork(office.tasks, st.failed);
  if (!work.length) return null;
  const self = await client.get("/agents/self");
  if (self.kind !== "specialist") throw new Error("This agent isn't set as a Specialist (Admin → AI Agents → Edit → Type)");
  const system = self.instructions || "You are an AI specialist at Tikdum. Draft the requested deliverable for a person to review. Never publish or send anything.";
  let done = 0;
  for (const t of work) {
    try {
      if (t.status === "open") await client.post(`/agents/office/tasks/${encodeURIComponent(t.id)}/status`, { status: "in_progress" });
      const draft = (await complete(client, { system, prompt: promptFor(t, office.context), maxTokens: 1800 })).slice(0, 7900);
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
  return done ? `${done} task(s) drafted and sent for review` : null;
}

module.exports = { tick, tasksToWork, promptFor };
