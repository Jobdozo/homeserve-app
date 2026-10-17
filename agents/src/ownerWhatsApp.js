// WhatsApp to the owner numbers straight through MSG91 — not through the Tikdum API —
// so the Network Bot can still say "the API is down" when the API is down. Always the
// approved notice template (MSG91_NOTICE_TEMPLATE): free text only reaches someone
// who wrote to the business number in the last 24 hours, and WhatsApp drops it
// silently otherwise. Same request shape as server/src/whatsapp.js.
const BULK_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

function settings(env = process.env) {
  const phones = String(env.NETWATCH_PHONES || env.ADMIN_PHONES || "")
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter((p) => p.length >= 10)
    .map((p) => (p.length === 10 ? `91${p}` : p));
  return {
    authKey: env.MSG91_AUTH_KEY || "",
    number: env.MSG91_WHATSAPP_NUMBER || "",
    template: env.MSG91_NOTICE_TEMPLATE || "",
    lang: env.MSG91_NOTICE_TEMPLATE_LANG || "en",
    vars: String(env.MSG91_NOTICE_TEMPLATE_VARS || "name,message").split(",").map((v) => v.trim()).filter((v) => v === "name" || v === "message"),
    phones: [...new Set(phones)],
  };
}

const missing = (s) => [!s.authKey && "MSG91_AUTH_KEY", !s.number && "MSG91_WHATSAPP_NUMBER", !s.template && "MSG91_NOTICE_TEMPLATE", !s.phones.length && "ADMIN_PHONES"].filter(Boolean);

// Template variables can't hold new lines, tabs or more than 4 spaces in a row (Meta's rule).
const templateValue = (v) => String(v || "").replace(/\s*[\r\n\t]+\s*/g, " · ").replace(/ {4,}/g, "   ").trim().slice(0, 1000);

function payload(s, phone, message) {
  const values = { message: templateValue(message), name: "Owner" };
  const components = {};
  s.vars.forEach((v, i) => {
    components[`body_${i + 1}`] = { type: "text", value: values[v] };
  });
  return {
    integrated_number: s.number,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: { name: s.template, language: { code: s.lang, policy: "deterministic" }, namespace: null, to_and_components: [{ to: [phone], components }] },
    },
  };
}

// -> { delivered, attempted, error }. delivered = numbers MSG91 accepted.
async function send(message, { env = process.env, fetchFn = fetch } = {}) {
  const s = settings(env);
  const gaps = missing(s);
  if (gaps.length) return { delivered: 0, attempted: 0, error: `not set up: ${gaps.join(", ")}` };
  let delivered = 0;
  let error = null;
  for (const phone of s.phones) {
    try {
      const r = await fetchFn(BULK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: s.authKey },
        body: JSON.stringify(payload(s, phone, message)),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.status !== "error" && !data.hasError) delivered += 1;
      else error = `MSG91 ${r.status}: ${JSON.stringify(data.errors || data.message || data).slice(0, 160)}`;
    } catch (e) {
      error = e.message;
    }
  }
  return { delivered, attempted: s.phones.length, error };
}

module.exports = { send, settings, missing, payload, templateValue };
