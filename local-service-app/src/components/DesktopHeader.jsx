import { NavLink, useNavigate } from "react-router-dom";
import { HomeIcon, BookingsIcon, GridIcon, ChatIcon, ProfileIcon, BellIcon, SearchIcon, CartIcon } from "./icons";
import { useApp } from "../context/AppContext";
import LogoMark from "./LogoMark";

const links = [
  { to: "/home", label: "Home", Icon: HomeIcon },
  { to: "/categories", label: "Categories", Icon: GridIcon },
  { to: "/bookings", label: "My Bookings", Icon: BookingsIcon },
  { to: "/messages", label: "Messages", Icon: ChatIcon },
];

export default function DesktopHeader() {
  const navigate = useNavigate();
  const { customer, cart, notifications } = useApp();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="hidden flex-shrink-0 border-b border-gray-100 bg-white lg:block">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-8 py-3.5">
        <button onClick={() => navigate("/home")} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
            <LogoMark size={19} />
          </span>
          <span className="text-[17px] font-extrabold text-gray-900">Tikdum</span>
        </button>

        <nav className="flex flex-1 items-center gap-1">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors ${
                  isActive ? "bg-brand-light text-brand-dark" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`
              }
            >
              <Icon width={16} height={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => navigate("/search")}
          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-gray-400 hover:border-gray-300"
        >
          <SearchIcon width={15} height={15} />
          Search for services...
        </button>

        <button
          onClick={() => navigate("/cart")}
          className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        >
          <CartIcon width={18} height={18} />
          {cart.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {cart.length}
            </span>
          )}
        </button>

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
            {customer?.avatar || <ProfileIcon width={16} height={16} />}
          </span>
          <span className="max-w-[110px] truncate text-[13px] font-semibold text-gray-800">
            {customer?.name || "Account"}
          </span>
        </button>
      </div>
    </header>
  );
}
