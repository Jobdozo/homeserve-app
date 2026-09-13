import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket } from "../socket";
import { timeSlots, defaultAddress } from "../data/mockData";

const AppContext = createContext(null);
const CART_KEY = "homeserve-cart-v1";
const AUTH_KEY = "tikdum-customer-auth-v1";

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt storage
  }
  return null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt storage
  }
  return [];
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
  const [customer, setCustomer] = useState(initialAuth?.user || null);
  const [authLoading, setAuthLoading] = useState(true);
  const [providers, setProviders] = useState({});
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const [cart, setCart] = useState(loadCart);
  const [notifications, setNotifications] = useState([]);
  const loadedThreads = useRef(new Set());

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const login = useCallback((token, user) => {
    setAuthToken(token);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
    setCustomer(user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    localStorage.removeItem(AUTH_KEY);
    setCustomer(null);
    setBookings([]);
    setMessages({});
    setNotifications([]);
    loadedThreads.current = new Set();
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
        setCustomer(user);
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

  // Public catalog data — loads regardless of auth so browsing works pre-login.
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const boot = await api.bootstrap();
        if (cancelled) return;
        setProviders(Object.fromEntries(boot.providers.map((p) => [p.id, p])));
        setCategories(boot.categories);
        setServices(boot.services);
      } catch (e) {
        console.error("Failed to load catalog", e);
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-customer data — only once logged in.
  useEffect(() => {
    if (!customer) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function loadCustomerData() {
      setLoading(true);
      try {
        const myBookings = await api.listBookings();
        if (cancelled) return;
        setBookings(myBookings);

        const threads = await Promise.all(
          myBookings.map((b) => api.getMessages(b.id).then((thread) => [b.id, thread]))
        );
        if (cancelled) return;
        threads.forEach(([id]) => loadedThreads.current.add(id));
        setMessages(Object.fromEntries(threads));

        const myNotifications = await api.listNotifications();
        if (cancelled) return;
        setNotifications(myNotifications);
      } catch (e) {
        console.error("Failed to load app data", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCustomerData();
    return () => {
      cancelled = true;
    };
  }, [customer]);

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

  // Live sync: reflect provider-side actions (accept/reject/status/chat) instantly.
  useEffect(() => {
    const onBookingCreated = (booking) => {
      if (booking.customerId !== customer?.id) return;
      setBookings((prev) => upsertById(prev, booking));
    };
    const onBookingUpdated = (booking) => {
      if (booking.customerId !== customer?.id) return;
      setBookings((prev) => upsertById(prev, booking));
    };
    const onMessageCreated = ({ bookingId, message }) => {
      setMessages((prev) => ({ ...prev, [bookingId]: [...(prev[bookingId] || []), message] }));
    };
    const onServiceChanged = (service) => {
      setServices((prev) =>
        service.status === "active" ? upsertById(prev, service) : prev.filter((s) => s.id !== service.id)
      );
    };
    const onProviderUpdated = (provider) => {
      setProviders((prev) => ({ ...prev, [provider.id]: provider }));
    };
    const onNotificationCreated = (notification) => {
      if (notification.recipientType !== "customer" || notification.recipientId !== customer?.id) return;
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
  }, [customer]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((message) => setToast(message), []);

  const getService = useCallback((id) => services.find((s) => s.id === id), [services]);
  const getProvider = useCallback((id) => providers[id], [providers]);
  const getBooking = useCallback((id) => bookings.find((b) => b.id === id), [bookings]);

  const createBooking = useCallback(async ({ serviceId, date, time, address, issue }) => {
    const booking = await api.createBooking({ serviceId, date, time, address, issue });
    setBookings((prev) => upsertById(prev, booking));
    return booking;
  }, []);

  const cancelBooking = useCallback(async (id) => {
    const booking = await api.updateBookingStatus(id, "Cancelled");
    setBookings((prev) => upsertById(prev, booking));
  }, []);

  const advanceBookingStatus = useCallback(async (id, nextStatus) => {
    const booking = await api.updateBookingStatus(id, nextStatus);
    setBookings((prev) => upsertById(prev, booking));
  }, []);

  const loadMessages = useCallback(async (bookingId) => {
    if (loadedThreads.current.has(bookingId)) return;
    loadedThreads.current.add(bookingId);
    const thread = await api.getMessages(bookingId);
    setMessages((prev) => ({ ...prev, [bookingId]: thread }));
  }, []);

  const sendMessage = useCallback((bookingId, text) => {
    api.sendMessage(bookingId, text).catch((e) => console.error("Failed to send message", e));
  }, []);

  const submitReview = useCallback(async (bookingId, rating, text) => {
    const booking = await api.submitReview(bookingId, rating, text);
    setBookings((prev) => upsertById(prev, booking));
  }, []);

  const addToCart = useCallback(
    (serviceId) => {
      setCart((prev) => {
        if (prev.some((item) => item.serviceId === serviceId)) {
          showToast("Already in your cart");
          return prev;
        }
        showToast("Added to cart");
        return [...prev, { serviceId, date: todayISO(), time: timeSlots[1], issue: "" }];
      });
    },
    [showToast]
  );

  const updateCartItem = useCallback((serviceId, patch) => {
    setCart((prev) => prev.map((item) => (item.serviceId === serviceId ? { ...item, ...patch } : item)));
  }, []);

  const removeFromCart = useCallback((serviceId) => {
    setCart((prev) => prev.filter((item) => item.serviceId !== serviceId));
  }, []);

  const checkout = useCallback(
    async (address) => {
      if (cart.length === 0) return [];
      const items = cart.map(({ serviceId, date, time, issue }) => ({ serviceId, date, time, issue }));
      const created = await api.createOrder({ items, address: address || defaultAddress });
      setBookings((prev) => created.reduce((acc, b) => upsertById(acc, b), prev));
      setCart([]);
      showToast(`Order placed! ${created.length} service${created.length > 1 ? "s" : ""} booked`);
      return created;
    },
    [cart, showToast]
  );

  const markNotificationRead = useCallback(async (id) => {
    const notification = await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? notification : n)));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (!customer) return;
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [customer]);

  const value = useMemo(
    () => ({
      customer,
      authLoading,
      login,
      logout,
      providers,
      categories,
      services,
      bookings,
      messages,
      loading,
      connected,
      toast,
      showToast,
      getService,
      getProvider,
      getBooking,
      createBooking,
      cancelBooking,
      advanceBookingStatus,
      loadMessages,
      sendMessage,
      submitReview,
      cart,
      addToCart,
      updateCartItem,
      removeFromCart,
      checkout,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
    }),
    [
      customer,
      authLoading,
      login,
      logout,
      providers,
      categories,
      services,
      bookings,
      messages,
      loading,
      connected,
      toast,
      showToast,
      getService,
      getProvider,
      getBooking,
      createBooking,
      cancelBooking,
      advanceBookingStatus,
      loadMessages,
      sendMessage,
      submitReview,
      cart,
      addToCart,
      updateCartItem,
      removeFromCart,
      checkout,
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
