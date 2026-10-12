// Run: npm test  (throwaway DATA_DIR)
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-store-"));
process.env.DATA_DIR = dir;
// Old-style files from before scaling step 2.
fs.writeFileSync(path.join(dir, "providerWallets.json"), JSON.stringify([{ id: "p1", balance: 500, recharges: [{ amount: 500 }] }, { id: "p2", balance: 0 }]));
fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify([{ platformFeePct: 10 }])); // a record with no id
fs.writeFileSync(path.join(dir, "backup-status.json"), JSON.stringify({ at: "x" })); // not a collection: never touched
const store = require("../src/jsonStore");

test("an old JSON file is copied in on first use, then renamed", () => {
  const wallets = store.readAll("providerWallets");
  assert.deepEqual(wallets.map((w) => w.id), ["p1", "p2"]);
  assert.equal(wallets[0].recharges[0].amount, 500);
  assert.equal(fs.existsSync(path.join(dir, "providerWallets.json")), false);
  assert.equal(fs.existsSync(path.join(dir, "providerWallets.json.migrated")), true);
  assert.deepEqual(store.readAll("settings"), [{ platformFeePct: 10 }]);
  assert.equal(fs.existsSync(path.join(dir, "backup-status.json")), true);
});

test("insert, update, remove behave as the file store did", () => {
  const a = store.insert("things", { name: "A" });
  assert.match(a.id, /^[0-9a-f]{24}$/);
  store.insert("things", { id: "b", name: "B" });
  assert.deepEqual(store.update("things", "b", { name: "B2", extra: 1 }), { id: "b", name: "B2", extra: 1 });
  assert.equal(store.update("things", "nope", { x: 1 }), undefined);
  assert.deepEqual(store.readAll("things").map((t) => t.name), ["A", "B2"]); // insertion order kept
  assert.equal(store.remove("things", "b"), true);
  assert.equal(store.remove("things", "b"), false);
  assert.deepEqual(store.readAll("things").map((t) => t.id), [a.id]);
  assert.deepEqual(store.readAll("never-used"), []);
});

test("writeAll replaces the collection in the given order; returned objects are copies", () => {
  store.writeAll("list", [{ id: "3" }, { id: "1" }, { id: "2" }]);
  const got = store.readAll("list");
  assert.deepEqual(got.map((r) => r.id), ["3", "1", "2"]);
  got[0].changed = true;
  assert.equal(store.readAll("list")[0].changed, undefined);
});

test("snapshot writes a consistent copy that opens on its own", () => {
  const dest = path.join(dir, "copy.db");
  store.snapshot(dest);
  const { DatabaseSync } = require("node:sqlite");
  const copy = new DatabaseSync(dest);
  const n = copy.prepare("SELECT COUNT(*) n FROM records WHERE collection = 'providerWallets'").get().n;
  copy.close();
  assert.equal(n, 2);
  assert.equal(store.counts().providerWallets, 2);
});
