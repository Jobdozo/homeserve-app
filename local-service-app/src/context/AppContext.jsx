import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api } from "../api";
import { socket } from "../socket";
import { timeSlots, defaultAddress } from "../data/mockData";

const AppContext = createContext(null);
const CART_KEY = "homeserve-cart-v1";

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
  const [customer, setCustomer] = useState(null);
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const boot = await api.bootstrap();
        if (cancelled) return;
        setCustomer(boot.customer);
        setProviders(Object.fromEntries(boot.providers.map((p) => [p.id, p])));
        setCategories(boot.categories);
        setServices(boot.services);

        const myBookings = await api.listBookings(boot.customer.id);
        if (cancelled) return;
        setBookings(myBookings);

        const threads = await Promise.all(
          myBookings.map((b) => api.getMessages(b.id).then((thread) => [b.id, thread]))
        );
        if (cancelled) return;
        threads.forEach(([id]) => loadedThreads.current.add(id));
        setMessages(Object.fromEntries(threads));

        const myNotifications = await api.listNotifications("customer", boot.customer.id);
        if (cancelled) return;
        setNotifications(myNotifications);
      } catch (e) {
        console.error("Failed to load app data", e);
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

  const createBooking = useCallback(
    async ({ serviceId, date, time, address, issue }) => {
      const booking = await api.createBooking({
        serviceId,
        date,
        time,
        address,
        issue,
        customerId: customer?.id,
      });
      setBookings((prev) => upsertById(prev, booking));
      return booking;
    },
    [customer]
  );

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
    api.sendMessage(bookingId, "user", text).catch((e) => console.error("Failed to send message", e));
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
      const created = await api.createOrder({ items, address: address || defaultAddress, customerId: customer?.id });
      setBookings((prev) => created.reduce((acc, b) => upsertById(acc, b), prev));
      setCart([]);
      showToast(`Order placed! ${created.length} service${created.length > 1 ? "s" : ""} booked`);
      return created;
    },
    [cart, customer, showToast]
  );

  const markNotificationRead = useCallback(async (id) => {
    const notification = await api.markNotificationRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? notification : n)));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    if (!customer) return;
    await api.markAllNotificationsRead("customer", customer.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [customer]);

  const value = useMemo(
    () => ({
      customer,
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
