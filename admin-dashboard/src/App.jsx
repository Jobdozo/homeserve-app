import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAndroidBackButton } from "./utils/useAndroidBackButton";
import { AppProvider, useApp } from "./context/AppContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import LoginScreen from "./screens/LoginScreen";
import LogoMark from "./components/LogoMark";
// Each page is downloaded the first time it's opened, so the admin site starts faster.
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ProvidersPage = lazy(() => import("./pages/ProvidersPage"));
const ProviderPage = lazy(() => import("./pages/ProviderPage"));
const ProviderCrmPage = lazy(() => import("./pages/ProviderCrmPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const HomeLayoutPage = lazy(() => import("./pages/HomeLayoutPage"));
const LocationsPage = lazy(() => import("./pages/LocationsPage"));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage"));
const ComplaintsPage = lazy(() => import("./pages/ComplaintsPage"));
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage"));
const DisputesPage = lazy(() => import("./pages/DisputesPage"));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const PaidServicesPage = lazy(() => import("./pages/PaidServicesPage"));
const SocialMediaPage = lazy(() => import("./pages/SocialMediaPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const VideoStudioPage = lazy(() => import("./pages/VideoStudioPage"));
const SettingsPage = lazy(() => import("./pages/SettingsHubPage"));
const DataManagementPage = lazy(() => import("./pages/DataManagementPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));
const AiAgentsPage = lazy(() => import("./pages/AiAgentsPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const AccountingPage = lazy(() => import("./pages/AccountingPage"));

function NoAccess() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="text-[15px] font-bold text-gray-800">You don't have access to this section</p>
      <p className="max-w-sm text-[12.5px] text-gray-500">Ask a Super Admin to update your role's permissions in User Management.</p>
    </div>
  );
}

function AppRoutes() {
  const { admin, authLoading, can } = useApp();
  const { pathname } = useLocation();
  // Android back button: one screen back inside the app; on the first screen
  // (or before login) press twice to exit.
  useAndroidBackButton({ rootPath: "/dashboard", atRoot: authLoading || !admin || pathname === "/dashboard" || pathname === "/" });

  if (authLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-50">
        <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-brand text-white">
          <LogoMark size={34} />
        </div>
      </div>
    );
  }

  if (!admin) return <LoginScreen />;

  // Each route needs a permission; the landing page is the first one this
  // staff account can open.
  const routes = [
    ["/dashboard", <DashboardPage />, "dashboard.view"],
    ["/customers", <CustomersPage />, "customers.view"],
    ["/providers", <ProvidersPage />, "providers.view"],
    ["/providers/:providerId", <ProviderPage />, "providers.view"],
    ["/crm", <ProviderCrmPage />, "crm.view"],
    ["/services", <ServicesPage />, "services.view"],
    ["/home-layout", <HomeLayoutPage />, "cms.view"],
    ["/locations", <LocationsPage />, "locations.view"],
    ["/monitoring", <MonitoringPage />, "monitoring.view"],
    ["/complaints", <ComplaintsPage />, "complaints.view"],
    ["/bookings", <BookingsPage />, "bookings.view"],
    ["/reviews", <ReviewsPage />, "reviews.view"],
    ["/disputes", <DisputesPage />, "complaints.view"],
    ["/payments", <PaymentsPage />, "payments.view"],
    ["/reports", <ReportsPage />, "reports.view"],
    ["/audit-logs", <AuditLogsPage />, "audit.view"],
    ["/paid-services", <PaidServicesPage />, "*"], // Super Admin only (costs and accounts)
    ["/settings", <SettingsPage />, "settings.view"],
    ["/data", <DataManagementPage />, ["data.export", "data.import"]],
    ["/notifications", <NotificationsPage />, "notifications.view"],
    ["/users", <UserManagementPage />, "users.view"],
    ["/ai-agents", <AiAgentsPage />, "ai.view"],
    ["/inbox", <InboxPage />, "inbox.view"],
    ["/social", <SocialMediaPage />, "social.view"],
    ["/blog", <BlogPage />, "blog.view"],
    ["/video-studio", <VideoStudioPage />, "social.view"],
    ["/accounting", <AccountingPage />, "accounting.view"],
  ];
  const landing = routes.find(([, , perm]) => can(perm))?.[0];

  return (
    <Routes>
      <Route element={<Layout />}>
        {routes.map(([path, page, perm]) => (
          <Route key={path} path={path} element={can(perm) ? <Suspense fallback={<PageLoading />}>{page}</Suspense> : <NoAccess />} />
        ))}
      </Route>
      <Route path="*" element={landing ? <Navigate to={landing} replace /> : <NoAccess />} />
    </Routes>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-brand" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ErrorBoundary>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </ErrorBoundary>
    </AppProvider>
  );
}
