import { NavLink, useNavigate } from "react-router-dom";
import { HomeIcon, RequestsIcon, GridIcon, WalletIcon, LogoutIcon } from "./icons";
import { useApp } from "../context/AppContext";
import LogoMark from "./LogoMark";

// The website's left menu (computer screens only). Phones keep the bottom bar.
const MAIN = [
  { to: "/dashboard", label: "Dashboard", Icon: HomeIcon },
  { to: "/requests", label: "Requests", Icon: RequestsIcon, badge: true, perm: ["orders.view_all", "orders.view_assigned"] },
  { to: "/services", label: "My services", Icon: GridIcon, perm: ["services.view", "services.manage"] },
  { to: "/earnings", label: "Earnings", Icon: WalletIcon, perm: "earnings.view" },
];
const BUSINESS = [
  { to: "/profile/ads", label: "Advertisements", emoji: "📢", perm: "ads.manage" },
  { to: "/profile/staff", label: "Staff", emoji: "👥", perm: ["staff.view", "staff.manage"] },
  { to: "/profile/documents", label: "Documents & KYC", emoji: "📄", perm: "profile.edit" },
  { to: "/profile/availability", label: "Availability", emoji: "🗓️", perm: "profile.edit" },
];
const ACCOUNT = [
  { to: "/notifications", label: "Notifications", emoji: "🔔" },
  { to: "/profile/refer", label: "Refer a friend", emoji: "🎁" },
  { to: "/profile/help", label: "Help & support", emoji: "❓" },
  { to: "/profile", label: "My profile", emoji: "🙂", end: true },
];

const itemCls = ({ isActive }) =>
  `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
    isActive ? "bg-brand-light text-brand-dark" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;

export default function DesktopSidebar() {
  const navigate = useNavigate();
  const { provider, requests, notifications, can, logout } = useApp();
  const newCount = requests.filter((r) => r.status === "Pending").length;
  const unread = notifications.filter((n) => !n.read).length;
  const allowed = (item) => !item.perm || can(item.perm);

  const section = (title, items) => {
    const shown = items.filter(allowed);
    if (shown.length === 0) return null;
    return (
      <div className="mt-6" key={title}>
        <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
        <div className="space-y-0.5">
          {shown.map(({ to, label, Icon, emoji, badge, end }) => (
            <NavLink key={to} to={to} end={end} className={itemCls}>
              {Icon ? <Icon width={18} height={18} /> : <span className="w-[18px] text-center text-[15px] leading-none">{emoji}</span>}
              <span className="flex-1">{label}</span>
              {badge && newCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{newCount}</span>
              )}
              {to === "/notifications" && unread > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    );
  };

  return (
    <aside className="hidden w-[248px] flex-shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-white px-4 py-5 lg:flex">
      <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2.5 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
          <LogoMark size={21} />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[16px] font-extrabold text-gray-900">Tikdum</span>
          <span className="block text-[11px] font-semibold text-brand">Business</span>
        </span>
      </button>

      <nav className="flex-1">
        {section("Work", MAIN)}
        {section("Business", BUSINESS)}
        {section("Account", ACCOUNT)}
      </nav>

      <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-gray-50 p-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-lg">{provider?.avatar || "🙂"}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-gray-900">{provider?.name || "Provider"}</p>
          <p className="truncate text-[10.5px] text-gray-400">{provider?.category || ""}</p>
        </div>
        <button onClick={logout} title="Log out" className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-red-500">
          <LogoutIcon width={16} height={16} />
        </button>
      </div>
    </aside>
  );
}
