import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket } from "../socket";
import { timeSlots } from "../data/mockData";
import { detectCurrentLocation } from "../utils/geolocation";
import { ensurePushSubscribed, onNativeNotificationTap } from "../utils/pushNotifications";

const AppContext = createContext(null);
const CART_KEY = "homeserve-cart-v1";
const AUTH_KEY = "tikdum-customer-auth-v1";
const LOCATION_KEY = "tikdum-location-v1";

function loadLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore corrupt storage
  }
  return null;
}

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
  const [banners, setBanners] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const [cart, setCart] = useState(loadCart);
  const [notifications, setNotifications] = useState([]);
  const [location, setLocation] = useState(loadLocation);
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | detecting | ready | denied | error
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

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const detectLocation = useCallback(async () => {
    setLocationStatus("detecting");
    try {
      const loc = await detectCurrentLocation();
      setLocation(loc);
      localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      setLocationStatus("ready");
    } catch (e) {
      console.error("Failed to detect location", e);
      setLocationStatus(e.code === 1 ? "denied" : "error");
    }
  }, []);

  // Ask for location once per login if we don't already have one saved.
  useEffect(() => {
    if (customer && !location) detectLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Register for push once logged in, so an admin broadcast or booking
  // update can reach this device even while the app is backgrounded/closed.
  useEffect(() => {
    if (customer) ensurePushSubscribed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Tapping a native notification (or a cold start from one) surfaces a
  // bookingId here — AppRoutes (inside the Router, unlike this context)
  // watches it and navigates, then clears it.
  const [pendingNotificationBookingId, setPendingNotificationBookingId] = useState(null);
  useEffect(() => onNativeNotificationTap(setPendingNotificationBookingId), []);
  const clearPendingNotification = useCallback(() => setPendingNotificationBookingId(null), []);

  const hasActiveBooking = useMemo(
    () => bookings.some((b) => ["Pending", "Accepted", "In Progress"].includes(b.status)),
    [bookings]
  );

  // While a booking is in flight, share this customer's real-time position
  // every 30s so the provider's "Get Directions" can target where they
  // actually are instead of the address captured when the booking was made.
  useEffect(() => {
    if (!customer || !hasActiveBooking || !navigator.geolocation) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, hasActiveBooking]);

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
        if (cancelled) return;
        // A real 401/403 means the token itself is invalid — log out. A
        // network failure (offline, unreachable) just means we can't verify
        // it right now, so keep the cached session and let the app work
        // offline with what it already has.
        if (e.status === 401 || e.status === 403) {
          logout();
        } else {
          setCustomer(initialAuth.user);
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

  // Public catalog data — loads regardless of auth so browsing works pre-login.
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const [boot, bannerData] = await Promise.all([api.bootstrap(), api.listBanners().catch(() => [])]);
        if (cancelled) return;
        setProviders(Object.fromEntries(boot.providers.map((p) => [p.id, p])));
        setCategories(boot.categories);
        setServices(boot.services);
        setBanners(bannerData);
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
        // Chat threads load lazily per-booking (see loadMessages, used by
        // ChatScreen) — prefetching all of them here used to mean one extra
        // network round trip per booking on every app open, for chats most
        // people never look at.
        const [myBookings, myNotifications] = await Promise.all([api.listBookings(), api.listNotifications()]);
        if (cancelled) return;
        setBookings(myBookings);
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
    // Depend on the id, not the whole `customer` object: session restore
    // sets a fresh-but-identical user object right after the cached one
    // loads, and keying this on object reference was firing every fetch in
    // loadCustomerData() twice on every single app open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Background safety net: the live socket is what's supposed to keep
  // bookings/notifications current, but mobile browsers frequently
  // suspend/drop websockets for a backgrounded tab, so a quiet poll (no
  // `loading` toggle — this must never blank the screen with a spinner)
  // is what actually keeps data from going stale. Also fires once
  // immediately when the app comes back to the foreground, so reopening it
  // doesn't have to wait out the rest of the 30s tick.
  useEffect(() => {
    if (!customer) return;
    let cancelled = false;

    const silentRefresh = () => {
      Promise.all([api.listBookings(), api.listNotifications()])
        .then(([myBookings, myNotifications]) => {
          if (cancelled) return;
          setBookings(myBookings);
          setNotifications(myNotifications);
        })
        .catch((e) => console.error("Background refresh failed", e));
    };

    const interval = setInterval(silentRefresh, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") silentRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [customer?.id]);

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

  const [appliedOffer, setAppliedOffer] = useState(null);
  const [offerError, setOfferError] = useState("");

  const applyOfferCode = useCallback(async (code) => {
    setOfferError("");
    try {
      const offer = await api.validateOffer(code);
      setAppliedOffer(offer);
      return offer;
    } catch (e) {
      setAppliedOffer(null);
      setOfferError(e.message || "Invalid offer code");
      throw e;
    }
  }, []);

  const clearOffer = useCallback(() => {
    setAppliedOffer(null);
    setOfferError("");
  }, []);

  const checkout = useCallback(
    async (address) => {
      if (cart.length === 0) return [];
      const items = cart.map(({ serviceId, date, time, issue }) => ({ serviceId, date, time, issue }));
      const created = await api.createOrder({ items, address, offerCode: appliedOffer?.code });
      setBookings((prev) => created.reduce((acc, b) => upsertById(acc, b), prev));
      setCart([]);
      setAppliedOffer(null);
      showToast(`Order placed! ${created.length} service${created.length > 1 ? "s" : ""} booked`);
      return created;
    },
    [cart, showToast, appliedOffer]
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
      banners,
      bookings,
      messages,
      loading,
      connected,
      isOffline,
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
      appliedOffer,
      offerError,
      applyOfferCode,
      clearOffer,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
      location,
      locationStatus,
      detectLocation,
      pendingNotificationBookingId,
      clearPendingNotification,
    }),
    [
      customer,
      authLoading,
      login,
      logout,
      providers,
      categories,
      services,
      banners,
      bookings,
      messages,
      loading,
      connected,
      isOffline,
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
      appliedOffer,
      offerError,
      applyOfferCode,
      clearOffer,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
      location,
      locationStatus,
      detectLocation,
      pendingNotificationBookingId,
      clearPendingNotification,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
