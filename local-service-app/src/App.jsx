import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import LoginScreen from "./screens/LoginScreen";

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
const CategoryServicesScreen = lazy(() => import("./screens/CategoryServicesScreen"));
const BookingDetailsScreen = lazy(() => import("./screens/BookingDetailsScreen"));
const ChatScreen = lazy(() => import("./screens/ChatScreen"));
const RateReviewScreen = lazy(() => import("./screens/RateReviewScreen"));
const SearchScreen = lazy(() => import("./screens/SearchScreen"));
const CartScreen = lazy(() => import("./screens/CartScreen"));
const NotificationsScreen = lazy(() => import("./screens/NotificationsScreen"));
const ProviderProfileScreen = lazy(() => import("./screens/ProviderProfileScreen"));
const AllServicesScreen = lazy(() => import("./screens/AllServicesScreen"));

function ScreenFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
    </div>
  );
}

function AppRoutes() {
  const { customer, authLoading, pendingNotificationBookingId, clearPendingNotification } = useApp();
  const navigate = useNavigate();

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
              <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!customer) return <LoginScreen />;

  return (
    <Suspense fallback={<ScreenFallback />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/categories" element={<CategoriesScreen />} />
          <Route path="/bookings" element={<BookingsScreen />} />
          <Route path="/messages" element={<MessagesListScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
        </Route>

        <Route element={<DetailLayout />}>
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/category/:categoryId" element={<CategoryServicesScreen />} />
          <Route path="/service/:serviceId" element={<ServiceDetailsScreen />} />
          <Route path="/cart" element={<CartScreen />} />
          <Route path="/booking/:bookingId" element={<BookingDetailsScreen />} />
          <Route path="/chat/:bookingId" element={<ChatScreen />} />
          <Route path="/review/:bookingId" element={<RateReviewScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/provider/:providerId" element={<ProviderProfileScreen />} />
          <Route path="/services" element={<AllServicesScreen />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
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
