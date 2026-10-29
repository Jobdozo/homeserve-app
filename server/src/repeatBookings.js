// Repeat bookings: the same customer booking the same service again soon after the first
// (a double tap, or not seeing the first booking go through). Used by POST /api/bookings
// and POST /api/orders:
//   - every line already booked in the last 2 minutes: a double tap. The earlier bookings
//     are returned and nothing new is made.
//   - any line booked in the last hour: the customer is asked first ("Book it again?"). A yes
//     (confirmRepeat) books it, marked as a possible duplicate for Admin and the provider,
//     and it isn't counted as a new booking for Meta ads.
// Cancelled and rejected bookings don't count, so re-booking after a cancel just works.
const DOUBLE_TAP_MS = 2 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const CLOSED = new Set(["Cancelled", "Rejected"]);

// "Sofa Cleaning (1 Seat) × 2" -> "sofa cleaning (1 seat)"; "Carpet Cleaning × 300 sq ft" -> "carpet cleaning"
const COUNT = /\s*×\s*\d+(\s*(sq ft|litres))?\s*$/;
const baseName = (name) => String(name || "").replace(COUNT, "").trim().toLowerCase();

// The same service, or the same-named service in the same category from another provider
// (a booking handed to another provider keeps the customer's service but not its id).
function sameService(line, b) {
  if (b.serviceId && b.serviceId === line.serviceId) return true;
  return Boolean(line.categoryId && line.name && b.service && b.service.categoryId === line.categoryId && baseName(b.service.name) === baseName(line.name));
}

// lines: [{ serviceId, name, categoryId }]; recent: the customer's bookings.
// Returns { matches: the newest earlier booking per line (or null), doubleTap }.
function find(lines, recent, now = Date.now()) {
  const age = (b) => now - Date.parse(b.createdAt);
  const live = (recent || [])
    .filter((b) => b && !CLOSED.has(b.status) && age(b) < WINDOW_MS)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const matches = lines.map((line) => live.find((b) => sameService(line, b)) || null);
  const doubleTap = matches.length > 0 && matches.every((m) => m && age(m) < DOUBLE_TAP_MS);
  return { matches, doubleTap };
}

const clock = (ms) => new Date(ms).toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const listOf = (names) => (names.length < 2 ? names[0] || "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

// What the customer is told. `question` is for the website's "Book again?" box; `error` stands
// on its own for an app that only shows the message (it can't send confirmRepeat).
function describe(matches) {
  const groups = new Map();
  for (const m of matches) {
    if (!m) continue;
    const key = m.ref || m.id;
    if (!groups.has(key)) groups.set(key, { ref: m.ref, at: Date.parse(m.createdAt), names: [] });
    const name = String(m.service?.name || "this service").replace(COUNT, "");
    if (!groups.get(key).names.includes(name)) groups.get(key).names.push(name);
  }
  const parts = [...groups.values()].map((g) => `${listOf(g.names)} at ${clock(g.at)}${g.ref ? ` (#${g.ref})` : ""}`);
  const already = `You already booked ${listOf(parts)}.`;
  const count = [...groups.values()].reduce((n, g) => n + g.names.length, 0);
  const latest = Math.max(...[...groups.values()].map((g) => g.at));
  return {
    question: `${already} Book ${count > 1 ? "them" : "it"} again?`,
    error: `${already} It's in My Bookings. To book ${count > 1 ? "them" : "it"} again, try after ${clock(latest + WINDOW_MS)} or contact Tikdum support.`,
  };
}

// Runs one booking request per customer at a time, so a double tap's second request sees
// the first one's bookings instead of racing it.
const queues = new Map();
function oneAtATime(key, fn) {
  const run = (queues.get(key) || Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return run;
}

module.exports = { find, describe, oneAtATime, sameService, DOUBLE_TAP_MS, WINDOW_MS };
