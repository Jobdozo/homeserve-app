const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-googleads-"));
const googleAds = require("../src/googleAds");
const access = require("../src/access");

test("Google Ads tracking: the IDs from Google's snippet, nothing on the website until both are set, who may change it", () => {
  const snippet = `<script> gtag('event', 'conversion', { 'send_to': 'AW-17123456789/AbC-dEfGhI123', 'value': 1.0, 'currency': 'INR', 'transaction_id': '' }); </script>`;
  assert.deepEqual(googleAds.parse(snippet), { tagId: "AW-17123456789", label: "AbC-dEfGhI123" });
  assert.deepEqual(googleAds.parse("AW-17123456789"), { tagId: "AW-17123456789", label: null });
  assert.deepEqual(googleAds.parse("G-ABC123"), { tagId: null, label: null }, "a Google Analytics ID isn't an Ads tag");

  assert.deepEqual(googleAds.forWebsite(), {});
  assert.throws(() => googleAds.set({ snippet: "nothing useful" }, "Owner"), /doesn't contain a Google Ads tag ID/);
  assert.throws(() => googleAds.set({ tagId: "UA-1234" }, "Owner"), /looks like AW-123456789/);
  googleAds.set({ tagId: "AW-17123456789" }, "Owner");
  assert.deepEqual(googleAds.forWebsite(), {}, "the label is still missing");
  assert.throws(() => googleAds.set({ label: "bad label!" }, "Owner"), /part after the slash/);

  const on = googleAds.set({ snippet, on: true }, "Owner");
  assert.equal(on.on, true);
  assert.deepEqual(googleAds.forWebsite(), { tagId: "AW-17123456789", label: "AbC-dEfGhI123" });
  assert.equal(googleAds.set({ on: false }, "Owner").on, false);
  assert.deepEqual(googleAds.forWebsite(), {}, "paused: nothing loads");

  assert.equal(access.requiredFor("GET", "/admin/google-ads"), "social.view");
  assert.equal(access.requiredFor("PUT", "/admin/google-ads"), "settings.edit");
});
