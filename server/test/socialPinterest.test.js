const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-pinterest-"));
process.env.PINTEREST_CLIENT_ID = "1234567";
process.env.PINTEREST_CLIENT_SECRET = "app-secret";
process.env.PINTEREST_POLL_MS = "1";
const pinterest = require("../src/socialPinterest");
const access = require("../src/access");

// A stand-in for Pinterest's API: records each call and answers like Pinterest does.
function fakePinterest({ boards = [], mediaStates = ["processing", "succeeded"] } = {}) {
  const calls = [];
  const states = [...mediaStates];
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || "GET", body: opts.body, headers: opts.headers || {} });
    if (u.endsWith("/oauth/token")) {
      const p = new URLSearchParams(opts.body);
      return json({ access_token: `access-${p.get("grant_type")}`, refresh_token: "refresh-1", expires_in: 2592000, refresh_token_expires_in: 31536000 });
    }
    if (u.endsWith("/user_account")) return json({ username: "tikdum", account_type: "BUSINESS" });
    if (u.includes("/boards?")) return json({ items: boards });
    if (u.endsWith("/boards")) return json({ id: "board-new", name: JSON.parse(opts.body).name });
    if (u.endsWith("/media") && opts.method === "POST") return json({ media_id: "m1", upload_url: "https://upload.example/s3", upload_parameters: { key: "k1", policy: "p" } });
    if (u === "https://upload.example/s3") return { ok: true, status: 204, json: async () => ({}) };
    if (u.includes("/media/m1")) return json({ status: states.shift() || "succeeded" });
    if (u.endsWith("/pins")) return json({ id: "pin-1" });
    return json({ message: "unexpected" }, 404);
  };
  return calls;
}

test("Pinterest: the Pin's title, description and link to tikdum.com", () => {
  const blog = pinterest.pinFor({ title: "Kitchen deep clean", caption: "Five steps for a grease-free kitchen.\n\nRead it: https://tikdum.com/blog/kitchen-clean.\n#cleaning #jammu" });
  assert.equal(blog.title, "Kitchen deep clean");
  assert.equal(blog.link, "https://tikdum.com/blog/kitchen-clean?utm_source=pinterest&utm_medium=social");
  const plain = pinterest.pinFor({ caption: `Sofa looking tired? #sofa\n${"Long text. ".repeat(80)}` });
  assert.equal(plain.title, "Sofa looking tired?", "first line, without hashtags");
  assert.equal(plain.link, "https://tikdum.com/jammu?utm_source=pinterest&utm_medium=social");
  assert.ok(plain.description.length <= 500);
});

test("Pinterest: sign-in only with a fresh state from Admin; tokens and the account are saved", async () => {
  const calls = fakePinterest();
  assert.equal(pinterest.configured(), false);
  const url = new URL(pinterest.connectUrl("Asha"));
  assert.equal(url.origin + url.pathname, "https://www.pinterest.com/oauth/");
  assert.equal(url.searchParams.get("redirect_uri"), "https://api.tikdum.com/api/social/pinterest/callback");
  assert.match(url.searchParams.get("scope"), /pins:write/);
  await assert.rejects(pinterest.finishConnect({ code: "c", state: "made-up" }), /expired/);
  const state = url.searchParams.get("state");
  assert.deepEqual(await pinterest.finishConnect({ code: "code-1", state }), { username: "tikdum" });
  await assert.rejects(pinterest.finishConnect({ code: "code-1", state }), /expired/, "a state works once");
  const tokenCall = calls.find((c) => c.url.endsWith("/oauth/token"));
  assert.equal(tokenCall.headers.Authorization, `Basic ${Buffer.from("1234567:app-secret").toString("base64")}`);
  assert.equal(pinterest.configured(), true);
  assert.equal(pinterest.status().username, "tikdum");
});

test("Pinterest: the access token is renewed only when it's close to running out", async () => {
  const calls = fakePinterest();
  const now = Date.now();
  assert.equal(await pinterest.accessToken(now), "access-authorization_code");
  assert.equal(calls.length, 0, "still fresh");
  assert.equal(await pinterest.accessToken(now + 27 * 86400000), "access-refresh_token");
  assert.equal(new URLSearchParams(calls[0].body).get("grant_type"), "refresh_token");
});

test("Pinterest: a picture Pin goes on Tikdum's board (found or made once)", async () => {
  const calls = fakePinterest({ boards: [] });
  const out = await pinterest.publish({ caption: "Clean fans before winter" }, [{ url: "https://api.tikdum.com/api/social-images/a.jpg" }]);
  assert.deepEqual(out, { ok: true, id: "pin-1", link: "https://www.pinterest.com/pin/pin-1/" });
  const pin = JSON.parse(calls.find((c) => c.url.endsWith("/pins")).body);
  assert.equal(pin.board_id, "board-new");
  assert.deepEqual(pin.media_source, { source_type: "image_url", url: "https://api.tikdum.com/api/social-images/a.jpg" });
  const again = fakePinterest({ boards: [] });
  await pinterest.publish({ caption: "Second" }, [{ url: "https://x/b.jpg" }]);
  assert.ok(!again.some((c) => c.url.includes("/boards")), "the board is remembered");
});

test("Pinterest: a Reel becomes a video Pin after Pinterest has processed the upload", async () => {
  const file = path.join(process.env.DATA_DIR, "reel.mp4");
  fs.writeFileSync(file, Buffer.from("fake mp4"));
  const calls = fakePinterest({ mediaStates: ["registered", "processing", "succeeded"] });
  const out = await pinterest.publishVideo({ title: "AC service tips", caption: "Cool air, lower bills" }, file, "https://api.tikdum.com/api/social-images/cover.jpg");
  assert.equal(out.ok, true);
  assert.equal(calls.filter((c) => c.url.includes("/media/m1")).length, 3, "waited for 'succeeded'");
  assert.ok(calls.some((c) => c.url === "https://upload.example/s3"));
  const pin = JSON.parse(calls.find((c) => c.url.endsWith("/pins")).body);
  assert.deepEqual(pin.media_source, { source_type: "video_id", media_id: "m1", cover_image_url: "https://api.tikdum.com/api/social-images/cover.jpg" });

  fakePinterest({ mediaStates: ["failed"] });
  await assert.rejects(pinterest.publishVideo({ caption: "x" }, file, null), /couldn't process/);
});

test("Pinterest: connecting is a settings change; the social channel list includes it", () => {
  assert.equal(access.requiredFor("GET", "/admin/social/pinterest/connect"), "settings.edit");
  const social = require("../src/social");
  const post = social.cleanPost({ caption: "Hi", imageUrl: "https://x/a.jpg", channels: ["facebook", "pinterest"] });
  assert.deepEqual(post.channels, ["facebook", "pinterest"]);
  const story = social.cleanPost({ format: "story", storyLine: "Hi", imageUrl: "https://x/a.jpg", channels: ["facebook", "pinterest"] });
  assert.deepEqual(story.channels, ["facebook"], "no Stories on Pinterest");
  assert.equal(social.score({ pinterest: { saves: 2, outboundClicks: 1 } }), 7);
});
