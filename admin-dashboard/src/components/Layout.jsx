import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import Toast from "./Toast";
import { useApp } from "../context/AppContext";

const TITLES = {
  "/dashboard": { title: "Dashboard", subtitle: "Welcome back, Super Admin 👋" },
  "/customers": { title: "Customers", subtitle: "Everyone who's booked a service on Tikdum" },
  "/providers": { title: "Providers Verification", subtitle: "Review and manage service providers" },
  "/services": { title: "Services & Categories", subtitle: "Moderate the live service catalog" },
  "/home-layout": { title: "Home Layout (CMS)", subtitle: "Customer home sections and promotional banners" },
  "/monitoring": { title: "Live Service Provider Monitoring", subtitle: "Real-time provider status, orders and reports" },
  "/bookings": { title: "Bookings", subtitle: "All bookings across every provider" },
  "/reviews": { title: "Reviews & Ratings", subtitle: "Customer feedback across the platform" },
  "/payments": { title: "Payments & Transactions", subtitle: "Revenue, platform fees, and provider payouts" },
  "/reports": { title: "Reports & Analytics", subtitle: "Revenue, bookings, and provider performance" },
  "/audit-logs": { title: "Audit Logs", subtitle: "Every platform event, in order" },
  "/settings": { title: "Settings", subtitle: "Platform-wide configuration" },
  "/notifications": { title: "Notifications", subtitle: "Broadcast messages to customers and providers" },
};

function ConnectionBanner() {
  const { connected } = useApp();
  if (connected) return null;
  return (
    <div className="flex-shrink-0 bg-amber-100 px-4 py-1.5 text-center text-[11px] font-medium text-amber-700">
      Reconnecting to server…
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
      <p className="text-xs text-gray-400">Loading admin data…</p>
    </div>
  );
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loading } = useApp();
  const location = useLocation();
  const meta = TITLES[location.pathname] || { title: "Admin" };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6FA]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={meta.title} subtitle={meta.subtitle} onMenuClick={() => setSidebarOpen(true)} />
        <ConnectionBanner />
        <main className="no-scrollbar relative flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? <LoadingState /> : <Outlet />}
        </main>
      </div>
      <Toast />
    </div>
  );
}
