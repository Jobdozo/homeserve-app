import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api } from "../api";
import { socket } from "../socket";

const PROVIDER_ID = "amit-sharma";

const AppContext = createContext(null);

function upsertById(list, item) {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const copy = [...list];
  copy[idx] = item;
  return copy;
}

export function AppProvider({ children }) {
  const [provider, setProvider] = useState(null);
  const [requests, setRequests] = useState([]);
  const [services, setServices] = useState([]);
  const [messages, setMessages] = useState({});
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const loadedThreads = useRef(new Set());

  const refreshEarnings = useCallback(() => {
    api.getEarnings(PROVIDER_ID).then(setEarnings).catch((e) => console.error("earnings", e));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [providerData, requestData, serviceData, earningsData, notificationData] = await Promise.all([
          api.getProvider(PROVIDER_ID),
          api.listBookings(PROVIDER_ID),
          api.listProviderServices(PROVIDER_ID),
          api.getEarnings(PROVIDER_ID),
          api.listNotifications("provider", PROVIDER_ID),
        ]);
        if (cancelled) return;
        setProvider(providerData);
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
  }, []);

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
    const onBookingCreated = (booking) => {
      if (booking.providerId !== PROVIDER_ID) return;
      setRequests((prev) => upsertById(prev, booking));
    };
    const onBookingUpdated = (booking) => {
      if (booking.providerId !== PROVIDER_ID) return;
      setRequests((prev) => upsertById(prev, booking));
      if (booking.status === "Completed") refreshEarnings();
    };
    const onMessageCreated = ({ bookingId, message }) => {
      setMessages((prev) => ({ ...prev, [bookingId]: [...(prev[bookingId] || []), message] }));
    };
    const onServiceChanged = (service) => {
      if (service.providerId !== PROVIDER_ID) return;
      setServices((prev) => upsertById(prev, service));
    };
    const onProviderUpdated = (updated) => {
      if (updated.id !== PROVIDER_ID) return;
      setProvider(updated);
    };
    const onNotificationCreated = (notification) => {
      if (notification.recipientType !== "provider" || notification.recipientId !== PROVIDER_ID) return;
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
  }, [refreshEarnings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message) => setToast(message), []);

  const getRequest = useCallback((id) => requests.find((r) => r.id === id), [requests]);

  const acceptRequest = useCallback(
    async (id) => {
      const booking = await api.updateBookingStatus(id, "Accepted");
      setRequests((prev) => upsertById(prev, booking));
      showToast("Request accepted");
    },
    [showToast]
  );

  const rejectRequest = useCallback(
    async (id) => {
      const booking = await api.updateBookingStatus(id, "Rejected");
      setRequests((prev) => upsertById(prev, booking));
      showToast("Request rejected");
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
    api.sendMessage(requestId, "provider", text).catch((e) => console.error("Failed to send message", e));
  }, []);

  const toggleServiceStatus = useCallback(async (id) => {
    const current = services.find((s) => s.id === id);
    if (!current) return;
    const nextStatus = current.status === "active" ? "inactive" : "active";
    const service = await api.updateProviderService(PROVIDER_ID, id, { status: nextStatus });
    setServices((prev) => upsertById(prev, service));
  }, [services]);

  const addService = useCallback(
    async ({ name, category, description, price, originalPrice, extraCharges, serviceArea }) => {
      const numericOriginal = Number(originalPrice) || 0;
      const service = await api.addProviderService(PROVIDER_ID, {
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
    [showToast]
  );

  const markNotificationRead = useCallback(async (id) => {
    const notification = await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? notification : n)));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await api.markAllNotificationsRead("provider", PROVIDER_ID);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const value = useMemo(
    () => ({
      provider,
      requests,
      services,
      messages,
      earnings,
      loading,
      connected,
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
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      provider,
      requests,
      services,
      messages,
      earnings,
      loading,
      connected,
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
      notifications,
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
