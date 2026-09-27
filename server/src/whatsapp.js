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
const MSG91_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";

function toGatewayNumber(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function postToMsg91(payload, label) {
  if (!isConfigured) {
    console.log(`[WhatsApp] (MSG91 not configured) ${label}`);
    return false;
  }
  const res = await fetch(MSG91_URL, {
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
  return postToMsg91(buildOtpPayload(phone, code), "OTP send");
}

// Plain free-form text — standard WhatsApp Cloud API text-message shape.
// Only deliverable within 24 hours of the recipient last messaging the
// business number; unconfirmed against a real send, see file header.
function buildTextPayload(phone, message) {
  return {
    integrated_number: MSG91_SENDER_NUMBER,
    content_type: "text",
    payload: {
      messaging_product: "whatsapp",
      to: toGatewayNumber(phone),
      type: "text",
      text: { body: message },
    },
  };
}

async function sendWhatsAppMessage(phone, message) {
  return postToMsg91(buildTextPayload(phone, message), "Text send");
}

module.exports = { sendOtpViaWhatsApp, sendWhatsAppMessage, isConfigured, buildOtpPayload, buildTextPayload };
