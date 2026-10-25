// Google AdSense on the blog only — tikdum.com/blog and its articles: the publisher ID set in
// Admin → Blog → Ads. The blog pages' HTML carries the AdSense script (seoPages.js), the website
// loads it when someone opens the blog inside the app (local-service-app utils/blogAds.js), and
// tikdum.com/ads.txt names Tikdum as the seller. No other page and never the Android app.
const jsonStore = require("./jsonStore");

const TABLE = "blogAds";
const fail = (status, message) => Object.assign(new Error(message), { status });
const row = () => jsonStore.readAll(TABLE)[0] || null;

// Pure: "ca-pub-1234567890123456" from what someone pastes — the ID, "pub-…", or AdSense's whole
// <script> tag. Exported for tests.
function clientFrom(input) {
  const m = /(?:ca-)?pub-(\d{10,20})\b/.exec(String(input || ""));
  return m ? `ca-pub-${m[1]}` : null;
}

function get() {
  const r = row();
  return { client: r?.client || null, on: Boolean(r?.client && r.on !== false), updatedAt: r?.updatedAt || null, updatedBy: r?.updatedBy || null };
}

// patch: { client?, on? }; client "" removes it.
function set(patch, actor) {
  const before = row();
  let client = before?.client || null;
  if (patch.client !== undefined) {
    client = String(patch.client || "").trim() ? clientFrom(patch.client) : null;
    if (String(patch.client || "").trim() && !client) throw fail(400, "That isn't an AdSense publisher ID — it looks like ca-pub-1234567890123456 (AdSense → Account → Account information)");
  }
  const on = patch.on !== undefined ? patch.on !== false : before ? before.on !== false : true;
  const next = { id: "ads", client, on, updatedAt: new Date().toISOString(), updatedBy: actor || null };
  if (before) jsonStore.update(TABLE, "ads", next);
  else jsonStore.insert(TABLE, next);
  return get();
}

// The publisher ID while ads are on, else null.
const active = () => {
  const g = get();
  return g.on ? g.client : null;
};

// For the head of a blog page.
function headTags() {
  const c = active();
  if (!c) return [];
  return [
    `<meta name="google-adsense-account" content="${c}" />`,
    `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${c}" crossorigin="anonymous"></script>`,
  ];
}

// tikdum.com/ads.txt (whenever an ID is set, so a pause doesn't drop it), else null (a 404).
function adsTxt() {
  const c = get().client;
  return c ? `google.com, ${c.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : null;
}

module.exports = { clientFrom, get, set, active, headTags, adsTxt };
