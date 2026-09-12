import { NavLink } from "react-router-dom";
import { HomeIcon, RequestsIcon, GridIcon, WalletIcon, ProfileIcon } from "./icons";
import { useApp } from "../context/AppContext";

const tabs = [
  { to: "/dashboard", label: "Home", Icon: HomeIcon },
  { to: "/requests", label: "Requests", Icon: RequestsIcon, badgeKey: "newRequests" },
  { to: "/services", label: "Services", Icon: GridIcon },
  { to: "/earnings", label: "Earnings", Icon: WalletIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon },
];

export default function BottomNav() {
  const { requests } = useApp();
  const newCount = requests.filter((r) => r.status === "Pending").length;

  return (
    <nav className="flex-shrink-0 border-t border-gray-100 bg-white px-2 pb-2 pt-1.5 lg:hidden">
      <div className="flex items-center justify-between">
        {tabs.map(({ to, label, Icon, badgeKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-brand" : "text-gray-400"
              }`
            }
          >
            <span className="relative">
              <Icon width={21} height={21} />
              {badgeKey === "newRequests" && newCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                  {newCount}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
