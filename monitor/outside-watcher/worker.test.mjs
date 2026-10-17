// node --test monitor/outside-watcher/worker.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { run } from "./worker.js";

const env = () => {
  const kv = new Map();
  return {
    MSG91_AUTH_KEY: "k",
    MSG91_WHATSAPP_NUMBER: "919000000000",
    OWNER_PHONES: "9876543210",
    STATE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), writes: () => kv },
  };
};
// up=false: the Tikdum addresses don't answer. Records every WhatsApp text sent.
function net(up) {
  const texts = [];
  const fetchFn = async (url, init) => {
    if (url.includes("msg91")) {
      texts.push(JSON.parse(init.body).payload.template.to_and_components[0].components.body_2.value);
      return { ok: true, status: 200, json: async () => ({ status: "success" }) };
    }
    if (!up.value) throw new TypeError("fetch failed");
    return { ok: true, status: 200 };
  };
  return { fetchFn, texts };
}
const T0 = Date.parse("2026-10-17T14:08:00Z"); // 19:38 IST
const MIN = 60000;

test("outside watcher: hello once, then silent while everything is up", async () => {
  const e = env();
  const up = { value: true };
  const n = net(up);
  await run(e, { now: T0, fetchFn: n.fetchFn, retryDelayMs: 0 });
  await run(e, { now: T0 + MIN, fetchFn: n.fetchFn, retryDelayMs: 0 });
  assert.equal(n.texts.length, 1);
  assert.match(n.texts[0], /^Outside watcher: ✅ I'm on/);
});

test("outside watcher: one bad minute is ignored; two in a row alert; back up says how long", async () => {
  const e = env();
  const up = { value: true };
  const n = net(up);
  await run(e, { now: T0 - MIN, fetchFn: n.fetchFn, retryDelayMs: 0 }); // hello
  up.value = false;
  await run(e, { now: T0, fetchFn: n.fetchFn, retryDelayMs: 0 });
  assert.equal(n.texts.length, 1);
  await run(e, { now: T0 + MIN, fetchFn: n.fetchFn, retryDelayMs: 0 });
  assert.equal(n.texts.length, 2);
  assert.match(n.texts[1], /🔴 Tikdum can't be reached from the internet since 17 Oct, 19:38 IST \(tikdum\.com: no connection; api\.tikdum\.com: no connection\)/);
  // Quiet until the 30-minute reminder.
  for (let m = 2; m < 31; m++) await run(e, { now: T0 + m * MIN, fetchFn: n.fetchFn, retryDelayMs: 0 });
  assert.equal(n.texts.length, 2);
  await run(e, { now: T0 + 31 * MIN, fetchFn: n.fetchFn, retryDelayMs: 0 });
  assert.match(n.texts[2], /Still unreachable after 31 min/);
  up.value = true;
  await run(e, { now: T0 + 40 * MIN, fetchFn: n.fetchFn, retryDelayMs: 0 });
  assert.match(n.texts[3], /✅ Tikdum can be reached again\. It was unreachable for about 40 min \(17 Oct, 19:38 to 17 Oct, 20:18 IST\)/);
  const st = JSON.parse(await e.STATE.get("state"));
  assert.equal(st.downSince, null);
});

test("outside watcher: only one address down is the Network Bot's job", async () => {
  const e = env();
  const texts = [];
  const fetchFn = async (url, init) => {
    if (url.includes("msg91")) {
      texts.push("x");
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: true, status: url.includes("api.") ? 502 : 200 };
  };
  for (let m = 0; m < 5; m++) await run(e, { now: T0 + m * MIN, fetchFn, retryDelayMs: 0 });
  assert.equal(texts.length, 1); // just the hello
});
