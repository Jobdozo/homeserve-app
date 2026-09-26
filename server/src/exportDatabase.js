// Exports every table of the main database (Firebase Data Connect / Postgres)
// to JSON files, so a copy of the data exists outside Google. Run nightly by
// the backup job:
//
//   docker exec <server container> node src/exportDatabase.js
//
// Files land in DATA_DIR/db-export/ (one <table>.json each plus manifest.json),
// which the folder backup then picks up. The previous export is only replaced
// once ALL tables were read successfully, so a failed run never leaves a
// half-written export.
const fs = require("fs");
const path = require("path");
const { query } = require("./dataconnect");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const OUT_DIR = path.join(DATA_DIR, "db-export");
const PAGE = 500;

// [query name, fields] — relations are exported as their id. Keep in step with
// dataconnect/schema/schema.gql.
const TABLES = [
  ["customers", "id name avatar phone email"],
  ["providers", "id name avatar category rating reviews phone live verified verificationStatus businessName experience serviceArea email gstNumber responseRate joinedAt"],
  ["categories", "id slug name icon"],
  ["services", "id category { id } provider { id } name icon tagline price originalPrice rating reviewCount distanceLabel status extraCharges serviceArea"],
  ["serviceHighlights", "id service { id } icon label"],
  ["serviceIncludes", "id service { id } text"],
  ["bookings", "id orderId service { id } provider { id } customer { id } status date time addressLabel addressLine addressLat addressLng issue amount createdAt cancelledAt reviewed reviewRating reviewText"],
  ["bookingStatusEvents", "id booking { id } status at"],
  ["messages", "id booking { id } sender text sentAt"],
  ["activities", "id type message occurredAt"],
  ["notifications", "id recipientType recipientId type title message booking { id } read createdAt"],
];

async function readAllRows(name, fields) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const data = await query(
      `query($limit: Int!, $offset: Int!) { ${name}(orderBy: { id: ASC }, limit: $limit, offset: $offset) { ${fields} } }`,
      { limit: PAGE, offset }
    );
    const page = data[name] || [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function main() {
  const tmp = `${OUT_DIR}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const counts = {};
  for (const [name, fields] of TABLES) {
    const rows = await readAllRows(name, fields);
    fs.writeFileSync(path.join(tmp, `${name}.json`), JSON.stringify(rows));
    counts[name] = rows.length;
  }
  fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify({ exportedAt: new Date().toISOString(), counts }, null, 2));

  // Swap in the finished export.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.renameSync(tmp, OUT_DIR);
  console.log(`database export ok: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("DATABASE EXPORT FAILED:", err.message);
    process.exit(1);
  }
);
