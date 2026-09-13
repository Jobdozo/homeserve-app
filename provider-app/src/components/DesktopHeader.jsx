import { NavLink, useNavigate } from "react-router-dom";
import { HomeIcon, RequestsIcon, GridIcon, WalletIcon, ProfileIcon, BellIcon } from "./icons";
import { useApp } from "../context/AppContext";

const links = [
  { to: "/dashboard", label: "Home", Icon: HomeIcon },
  { to: "/requests", label: "Requests", Icon: RequestsIcon, badgeKey: "newRequests" },
  { to: "/services", label: "Services", Icon: GridIcon },
  { to: "/earnings", label: "Earnings", Icon: WalletIcon },
];

export default function DesktopHeader() {
  const navigate = useNavigate();
  const { provider, requests, notifications } = useApp();
  const newCount = requests.filter((r) => r.status === "Pending").length;
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="hidden flex-shrink-0 border-b border-gray-100 bg-white lg:block">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-8 py-3.5">
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-lg text-white">
            🧑‍🔧
          </span>
          <span className="text-[17px] font-extrabold text-gray-900">Tikdum Pro</span>
        </button>

        <nav className="flex flex-1 items-center gap-1">
          {links.map(({ to, label, Icon, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${
                  isActive ? "bg-brand-light text-brand-dark" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <Icon width={16} height={16} />
              {label}
              {badgeKey === "newRequests" && newCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {newCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => navigate("/notifications")}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <BellIcon width={17} height={17} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => navigate("/profile")}
          className="flex flex-shrink-0 items-center gap-2 rounded-lg pl-1 hover:bg-gray-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-base">
            {provider?.avatar || <ProfileIcon width={16} height={16} />}
          </span>
          <span className="max-w-[110px] truncate text-[13px] font-semibold text-gray-800">
            {provider?.name || "Provider"}
          </span>
        </button>
      </div>
    </header>
  );
}
