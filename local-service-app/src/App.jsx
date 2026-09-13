import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./context/AppContext";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import CategoriesScreen from "./screens/CategoriesScreen";
import BookingsScreen from "./screens/BookingsScreen";
import MessagesListScreen from "./screens/MessagesListScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ServiceDetailsScreen from "./screens/ServiceDetailsScreen";
import CategoryServicesScreen from "./screens/CategoryServicesScreen";
import BookingDetailsScreen from "./screens/BookingDetailsScreen";
import ChatScreen from "./screens/ChatScreen";
import RateReviewScreen from "./screens/RateReviewScreen";
import SearchScreen from "./screens/SearchScreen";
import CartScreen from "./screens/CartScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import ProviderProfileScreen from "./screens/ProviderProfileScreen";
import AllServicesScreen from "./screens/AllServicesScreen";

function AppRoutes() {
  const { customer, authLoading } = useApp();

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
