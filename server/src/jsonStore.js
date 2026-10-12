const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

// Small records that don't live in the main database (settings, wallets, coverage,
// offers, KYC metadata, staff, complaints …), grouped into named collections.
// They used to be one JSON file per collection, rewritten whole on every change;
// since scaling step 2 they live in one SQLite file, DATA_DIR/records.db, where a
// write changes one row and a crash can't leave half a file behind. The functions
// and what they return are unchanged, so callers didn't change.
//
// DATA_DIR is the host-mounted folder in production (it survives redeploys); it
// defaults to a folder inside the repo for local dev. A collection still in an old
// <name>.json file is copied in the first time it's used, and the file is renamed
// <name>.json.migrated (kept as a backup, never read again).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "records.db");

let db = null;
let stmt = null;
const migrated = new Set();

function open() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  // WAL: readers never wait for a writer, and a crash mid-write rolls back cleanly.
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS records (
      rid INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      id TEXT,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_by_id ON records (collection, id);
    CREATE TABLE IF NOT EXISTS migrated (collection TEXT PRIMARY KEY, at TEXT NOT NULL, rows INTEGER NOT NULL);
  `);
  stmt = {
    all: db.prepare("SELECT data FROM records WHERE collection = ? ORDER BY rid"),
    insert: db.prepare("INSERT INTO records (collection, id, data) VALUES (?, ?, ?)"),
    clear: db.prepare("DELETE FROM records WHERE collection = ?"),
    first: db.prepare("SELECT rid, data FROM records WHERE collection = ? AND id = ? ORDER BY rid LIMIT 1"),
    set: db.prepare("UPDATE records SET data = ? WHERE rid = ?"),
    remove: db.prepare("DELETE FROM records WHERE collection = ? AND id = ?"),
    wasMigrated: db.prepare("SELECT 1 FROM migrated WHERE collection = ?"),
    markMigrated: db.prepare("INSERT OR REPLACE INTO migrated (collection, at, rows) VALUES (?, ?, ?)"),
  };
  for (const row of db.prepare("SELECT collection FROM migrated").all()) migrated.add(row.collection);
  return db;
}

function inTransaction(fn) {
  open();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const idOf = (r) => (r && r.id !== undefined && r.id !== null ? String(r.id) : null);

// The first time a collection is touched: copy its old JSON file in, if there is one.
function ensureMigrated(name) {
  open();
  if (migrated.has(name)) return;
  const file = path.join(DATA_DIR, `${name}.json`);
  let records = null;
  try {
    records = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e; // a corrupt file must not be silently replaced
  }
  inTransaction(() => {
    if (stmt.wasMigrated.get(name)) return;
    if (Array.isArray(records)) for (const r of records) stmt.insert.run(name, idOf(r), JSON.stringify(r));
    stmt.markMigrated.run(name, new Date().toISOString(), Array.isArray(records) ? records.length : 0);
  });
  migrated.add(name);
  if (records) {
    try {
      fs.renameSync(file, `${file}.migrated`);
    } catch {
      // renaming is housekeeping; the migrated table already says it's done
    }
  }
}

function readAll(name) {
  ensureMigrated(name);
  return stmt.all.all(name).map((r) => JSON.parse(r.data));
}

function writeAll(name, records) {
  ensureMigrated(name);
  inTransaction(() => {
    stmt.clear.run(name);
    for (const r of records) stmt.insert.run(name, idOf(r), JSON.stringify(r));
  });
}

function insert(name, record) {
  ensureMigrated(name);
  const withId = { id: record.id || cryptoRandomId(), ...record };
  stmt.insert.run(name, idOf(withId), JSON.stringify(withId));
  return withId;
}

function update(name, id, patch) {
  ensureMigrated(name);
  return inTransaction(() => {
    const row = stmt.first.get(name, String(id));
    if (!row) return undefined;
    const next = { ...JSON.parse(row.data), ...patch };
    stmt.set.run(JSON.stringify(next), row.rid);
    return next;
  });
}

function remove(name, id) {
  ensureMigrated(name);
  return stmt.remove.run(name, String(id)).changes > 0;
}

function cryptoRandomId() {
  return crypto.randomBytes(12).toString("hex");
}

// A consistent copy of the whole store, for the nightly backup (taken while the
// server keeps running). Overwrites `dest`.
function snapshot(dest) {
  open();
  fs.rmSync(dest, { force: true });
  db.exec(`VACUUM INTO '${String(dest).replace(/'/g, "''")}'`);
  return dest;
}

// Row counts per collection, for the export manifest.
function counts() {
  open();
  return Object.fromEntries(
    db
      .prepare("SELECT collection, COUNT(*) n FROM records GROUP BY collection ORDER BY collection")
      .all()
      .map((r) => [r.collection, r.n])
  );
}

module.exports = { readAll, writeAll, insert, update, remove, snapshot, counts, DB_FILE };
