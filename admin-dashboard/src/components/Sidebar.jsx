import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../api";
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
  StarIcon,
  AlertIcon,
  BellIcon,
  ChartIcon,
  FileIcon,
  SettingsIcon,
  ArchiveIcon,
  SupportIcon,
  DownloadIcon,
  RequestIcon,
  BotIcon,
  ChatIcon,
  PipelineIcon,
  CameraIcon,
} from "./icons";

const sections = [
  {
    items: [{ label: "Dashboard", icon: DashboardIcon, to: "/dashboard", perm: "dashboard.view" }],
  },
  {
    title: "Users",
    items: [{ label: "Customers", icon: UsersIcon, to: "/customers", perm: "customers.view" }],
  },
  {
    items: [
      { label: "Providers Verification", icon: ShieldCheckIcon, to: "/providers", perm: "providers.view" },
      { label: "Provider CRM", icon: PipelineIcon, to: "/crm", perm: "crm.view", badge: "crm" },
      { label: "Live Provider Monitoring", icon: RequestIcon, to: "/monitoring", perm: "monitoring.view" },
      { label: "Services & Categories", icon: GridIcon, to: "/services", perm: "services.view" },
      { label: "Locations", icon: MapPinIcon, to: "/locations", perm: "locations.view" },
      { label: "Bookings", icon: CalendarIcon, to: "/bookings", perm: "bookings.view" },
      { label: "Payments & Transactions", icon: WalletIcon, to: "/payments", perm: "payments.view" },
      { label: "Accounting & GST", icon: FileIcon, to: "/accounting", perm: "accounting.view" },
      { label: "Reviews & Ratings", icon: StarIcon, to: "/reviews", perm: "reviews.view" },
      { label: "Complaints & Disputes", icon: AlertIcon, to: "/complaints", perm: "complaints.view" },
      { label: "Notifications", icon: BellIcon, to: "/notifications", perm: "notifications.view" },
      { label: "WhatsApp Inbox", icon: ChatIcon, to: "/inbox", perm: "inbox.view" },
      { label: "Social Media", icon: ChartIcon, to: "/social", perm: "social.view" },
      { label: "Blog", icon: FileIcon, to: "/blog", perm: "blog.view" },
      { label: "Video Studio", icon: CameraIcon, to: "/video-studio", perm: "social.view" },
    ],
  },
  {
    items: [
      { label: "Reports & Analytics", icon: ChartIcon, to: "/reports", perm: "reports.view" },
      { label: "Home Layout (CMS)", icon: FileIcon, to: "/home-layout", perm: "cms.view" },
      { label: "Import & Export", icon: DownloadIcon, to: "/data", perm: ["data.export", "data.import"] },
      { label: "User Management", icon: UsersIcon, to: "/users", perm: "users.view" },
      { label: "AI Agents", icon: BotIcon, to: "/ai-agents", perm: "ai.view" },
      { label: "Settings", icon: SettingsIcon, to: "/settings", perm: "settings.view" },
      { label: "Paid Services", icon: CalendarIcon, to: "/paid-services", perm: "*" },
      { label: "Audit Logs", icon: ArchiveIcon, to: "/audit-logs", perm: "audit.view" },
      { label: "Support", icon: SupportIcon, perm: "*" },
    ],
  },
];

export default function Sidebar({ open, onClose }) {
  const { showToast, admin, can } = useApp();
  // Provider CRM badge: my follow-ups due today or late, plus unassigned ones.
  const [crmDue, setCrmDue] = useState(null);
  const canCrm = can("crm.view");
  useEffect(() => {
    if (!canCrm) return undefined;
    const load = () =>
      api
        .crmSummary()
        .then((s) => setCrmDue({ count: s.mineDue + s.unassignedDue, late: s.mineOverdue > 0 }))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [canCrm]);
  const badges = { crm: crmDue };
  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((item) => !item.perm || can(item.perm)) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-black/40 lg:hidden" />}
      <aside
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          // Same brand-orange strips as the page, so the open menu matches.
          boxShadow:
            "inset 0 env(safe-area-inset-top) 0 0 #d97706, inset 0 calc(-1 * env(safe-area-inset-bottom)) 0 0 #d97706",
        }}
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
            <p className="text-[11px] text-white/50">{admin?.roleName || "Super Admin"}</p>
          </div>
        </div>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
          {visibleSections.map((section, i) => (
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
                      <span className="flex-1">{item.label}</span>
                      {item.badge && badges[item.badge]?.count > 0 && (
                        <span className={`rounded-full px-1.5 text-[10.5px] font-bold tabular-nums ${badges[item.badge].late ? "bg-red-500 text-white" : "bg-white/15 text-white"}`}>
                          {badges[item.badge].count}
                        </span>
                      )}
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
