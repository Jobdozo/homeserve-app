// Tiny per-agent JSON state (e.g. which bookings were already nudged, the day
// the last report went out) so a restart doesn't repeat work. Written
// atomically (temp file + rename).
const fs = require("fs");
const path = require("path");
const { stateDir } = require("./config");

function load(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(stateDir, `${name}.json`), "utf8"));
  } catch {
    return {};
  }
}

function save(name, data) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, `${name}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
}

module.exports = { load, save };
