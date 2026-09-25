import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket } from "../socket";

const AppContext = createContext(null);
const AUTH_KEY = "tikdum-admin-auth-v1";

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt storage
  }
  return null;
}

function upsertById(list, item) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const copy = [...list];
  copy[idx] = item;
  return copy;
}

export function AppProvider({ children }) {
  const initialAuth = loadAuth();
  const [admin, setAdmin] = useState(initialAuth?.user || null);
  const [authLoading, setAuthLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const refreshTimer = useRef(null);

  const login = useCallback((token, user) => {
    setAuthToken(token);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
    setAdmin(user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(AUTH_KEY);
    setAdmin(null);
    setOverview(null);
    setProviders([]);
    setServices([]);
    setBookings([]);
    setActivities([]);
  }, []);

  const loadAll = useCallback(async () => {
    const [overviewData, categoryData, providerData, serviceData, bookingData, activityData] = await Promise.all([
      api.getOverview(),
      api.listCategories(),
      api.listProviders(),
      api.listServices(),
      api.listBookings(),
      api.listActivities(20),
    ]);
    setOverview(overviewData);
    setCategories(categoryData);
    setProviders(providerData);
    setServices(serviceData);
    setBookings(bookingData);
    setActivities(activityData);
  }, []);

  // Restore + validate a persisted session on first load.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!initialAuth?.token) {
        setAuthLoading(false);
        return;
      }
      setAuthToken(initialAuth.token);
      try {
        const { user } = await api.me();
        if (cancelled) return;
        setAdmin(user);
      } catch (e) {
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!admin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } catch (e) {
        console.error("Failed to load admin data", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [admin, loadAll]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      loadAll().catch((e) => console.error("Refresh failed", e));
    }, 350);
  }, [loadAll]);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.connect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  useEffect(() => {
    const onBookingChanged = () => scheduleRefresh();
    const onServiceChanged = (service) => {
      setServices((prev) => upsertById(prev, service));
      scheduleRefresh();
    };
    const onProviderUpdated = (provider) => {
      setProviders((prev) => upsertById(prev, provider));
      scheduleRefresh();
    };
    const onProviderDeleted = (providerId) => {
      setProviders((prev) => prev.filter((p) => p.id !== providerId));
      scheduleRefresh();
    };
    const onActivityCreated = (activity) => {
      if (!activity) return;
      setActivities((prev) => [activity, ...prev].slice(0, 20));
    };

    socket.on("booking:created", onBookingChanged);
    socket.on("booking:updated", onBookingChanged);
    socket.on("service:created", onServiceChanged);
    socket.on("service:updated", onServiceChanged);
    socket.on("provider:updated", onProviderUpdated);
    socket.on("provider:deleted", onProviderDeleted);
    socket.on("activity:created", onActivityCreated);
    return () => {
      socket.off("booking:created", onBookingChanged);
      socket.off("booking:updated", onBookingChanged);
      socket.off("service:created", onServiceChanged);
      socket.off("service:updated", onServiceChanged);
      socket.off("provider:updated", onProviderUpdated);
      socket.off("provider:deleted", onProviderDeleted);
      socket.off("activity:created", onActivityCreated);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message) => setToast(message), []);

  const approveProvider = useCallback(
    async (id) => {
      const provider = await api.setProviderVerification(id, "approved");
      setProviders((prev) => upsertById(prev, provider));
      showToast("Provider approved");
      scheduleRefresh();
    },
    [showToast, scheduleRefresh]
  );

  const rejectProvider = useCallback(
    async (id) => {
      const provider = await api.setProviderVerification(id, "rejected");
      setProviders((prev) => upsertById(prev, provider));
      showToast("Provider rejected");
      scheduleRefresh();
    },
    [showToast, scheduleRefresh]
  );

  const deleteProvider = useCallback(
    async (id) => {
      await api.deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
      showToast("Provider deleted");
      scheduleRefresh();
    },
    [showToast, scheduleRefresh]
  );

  const updateProviderCoverage = useCallback(
    async (id, patch) => {
      const coverage = await api.updateProviderCoverage(id, patch);
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, coverage } : p)));
      showToast("Service area updated");
      return coverage;
    },
    [showToast]
  );

  const reviewService = useCallback(
    async (id, decision, note) => {
      const service = await api.reviewService(id, decision, note);
      setServices((prev) => upsertById(prev, service));
      showToast(decision === "approved" ? "Service approved" : "Service rejected");
      scheduleRefresh();
      return service;
    },
    [showToast, scheduleRefresh]
  );

  const updateService = useCallback(
    async (id, patch) => {
      const service = await api.updateService(id, patch);
      setServices((prev) => upsertById(prev, service));
      showToast("Service updated");
      return service;
    },
    [showToast]
  );

  const deleteService = useCallback(
    async (id) => {
      await api.deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      showToast("Service deleted");
      scheduleRefresh();
    },
    [showToast, scheduleRefresh]
  );

  const toggleServiceStatus = useCallback(
    async (id, currentStatus) => {
      const nextStatus = currentStatus === "active" ? "inactive" : "active";
      const service = await api.setServiceStatus(id, nextStatus);
      setServices((prev) => upsertById(prev, service));
      showToast(`Service set to ${nextStatus}`);
      scheduleRefresh();
    },
    [showToast, scheduleRefresh]
  );

  const addCategory = useCallback(
    async (data) => {
      const category = await api.createCategory(data);
      setCategories((prev) => [...prev, category]);
      showToast("Category added");
      return category;
    },
    [showToast]
  );

  const addProvider = useCallback(
    async (data) => {
      const provider = await api.createProvider(data);
      setProviders((prev) => upsertById(prev, provider));
      showToast("Provider added");
      scheduleRefresh();
      return provider;
    },
    [showToast, scheduleRefresh]
  );

  const addService = useCallback(
    async (data) => {
      const service = await api.createService(data);
      setServices((prev) => upsertById(prev, service));
      showToast("Service added");
      scheduleRefresh();
      return service;
    },
    [showToast, scheduleRefresh]
  );

  const sendBroadcastNotification = useCallback(
    async (data) => {
      const result = await api.broadcastNotification(data);
      showToast(`Sent to ${result.sent} recipient${result.sent === 1 ? "" : "s"}`);
      return result;
    },
    [showToast]
  );

  const value = useMemo(
    () => ({
      admin,
      authLoading,
      login,
      logout,
      overview,
      categories,
      providers,
      services,
      bookings,
      activities,
      loading,
      connected,
      toast,
      showToast,
      approveProvider,
      rejectProvider,
      deleteProvider,
      updateProviderCoverage,
      toggleServiceStatus,
      reviewService,
      updateService,
      deleteService,
      addCategory,
      addProvider,
      addService,
      sendBroadcastNotification,
    }),
    [
      admin,
      authLoading,
      login,
      logout,
      overview,
      categories,
      providers,
      services,
      bookings,
      activities,
      loading,
      connected,
      toast,
      showToast,
      approveProvider,
      rejectProvider,
      deleteProvider,
      updateProviderCoverage,
      toggleServiceStatus,
      reviewService,
      updateService,
      deleteService,
      addCategory,
      addProvider,
      addService,
      sendBroadcastNotification,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
