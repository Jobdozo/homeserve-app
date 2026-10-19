import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "./BottomNav";
import DesktopHeader from "./DesktopHeader";
import DesktopFooter from "./DesktopFooter";
import Toast from "../components/Toast";
import OfflineBanner from "./OfflineBanner";
import AppBanner from "./AppBanner";
import { useApp } from "../context/AppContext";

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
      <p className="text-xs text-gray-400">Connecting to Tikdum…</p>
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

// A small pill above the bottom bar (under any toast) while the live link (booking status,
// provider location, chat) is down. The offline banner already covers "no network".
function ConnectionBanner() {
  const { connected, isOffline } = useApp();
  const down = useDownFor(connected, 8000);
  if (!down || isOffline) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 z-40 flex justify-center" role="status">
      <span className="flex items-center gap-1.5 rounded-full bg-gray-900/85 px-3 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Live updates paused · reconnecting
      </span>
    </div>
  );
}

// Desktop pages that are full-width marketing-style pages instead of the
// narrow centered column.
// The first part of every app screen's address; anything else of one or two parts is a city
// page (tikdum.com/jammu, /jammu/ac-repair — CityPageScreen), which is wide too.
const APP_SCREENS = new Set([
  "home", "categories", "category", "find-service", "service", "cart", "bookings", "profile", "search", "provider", "services",
  "booking-protection", "booking", "chat", "review", "rate", "notifications", "refer", "address", "messages", "login",
]);
function isCityPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 1 && parts.length <= 2 && !APP_SCREENS.has(parts[0]);
}

function isWidePath(pathname) {
  return (
    pathname === "/home" ||
    pathname === "/categories" ||
    pathname.startsWith("/category/") ||
    pathname.startsWith("/find-service/") ||
    pathname.startsWith("/service/") ||
    pathname === "/cart" ||
    pathname === "/bookings" ||
    pathname === "/profile" ||
    isCityPath(pathname)
  );
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
          <AppBanner />
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
          <AppBanner />
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
