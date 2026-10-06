// India time helpers. Booking slots are stored as date "YYYY-MM-DD" plus a
// time label like "10:00 AM – 12:00 PM", both in IST.
const IST_MS = 5.5 * 3600 * 1000;

const istDay = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const istHour = (ms = Date.now()) => new Date(ms + IST_MS).getUTCHours();
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Start of a booking's slot as epoch ms, or null if the label isn't a clock time.
function slotStartMs(date, timeLabel) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;
  const m = String(timeLabel || "").match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return Date.parse(`${date}T00:00:00Z`) + (h * 60 + min) * 60000 - IST_MS;
}

module.exports = { istDay, istHour, addDays, slotStartMs };
