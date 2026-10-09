import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "./BottomNav";
import DesktopHeader from "./DesktopHeader";
import DesktopSidebar from "./DesktopSidebar";
import Toast from "./Toast";
import OfflineBanner from "./OfflineBanner";
import { useApp } from "../context/AppContext";

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
      <p className="text-xs text-gray-400">Connecting to Tikdum Business…</p>
    </div>
  );
}

function ConnectionBanner() {
  const { connected, isOffline } = useApp();
  if (connected || isOffline) return null;
  return (
    <div className="flex-shrink-0 bg-amber-100 px-4 py-1.5 text-center text-[10.5px] font-medium text-amber-700">
      Reconnecting to server…
    </div>
  );
}

// Phone: one column with the bottom bar. Computer: menu on the left, a slim bar on top, the page filling the rest.
export function MainLayout() {
  const { loading } = useApp();
  const { pathname } = useLocation();
  // The profile menu is one long column, so it keeps a comfortable reading width on a big screen.
  const narrow = pathname === "/profile";
  return (
    <div className="app-shell">
      <DesktopSidebar />
      <div className="app-main">
        <DesktopHeader />
        <div className="app-body">
          <div className={"phone-frame" + (narrow ? " frame-narrow" : "")}>
            <OfflineBanner />
            <ConnectionBanner />
            <div className="screen no-scrollbar">{loading ? <LoadingState /> : <Outlet />}</div>
            <BottomNav />
            <Toast />
          </div>
        </div>
      </div>
    </div>
  );
}

// Detail pages (a request, add a service, settings…) read best in a narrower column.
export function DetailLayout() {
  const { loading } = useApp();
  return (
    <div className="app-shell">
      <DesktopSidebar />
      <div className="app-main">
        <DesktopHeader />
        <div className="app-body">
          <div className="phone-frame frame-narrow">
            <OfflineBanner />
            <ConnectionBanner />
            <div className="screen no-scrollbar">{loading ? <LoadingState /> : <Outlet />}</div>
            <Toast />
          </div>
        </div>
      </div>
    </div>
  );
}
