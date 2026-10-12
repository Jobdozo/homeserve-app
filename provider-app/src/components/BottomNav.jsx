import { NavLink, useLocation } from "react-router-dom";
import { OrdersIcon, InsightsIcon, ToolIcon, RupeeIcon, GrowIcon } from "./icons";
import { useApp } from "../context/AppContext";

// A floating dark bar; the open tab is a light pill. Orders also lights up on a job page.
const tabs = [
  { to: "/dashboard", label: "Orders", Icon: OrdersIcon, also: ["/requests"], badge: true },
  { to: "/insights", label: "Insights", Icon: InsightsIcon, also: ["/feedback"] },
  { to: "/services", label: "Services", Icon: ToolIcon, perm: ["services.view", "services.manage"] },
  { to: "/earnings", label: "Money", Icon: RupeeIcon, perm: "earnings.view", also: ["/money"] },
  { to: "/grow", label: "Grow", Icon: GrowIcon, also: ["/profile", "/ready"] },
];

export default function BottomNav() {
  const { requests, can } = useApp();
  const { pathname } = useLocation();
  const newCount = requests.filter((r) => r.status === "Pending").length;
  const shown = tabs.filter((t) => !t.perm || can(t.perm));

  return (
    <nav aria-label="Main" className="flex-shrink-0 px-3 pb-3 pt-1 lg:hidden">
      <div className="grid gap-1 rounded-[24px] border border-gray-200 bg-card p-1.5 shadow-float" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map(({ to, label, Icon, badge, also = [] }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => {
              const on = isActive || also.some((p) => pathname.startsWith(p));
              return `relative flex h-14 flex-col items-center justify-center gap-[3px] rounded-[18px] text-[11.5px] transition-colors ${
                on ? "bg-ink font-extrabold text-ground" : "font-bold text-ink-muted"
              }`;
            }}
          >
            <Icon width={20} height={20} strokeWidth={2.2} />
            {label}
            {badge && newCount > 0 && (
              <span className="absolute right-3 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-marigold px-1 text-[10px] font-extrabold text-marigold-ink">
                {newCount}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
