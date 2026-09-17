// Sends OTP codes via a WhatsApp Web automation gateway (saasyto.com) — an
// unofficial API, not the WhatsApp Business Cloud API. It works by driving a
// real WhatsApp Web session (paired via QR code in their dashboard), so
// delivery depends on that session staying connected and carries some risk
// of the paired number being flagged by WhatsApp for automation.
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

async function sendOtpViaWhatsApp(phone, code) {
  return sendWhatsAppMessage(phone, `Your Tikdum verification code is ${code}. It expires in 5 minutes.`);
}

module.exports = { sendOtpViaWhatsApp, sendWhatsAppMessage, isConfigured };
