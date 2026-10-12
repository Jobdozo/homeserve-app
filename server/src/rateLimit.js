// Request limits per signed-in account (or per network address when signed out),
// so one script or stuck client can't flood the API for everyone. In memory on
// purpose, like otpGuard: it only has to remember the last few minutes, and a
// restart resetting it is harmless. The numbers are far above what a person in
// the apps does; they exist to stop floods, not normal use.
const auth = require("./auth");
const { clientIp } = require("./otpGuard");

const MINUTE = 60 * 1000;

// Fixed windows: a key's count resets when its window ends. Cheap and good enough here.
function createLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map(); // key -> { start, count }
  return {
    // { ok, remaining, retryAfterSec }
    take(key) {
      const t = now();
      let h = hits.get(key);
      if (!h || t - h.start >= windowMs) {
        h = { start: t, count: 0 };
        hits.set(key, h);
      }
      h.count += 1;
      if (h.count > max) return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((h.start + windowMs - t) / 1000)) };
      return { ok: true, remaining: max - h.count };
    },
    prune() {
      const t = now();
      for (const [k, h] of hits) if (t - h.start >= windowMs) hits.delete(k);
    },
    size: () => hits.size,
  };
}

// Who is asking: the account behind a valid token, else the client's address.
function whoIs(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const user = token ? auth.verifyToken(token) : null;
  if (user) return { key: `${user.role}:${user.id}${user.staffId ? `:${user.staffId}` : ""}`, role: user.role };
  return { key: `ip:${clientIp(req) || req.socket?.remoteAddress || "unknown"}`, role: null };
}

// Per role, per minute. Admin screens load many lists at once, so they get more room.
const LIMITS = {
  read: { admin: 1200, signedIn: 300, anonymous: 600 },
  write: { admin: 300, signedIn: 60, anonymous: 60 },
};
const ORDERS_PER_10_MIN = 10;
const UPLOADS_PER_10_MIN = 30;

const limiters = {
  readAdmin: createLimiter({ windowMs: MINUTE, max: LIMITS.read.admin }),
  read: createLimiter({ windowMs: MINUTE, max: LIMITS.read.signedIn }),
  readAnon: createLimiter({ windowMs: MINUTE, max: LIMITS.read.anonymous }),
  writeAdmin: createLimiter({ windowMs: MINUTE, max: LIMITS.write.admin }),
  write: createLimiter({ windowMs: MINUTE, max: LIMITS.write.signedIn }),
  writeAnon: createLimiter({ windowMs: MINUTE, max: LIMITS.write.anonymous }),
  orders: createLimiter({ windowMs: 10 * MINUTE, max: ORDERS_PER_10_MIN }),
  uploads: createLimiter({ windowMs: 10 * MINUTE, max: UPLOADS_PER_10_MIN }),
};
setInterval(() => {
  Object.values(limiters).forEach((l) => l.prune());
  if (blocked.size > 10000) blocked.clear();
}, 5 * MINUTE).unref();

const blocked = new Map(); // key -> count of refused requests, for the health page
function refuse(res, key, result, what) {
  blocked.set(key, (blocked.get(key) || 0) + 1);
  res.set("Retry-After", String(result.retryAfterSec));
  res.status(429).json({ error: `Too many ${what} — please wait ${result.retryAfterSec} seconds and try again.`, retryAfterSec: result.retryAfterSec });
}

// The middleware for everything under /api.
function apiLimits(req, res, next) {
  if (req.path === "/health") return next();
  const who = whoIs(req);
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const tier = who.role === "admin" ? "Admin" : who.role ? "" : "Anon";
  const general = limiters[`${isWrite ? "write" : "read"}${tier}`].take(who.key);
  if (!general.ok) return refuse(res, who.key, general, "requests");
  if (isWrite && req.method === "POST" && req.path === "/orders") {
    const r = limiters.orders.take(who.key);
    if (!r.ok) return refuse(res, who.key, r, "bookings in a few minutes");
  }
  if (isWrite && String(req.headers["content-type"] || "").startsWith("multipart/form-data")) {
    const r = limiters.uploads.take(who.key);
    if (!r.ok) return refuse(res, who.key, r, "uploads");
  }
  next();
}

// How many requests were turned away, and by how many sources (no ids).
function stats() {
  let total = 0;
  for (const n of blocked.values()) total += n;
  return { refused: total, sources: blocked.size };
}

module.exports = { createLimiter, apiLimits, whoIs, stats, LIMITS, ORDERS_PER_10_MIN, UPLOADS_PER_10_MIN };
