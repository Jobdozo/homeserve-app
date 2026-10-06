// One JSON line per event so `docker compose logs agents` is greppable.
const write = (level, agent, msg, extra) =>
  console[level === "error" ? "error" : "log"](JSON.stringify({ t: new Date().toISOString(), level, agent, msg, ...(extra || {}) }));
module.exports = {
  info: (agent, msg, extra) => write("info", agent, msg, extra),
  warn: (agent, msg, extra) => write("warn", agent, msg, extra),
  error: (agent, msg, extra) => write("error", agent, msg, extra),
};
