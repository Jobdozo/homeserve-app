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

module.exports = { backupHealth, databaseHealth, BACKUP_MAX_AGE_HOURS };
