import { NavLink } from "react-router-dom";
import { HomeIcon, BookingsIcon, GridIcon, ChatIcon, ProfileIcon } from "./icons";

const tabs = [
  { to: "/home", label: "Home", Icon: HomeIcon },
  { to: "/bookings", label: "Bookings", Icon: BookingsIcon },
  { to: "/categories", label: "Categories", Icon: GridIcon },
  { to: "/messages", label: "Messages", Icon: ChatIcon },
  { to: "/profile", label: "Profile", Icon: ProfileIcon },
];

// A dark floating bar; the open tab is a marigold pill with its name.
export default function BottomNav() {
  return (
    <nav className="flex-shrink-0 bg-transparent px-3 pb-2.5 pt-1.5 lg:hidden">
      <div className="flex h-[60px] items-center justify-between rounded-[22px] bg-ink px-2 shadow-float">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) =>
              `flex h-11 items-center justify-center gap-1.5 rounded-2xl transition-all duration-200 ${
                isActive ? "flex-[1.6] bg-marigold px-3 text-[13px] font-bold text-ink" : "flex-1 text-[#C9C0F2] active:scale-90"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon width={isActive ? 18 : 21} height={isActive ? 18 : 21} />
                {isActive && <span className="animate-fade-up">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
