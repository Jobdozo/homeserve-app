import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
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

// True once the live link has been down for `ms`: opening the app and short
// network blips reconnect on their own and never show anything.
function useDownFor(connected, ms) {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (connected) {
      setDown(false);
      return undefined;
    }
    const t = setTimeout(() => setDown(true), ms);
    return () => clearTimeout(t);
  }, [connected, ms]);
  return down;
}

// A small pill above the bottom bar (under any toast) while the live link (new requests, chat)
// is down. The offline banner already covers "no network".
function ConnectionBanner() {
  const { connected, isOffline } = useApp();
  const down = useDownFor(connected, 8000);
  if (!down || isOffline) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center" role="status">
      <span className="flex items-center gap-1.5 rounded-full bg-raised/95 px-3 py-1 text-[11px] font-medium text-gray-900 shadow-lg ring-1 ring-white/10 backdrop-blur">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Live updates paused · reconnecting
      </span>
    </div>
  );
}

// Phone: one column with the bottom bar. Computer: menu on the left, a slim bar on top, the page filling the rest.
export function MainLayout() {
  const { loading } = useApp();
  return (
    <div className="app-shell">
      <DesktopSidebar />
      <div className="app-main">
        <DesktopHeader />
        <div className="app-body">
          <div className="phone-frame">
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
