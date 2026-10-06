// Tikdum AI agents worker. Runs each configured agent on its own schedule,
// talking to the Tikdum API with that agent's key. One failing agent never
// stops the others; every run reports a heartbeat (shown in Admin → AI Agents).
//
//   node src/index.js          run forever
//   node src/index.js --once   run every configured agent once now, then exit
require("./env");
const config = require("./config");
const log = require("./log");
const { TikdumClient, AgentSwitchedOff } = require("./tikdum");
const operations = require("./operations");
const reporting = require("./reporting");
const complaints = require("./complaints");
const support = require("./support");
const registration = require("./registration");
const verification = require("./verification");
const payments = require("./payments");

const AGENTS = [
  { name: "operations", key: config.operations.key, everyMs: config.operations.everyMs, run: (c, opts) => operations.tick(c, log, opts) },
  { name: "reporting", key: config.reporting.key, everyMs: config.reporting.checkEveryMs, run: (c, opts) => reporting.tick(c, log, opts) },
  { name: "complaints", key: config.complaints.key, everyMs: config.complaints.everyMs, run: (c) => complaints.tick(c, log) },
  { name: "support", key: config.support.key, everyMs: config.support.everyMs, run: (c) => support.tick(c, log) },
  { name: "registration", key: config.registration.key, everyMs: config.registration.everyMs, run: (c) => registration.tick(c, log) },
  { name: "verification", key: config.verification.key, everyMs: config.verification.everyMs, run: (c) => verification.tick(c, log) },
  { name: "payments", key: config.payments.key, everyMs: config.payments.everyMs, run: (c) => payments.tick(c, log) },
];

async function runOnce(agent, client, opts) {
  if (agent.busy) return; // previous run still going — skip, don't pile up
  agent.busy = true;
  const started = Date.now();
  try {
    const summary = await agent.run(client, opts);
    if (summary) log.info(agent.name, summary, { ms: Date.now() - started });
    await client.heartbeat("ok", summary || "idle");
  } catch (e) {
    if (e instanceof AgentSwitchedOff) {
      log.warn(agent.name, "switched off in Admin — waiting", { error: e.message });
    } else {
      log.error(agent.name, "run failed", { error: e.message });
      await client.heartbeat("error", e.message);
    }
  } finally {
    agent.busy = false;
  }
}

async function main() {
  const once = process.argv.includes("--once");
  const active = AGENTS.filter((a) => a.key);
  if (active.length === 0) {
    log.error("worker", "No agent keys set (AGENT_KEY_OPERATIONS / _REPORTING / _COMPLAINTS / _SUPPORT / _REGISTRATION / _VERIFICATION / _PAYMENTS). Create agents in Admin → AI Agents first.");
    process.exit(1);
  }
  for (const a of AGENTS.filter((x) => !x.key)) log.info("worker", `${a.name} agent not configured — skipped`);

  for (const agent of active) {
    const client = new TikdumClient(agent.name, agent.key);
    if (once) {
      await runOnce(agent, client, { force: true });
      continue;
    }
    // Stagger starts a little so agents don't all hit the API at once.
    setTimeout(() => {
      runOnce(agent, client);
      agent.timer = setInterval(() => runOnce(agent, client), agent.everyMs);
    }, 2000 + Math.random() * 3000);
    log.info(agent.name, "started", { everySec: agent.everyMs / 1000 });
  }
  if (once) return;

  const stop = (sig) => {
    log.info("worker", `received ${sig}, stopping`);
    for (const a of active) clearInterval(a.timer);
    // Give an in-flight run a moment to finish its current request.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

process.on("unhandledRejection", (e) => log.error("worker", "unhandled rejection", { error: String(e?.message || e) }));
main();
