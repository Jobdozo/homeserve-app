import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";
import DesktopHeader from "./DesktopHeader";
import Toast from "../components/Toast";
import { useApp } from "../context/AppContext";

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
      <p className="text-xs text-gray-400">Connecting to HomeServe…</p>
    </div>
  );
}

function ConnectionBanner() {
  const { connected } = useApp();
  if (connected) return null;
  return (
    <div className="flex-shrink-0 bg-amber-100 px-4 py-1.5 text-center text-[10.5px] font-medium text-amber-700">
      Reconnecting to server…
    </div>
  );
}

export function MainLayout() {
  const { loading } = useApp();
  return (
    <div className="app-shell">
      <DesktopHeader />
      <div className="app-body">
        <div className="phone-frame">
          <ConnectionBanner />
          <div className="screen no-scrollbar">{loading ? <LoadingState /> : <Outlet />}</div>
          <BottomNav />
          <Toast />
        </div>
      </div>
    </div>
  );
}

export function DetailLayout() {
  const { loading } = useApp();
  return (
    <div className="app-shell">
      <DesktopHeader />
      <div className="app-body">
        <div className="phone-frame">
          <ConnectionBanner />
          <div className="screen no-scrollbar">{loading ? <LoadingState /> : <Outlet />}</div>
          <Toast />
        </div>
      </div>
    </div>
  );
}
