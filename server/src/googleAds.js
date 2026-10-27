// Google Ads booking tracking on tikdum.com: the Google tag ID ("AW-…") and the "Booking"
// conversion's label, pasted in Admin → Social media → Google Ads. The website loads the tag
// (website only, never the Android app) and reports each order as a conversion with its value
// and order number, the way the Meta Pixel does (local-service-app utils/googleAds.js). Nothing
// loads until both are set. They're public — Google's own snippet puts them in every page.
const jsonStore = require("./jsonStore");

const TABLE = "googleAds";
const fail = (status, message) => Object.assign(new Error(message), { status });
const row = () => jsonStore.readAll(TABLE)[0] || null;

// Pure: the tag ID and label from what's pasted — the IDs, or Google's whole event snippet
// ("send_to': 'AW-123456789/AbC-dEfGhI"). Exported for tests.
function parse(input) {
  const s = String(input || "");
  const both = /(AW-\d{6,15})\/([A-Za-z0-9_-]{6,40})/.exec(s);
  if (both) return { tagId: both[1], label: both[2] };
  const tag = /\bAW-\d{6,15}\b/.exec(s);
  return { tagId: tag ? tag[0] : null, label: null };
}

function get() {
  const r = row();
  return { tagId: r?.tagId || null, label: r?.label || null, on: Boolean(r?.tagId && r?.label && r.on !== false), updatedAt: r?.updatedAt || null, updatedBy: r?.updatedBy || null };
}

// patch: { tagId?, label?, snippet?, on? } — a pasted snippet fills both.
function set(patch, actor) {
  const before = row();
  let tagId = before?.tagId || null;
  let label = before?.label || null;
  if (patch.snippet) {
    const p = parse(patch.snippet);
    if (!p.tagId) throw fail(400, "That doesn't contain a Google Ads tag ID (it looks like AW-123456789)");
    tagId = p.tagId;
    if (p.label) label = p.label;
  }
  if (patch.tagId !== undefined) {
    const p = parse(patch.tagId);
    if (String(patch.tagId || "").trim() && !p.tagId) throw fail(400, "The tag ID looks like AW-123456789 (Google Ads → Goals → Conversions → your conversion → Tag setup)");
    tagId = p.tagId;
  }
  if (patch.label !== undefined) {
    const l = String(patch.label || "").trim();
    if (l && !/^[A-Za-z0-9_-]{6,40}$/.test(l)) throw fail(400, "The conversion label is the part after the slash, e.g. AbC-dEfGhI123");
    label = l || null;
  }
  const on = patch.on !== undefined ? patch.on !== false : before ? before.on !== false : true;
  const next = { id: "ads", tagId, label, on, updatedAt: new Date().toISOString(), updatedBy: actor || null };
  if (before) jsonStore.update(TABLE, "ads", next);
  else jsonStore.insert(TABLE, next);
  return get();
}

// What the website needs (both set and on), else nothing.
const forWebsite = () => {
  const g = get();
  return g.on ? { tagId: g.tagId, label: g.label } : {};
};

module.exports = { parse, get, set, forWebsite };
