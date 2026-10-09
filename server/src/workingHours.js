// Weekly working hours for a provider. Optional: while "enabled" is off the
// provider is treated as available whenever their Receive Requests switch is
// on, exactly as before. Times are Indian Standard Time (the whole platform
// serves India), so the server's own timezone never matters.
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const IST_OFFSET_MIN = 330;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function defaultSchedule() {
  const days = {};
  for (const d of DAYS) days[d] = { open: d !== "sun", from: "09:00", to: "18:00" };
  return { enabled: false, days };
}

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

// Validates what a provider sent and returns the clean record to store.
function normalizeSchedule(input) {
  if (input === null) return null;
  if (!input || typeof input !== "object") throw Object.assign(new Error("Working hours are not valid"), { status: 400 });
  const out = { enabled: !!input.enabled, days: {} };
  for (const d of DAYS) {
    const row = input.days?.[d];
    if (!row || typeof row !== "object") throw Object.assign(new Error("Working hours need all seven days"), { status: 400 });
    const open = !!row.open;
    const from = String(row.from || "");
    const to = String(row.to || "");
    if (open) {
      if (!HHMM.test(from) || !HHMM.test(to)) throw Object.assign(new Error("Use times like 09:00 and 18:00"), { status: 400 });
      if (minutes(from) >= minutes(to)) throw Object.assign(new Error("Closing time must be after opening time"), { status: 400 });
    }
    out.days[d] = { open, from: HHMM.test(from) ? from : "09:00", to: HHMM.test(to) ? to : "18:00" };
  }
  return out;
}

// True when requests should be flowing at `at`: no schedule / not enabled, or
// the current IST day is open and the time falls inside its hours.
function isWithinSchedule(schedule, at = new Date()) {
  if (!schedule || !schedule.enabled) return true;
  const ist = new Date(at.getTime() + IST_OFFSET_MIN * 60000);
  const day = DAYS[(ist.getUTCDay() + 6) % 7]; // getUTCDay: 0 = Sunday
  const row = schedule.days?.[day];
  if (!row || !row.open) return false;
  const now = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return now >= minutes(row.from) && now < minutes(row.to);
}

module.exports = { DAYS, defaultSchedule, normalizeSchedule, isWithinSchedule };
