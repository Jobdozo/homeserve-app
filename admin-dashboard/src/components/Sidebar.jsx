import { NavLink } from "react-router-dom";
import { useApp } from "../context/AppContext";
import LogoMark from "./LogoMark";
import {
  DashboardIcon,
  UsersIcon,
  ShieldCheckIcon,
  GridIcon,
  MapPinIcon,
  CalendarIcon,
  WalletIcon,
  PercentIcon,
  StarIcon,
  AlertIcon,
  BellIcon,
  ChartIcon,
  FileIcon,
  SettingsIcon,
  ArchiveIcon,
  SupportIcon,
} from "./icons";

const sections = [
  {
    items: [{ label: "Dashboard", icon: DashboardIcon, to: "/dashboard" }],
  },
  {
    title: "Users",
    items: [{ label: "Customers", icon: UsersIcon }],
  },
  {
    items: [
      { label: "Providers Verification", icon: ShieldCheckIcon, to: "/providers" },
      { label: "Services & Categories", icon: GridIcon, to: "/services" },
      { label: "Locations", icon: MapPinIcon, sub: "Cities / Areas / PIN Codes" },
      { label: "Bookings", icon: CalendarIcon, to: "/bookings" },
      { label: "Payments & Transactions", icon: WalletIcon, to: "/payments" },
      { label: "Commission", icon: PercentIcon },
      { label: "Reviews & Ratings", icon: StarIcon, to: "/reviews" },
      { label: "Disputes & Complaints", icon: AlertIcon },
      { label: "Notifications", icon: BellIcon },
    ],
  },
  {
    items: [
      { label: "Reports & Analytics", icon: ChartIcon, to: "/reports" },
      { label: "CMS", icon: FileIcon, sub: "Banners / Pages / FAQs" },
      { label: "Settings", icon: SettingsIcon },
      { label: "Audit Logs", icon: ArchiveIcon, to: "/audit-logs" },
      { label: "Support", icon: SupportIcon },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const { showToast } = useApp();

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-black/40 lg:hidden" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col bg-ink text-white transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand">
            <LogoMark size={19} />
          </span>
          <div>
            <p className="text-[15px] font-bold leading-tight">Tikdum</p>
            <p className="text-[11px] text-white/50">Super Admin</p>
          </div>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((section, i) => (
            <div key={i} className="mb-3">
              {section.title && (
                <p className="mb-1 mt-3 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-white/35">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                if (item.to) {
                  return (
                    <NavLink
                      key={item.label}
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                          isActive ? "bg-brand text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`
                      }
                    >
                      <Icon width={16} height={16} />
                      {item.label}
                    </NavLink>
                  );
                }
                return (
                  <button
                    key={item.label}
                    onClick={() => showToast(`${item.label} — coming soon`)}
                    className="mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Icon width={16} height={16} />
                    <span className="flex-1">
                      {item.label}
                      {item.sub && <span className="block text-[10px] text-white/35">{item.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
