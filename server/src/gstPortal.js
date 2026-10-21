// GST portal check through API Setu (GSTN taxpayer details, set with
// deploy/set-apisetu-gst.sh): is a provider's GST number real and active, and
// whose is it? taxIds.js only checks the format offline; this asks GSTN.
// Answers are kept for a week (collection "gstPortal") so the pre-check and
// the Verification Agent don't call API Setu for the same number again.
const jsonStore = require("./jsonStore");
const { checkGstin } = require("./taxIds");

const KEEP_MS = 7 * 86400000;
const TIMEOUT_MS = 15000;
const clientId = () => String(process.env.APISETU_CLIENT_ID || "").trim();
const apiKey = () => String(process.env.APISETU_API_KEY || "").trim();
const urlFor = (gstin) =>
  String(process.env.APISETU_GST_URL || "https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}").replace("{gstin}", encodeURIComponent(gstin));

const configured = () => Boolean(clientId() && apiKey());
const fail = (message, status) => Object.assign(new Error(message), { status });

// GSTN's short field names (lgnm, tradeNam, sts …) or spelled-out ones; some
// answers wrap them in taxpayerInfo / data. Pure, exported for tests.
function parse(gstin, json) {
  const d = json?.taxpayerInfo || json?.data || json?.result || json || {};
  const addr = d.pradr?.addr || d.principalPlaceOfBusiness?.address || {};
  const status = String(d.sts || d.status || d.gstinStatus || "").trim();
  const address = [addr.bno, addr.bnm, addr.flno, addr.st, addr.loc, addr.dst, addr.stcd, addr.pncd].filter(Boolean).join(", ");
  return {
    gstin,
    found: Boolean(d.lgnm || d.legalName || d.tradeNam || d.tradeName || status),
    active: /^active$/i.test(status),
    status: status || "Unknown",
    legalName: String(d.lgnm || d.legalName || "").trim(),
    tradeName: String(d.tradeNam || d.tradeName || "").trim(),
    registeredOn: d.rgdt || d.registrationDate || null,
    cancelledOn: d.cxdt || d.cancellationDate || null,
    constitution: d.ctb || d.constitutionOfBusiness || "",
    type: d.dty || d.taxpayerType || "",
    address,
    pincode: addr.pncd || "",
  };
}

const cached = (gstin) => jsonStore.readAll("gstPortal").find((r) => r.id === gstin) || null;
const fresh = (r, now) => r && now - Date.parse(r.checkedAt) < KEEP_MS;

// -> the parsed answer (+ checkedAt). Throws { status } when API Setu can't answer.
async function lookup(raw, { refresh = false, now = Date.now(), fetchImpl = fetch } = {}) {
  const g = checkGstin(raw);
  if (!g.ok || !g.value) throw fail(g.error || "No GST number", 400);
  const gstin = g.value;
  const old = cached(gstin);
  if (!refresh && fresh(old, now)) return old;
  if (!configured()) throw fail("GST portal check isn't set up — run deploy/set-apisetu-gst.sh on the server", 503);

  let res;
  try {
    res = await fetchImpl(urlFor(gstin), {
      headers: { "X-APISETU-CLIENTID": clientId(), "X-APISETU-APIKEY": apiKey(), Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw fail(`Couldn't reach API Setu (${e.message})`, 502);
  }
  const json = await res.json().catch(() => ({}));
  let result;
  if (res.ok) result = parse(gstin, json);
  else if (res.status === 404) result = { ...parse(gstin, {}), status: "Not found" };
  else {
    const why = json.errorDescription || json.message || json.error || `HTTP ${res.status}`;
    throw fail(res.status === 401 || res.status === 403 ? `API Setu refused the key (${why})` : `API Setu answered: ${why}`, 502);
  }
  const record = { id: gstin, ...result, checkedAt: new Date(now).toISOString() };
  if (old) jsonStore.update("gstPortal", gstin, record);
  else jsonStore.insert("gstPortal", record);
  return record;
}

// Looks up numbers nobody has checked this week, one at a time, in the
// background (the pre-check shows them on its next run). A few per call.
let warming = false;
function warm(gstNumbers, { max = 5 } = {}) {
  if (!configured() || warming) return;
  const now = Date.now();
  const todo = [...new Set(gstNumbers.map((n) => checkGstin(n)).filter((g) => g.ok && g.value).map((g) => g.value))]
    .filter((gstin) => !fresh(cached(gstin), now))
    .slice(0, max);
  if (!todo.length) return;
  warming = true;
  (async () => {
    for (const gstin of todo) await lookup(gstin).catch((e) => console.warn(`[gst-portal] ${gstin}: ${e.message}`));
  })().finally(() => (warming = false));
}

module.exports = { configured, lookup, cached: (raw) => cached(checkGstin(raw).value || ""), warm, parse };
