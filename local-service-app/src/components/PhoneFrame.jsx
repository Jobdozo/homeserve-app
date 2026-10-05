import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "./BottomNav";
import DesktopHeader from "./DesktopHeader";
import DesktopFooter from "./DesktopFooter";
import Toast from "../components/Toast";
import OfflineBanner from "./OfflineBanner";
import { useApp } from "../context/AppContext";

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
      <p className="text-xs text-gray-400">Connecting to Tikdum…</p>
    </div>
  );
}

function ConnectionBanner() {
  const { connected, isOffline } = useApp();
  // The offline banner already covers "no network" more precisely — don't
  // also show "reconnecting" underneath it.
  if (connected || isOffline) return null;
  return (
    <div className="flex-shrink-0 bg-amber-100 px-4 py-1.5 text-center text-[10.5px] font-medium text-amber-700">
      Reconnecting to server…
    </div>
  );
}

// Desktop pages that are full-width marketing-style pages instead of the
// narrow centered column.
function isWidePath(pathname) {
  return pathname === "/home" || pathname === "/categories" || pathname.startsWith("/category/");
}

export function MainLayout() {
  const { loading } = useApp();
  // On desktop the home page is a full-width marketing page; every other
  // screen stays in the narrow centered column.
  const wide = isWidePath(useLocation().pathname);
  return (
    <div className="app-shell">
      <DesktopHeader />
      <div className={`app-body${wide ? " wide" : ""}`}>
        <div className={`phone-frame${wide ? " wide" : ""}`}>
          <OfflineBanner />
          <ConnectionBanner />
          <div className="screen no-scrollbar">{loading ? <LoadingState /> : <Outlet />}</div>
          <BottomNav />
          <Toast />
        </div>
      </div>
      <DesktopFooter />
    </div>
  );
}

export function DetailLayout() {
  const { loading } = useApp();
  const wide = isWidePath(useLocation().pathname);
  return (
    <div className="app-shell">
      <DesktopHeader />
      <div className={`app-body${wide ? " wide" : ""}`}>
        <div className={`phone-frame${wide ? " wide" : ""}`}>
          <OfflineBanner />
          <ConnectionBanner />
          <div className="screen no-scrollbar">{loading ? <LoadingState /> : <Outlet />}</div>
          <Toast />
        </div>
      </div>
      <DesktopFooter />
    </div>
  );
}
