// Limits for "send me a login code" requests. Every request costs a WhatsApp
// message and lands on someone's phone, so without limits anyone can spam any
// number (or run up the bill). In memory on purpose: it only has to hold the
// recent past, and a restart resetting it is harmless.
const PHONE_COOLDOWN_MS = 60 * 1000;
const PHONE_PER_HOUR = 5;
const PHONE_PER_DAY = 15;
const IP_WINDOW_MS = 10 * 60 * 1000;
// Mobile carriers put many people behind one address, so this is deliberately
// generous — it only has to stop one source hammering many numbers.
const IP_MAX_PER_WINDOW = 40;
const RECENT_MAX = 500;

const byPhone = new Map(); // digits -> [timestamps]
const byIp = new Map(); // ip -> [timestamps]
const recent = [];

const digits = (phone) => String(phone || "").replace(/\D/g, "");
// Limits are keyed on the last 10 digits so "9596618930", "+91 9596618930" and
// "91 95966 18930" all count as the same person.
const limitKey = (phone) => digits(phone).slice(-10);
const mask = (phone) => {
  const d = digits(phone);
  return d.length > 4 ? `${"*".repeat(d.length - 4)}${d.slice(-4)}` : d;
};

function prune(map, key, keepMs, now) {
  const arr = (map.get(key) || []).filter((t) => now - t < keepMs);
  if (arr.length) map.set(key, arr);
  else map.delete(key);
  return arr;
}

const secs = (ms) => Math.max(1, Math.ceil(ms / 1000));
const waitText = (ms) => (ms >= 90 * 1000 ? `${Math.ceil(ms / 60000)} minutes` : `${secs(ms)} seconds`);

// The address the request really came from: the last entry of
// X-Forwarded-For is the one our own reverse proxy appended (earlier entries
// can be forged by the client). Null when there's no proxy header, in which
// case the per-network limit is simply skipped rather than lumping everyone together.
function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return xff.length ? xff[xff.length - 1] : null;
}

function check(phone, ip, now = Date.now()) {
  const key = limitKey(phone);
  const times = prune(byPhone, key, 24 * 60 * 60 * 1000, now);

  const last = times[times.length - 1];
  if (last && now - last < PHONE_COOLDOWN_MS) {
    const wait = PHONE_COOLDOWN_MS - (now - last);
    return { ok: false, retryAfterSec: secs(wait), error: `A code was just sent. Please wait ${waitText(wait)} before asking for another.` };
  }
  const lastHour = times.filter((t) => now - t < 60 * 60 * 1000);
  if (lastHour.length >= PHONE_PER_HOUR) {
    const wait = 60 * 60 * 1000 - (now - lastHour[0]);
    return { ok: false, retryAfterSec: secs(wait), error: `Too many codes requested for this number. Please try again in ${waitText(wait)}.` };
  }
  if (times.length >= PHONE_PER_DAY) {
    const wait = 24 * 60 * 60 * 1000 - (now - times[0]);
    return { ok: false, retryAfterSec: secs(wait), error: "Too many codes requested for this number today. Please try again tomorrow." };
  }
  if (ip) {
    const ipTimes = prune(byIp, ip, IP_WINDOW_MS, now);
    if (ipTimes.length >= IP_MAX_PER_WINDOW) {
      const wait = IP_WINDOW_MS - (now - ipTimes[0]);
      return { ok: false, retryAfterSec: secs(wait), error: `Too many requests from this network. Please try again in ${waitText(wait)}.` };
    }
  }
  return { ok: true };
}

// Counts an allowed request against the limits.
function record(phone, ip, now = Date.now()) {
  const key = limitKey(phone);
  byPhone.set(key, [...(byPhone.get(key) || []), now]);
  if (ip) byIp.set(ip, [...(byIp.get(ip) || []), now]);
}

// What happened to a request, for the admin view and the server log.
function log({ phone, role, ip, result }) {
  const entry = { at: new Date().toISOString(), phone: mask(phone), role, ip: ip || null, result };
  recent.push(entry);
  if (recent.length > RECENT_MAX) recent.shift();
  console.log(`[otp] ${entry.result} role=${role} phone=${entry.phone} ip=${entry.ip || "?"}`);
}

const recentRequests = () => [...recent].reverse();

setInterval(() => {
  const now = Date.now();
  for (const k of [...byPhone.keys()]) prune(byPhone, k, 24 * 60 * 60 * 1000, now);
  for (const k of [...byIp.keys()]) prune(byIp, k, IP_WINDOW_MS, now);
}, 10 * 60 * 1000).unref();

module.exports = { check, record, log, clientIp, recentRequests };
