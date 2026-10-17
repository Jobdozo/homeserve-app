// What /api/health reports: the API answers, the database answers, and last
// night's backup (read from the status file deploy/backup-data.sh writes into
// the data folder). The outside uptime check (.github/workflows/uptime.yml)
// alerts on it. Nothing here names a customer, a file or a key.
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const BACKUP_STATUS_FILE = path.join(DATA_DIR, "backup-status.json");
// The backup runs every night at 02:30 UTC; a day and a half without one is overdue.
const BACKUP_MAX_AGE_HOURS = 30;

// { ok, state, at, ageHours, database, offsite } — state: ok | failed | overdue | unknown
function backupHealth({ file = BACKUP_STATUS_FILE, now = Date.now() } = {}) {
  let s;
  try {
    s = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { ok: false, state: "unknown", note: "No backup has reported yet" };
  }
  const at = Date.parse(s.at);
  const ageHours = Number.isFinite(at) ? Math.round(((now - at) / 3600000) * 10) / 10 : null;
  const failed = s.archive !== "ok" || s.offsite === "failed";
  const overdue = ageHours === null || ageHours > BACKUP_MAX_AGE_HOURS;
  return {
    ok: !failed && !overdue,
    state: failed ? "failed" : overdue ? "overdue" : "ok",
    at: s.at || null,
    ageHours,
    database: s.database || "unknown",
    offsite: s.offsite || "off",
    ...(s.note ? { note: String(s.note).slice(0, 200) } : {}),
  };
}

// Resolves "ok" or "error" within `ms`.
async function databaseHealth(check, ms = 8000) {
  try {
    await Promise.race([check(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
    return "ok";
  } catch {
    return "error";
  }
}

// ---- server load: the signal that scaling step 4 (more than one server) is due ----
// Measured over fixed 5-minute windows and the last finished one is reported, so a
// single slow request or a short burst never raises it. Node runs JavaScript on one
// processor core: sustained high CPU or a slow event loop means this one copy of the
// API is getting busy.
const { monitorEventLoopDelay } = require("perf_hooks");
const LOAD_WINDOW_MS = 5 * 60 * 1000;
const BUSY_CPU_PCT = 70;
const BUSY_LOOP_P99_MS = 200;

const judgeLoad = ({ cpuPct, loopP99Ms }) => cpuPct >= BUSY_CPU_PCT || loopP99Ms >= BUSY_LOOP_P99_MS;

let lastLoad = null;
let requests = 0;
function countRequest(req, res, next) {
  // The Network Bot asks /api/health every second; that isn't traffic.
  if (req.path !== "/health") requests += 1;
  next();
}

function startLoadMonitor() {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  let cpu = process.cpuUsage();
  let at = Date.now();
  setInterval(() => {
    const now = Date.now();
    const used = process.cpuUsage(cpu);
    const elapsedMs = now - at;
    const cpuPct = Math.round(((used.user + used.system) / 1000 / elapsedMs) * 100);
    const loopP99Ms = Math.round(loop.percentile(99) / 1e6);
    lastLoad = {
      windowMin: Math.round(elapsedMs / 60000),
      cpuPct,
      loopP99Ms,
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      requestsPerMin: Math.round((requests / elapsedMs) * 60000),
      busy: judgeLoad({ cpuPct, loopP99Ms }),
      at: new Date(now).toISOString(),
    };
    requests = 0;
    loop.reset();
    cpu = process.cpuUsage();
    at = now;
  }, LOAD_WINDOW_MS).unref();
}

// null until the first window has finished (5 minutes after a start).
const serverLoad = () => lastLoad;

module.exports = { backupHealth, databaseHealth, BACKUP_MAX_AGE_HOURS, judgeLoad, startLoadMonitor, serverLoad, countRequest, BUSY_CPU_PCT, BUSY_LOOP_P99_MS };
