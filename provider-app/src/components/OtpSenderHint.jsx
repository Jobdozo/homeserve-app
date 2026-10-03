// Login codes come from Tikdum's WhatsApp Business number. WhatsApp shows a
// business without the green tick as a bare phone number, so tell people up
// front who the message will be from.
const OTP_SENDER_LABEL = "+91 94191 49336";
const OTP_SENDER_WA = "919419149336";

export default function OtpSenderHint() {
  return (
    <p className="text-center text-[12px] leading-relaxed text-gray-500">
      Your code arrives on WhatsApp from <span className="font-semibold text-gray-700">Tikdum</span> ({OTP_SENDER_LABEL}).{" "}
      <a href={`https://wa.me/${OTP_SENDER_WA}`} target="_blank" rel="noreferrer" className="font-semibold text-brand">
        Open Tikdum on WhatsApp
      </a>
    </p>
  );
}
