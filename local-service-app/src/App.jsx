import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import LoginScreen from "./screens/LoginScreen";
import LogoMark from "./components/LogoMark";
import { useAndroidBackButton } from "./utils/useAndroidBackButton";

// Route-level code splitting: only Login (needed before anything else can
// render) ships in the initial bundle. Every other screen loads on demand
// as the user navigates to it, instead of all ~15 screens' code being
// downloaded and parsed up front on every app open.
const HomeScreen = lazy(() => import("./screens/HomeScreen"));
const CategoriesScreen = lazy(() => import("./screens/CategoriesScreen"));
const BookingsScreen = lazy(() => import("./screens/BookingsScreen"));
const MessagesListScreen = lazy(() => import("./screens/MessagesListScreen"));
const ProfileScreen = lazy(() => import("./screens/ProfileScreen"));
const ServiceDetailsScreen = lazy(() => import("./screens/ServiceDetailsScreen"));
const ServiceProvidersScreen = lazy(() => import("./screens/ServiceProvidersScreen"));
const CategoryServicesScreen = lazy(() => import("./screens/CategoryServicesScreen"));
const BookingDetailsScreen = lazy(() => import("./screens/BookingDetailsScreen"));
const ChatScreen = lazy(() => import("./screens/ChatScreen"));
const RateReviewScreen = lazy(() => import("./screens/RateReviewScreen"));
const SearchScreen = lazy(() => import("./screens/SearchScreen"));
const CartScreen = lazy(() => import("./screens/CartScreen"));
const NotificationsScreen = lazy(() => import("./screens/NotificationsScreen"));
const ProviderProfileScreen = lazy(() => import("./screens/ProviderProfileScreen"));
const AllServicesScreen = lazy(() => import("./screens/AllServicesScreen"));
const ReferFriendScreen = lazy(() => import("./screens/ReferFriendScreen"));
const BookingProtectionScreen = lazy(() => import("./screens/BookingProtectionScreen"));
const SavedAddressScreen = lazy(() => import("./screens/SavedAddressScreen"));
const HelpSupportScreen = lazy(() => import("./screens/HelpSupportScreen"));

function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
    </div>
  );
}

// Gates booking/checkout/account screens behind login while leaving the
// catalog (home, categories, individual services) publicly browsable —
// both so anonymous visitors can shop before signing up, and so search
// engines have real content to index instead of a login wall on every URL.
function RequireAuth({ children }) {
  const { customer } = useApp();
  const location = useLocation();
  if (!customer) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function AppRoutes() {
  const { customer, authLoading, pendingNotificationBookingId, clearPendingNotification } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useAndroidBackButton({ rootPath: "/home", atRoot: authLoading || !customer || pathname === "/home" });

  useEffect(() => {
    if (!pendingNotificationBookingId) return;
    navigate(`/booking/${pendingNotificationBookingId}`);
    clearPendingNotification();
  }, [pendingNotificationBookingId, navigate, clearPendingNotification]);

  if (authLoading) {
    return (
      <div className="app-shell">
        <div className="app-body">
          <div className="phone-frame">
            <div className="screen flex items-center justify-center">
              <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-brand text-white">
                <LogoMark size={34} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<ScreenFallback />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/categories" element={<CategoriesScreen />} />
          <Route
            path="/bookings"
            element={
              <RequireAuth>
                <BookingsScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/messages"
            element={
              <RequireAuth>
                <MessagesListScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfileScreen />
              </RequireAuth>
            }
          />
        </Route>

        <Route element={<DetailLayout />}>
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/category/:categoryId" element={<CategoryServicesScreen />} />
          <Route path="/service/:serviceId" element={<ServiceDetailsScreen />} />
          <Route path="/find-service/:serviceId" element={<ServiceProvidersScreen />} />
          <Route path="/provider/:providerId" element={<ProviderProfileScreen />} />
          <Route path="/services" element={<AllServicesScreen />} />
          <Route path="/booking-protection" element={<BookingProtectionScreen />} />
          <Route
            path="/cart"
            element={
              <RequireAuth>
                <CartScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/booking/:bookingId"
            element={
              <RequireAuth>
                <BookingDetailsScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/chat/:bookingId"
            element={
              <RequireAuth>
                <ChatScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/review/:bookingId"
            element={
              <RequireAuth>
                <RateReviewScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <NotificationsScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/refer"
            element={
              <RequireAuth>
                <ReferFriendScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/address"
            element={
              <RequireAuth>
                <SavedAddressScreen />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/help"
            element={
              <RequireAuth>
                <HelpSupportScreen />
              </RequireAuth>
            }
          />
        </Route>

        <Route path="/login" element={customer ? <Navigate to="/home" replace /> : <LoginScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ErrorBoundary>
    </AppProvider>
  );
}
