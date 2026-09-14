import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket } from "../socket";
import { loadNotificationPrefs, saveNotificationPrefs } from "../utils/notificationPrefs";

const AppContext = createContext(null);
const AUTH_KEY = "tikdum-provider-auth-v1";

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
  const [provider, setProvider] = useState(initialAuth?.user || null);
  const [authLoading, setAuthLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [services, setServices] = useState([]);
  const [messages, setMessages] = useState({});
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationPrefs, setNotificationPrefs] = useState(loadNotificationPrefs);
  const [ringingRequest, setRingingRequest] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const loadedThreads = useRef(new Set());

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const dismissRinging = useCallback(() => setRingingRequest(null), []);

  const updateNotificationPref = useCallback((type, enabled) => {
    setNotificationPrefs((prev) => {
      const next = { ...prev, [type]: enabled };
      saveNotificationPrefs(next);
      return next;
    });
  }, []);

  const login = useCallback((token, user) => {
    setAuthToken(token);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
    setProvider(user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(AUTH_KEY);
    setProvider(null);
    setRequests([]);
    setServices([]);
    setMessages({});
    setEarnings(null);
    setNotifications([]);
    loadedThreads.current = new Set();
  }, []);

  const refreshEarnings = useCallback(() => {
    if (!provider) return;
    api.getEarnings(provider.id).then(setEarnings).catch((e) => console.error("earnings", e));
  }, [provider]);

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
        setProvider(user);
      } catch (e) {
        if (cancelled) return;
        // A real 401/403 means the token itself is invalid — log out. A
        // network failure (offline, unreachable) just means we can't verify
        // it right now, so keep the cached session and let the app work
        // offline with what it already has.
        if (e.status === 401 || e.status === 403) {
          logout();
        } else {
          setProvider(initialAuth.user);
        }
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
    if (!provider) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [requestData, serviceData, earningsData, notificationData] = await Promise.all([
          api.listBookings(),
          api.listProviderServices(provider.id),
          api.getEarnings(provider.id),
          api.listNotifications(),
        ]);
        if (cancelled) return;
        setRequests(requestData);
        setServices(serviceData);
        setEarnings(earningsData);
        setNotifications(notificationData);

        const threads = await Promise.all(
          requestData.map((r) => api.getMessages(r.id).then((thread) => [r.id, thread]))
        );
        if (cancelled) return;
        threads.forEach(([id]) => loadedThreads.current.add(id));
        setMessages(Object.fromEntries(threads));
      } catch (e) {
        console.error("Failed to load provider data", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [provider]);

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
    const providerId = provider?.id;
    const onBookingCreated = (booking) => {
      if (booking.providerId !== providerId) return;
      setRequests((prev) => upsertById(prev, booking));
      if (booking.status === "Pending") setRingingRequest(booking);
    };
    const onBookingUpdated = (booking) => {
      if (booking.providerId !== providerId) {
        // Reassigned away to another provider — stop showing/ringing it here.
        setRequests((prev) => prev.filter((r) => r.id !== booking.id));
        setRingingRequest((prev) => (prev?.id === booking.id ? null : prev));
        return;
      }
      setRequests((prev) => upsertById(prev, booking));
      if (booking.status !== "Pending") {
        setRingingRequest((prev) => (prev?.id === booking.id ? null : prev));
      }
      if (booking.status === "Completed") refreshEarnings();
    };
    const onMessageCreated = ({ bookingId, message }) => {
      setMessages((prev) => ({ ...prev, [bookingId]: [...(prev[bookingId] || []), message] }));
    };
    const onServiceChanged = (service) => {
      if (service.providerId !== providerId) return;
      setServices((prev) => upsertById(prev, service));
    };
    const onProviderUpdated = (updated) => {
      if (updated.id !== providerId) return;
      setProvider(updated);
    };
    const onNotificationCreated = (notification) => {
      if (notification.recipientType !== "provider" || notification.recipientId !== providerId) return;
      if (notificationPrefs[notification.type] === false) return;
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
    };

    socket.on("booking:created", onBookingCreated);
    socket.on("booking:updated", onBookingUpdated);
    socket.on("message:created", onMessageCreated);
    socket.on("service:created", onServiceChanged);
    socket.on("service:updated", onServiceChanged);
    socket.on("provider:updated", onProviderUpdated);
    socket.on("notification:created", onNotificationCreated);
    return () => {
      socket.off("booking:created", onBookingCreated);
      socket.off("booking:updated", onBookingUpdated);
      socket.off("message:created", onMessageCreated);
      socket.off("service:created", onServiceChanged);
      socket.off("service:updated", onServiceChanged);
      socket.off("provider:updated", onProviderUpdated);
      socket.off("notification:created", onNotificationCreated);
    };
  }, [provider, refreshEarnings, notificationPrefs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const hasActiveJob = useMemo(
    () => requests.some((r) => ["Pending", "Accepted", "In Progress"].includes(r.status)),
    [requests]
  );

  // While a job is in flight, share this provider's real-time position every
  // 30s so the customer can see where they actually are, not just their
  // profile's service area.
  useEffect(() => {
    if (!provider || !hasActiveJob || !navigator.geolocation) return;
    let cancelled = false;
    const report = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          api.reportLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy).catch(() => {});
        },
        () => {},
        // maximumAge: 0 forces a fresh GPS fix each time instead of reusing a
        // cached (often lower-accuracy, wifi/cell-based) position.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    };
    report();
    const interval = setInterval(report, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [provider, hasActiveJob]);

  const showToast = useCallback((message) => setToast(message), []);

  const getRequest = useCallback((id) => requests.find((r) => r.id === id), [requests]);

  const acceptRequest = useCallback(
    async (id) => {
      const booking = await api.updateBookingStatus(id, "Accepted");
      setRequests((prev) => upsertById(prev, booking));
      setRingingRequest((prev) => (prev?.id === id ? null : prev));
      showToast("Request accepted");
    },
    [showToast]
  );

  const rejectRequest = useCallback(
    async (id) => {
      // The booking may get handed to another provider right away — either
      // way it's no longer this provider's to act on, so drop it locally.
      await api.updateBookingStatus(id, "Rejected");
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setRingingRequest((prev) => (prev?.id === id ? null : prev));
      showToast("Request declined");
    },
    [showToast]
  );

  const advanceRequestStatus = useCallback(
    async (id) => {
      const order = ["Accepted", "In Progress", "Completed"];
      const current = requests.find((r) => r.id === id);
      if (!current) return;
      const idx = order.indexOf(current.status);
      const next = order[Math.min(idx + 1, order.length - 1)];
      const booking = await api.updateBookingStatus(id, next);
      setRequests((prev) => upsertById(prev, booking));
      if (booking.status === "Completed") refreshEarnings();
    },
    [requests, refreshEarnings]
  );

  const loadMessages = useCallback(async (bookingId) => {
    if (loadedThreads.current.has(bookingId)) return;
    loadedThreads.current.add(bookingId);
    const thread = await api.getMessages(bookingId);
    setMessages((prev) => ({ ...prev, [bookingId]: thread }));
  }, []);

  const sendMessage = useCallback((requestId, text) => {
    api.sendMessage(requestId, text).catch((e) => console.error("Failed to send message", e));
  }, []);

  const toggleServiceStatus = useCallback(async (id) => {
    if (!provider) return;
    const current = services.find((s) => s.id === id);
    if (!current) return;
    const nextStatus = current.status === "active" ? "inactive" : "active";
    const service = await api.updateProviderService(provider.id, id, { status: nextStatus });
    setServices((prev) => upsertById(prev, service));
  }, [provider, services]);

  const addService = useCallback(
    async ({ name, category, description, price, originalPrice, extraCharges, serviceArea }) => {
      if (!provider) return;
      const numericOriginal = Number(originalPrice) || 0;
      const service = await api.addProviderService(provider.id, {
        name,
        category,
        description,
        price: Number(price) || 0,
        ...(numericOriginal > 0 ? { originalPrice: numericOriginal } : {}),
        extraCharges: extraCharges || "",
        serviceArea: serviceArea || "",
      });
      setServices((prev) => upsertById(prev, service));
      showToast("Service added");
      return service;
    },
    [provider, showToast]
  );

  const updateProfile = useCallback(
    async (patch) => {
      if (!provider) return;
      const updated = await api.updateProviderProfile(provider.id, patch);
      setProvider(updated);
      showToast("Profile updated");
      return updated;
    },
    [provider, showToast]
  );

  const markNotificationRead = useCallback(async (id) => {
    const notification = await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? notification : n)));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const value = useMemo(
    () => ({
      provider,
      authLoading,
      login,
      logout,
      requests,
      services,
      messages,
      earnings,
      loading,
      connected,
      isOffline,
      toast,
      showToast,
      getRequest,
      acceptRequest,
      rejectRequest,
      advanceRequestStatus,
      loadMessages,
      sendMessage,
      toggleServiceStatus,
      addService,
      updateProfile,
      notifications,
      notificationPrefs,
      updateNotificationPref,
      ringingRequest,
      dismissRinging,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      provider,
      authLoading,
      login,
      logout,
      requests,
      services,
      messages,
      earnings,
      loading,
      connected,
      isOffline,
      toast,
      showToast,
      getRequest,
      acceptRequest,
      rejectRequest,
      advanceRequestStatus,
      loadMessages,
      sendMessage,
      toggleServiceStatus,
      addService,
      updateProfile,
      notifications,
      notificationPrefs,
      updateNotificationPref,
      ringingRequest,
      dismissRinging,
      markNotificationRead,
      markAllNotificationsRead,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
