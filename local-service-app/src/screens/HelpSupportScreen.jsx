import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import CartBar from "../components/CartBar";
import { ChevronRightIcon } from "../components/icons";

const SUPPORT_EMAIL = "support@tikdum.com";
const SUPPORT_PHONE = "+919419149336";
const SUPPORT_PHONE_LABEL = "+91 94191 49336";

function ContactRow({ icon, title, detail, href, external }) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 lg:px-5 lg:py-4"
    >
      <span className="text-lg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-gray-800 lg:text-[14px]">{title}</span>
        <span className="block truncate text-[11.5px] text-gray-500 lg:text-[12.5px]">{detail}</span>
      </span>
      <ChevronRightIcon width={16} height={16} className="text-gray-300" />
    </a>
  );
}

export default function HelpSupportScreen() {
  const { bookings } = useApp();
  const hasBookings = bookings.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Help & Support" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Contact us</h2>
          <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-card">
            <ContactRow icon="📞" title="Call us" detail={SUPPORT_PHONE_LABEL} href={`tel:${SUPPORT_PHONE}`} />
            <ContactRow icon="💬" title="Chat on WhatsApp" detail={SUPPORT_PHONE_LABEL} href={`https://wa.me/${SUPPORT_PHONE.slice(1)}`} external />
            <ContactRow icon="✉️" title="Email us" detail={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
          </div>
          {hasBookings && (
            <p className="mt-2 text-[11.5px] text-gray-500">
              About a booking? Mention its request ID (shown on the booking screen) so we can find it quickly.
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">More</h2>
          <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-card">
            <ContactRow icon="📄" title="Terms & Privacy Policy" detail="How we handle your information" href="/privacy.html" external />
            <ContactRow icon="🗑️" title="Delete my account" detail="Profile → Delete account, or ask us to do it" href="/delete-account.html" external />
          </div>
        </div>
      </div>
      <CartBar />
    </div>
  );
}
