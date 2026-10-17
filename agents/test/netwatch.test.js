const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.AGENT_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tikdum-netwatch-"));
const nw = require("../src/netwatch");
const owner = require("../src/ownerWhatsApp");

const cfg = { downAfterMs: 20000, upAfterMs: 10000, remindMs: 600000, updateGapMs: 60000, botOffAlertMs: 300000 };
const labels = { api: "API (apps, bookings, logins)", website: "Customer website", nginx: "Web server (nginx)", internet: "Server's internet connection", "https:tikdum.com": "tikdum.com" };
const T0 = Date.parse("2026-10-17T14:08:29Z"); // 19:38:29 IST
const S = 1000;

// Feeds one result per second for each id over [from, to) and evaluates every second.
function run(st, from, to, results) {
  const msgs = [];
  for (let t = from; t < to; t += S) {
    for (const [id, ok] of Object.entries(results)) nw.record(st, id, ok ? { ok: true } : { ok: false, error: "connection refused (not running)" }, t);
    msgs.push(...nw.evaluate(st, labels, t, cfg));
  }
  return msgs;
}

test("network bot: a blip shorter than 20 s (a deploy restart) sends nothing", () => {
  const st = {};
  assert.deepEqual(run(st, T0, T0 + 10 * S, { api: true }), []);
  assert.deepEqual(run(st, T0 + 10 * S, T0 + 25 * S, { api: false }), []);
  assert.deepEqual(run(st, T0 + 25 * S, T0 + 60 * S, { api: true }), []);
  assert.ok(!st.incident);
});

test("network bot: down 20 s -> one alert, back -> one message with how long", () => {
  const st = {};
  const down = run(st, T0, T0 + 30 * S, { api: false, website: false });
  assert.equal(down.length, 1);
  assert.equal(down[0].kind, "down");
  assert.match(down[0].text, /^🔴 DOWN: API \(apps, bookings, logins\) \(connection refused \(not running\)\), Customer website/);
  assert.match(down[0].text, /Failing since 19:38:29 IST/);
  // Nothing more while it stays down (under the 10-minute reminder).
  assert.deepEqual(run(st, T0 + 30 * S, T0 + 120 * S, { api: false, website: false }), []);
  const up = run(st, T0 + 120 * S, T0 + 140 * S, { api: true, website: true });
  assert.equal(up.length, 1);
  assert.equal(up[0].kind, "up");
  assert.match(up[0].text, /^✅ BACK UP: API \(apps, bookings, logins\), Customer website\. Down for 2 min \(19:38:29 to 19:40:29 IST\)\.$/);
  assert.equal(st.incident, null);
  assert.equal(st.history.length, 1);
});

test("network bot: reminder every 10 minutes while still down", () => {
  const st = {};
  const msgs = run(st, T0, T0 + 21 * 60 * S, { api: false });
  assert.deepEqual(msgs.map((m) => m.kind), ["down", "reminder", "reminder"]);
  assert.match(msgs[1].text, /^🔴 STILL DOWN after 10 min/);
});

test("network bot: a second failure joins the same incident as one update", () => {
  const st = {};
  run(st, T0, T0 + 25 * S, { api: false, website: true });
  const later = run(st, T0 + 25 * S, T0 + 120 * S, { api: false, website: false });
  assert.deepEqual(later.map((m) => m.kind), ["update"]);
  assert.match(later[0].text, /^🔴 ALSO DOWN now: Customer website/);
  const up = run(st, T0 + 120 * S, T0 + 140 * S, { api: true, website: true });
  assert.match(up[0].text, /BACK UP: API \(apps, bookings, logins\), Customer website/);
});

test("network bot: flapping doesn't close the incident until 10 s of OK", () => {
  const st = {};
  run(st, T0, T0 + 25 * S, { api: false });
  // 5 s OK, then failing again: still the same incident, no new messages.
  assert.deepEqual(run(st, T0 + 25 * S, T0 + 30 * S, { api: true }), []);
  assert.deepEqual(run(st, T0 + 30 * S, T0 + 60 * S, { api: false }), []);
  assert.ok(st.incident);
});

test("network bot: hints at the cause", () => {
  assert.match(nw.hint(["internet", "https:tikdum.com"]), /can't reach the internet/);
  assert.match(nw.hint(["api", "website", "provider", "admin"]), /Docker may be down/);
  assert.match(nw.hint(["nginx", "https:tikdum.com"]), /systemctl status nginx/);
  assert.match(nw.hint(["https:tikdum.com"]), /public address fails/);
});

test("network bot: after a VPS power-off it says when it went dark and for how long", () => {
  const last = T0; // 19:38:29 IST
  const now = Date.parse("2026-10-17T14:25:20Z"); // 19:55:20 IST
  const vps = nw.restartNotice({ lastAliveAt: last }, now, 8 * S, cfg); // host booted 8 s ago
  assert.match(vps, /The server \(VPS\) was switched off or restarted/);
  assert.match(vps, /last seen working at 19:38:29 IST/);
  assert.match(vps, /about 16 min 51 s/);
  // Only the bot restarted (a deploy), host up for days: nothing for a short gap.
  assert.equal(nw.restartNotice({ lastAliveAt: now - 40 * S }, now, 5 * 86400 * S, cfg), null);
  // ...but a long gap is worth saying.
  assert.match(nw.restartNotice({ lastAliveAt: now - 10 * 60 * S }, now, 5 * 86400 * S, cfg), /Network Bot itself was stopped/);
  assert.equal(nw.restartNotice({}, now, 8 * S, cfg), null);
});

test("network bot: durations read naturally", () => {
  assert.equal(nw.dur(45 * S), "45 s");
  assert.equal(nw.dur(252 * S), "4 min 12 s");
  assert.equal(nw.dur(17 * 60 * S), "17 min");
  assert.equal(nw.dur(65 * 60 * S), "1 h 5 min");
});

test("owner WhatsApp: template payload, 10-digit numbers get 91, nothing sent when not set up", async () => {
  const env = { MSG91_AUTH_KEY: "k", MSG91_WHATSAPP_NUMBER: "919000000000", MSG91_NOTICE_TEMPLATE: "tikdum_message", ADMIN_PHONES: "+91 98765 43210, 9876543211" };
  const s = owner.settings(env);
  assert.deepEqual(s.phones, ["919876543210", "919876543211"]);
  const p = owner.payload(s, s.phones[0], "line one\nline two");
  assert.equal(p.payload.template.name, "tikdum_message");
  assert.deepEqual(p.payload.template.to_and_components[0].components, { body_1: { type: "text", value: "Owner" }, body_2: { type: "text", value: "line one · line two" } });

  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ status: "success" }) };
  };
  assert.deepEqual(await owner.send("hi", { env, fetchFn }), { delivered: 2, attempted: 2, error: null });
  assert.equal(calls.length, 2);
  const none = await owner.send("hi", { env: {}, fetchFn });
  assert.equal(none.delivered, 0);
  assert.match(none.error, /not set up: MSG91_AUTH_KEY/);
});
