import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket, setSocketToken } from "../socket";
import { timeSlots } from "../data/mockData";
import { detectCurrentLocation, APPROXIMATE_OVER_METERS } from "../utils/geolocation";
import { ensurePushSubscribed, onNativeNotificationTap } from "../utils/pushNotifications";

const AppContext = createContext(null);
const CART_KEY = "homeserve-cart-v1";
const AUTH_KEY = "tikdum-customer-auth-v1";
const LOCATION_KEY = "tikdum-location-v1";
// Re-detection must be at least this accurate (metres) to replace a hand-pinned spot.
const PINNED_KEEP_OVER_METERS = 200;

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
  const [subcategories, setSubcategories] = useState([]);
  const [services, setServices] = useState([]);
  const [banners, setBanners] = useState([]);
  const [homeLayout, setHomeLayout] = useState({ sections: [], bookingCounts: {} });
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

  // A spot the customer pinned on the map is more trustworthy than a coarse
  // automatic guess (a laptop without GPS often reports the wrong city), so
  // automatic re-detection only replaces it when the new fix is accurate.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const detectLocation = useCallback(async (opts) => {
    const auto = opts?.auto === true; // true = background re-detect, not a button tap
    setLocationStatus("detecting");
    try {
      const loc = await detectCurrentLocation();
      if (auto && locationRef.current?.source === "pinned" && (loc.accuracy || 0) > PINNED_KEEP_OVER_METERS) {
        setLocationStatus("ready");
        return;
      }
      setLocation(loc);
      localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
      setLocationStatus("ready");
    } catch (e) {
      console.error("Failed to detect location", e);
      // Keep using the pinned spot rather than falling back to the saved address.
      if (locationRef.current?.source === "pinned") setLocationStatus("ready");
      else setLocationStatus(e.code === 1 ? "denied" : "error");
    }
  }, []);

  // The customer chose this exact spot on the map.
  const setPinnedLocation = useCallback((loc) => {
    const next = { ...loc, source: "pinned" };
    setLocation(next);
    localStorage.setItem(LOCATION_KEY, JSON.stringify(next));
    setLocationStatus("ready");
  }, []);

  // City-level guesses (no GPS, e.g. a laptop) are flagged so the app can ask
  // the customer to set their exact spot.
  const locationApproximate = !!location && location.source !== "pinned" && (location.accuracy || 0) > APPROXIMATE_OVER_METERS;

  // Re-detect the real current location on every app open, and again when the
  // app returns to the foreground after a while, so the provider list always
  // follows where the customer actually is. Guests are only auto-detected if
  // they've already granted permission (no surprise prompt on a public page).
  const lastDetectAt = useRef(0);
  const runDetect = useCallback(async () => {
    lastDetectAt.current = Date.now();
    await detectLocation({ auto: true });
  }, [detectLocation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let allowed = !!customer;
      if (!allowed) {
        try {
          const perm = await navigator.permissions?.query({ name: "geolocation" });
          allowed = perm?.state === "granted";
        } catch (e) {
          allowed = false;
        }
      }
      if (allowed && !cancelled) runDetect();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastDetectAt.current < 5 * 60 * 1000) return;
      if (customer || locationStatus === "ready") runDetect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [customer, locationStatus, runDetect]);

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
    setSocketToken(token);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
    setCustomer(user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setSocketToken(null);
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
      setSocketToken(initialAuth.token);
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

  // Public catalog data — loads regardless of auth so browsing works
  // pre-login. Re-callable with a pincode once the customer's registered
  // address is known, so the catalog can be re-filtered to their area
  // without a full page reload.
  const catalogReq = useRef(0);
  // The PIN the on-screen catalog was last successfully loaded for — lets the
  // "coming soon to your area" message wait for a real answer instead of
  // flashing while a new PIN's catalog (or a failed request) is pending.
  const [catalogPin, setCatalogPin] = useState(null);
  const loadCatalog = useCallback(async (pincode) => {
    const reqId = ++catalogReq.current;
    try {
      const [boot, layout] = await Promise.all([api.bootstrap(pincode), api.getHomeLayout().catch(() => null)]);
      if (reqId !== catalogReq.current) return; // a newer PIN's request superseded this one
      setProviders(Object.fromEntries(boot.providers.map((p) => [p.id, p])));
      setCategories(boot.categories);
      setSubcategories(boot.subcategories || []);
      // A service with no picture of its own shows its type's picture (the one drawn or uploaded for the type).
      const typePicture = new Map((boot.subcategories || []).filter((x) => x.imageUrl).map((x) => [x.id, x.imageUrl]));
      setServices(boot.services.map((x) => (x.imageUrl || !typePicture.has(x.subcategoryId) ? x : { ...x, imageUrl: typePicture.get(x.subcategoryId) })));
      setCatalogPin(pincode || "");
      if (layout) {
        setBanners(layout.banners || []);
        setHomeLayout({ sections: layout.sections || [], bookingCounts: layout.bookingCounts || {} });
      }
    } catch (e) {
      console.error("Failed to load catalog", e);
    }
  }, []);

  // Filter the catalog to wherever the customer actually is. The live
  // (or last-known) GPS PIN wins; the saved profile address is only the
  // fallback when location is denied/unavailable or gave no PIN.
  const gpsUsable = locationStatus !== "denied" && locationStatus !== "error";
  const savedPincode = customer?.address?.pincode || "";
  const gpsPincode = location?.pincode || "";
  const activePincode = (gpsUsable ? gpsPincode || savedPincode : savedPincode || gpsPincode) || "";

  useEffect(() => {
    loadCatalog(activePincode || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePincode]);

  const reloadCatalog = useCallback(() => loadCatalog(activePincode || undefined), [loadCatalog, activePincode]);
  // No providers at all in the customer's area (only once we really know).
  const catalogReady = catalogPin !== null && catalogPin === (activePincode || "");
  const noCoverage = !!activePincode && catalogReady && services.length === 0;

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
      if (booking.status === "Completed") {
        // The conversation is closed once the order completes — drop any copy
        // held in memory rather than just hiding the screen.
        setMessages((prev) => {
          const { [booking.id]: _closed, ...rest } = prev;
          return rest;
        });
      }
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

  // Name / avatar. The login session keeps a copy of the customer in
  // localStorage, so refresh that too or the old name returns on reload.
  const updateProfile = useCallback(
    async (patch) => {
      const updated = await api.updateMyProfile(patch);
      setCustomer((prev) => (prev ? { ...prev, name: updated.name, avatar: updated.avatar } : prev));
      try {
        const raw = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
        if (raw?.user) localStorage.setItem(AUTH_KEY, JSON.stringify({ ...raw, user: { ...raw.user, name: updated.name, avatar: updated.avatar } }));
      } catch (e) {
        console.error("Could not refresh the saved session", e);
      }
      showToast("Profile updated");
      return updated;
    },
    [showToast]
  );

  const saveAddress = useCallback(
    async (addressData) => {
      const saved = await api.saveMyAddress(addressData);
      setCustomer((prev) => (prev ? { ...prev, address: saved } : prev));
      showToast("Address saved");
      return saved;
    },
    [showToast]
  );

  const removeOfficeAddress = useCallback(async () => {
    const saved = await api.deleteMyOffice();
    setCustomer((prev) => (prev ? { ...prev, address: saved } : prev));
    showToast("Office address removed");
  }, [showToast]);

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

  // likeServiceId: an add-on joins the same visit, so it starts on that cart item's date and time.
  const addToCart = useCallback(
    (serviceId, likeServiceId) => {
      setCart((prev) => {
        if (prev.some((item) => item.serviceId === serviceId)) {
          showToast("Already in your cart");
          return prev;
        }
        showToast("Added to cart");
        const like = (likeServiceId && prev.find((item) => item.serviceId === likeServiceId)) || prev[0] || null;
        return [...prev, { serviceId, date: like?.date || todayISO(), time: like?.time || timeSlots[1], issue: "", quantity: 1 }];
      });
    },
    [showToast]
  );

  // One date and time for the whole cart: the provider is booked for a single visit.
  const setCartSchedule = useCallback((patch) => {
    setCart((prev) => prev.map((item) => ({ ...item, ...patch })));
  }, []);

  const updateCartItem = useCallback((serviceId, patch) => {
    setCart((prev) => prev.map((item) => (item.serviceId === serviceId ? { ...item, ...patch } : item)));
  }, []);

  const removeFromCart = useCallback((serviceId) => {
    setCart((prev) => prev.filter((item) => item.serviceId !== serviceId));
  }, []);

  const [appliedOffer, setAppliedOffer] = useState(null);
  const [offerError, setOfferError] = useState("");
  const [referral, setReferral] = useState(null);

  // Fetched lazily (Refer & Earn screen, Cart's "use credit" checkbox) rather
  // than on every app open — most sessions never touch this data.
  const refreshReferral = useCallback(async () => {
    try {
      const info = await api.getReferralInfo();
      setReferral(info);
      return info;
    } catch (e) {
      console.error("Failed to load referral info", e);
      return null;
    }
  }, []);

  const submitRefundClaim = useCallback(
    async (bookingId, reason) => {
      const claim = await api.submitRefundClaim(bookingId, reason);
      showToast("Refund claim submitted — we'll review it shortly");
      return claim;
    },
    [showToast]
  );

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
    async (address, { referralCode, useCredits, serviceIds } = {}) => {
      // Only book what the customer can actually see in their cart — items
      // hidden because they aren't offered in the current area stay out.
      const ordered = cart.filter((c) => !serviceIds || serviceIds.includes(c.serviceId));
      if (ordered.length === 0) return [];
      const items = ordered.map(({ serviceId, date, time, issue, quantity }) => ({ serviceId, date, time, issue, quantity: quantity || 1 }));
      const created = await api.createOrder({
        items,
        address,
        offerCode: appliedOffer?.code,
        referralCode,
        useCredits,
      });
      setBookings((prev) => created.reduce((acc, b) => upsertById(acc, b), prev));
      setCart((prev) => prev.filter((c) => !ordered.some((o) => o.serviceId === c.serviceId)));
      setAppliedOffer(null);
      if (referralCode || useCredits) refreshReferral();
      showToast(`Order placed! ${created.length} service${created.length > 1 ? "s" : ""} booked`);
      return created;
    },
    [cart, showToast, appliedOffer, refreshReferral]
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
      subcategories,
      services,
      banners,
      homeLayout,
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
      setCartSchedule,
      removeFromCart,
      checkout,
      appliedOffer,
      offerError,
      applyOfferCode,
      clearOffer,
      referral,
      refreshReferral,
      submitRefundClaim,
      saveAddress,
      updateProfile,
      removeOfficeAddress,
      activePincode,
      noCoverage,
      catalogReady,
      reloadCatalog,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
      location,
      locationStatus,
      detectLocation,
      setPinnedLocation,
      locationApproximate,
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
      subcategories,
      services,
      banners,
      homeLayout,
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
      setCartSchedule,
      removeFromCart,
      checkout,
      appliedOffer,
      offerError,
      applyOfferCode,
      clearOffer,
      referral,
      refreshReferral,
      submitRefundClaim,
      saveAddress,
      updateProfile,
      removeOfficeAddress,
      activePincode,
      noCoverage,
      catalogReady,
      reloadCatalog,
      notifications,
      markNotificationRead,
      markAllNotificationsRead,
      location,
      locationStatus,
      detectLocation,
      setPinnedLocation,
      locationApproximate,
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
