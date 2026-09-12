import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { MainLayout, DetailLayout } from "./components/PhoneFrame";
import DashboardScreen from "./screens/DashboardScreen";
import RequestsScreen from "./screens/RequestsScreen";
import RequestDetailsScreen from "./screens/RequestDetailsScreen";
import ServicesScreen from "./screens/ServicesScreen";
import AddServiceScreen from "./screens/AddServiceScreen";
import EarningsScreen from "./screens/EarningsScreen";
import ProfileScreen from "./screens/ProfileScreen";
import ChatScreen from "./screens/ChatScreen";
import NotificationsScreen from "./screens/NotificationsScreen";

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
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
            <Route path="/chat/:requestId" element={<ChatScreen />} />
            <Route path="/notifications" element={<NotificationsScreen />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
