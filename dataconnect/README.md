# Tikdum — Firebase Data Connect

This is a Postgres schema + generated-SDK connector for [Firebase Data
Connect](https://firebase.google.com/docs/data-connect), translating the
current `server/data.json` flat-file store (see `server/src/store.js`) into
relational tables. It targets Firebase project **`tikdum-1edea`**.

**Status:** schema and connector are written and validated locally against
the real Data Connect compiler (via the emulator, offline, no cloud project
needed for that step) — both compile with zero errors. Nothing has been
deployed yet, and the Express backend (`server/`) still runs on the JSON
file; it has not been rewired to use this.

## What's here

- `dataconnect.yaml` — service config, points at project `tikdum-1edea`,
  region `us-central1`, and a Cloud SQL Postgres instance named
  `tikdum-fdc-instance` (Data Connect provisions this for you on first deploy
  if it doesn't already exist).
- `schema/schema.gql` — tables: `Customer`, `Provider`, `Category`,
  `Service`, `ServiceHighlight`, `ServiceInclude`, `Booking`,
  `BookingStatusEvent` (replaces the old `statusHistory` map),
  `Message`, `Activity`, `Notification`.
- `connector/` — a starter set of queries/mutations covering the app's main
  operations (auth lookups, bootstrap catalog, bookings, messages,
  notifications, reviews, admin actions).

## Cost note

Data Connect's Postgres instance runs on Cloud SQL, which is **not** on the
Firebase free (Spark) plan — you need the pay-as-you-go Blaze plan with
billing enabled. Even the smallest Cloud SQL tier has an ongoing cost
(roughly $10–50+/month depending on tier and region), unlike Firestore.

## To deploy this yourself

I can't run these steps for you — they need your own Google login.

```bash
npm install -g firebase-tools
firebase login
firebase use tikdum-1edea
firebase deploy --only dataconnect
```

The first deploy provisions the Cloud SQL instance (`tikdum-fdc-instance`),
which can take several minutes. After that, generate the client SDK:

```bash
firebase dataconnect:sdk:generate
```

This writes a JS SDK to `../generated/dataconnect-js` (per
`connector/connector.yaml`) that the three frontend apps could eventually
import instead of calling `server/src/api.js`.

## To validate schema changes locally without deploying

The emulator runs fully offline against a demo project — no login or real
Cloud SQL needed for this:

```bash
firebase emulators:start --only dataconnect --project demo-tikdum
```

Compiler errors for `schema.gql` / `connector/*.gql` show up in
`dataconnect-debug.log` (gitignored) while it's running.

## What's NOT done yet

- The Express backend (`server/src/store.js`, `server/src/index.js`) still
  reads/writes the flat `data.json` file — it has not been changed to call
  this connector. That's a separate, sizable follow-up: every function in
  `store.js` would need rewriting to issue Data Connect queries/mutations
  instead of mutating the in-memory JSON object, and it can only really be
  tested once the real Postgres instance is live (i.e., after the deploy
  step above).
- Auto-generated field names (e.g. `customer_insert`, `provider_update`)
  were confirmed against the actual compiler, but the exact shape of
  generated TypeScript/JS types will only be known once
  `dataconnect:sdk:generate` runs against a real deployed schema.
- No Postgres-side indexes beyond the implicit primary keys / `@unique`
  constraints have been tuned yet.
