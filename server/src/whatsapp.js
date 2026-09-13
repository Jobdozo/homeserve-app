// Placeholder WhatsApp OTP delivery — no real WhatsApp Business API account is
// wired up yet. This logs the code server-side instead of sending it, so the
// full login/signup flow can be built and tested end-to-end today. Swap the
// body of this function for a real provider (Twilio, Meta Cloud API, Gupshup,
// MSG91, ...) later; nothing else in the auth flow needs to change.
async function sendOtpViaWhatsApp(phone, code) {
  console.log(`[WhatsApp OTP] To ${phone}: Your Tikdum verification code is ${code}. It expires in 5 minutes.`);
  return true;
}

module.exports = { sendOtpViaWhatsApp };
