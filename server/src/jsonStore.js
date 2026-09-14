const fs = require("fs");
const path = require("path");

// Small admin-managed config (banners, offers) that doesn't warrant a full
// Postgres table — stored as flat JSON files instead. DATA_DIR should point
// at a host-mounted directory in production so this survives redeploys (the
// container filesystem itself is recreated fresh on every deploy); it
// defaults to a folder inside the repo for local dev.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readAll(name) {
  try {
    const raw = fs.readFileSync(filePath(name), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

function writeAll(name, records) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(records, null, 2));
}

function insert(name, record) {
  const records = readAll(name);
  const withId = { id: record.id || cryptoRandomId(), ...record };
  records.push(withId);
  writeAll(name, records);
  return withId;
}

function update(name, id, patch) {
  const records = readAll(name);
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  records[idx] = { ...records[idx], ...patch };
  writeAll(name, records);
  return records[idx];
}

function remove(name, id) {
  const records = readAll(name);
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false;
  writeAll(name, next);
  return true;
}

function cryptoRandomId() {
  return require("crypto").randomBytes(12).toString("hex");
}

module.exports = { readAll, writeAll, insert, update, remove };
