// WhatsApp senders.
//
// OTP codes go through MSG91's official WhatsApp Business API (a real Meta
// Business Solution Provider, using a pre-approved template) — see
// sendOtpViaWhatsApp. Everything else (provider warnings, wallet recharge,
// reminders) still goes through web.saasyto.com, an unofficial WhatsApp Web
// automation gateway (a real WhatsApp Web session paired by QR code in their
// dashboard). That one is free-form text, which only the unofficial gateway
// supports; moving it to MSG91 would mean getting a template approved by
// Meta for each message type.
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_NUMBER = process.env.MSG91_WHATSAPP_NUMBER; // MSG91's "integrated_number"
const MSG91_OTP_TEMPLATE = process.env.MSG91_OTP_TEMPLATE || "otp";
const MSG91_OTP_TEMPLATE_LANG = process.env.MSG91_OTP_TEMPLATE_LANG || "en";
// Set to "true" only if the approved template has a "Copy code" button —
// Meta rejects the request either way if this doesn't match the template.
const MSG91_OTP_HAS_BUTTON = process.env.MSG91_OTP_HAS_BUTTON === "true";

const isMsg91Configured = Boolean(MSG91_AUTH_KEY && MSG91_SENDER_NUMBER);

const INSTANCE_ID = process.env.WHATSAPP_INSTANCE_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const isConfigured = Boolean(INSTANCE_ID && ACCESS_TOKEN);

function toGatewayNumber(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function sendWhatsAppMessage(phone, message) {
  if (!isConfigured) {
    console.log(`[WhatsApp] (no provider configured) To ${phone}: ${message}`);
    return false;
  }

  const url = new URL("https://web.saasyto.com/api/send");
  url.searchParams.set("number", toGatewayNumber(phone));
  url.searchParams.set("type", "text");
  url.searchParams.set("message", message);
  url.searchParams.set("instance_id", INSTANCE_ID);
  url.searchParams.set("access_token", ACCESS_TOKEN);

  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (data.status !== "success") {
    console.error("[WhatsApp] Send failed:", data);
    return false;
  }
  return true;
}

// MSG91's WhatsApp template-send request body for one recipient, one body
// variable (the code) and, optionally, a "Copy code" button carrying the
// same value — MSG91's documented component keys for their v5 bulk endpoint.
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

async function sendOtpViaMsg91(phone, code) {
  const res = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: MSG91_AUTH_KEY },
    body: JSON.stringify(buildOtpPayload(phone, code)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === "error" || data.hasError) {
    console.error("[WhatsApp/MSG91] OTP send failed:", res.status, data);
    return false;
  }
  return true;
}

async function sendOtpViaWhatsApp(phone, code) {
  if (isMsg91Configured) return sendOtpViaMsg91(phone, code);
  // Falls back to the old free-text gateway until MSG91 env vars are set.
  return sendWhatsAppMessage(phone, `Your Tikdum verification code is ${code}. It expires in 5 minutes.`);
}

module.exports = { sendOtpViaWhatsApp, sendWhatsAppMessage, isConfigured, isMsg91Configured, buildOtpPayload };
