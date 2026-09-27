// All WhatsApp sending goes through MSG91's official WhatsApp Business API —
// a real Meta Business Solution Provider. The old unofficial web.saasyto.com
// gateway (a WhatsApp Web session paired by QR code) has been removed.
//
// Two message shapes:
//   - OTP: a pre-approved "template" send (see sendOtpViaWhatsApp) — this is
//     the one confirmed working against a real account and real messages.
//   - Everything else (provider warnings, wallet recharge, reminders): a
//     plain "text" send (see sendWhatsAppMessage). WhatsApp only allows
//     free-form business-initiated text within 24 hours of the recipient
//     last messaging the business number; outside that window Meta rejects
//     it and this returns false. If these need to reach providers reliably
//     regardless of that window, they should become approved templates too
//     (same pattern as the OTP one) — ask before assuming this path is
//     verified end-to-end; it hasn't been tested against a real send yet.
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_NUMBER = process.env.MSG91_WHATSAPP_NUMBER; // MSG91's "integrated_number"
const MSG91_OTP_TEMPLATE = process.env.MSG91_OTP_TEMPLATE || "otp";
const MSG91_OTP_TEMPLATE_LANG = process.env.MSG91_OTP_TEMPLATE_LANG || "en";
// Set to "true" only if the approved template has a "Copy code" button —
// Meta rejects the request either way if this doesn't match the template.
const MSG91_OTP_HAS_BUTTON = process.env.MSG91_OTP_HAS_BUTTON === "true";

const isConfigured = Boolean(MSG91_AUTH_KEY && MSG91_SENDER_NUMBER);
// Two different MSG91 endpoints — not interchangeable. The bulk one only
// accepts content_type "template" ("for now, only template is supported for
// bulk" is the literal error otherwise); the session one is query-string
// based (no JSON body) and only delivers within 24h of the recipient last
// messaging the business number.
const MSG91_BULK_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
const MSG91_SESSION_URL = "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/";

function toGatewayNumber(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function postJsonToMsg91(payload, label) {
  if (!isConfigured) {
    console.log(`[WhatsApp] (MSG91 not configured) ${label}`);
    return false;
  }
  const res = await fetch(MSG91_BULK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: MSG91_AUTH_KEY },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === "error" || data.hasError) {
    console.error(`[WhatsApp/MSG91] ${label} failed:`, res.status, data);
    return false;
  }
  return true;
}

// MSG91's template-send request body for one recipient, one body variable
// (the code) and, optionally, a "Copy code" button carrying the same value —
// MSG91's documented component keys for their v5 bulk endpoint.
function buildOtpPayload(phone, code) {
  const components = { body_1: { type: "text", value: code } };
  if (MSG91_OTP_HAS_BUTTON) {
    components.button_1 = { subtype: "url", type: "text", value: code };
  }
  return {
    integrated_number: MSG91_SENDER_NUMBER,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: MSG91_OTP_TEMPLATE,
        language: { code: MSG91_OTP_TEMPLATE_LANG, policy: "deterministic" },
        namespace: null,
        to_and_components: [{ to: [toGatewayNumber(phone)], components }],
      },
    },
  };
}

async function sendOtpViaWhatsApp(phone, code) {
  return postJsonToMsg91(buildOtpPayload(phone, code), "OTP send");
}

// MSG91's "Send message (once session started)" endpoint — plain free-form
// text, but only deliverable within 24 hours of the recipient last messaging
// the business number (WhatsApp's own rule; MSG91 just enforces it). Outside
// that window this fails and returns false — there is no workaround short of
// getting a template approved for this message too.
function buildTextUrl(phone, message) {
  const params = new URLSearchParams({
    integrated_number: MSG91_SENDER_NUMBER,
    recipient_number: toGatewayNumber(phone),
    content_type: "text",
    text: message,
  });
  return `${MSG91_SESSION_URL}?${params.toString()}`;
}

async function sendWhatsAppMessage(phone, message) {
  if (!isConfigured) {
    console.log(`[WhatsApp] (MSG91 not configured) Text send`);
    return false;
  }
  const res = await fetch(buildTextUrl(phone, message), {
    method: "POST",
    headers: { Accept: "application/json", authkey: MSG91_AUTH_KEY, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === "error" || data.hasError) {
    console.error("[WhatsApp/MSG91] Text send failed:", res.status, data);
    return false;
  }
  return true;
}

module.exports = { sendOtpViaWhatsApp, sendWhatsAppMessage, isConfigured, buildOtpPayload, buildTextUrl };
