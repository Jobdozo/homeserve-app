import { NavLink } from "react-router-dom";
import { HomeIcon, BookingsIcon, GridIcon, ChatIcon, ProfileIcon } from "./icons";

const tabs = [
  { to: "/home", label: "Home", Icon: HomeIcon },
  { to: "/bookings", label: "Bookings", Icon: BookingsIcon },
  { to: "/categories", label: "Categories", Icon: GridIcon },
  { to: "/messages", label: "Messages", Icon: ChatIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon },
];

export default function BottomNav() {
  return (
    <nav className="flex-shrink-0 border-t border-gray-100 bg-white px-2 pb-2 pt-1.5 lg:hidden">
      <div className="flex items-center justify-between">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-brand" : "text-gray-400"
              }`
            }
          >
            <Icon width={21} height={21} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
