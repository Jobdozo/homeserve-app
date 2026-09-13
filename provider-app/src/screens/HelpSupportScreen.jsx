import { useState } from "react";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { ChevronRightIcon } from "../components/icons";

// Placeholders — replace with real support channels before real providers use this.
const SUPPORT_EMAIL = "support@tikdum.com";
const SUPPORT_WHATSAPP = "919876543210";

const faqs = [
  {
    q: "How do I add a new service?",
    a: "Go to Services from the bottom navigation and tap the + button. Fill in the name, price, and details, then save — it'll appear in your service list right away.",
  },
  {
    q: "How do payouts work?",
    a: "Tikdum takes a 10% platform fee on completed bookings. The rest is your payout. Payout account setup is coming soon — for now, completed earnings are tracked on your Earnings screen.",
  },
  {
    q: "How is my rating calculated?",
    a: "Your rating is the average of all ratings customers leave after a completed booking. It updates automatically as new reviews come in.",
  },
  {
    q: "How do I get verified?",
    a: "Verification is reviewed by our team based on the business information in your profile (name, category, GST number, etc.). Keep your profile complete and accurate — check Documents & KYC for your current status.",
  },
  {
    q: "A customer isn't responding in chat — what do I do?",
    a: "You can still update the booking status from the request details screen. If a booking seems abandoned, you can mark it as needed once enough time has passed.",
  },
  {
    q: "Can I turn off certain notifications?",
    a: "Yes — go to Notification Settings from your Profile to choose which notification types show up in your feed.",
  },
];

export default function HelpSupportScreen() {
  const { showToast } = useApp();
  const [openIndex, setOpenIndex] = useState(null);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      showToast("Email address copied");
    } catch {
      showToast(SUPPORT_EMAIL);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Help & Support" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Contact Us</h2>
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50"
            >
              <span className="text-lg">💬</span>
              <span className="flex-1 text-[13px] font-medium text-gray-700">Chat with us on WhatsApp</span>
              <ChevronRightIcon width={16} height={16} className="text-gray-300" />
            </a>
            <button onClick={handleCopyEmail} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50">
              <span className="text-lg">✉️</span>
              <span className="flex-1 text-[13px] font-medium text-gray-700">{SUPPORT_EMAIL}</span>
              <ChevronRightIcon width={16} height={16} className="text-gray-300" />
            </button>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Frequently Asked Questions</h2>
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {faqs.map((faq, i) => (
              <div key={faq.q}>
                <button
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="flex-1 text-[13px] font-medium text-gray-800">{faq.q}</span>
                  <ChevronRightIcon
                    width={14}
                    height={14}
                    className={`flex-shrink-0 text-gray-300 transition-transform ${openIndex === i ? "rotate-90" : ""}`}
                  />
                </button>
                {openIndex === i && (
                  <p className="px-4 pb-3.5 text-[12px] leading-relaxed text-gray-500">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
