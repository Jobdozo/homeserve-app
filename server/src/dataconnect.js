// Talks to the deployed Firebase Data Connect service (Postgres-backed) for
// project tikdum-1edea. Credentials come from the standard
// GOOGLE_APPLICATION_CREDENTIALS env var (a service-account key path) or
// GOOGLE_APPLICATION_CREDENTIALS_JSON (the key contents, for hosts where
// writing a credentials file is inconvenient) — never hardcoded here.
const { initializeApp, applicationDefault, cert } = require("firebase-admin/app");
const { getDataConnect } = require("firebase-admin/data-connect");
const { addListLimits } = require("./listLimits");

function loadCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON));
  }
  return applicationDefault();
}

const app = initializeApp({ credential: loadCredential(), projectId: "tikdum-1edea" });

const connectorConfig = {
  connector: "default",
  serviceId: "tikdum-service",
  location: "us-central1",
};

const dc = getDataConnect(connectorConfig, app);

// List queries are asked for up to 5000 rows (see listLimits.js) — without it Data Connect stops at 100.
async function query(gql, variables) {
  const { data } = await dc.executeGraphqlRead(addListLimits(gql), { variables });
  return data;
}

async function mutate(gql, variables) {
  const { data } = await dc.executeGraphql(gql, { variables });
  return data;
}

module.exports = { query, mutate };
