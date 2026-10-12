import { NavLink, useNavigate } from "react-router-dom";
import { OrdersIcon, InsightsIcon, ToolIcon, RupeeIcon, GrowIcon, StarIcon, TagIcon, MegaphoneIcon, UsersIcon, DocIcon, CalendarIcon, BellIcon, ShieldCheckIcon, InfoIcon, ProfileIcon, LogoutIcon } from "./icons";
import { useApp } from "../context/AppContext";
import LogoMark from "./LogoMark";
import Avatar from "./Avatar";

// The website's left menu (computer screens only). Phones keep the bottom bar.
const MAIN = [
  { to: "/dashboard", label: "Orders", Icon: OrdersIcon, badge: true },
  { to: "/insights", label: "Insights", Icon: InsightsIcon },
  { to: "/services", label: "Services", Icon: ToolIcon, perm: ["services.view", "services.manage"] },
  { to: "/earnings", label: "Money", Icon: RupeeIcon, perm: "earnings.view" },
  { to: "/grow", label: "Grow", Icon: GrowIcon, end: true },
];
const BUSINESS = [
  { to: "/feedback", label: "Reviews & complaints", Icon: StarIcon },
  { to: "/grow/offers", label: "Offers", Icon: TagIcon },
  { to: "/profile/ads", label: "Ads", Icon: MegaphoneIcon, perm: "ads.manage" },
  { to: "/profile/staff", label: "Staff", Icon: UsersIcon, perm: ["staff.view", "staff.manage"] },
  { to: "/profile/documents", label: "Documents & KYC", Icon: DocIcon, perm: "profile.edit" },
  { to: "/profile/availability", label: "Working hours", Icon: CalendarIcon, perm: "profile.edit" },
];
const ACCOUNT = [
  { to: "/notifications", label: "Notifications", Icon: BellIcon },
  { to: "/ready", label: "Ready check", Icon: ShieldCheckIcon },
  { to: "/profile/help", label: "Help & support", Icon: InfoIcon },
  { to: "/profile", label: "My profile", Icon: ProfileIcon, end: true },
];

const itemCls = ({ isActive }) =>
  `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
    isActive ? "bg-ink text-ground" : "text-ink-soft hover:bg-raised hover:text-ink"
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
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-marigold px-1.5 text-[10px] font-extrabold text-marigold-ink">{newCount}</span>
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
    <aside className="hidden w-[248px] flex-shrink-0 flex-col overflow-y-auto border-r border-gray-100 bg-card px-4 py-5 lg:flex">
      <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2.5 px-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-night text-white">
          <LogoMark size={21} />
        </span>
        <span className="text-left leading-tight">
          <span className="block font-display text-[17px] font-extrabold text-ink">Tikdum</span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-marigold">Business</span>
        </span>
      </button>

      <nav className="flex-1">
        {section("Work", MAIN)}
        {section("Business", BUSINESS)}
        {section("Account", ACCOUNT)}
      </nav>

      <div className="mt-6 flex items-center gap-2.5 rounded-xl bg-gray-50 p-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light text-lg"><Avatar provider={provider} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-gray-900">{provider?.name || "Provider"}</p>
          <p className="truncate text-[10.5px] text-gray-400">{provider?.category || ""}</p>
        </div>
        <button onClick={logout} title="Log out" className="rounded-lg p-1.5 text-gray-400 hover:bg-raised hover:text-red-500">
          <LogoutIcon width={16} height={16} />
        </button>
      </div>
    </aside>
  );
}
