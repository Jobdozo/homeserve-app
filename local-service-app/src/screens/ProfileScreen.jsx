import { useApp } from "../context/AppContext";
import { ChevronRightIcon, StarIcon } from "../components/icons";

const menuItems = [
  { icon: "📍", label: "Saved Addresses" },
  { icon: "💳", label: "Payment Methods" },
  { icon: "🎟️", label: "Coupons & Offers" },
  { icon: "🔔", label: "Notification Settings" },
  { icon: "❓", label: "Help & Support" },
  { icon: "📄", label: "Terms & Privacy Policy" },
];

export default function ProfileScreen() {
  const { customer, bookings, showToast } = useApp();
  const completed = bookings.filter((b) => b.status === "Completed").length;

  return (
    <div className="flex flex-1 flex-col pb-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-16 lg:pt-8">
      <h1 className="px-4 pt-1 text-lg font-bold text-gray-900 lg:px-0 lg:pt-0 lg:text-2xl">Profile</h1>

      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-4 text-white lg:mx-0 lg:mt-6 lg:p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-2xl lg:h-16 lg:w-16 lg:text-3xl">
          {customer?.avatar || "🧑"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold lg:text-lg">{customer?.name}</p>
          <p className="text-[11.5px] text-white/75 lg:text-sm">{customer?.email}</p>
        </div>
      </div>

      <div className="mx-4 mt-4 grid grid-cols-3 gap-2 text-center lg:mx-0 lg:mt-4 lg:gap-4">
        <div className="rounded-xl bg-white py-3 shadow-card lg:py-5">
          <p className="text-lg font-extrabold text-gray-900 lg:text-2xl">{bookings.length}</p>
          <p className="text-[10.5px] text-gray-400 lg:text-xs">Total Bookings</p>
        </div>
        <div className="rounded-xl bg-white py-3 shadow-card lg:py-5">
          <p className="text-lg font-extrabold text-gray-900 lg:text-2xl">{completed}</p>
          <p className="text-[10.5px] text-gray-400 lg:text-xs">Completed</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-3 shadow-card lg:py-5">
          <div className="flex items-center gap-1">
            <StarIcon filled width={14} height={14} />
            <p className="text-lg font-extrabold text-gray-900 lg:text-2xl">4.9</p>
          </div>
          <p className="text-[10.5px] text-gray-400 lg:text-xs">Your Rating</p>
        </div>
      </div>

      <div className="mx-4 mt-4 divide-y divide-gray-100 rounded-2xl bg-white shadow-card lg:mx-0">
        {menuItems.map((item) => (
          <button
            key={item.label}
            onClick={() => showToast(`${item.label} coming soon`)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 lg:px-5 lg:py-4"
          >
            <span className="text-lg">{item.icon}</span>
            <span className="flex-1 text-[13px] font-medium text-gray-700 lg:text-[14px]">{item.label}</span>
            <ChevronRightIcon width={16} height={16} className="text-gray-300" />
          </button>
        ))}
      </div>

      <button
        onClick={() => showToast("Logged out (demo)")}
        className="mx-4 mt-4 rounded-2xl border border-red-200 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 lg:mx-0"
      >
        Logout
      </button>
    </div>
  );
}
