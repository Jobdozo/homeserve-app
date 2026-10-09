import { useLocation, useNavigate } from "react-router-dom";
import { BellIcon } from "./icons";
import { useApp } from "../context/AppContext";

const TITLES = {
  "/dashboard": "Dashboard",
  "/requests": "Requests",
  "/services": "My services",
  "/earnings": "Earnings",
  "/profile": "My profile",
  "/notifications": "Notifications",
};

// Slim bar above the page on computer screens: where you are, the wallet, the bell, and who you are.
export default function DesktopHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { provider, notifications, wallet } = useApp();
  const unread = notifications.filter((n) => !n.read).length;
  const title = TITLES[pathname] || "";

  return (
    <header className="hidden h-[60px] flex-shrink-0 items-center gap-4 border-b border-gray-100 bg-white px-8 lg:flex">
      <p className="flex-1 text-[15px] font-bold text-gray-900">{title}</p>
      <div className="hidden items-center gap-2 rounded-full bg-gray-50 px-3.5 py-1.5 text-[12.5px] xl:flex" title="Your wallet pays Tikdum's fee when you accept a request">
        <span className="text-gray-400">Wallet</span>
        <span className={"font-bold " + (wallet?.suspended ? "text-red-600" : "text-gray-900")}>₹{Number(wallet?.balance || 0).toLocaleString("en-IN")}</span>
      </div>
      <button onClick={() => navigate("/notifications")} className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
        <BellIcon width={17} height={17} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unread}</span>
        )}
      </button>
      <button onClick={() => navigate("/profile")} className="flex items-center gap-2 rounded-lg pl-1 hover:bg-gray-50">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-base">{provider?.avatar || "🙂"}</span>
        <span className="max-w-[140px] truncate text-[13px] font-semibold text-gray-800">{provider?.name || "Provider"}</span>
      </button>
    </header>
  );
}
