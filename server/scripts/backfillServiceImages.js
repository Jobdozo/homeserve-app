// One-time backfill: generates a Gemini brand-ambassador photo for every
// existing service that doesn't have one yet (new services get theirs
// automatically on creation — see store.generateServiceHeroImage, wired into
// index.js's two create-service routes). Safe to re-run: it only touches
// services with heroImage still null.
//
//   GEMINI_API_KEY=... GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/backfillServiceImages.js
require("dotenv").config({ override: true });
const store = require("../src/store");

async function main() {
  const services = await store.listServices({});
  const pending = services.filter((s) => !s.heroImage);
  console.log(`${pending.length}/${services.length} services need a hero image.`);

  for (const service of pending) {
    process.stdout.write(`Generating "${service.name}" (${service.id})... `);
    const updated = await store.generateServiceHeroImage(service.id);
    console.log(updated?.heroImage ? "done" : "FAILED");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
