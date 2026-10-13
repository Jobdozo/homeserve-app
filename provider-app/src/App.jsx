import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import LoginScreen from "./screens/LoginScreen";
import LogoMark from "./components/LogoMark";
import { useAndroidBackButton } from "./utils/useAndroidBackButton";
import AgreementScreen from "./screens/AgreementScreen";
import { AGREEMENT_VERSION } from "./data/providerAgreement";
import RingingOverlay from "./components/RingingOverlay";

// Route-level code splitting: only Login (needed before anything else can
// render) and the RingingOverlay (must be ready to fire the moment a
// booking comes in) ship in the initial bundle. Every other screen loads
// on demand as the user navigates to it.
const OrdersScreen = lazy(() => import("./screens/OrdersScreen"));
const InsightsScreen = lazy(() => import("./screens/InsightsScreen"));
const MoneyScreen = lazy(() => import("./screens/MoneyScreen"));
const GrowScreen = lazy(() => import("./screens/GrowScreen"));
const OffersScreen = lazy(() => import("./screens/OffersScreen"));
const FeedbackScreen = lazy(() => import("./screens/FeedbackScreen"));
const ReadyScreen = lazy(() => import("./screens/ReadyScreen"));
const InvoiceMonthScreen = lazy(() => import("./screens/InvoiceMonthScreen"));
const RequestDetailsScreen = lazy(() => import("./screens/RequestDetailsScreen"));
const ServicesScreen = lazy(() => import("./screens/ServicesScreen"));
const AddServiceScreen = lazy(() => import("./screens/AddServiceScreen"));
const ProfileScreen = lazy(() => import("./screens/ProfileScreen"));
const EditProfileScreen = lazy(() => import("./screens/EditProfileScreen"));
const DocumentsKycScreen = lazy(() => import("./screens/DocumentsKycScreen"));
const ManageAvailabilityScreen = lazy(() => import("./screens/ManageAvailabilityScreen"));
const NotificationSettingsScreen = lazy(() => import("./screens/NotificationSettingsScreen"));
const HelpSupportScreen = lazy(() => import("./screens/HelpSupportScreen"));
const ReferFriendScreen = lazy(() => import("./screens/ReferFriendScreen"));
const AdsScreen = lazy(() => import("./screens/AdsScreen"));
const ChatScreen = lazy(() => import("./screens/ChatScreen"));
const NotificationsScreen = lazy(() => import("./screens/NotificationsScreen"));
const StaffScreen = lazy(() => import("./screens/StaffScreen"));
const StaffDetailScreen = lazy(() => import("./screens/StaffDetailScreen"));

function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
    </div>
  );
}

function AppRoutes() {
  const { provider, authLoading, staff, logout } = useApp();
  const { pathname } = useLocation();
  useAndroidBackButton({
    rootPath: "/dashboard",
    atRoot: authLoading || !provider || !provider.agreementAccepted || pathname === "/dashboard",
  });

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="app-body">
          <div className="phone-frame">
            <div className="screen flex items-center justify-center">
              <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-brand-night text-white">
                <LogoMark size={34} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!provider) return <LoginScreen />;

  // The owner accepts again when the agreement's wording changed (staff keep working
  // under the version the owner accepted before).
  const agreementOutdated = provider.agreementAccepted && !staff && (provider.agreementVersion || "") < AGREEMENT_VERSION;
  if (!provider.agreementAccepted || agreementOutdated) {
    // Only the account owner can accept the provider agreement.
    if (staff) {
      return (
        <div className="app-shell">
          <div className="app-body">
            <div className="phone-frame">
              <div className="screen flex flex-col items-center justify-center gap-3 px-8 text-center">
                <p className="text-[16px] font-bold text-gray-900">Waiting for the account owner</p>
                <p className="text-[13px] text-gray-500">The owner of this company account needs to accept the provider agreement before staff can start work.</p>
                <button onClick={logout} className="mt-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600">Sign out</button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return <AgreementScreen />;
  }

  return (
    <>
      <RingingOverlay />
      <Suspense fallback={<ScreenFallback />}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<OrdersScreen />} />
            <Route path="/requests" element={<OrdersScreen />} />
            <Route path="/insights" element={<InsightsScreen />} />
            <Route path="/services" element={<ServicesScreen />} />
            <Route path="/earnings" element={<MoneyScreen />} />
            <Route path="/grow" element={<GrowScreen />} />
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
            <Route path="/profile/ads" element={<AdsScreen />} />
            <Route path="/profile/staff" element={<StaffScreen />} />
            <Route path="/profile/staff/:staffId" element={<StaffDetailScreen />} />
            <Route path="/chat/:requestId" element={<ChatScreen />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="/grow/offers" element={<OffersScreen />} />
            <Route path="/feedback" element={<FeedbackScreen />} />
            <Route path="/ready" element={<ReadyScreen />} />
            <Route path="/money/invoices/:month" element={<InvoiceMonthScreen />} />
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
      <ErrorBoundary>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </ErrorBoundary>
    </AppProvider>
  );
}
