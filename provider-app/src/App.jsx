import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import LoginScreen from "./screens/LoginScreen";
import RingingOverlay from "./components/RingingOverlay";

// Route-level code splitting: only Login (needed before anything else can
// render) and the RingingOverlay (must be ready to fire the moment a
// booking comes in) ship in the initial bundle. Every other screen loads
// on demand as the user navigates to it.
const DashboardScreen = lazy(() => import("./screens/DashboardScreen"));
const RequestsScreen = lazy(() => import("./screens/RequestsScreen"));
const RequestDetailsScreen = lazy(() => import("./screens/RequestDetailsScreen"));
const ServicesScreen = lazy(() => import("./screens/ServicesScreen"));
const AddServiceScreen = lazy(() => import("./screens/AddServiceScreen"));
const EarningsScreen = lazy(() => import("./screens/EarningsScreen"));
const ProfileScreen = lazy(() => import("./screens/ProfileScreen"));
const EditProfileScreen = lazy(() => import("./screens/EditProfileScreen"));
const DocumentsKycScreen = lazy(() => import("./screens/DocumentsKycScreen"));
const ManageAvailabilityScreen = lazy(() => import("./screens/ManageAvailabilityScreen"));
const NotificationSettingsScreen = lazy(() => import("./screens/NotificationSettingsScreen"));
const HelpSupportScreen = lazy(() => import("./screens/HelpSupportScreen"));
const ReferFriendScreen = lazy(() => import("./screens/ReferFriendScreen"));
const ChatScreen = lazy(() => import("./screens/ChatScreen"));
const NotificationsScreen = lazy(() => import("./screens/NotificationsScreen"));

function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
    </div>
  );
}

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
    <>
      <RingingOverlay />
      <Suspense fallback={<ScreenFallback />}>
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
            <Route path="/profile/notifications" element={<NotificationSettingsScreen />} />
            <Route path="/profile/help" element={<HelpSupportScreen />} />
            <Route path="/profile/refer" element={<ReferFriendScreen />} />
            <Route path="/chat/:requestId" element={<ChatScreen />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </>
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
