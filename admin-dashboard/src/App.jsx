import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import Layout from "./components/Layout";
import LoginScreen from "./screens/LoginScreen";
import DashboardPage from "./pages/DashboardPage";
import CustomersPage from "./pages/CustomersPage";
import ProvidersPage from "./pages/ProvidersPage";
import ServicesPage from "./pages/ServicesPage";
import HomeLayoutPage from "./pages/HomeLayoutPage";
import MonitoringPage from "./pages/MonitoringPage";
import ComplaintsPage from "./pages/ComplaintsPage";
import BookingsPage from "./pages/BookingsPage";
import ReviewsPage from "./pages/ReviewsPage";
import DisputesPage from "./pages/DisputesPage";
import PaymentsPage from "./pages/PaymentsPage";
import ReportsPage from "./pages/ReportsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import SettingsPage from "./pages/SettingsPage";
import DataManagementPage from "./pages/DataManagementPage";
import NotificationsPage from "./pages/NotificationsPage";
import UserManagementPage from "./pages/UserManagementPage";

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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
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
    ["/services", <ServicesPage />, "services.view"],
    ["/home-layout", <HomeLayoutPage />, "cms.view"],
    ["/monitoring", <MonitoringPage />, "monitoring.view"],
    ["/complaints", <ComplaintsPage />, "complaints.view"],
    ["/bookings", <BookingsPage />, "bookings.view"],
    ["/reviews", <ReviewsPage />, "reviews.view"],
    ["/disputes", <DisputesPage />, "complaints.view"],
    ["/payments", <PaymentsPage />, "payments.view"],
    ["/reports", <ReportsPage />, "reports.view"],
    ["/audit-logs", <AuditLogsPage />, "audit.view"],
    ["/settings", <SettingsPage />, "settings.view"],
    ["/data", <DataManagementPage />, ["data.export", "data.import"]],
    ["/notifications", <NotificationsPage />, "notifications.view"],
    ["/users", <UserManagementPage />, "users.view"],
  ];
  const landing = routes.find(([, , perm]) => can(perm))?.[0];

  return (
    <Routes>
      <Route element={<Layout />}>
        {routes.map(([path, page, perm]) => (
          <Route key={path} path={path} element={can(perm) ? page : <NoAccess />} />
        ))}
      </Route>
      <Route path="*" element={landing ? <Navigate to={landing} replace /> : <NoAccess />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppProvider>
  );
}
