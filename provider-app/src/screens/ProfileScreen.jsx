import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ChevronRightIcon, StarIcon, ShieldCheckIcon, EditIcon, LogoutIcon } from "../components/icons";

const verificationBadges = {
  approved: { text: "Verified", className: "bg-emerald-100 text-emerald-700" },
  pending: { text: "Pending", className: "bg-amber-100 text-amber-700" },
  rejected: { text: "Rejected", className: "bg-red-100 text-red-700" },
};

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { provider: providerProfile, showToast, logout } = useApp();

  const menuItems = [
    { icon: "💳", label: "Payout Details" },
    { icon: "📄", label: "Documents & KYC", path: "/profile/documents", badge: verificationBadges[providerProfile.verificationStatus] },
    { icon: "🗓️", label: "Manage Availability", path: "/profile/availability" },
    { icon: "🔔", label: "Notification Settings", path: "/profile/notifications" },
    { icon: "🎁", label: "Refer a Friend", path: "/profile/refer" },
    { icon: "❓", label: "Help & Support", path: "/profile/help" },
    { icon: "📄", label: "Terms & Privacy Policy", href: "/privacy.html" },
  ];

  return (
    <div className="flex flex-1 flex-col pb-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-16 lg:pt-8">
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <h1 className="text-lg font-bold text-gray-900 lg:text-2xl">Profile</h1>
        <button
          onClick={() => navigate("/profile/edit")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          <EditIcon width={16} height={16} />
        </button>
      </div>

      <div className="mx-4 mt-4 flex items-center gap-3 lg:mx-0 lg:mt-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-light text-3xl lg:h-20 lg:w-20 lg:text-4xl">
          {providerProfile.avatar}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[15px] font-bold text-gray-900 lg:text-lg">{providerProfile.name}</p>
            {providerProfile.verified && <ShieldCheckIcon width={15} height={15} className="text-brand" />}
          </div>
          <p className="text-[12px] text-gray-500 lg:text-sm">{providerProfile.category}</p>
          <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500 lg:text-[13px]">
            <StarIcon filled width={13} height={13} /> {providerProfile.rating} ({providerProfile.reviews}+ Reviews)
          </div>
        </div>
      </div>

      <div className="mx-4 mt-5 rounded-2xl border border-gray-100 p-4 lg:mx-0 lg:p-6">
        <h2 className="mb-3 text-[13px] font-bold text-gray-900 lg:text-[15px]">Business Information</h2>
        <InfoRow label="Business Name" value={providerProfile.businessName} />
        <InfoRow label="Experience" value={providerProfile.experience} />
        <InfoRow label="Service Area" value={providerProfile.serviceArea} />
        <InfoRow label="Phone" value={providerProfile.phone} />
        <InfoRow label="Email" value={providerProfile.email} />
        <InfoRow label="GST Number" value={providerProfile.gstNumber} last />
      </div>

      <div className="mx-4 mt-4 divide-y divide-gray-100 rounded-2xl border border-gray-100 lg:mx-0">
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={() =>
              item.path ? navigate(item.path) : item.href ? window.open(item.href, "_blank") : showToast(`${item.label} coming soon`)
            }
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 lg:px-5 lg:py-4"
          >
            <span className="text-lg">{item.icon}</span>
            <span className="flex-1 text-[13px] font-medium text-gray-700">{item.label}</span>
            {item.badge && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.badge.className}`}>
                {item.badge.text}
              </span>
            )}
            <ChevronRightIcon width={16} height={16} className="text-gray-300" />
          </button>
        ))}
      </div>

      <button
        onClick={logout}
        className="mx-4 mt-4 flex items-center justify-center gap-2 rounded-2xl border border-red-200 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 lg:mx-0"
      >
        <LogoutIcon width={16} height={16} /> Logout
      </button>
    </div>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <div className={`flex items-center justify-between py-2 text-[12.5px] ${last ? "" : "border-b border-gray-50"}`}>
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
