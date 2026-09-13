import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import RequestsScreen from "./screens/RequestsScreen";
import RequestDetailsScreen from "./screens/RequestDetailsScreen";
import ServicesScreen from "./screens/ServicesScreen";
import AddServiceScreen from "./screens/AddServiceScreen";
import EarningsScreen from "./screens/EarningsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import EditProfileScreen from "./screens/EditProfileScreen";
import DocumentsKycScreen from "./screens/DocumentsKycScreen";
import ManageAvailabilityScreen from "./screens/ManageAvailabilityScreen";
import ChatScreen from "./screens/ChatScreen";
import NotificationsScreen from "./screens/NotificationsScreen";

function AppRoutes() {
  const { provider, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="app-body">
          <div className="phone-frame">
            <div className="screen flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!provider) return <LoginScreen />;

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/requests" element={<RequestsScreen />} />
        <Route path="/services" element={<ServicesScreen />} />
        <Route path="/earnings" element={<EarningsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
      </Route>

      <Route element={<DetailLayout />}>
        <Route path="/requests/:requestId" element={<RequestDetailsScreen />} />
        <Route path="/services/add" element={<AddServiceScreen />} />
        <Route path="/profile/edit" element={<EditProfileScreen />} />
        <Route path="/profile/documents" element={<DocumentsKycScreen />} />
        <Route path="/profile/availability" element={<ManageAvailabilityScreen />} />
        <Route path="/chat/:requestId" element={<ChatScreen />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
