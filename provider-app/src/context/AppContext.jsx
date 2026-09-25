import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket } from "../socket";
import { loadNotificationPrefs, saveNotificationPrefs } from "../utils/notificationPrefs";
import { ensurePushSubscribed, onNativeRing } from "../utils/pushNotifications";

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
  const [categories, setCategories] = useState([]);
  const [messages, setMessages] = useState({});
  // A real zero-state default, not null — the dashboard/earnings screens
  // read straight through this (earnings.thisMonth etc.) with no loading
  // guard, so a failed fetch must never leave it null.
  const [earnings, setEarnings] = useState({
    allTime: 0,
    thisMonth: 0,
    changePct: 0,
    breakdown: { completedJobs: 0, inProgressJobs: 0, cancelledJobs: 0, platformFeePct: 0, platformFeeAmt: 0 },
    periods: {
      Daily: { total: 0, changePct: 0, breakdown: { completedJobs: 0, inProgressJobs: 0, cancelledJobs: 0, platformFeePct: 0, platformFeeAmt: 0 } },
      Weekly: { total: 0, changePct: 0, breakdown: { completedJobs: 0, inProgressJobs: 0, cancelledJobs: 0, platformFeePct: 0, platformFeeAmt: 0 } },
      Monthly: { total: 0, changePct: 0, breakdown: { completedJobs: 0, inProgressJobs: 0, cancelledJobs: 0, platformFeePct: 0, platformFeeAmt: 0 } },
      Yearly: { total: 0, changePct: 0, breakdown: { completedJobs: 0, inProgressJobs: 0, cancelledJobs: 0, platformFeePct: 0, platformFeeAmt: 0 } },
    },
    transactions: [],
  });
  const [wallet, setWallet] = useState({ balance: 0, suspended: false });
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationPrefs, setNotificationPrefs] = useState(loadNotificationPrefs);
  const [ringingRequest, setRingingRequest] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const loadedThreads = useRef(new Set());
  // Long-lived callbacks (the 30s background refresh below) close over
  // whatever `ringingRequest` was when they were created, not its current
  // value — this ref is how they read the live value instead.
  const ringingRequestRef = useRef(null);
  useEffect(() => {
    ringingRequestRef.current = ringingRequest;
  }, [ringingRequest]);

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
    setWallet(null);
    setNotifications([]);
    loadedThreads.current = new Set();
  }, []);

  const refreshEarnings = useCallback(() => {
    if (!provider) return;
    api.getEarnings(provider.id).then(setEarnings).catch((e) => console.error("earnings", e));
  }, [provider]);

  const refreshWallet = useCallback(() => {
    if (!provider) return;
    api.getWallet().then(setWallet).catch((e) => console.error("wallet", e));
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
        const [requestData, serviceData, earningsData, walletData, notificationData, categoryData] = await Promise.all([
          api.listBookings(),
          api.listProviderServices(provider.id),
          api.getEarnings(provider.id),
          api.getWallet(),
          api.listNotifications(),
          api.listCategories(),
        ]);
        if (cancelled) return;
        setRequests(requestData);
        setServices(serviceData);
        setEarnings(earningsData);
        setWallet(walletData);
        setNotifications(notificationData);
        setCategories(categoryData);

        // Reopening the app (e.g. tapping a push notification) should show
        // the ringing overlay for a request that's still waiting on this
        // provider, not just list it — ringingRequest otherwise only gets
        // set from the live "booking:created" socket event.
        const stillPending = requestData.find((r) => r.status === "Pending");
        if (stillPending) setRingingRequest(stillPending);

        // Chat threads load lazily per-request (see loadMessages, used by
        // ChatScreen) — prefetching all of them here used to mean one extra
        // network round trip per request on every app open.
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
    // Depend on the id, not the whole `provider` object: session restore
    // sets a fresh-but-identical user object right after the cached one
    // loads, and keying this on object reference was firing every fetch in
    // load() twice on every single app open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id]);

  // Register for push once logged in, so new booking requests can wake this
  // device even while the app is backgrounded or fully closed.
  useEffect(() => {
    if (provider) ensurePushSubscribed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider?.id]);

  // Native only: the full-screen ringing notification (TikdumMessagingService)
  // launches/resumes the app and fires this the same way the live socket
  // "booking:created" event does, for whichever booking triggered it.
  useEffect(() => {
    if (!provider) return () => {};
    return onNativeRing((bookingId) => {
      api
        .listBookings()
        .then((data) => {
          setRequests(data);
          const booking = data.find((r) => r.id === bookingId);
          if (booking && booking.status === "Pending") setRingingRequest(booking);
        })
        .catch((e) => console.error("Failed to load booking for native ring", e));
    });
  }, [provider]);

  // The service worker's push handler postMessages every open tab the
  // moment a booking comes in — this tab may have been backgrounded with a
  // dead socket connection and never heard about it any other way. Re-fetch
  // and ring for real, the same as the live socket path does.
  useEffect(() => {
    if (!provider || !("serviceWorker" in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type !== "tikdum-push") return;
      api
        .listBookings()
        .then((data) => {
          setRequests(data);
          const booking = data.find((r) => r.id === event.data.bookingId);
          if (booking && booking.status === "Pending") setRingingRequest(booking);
        })
        .catch((e) => console.error("Failed to refresh after push", e));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [provider]);

  // Background safety net: the live socket connection is what's supposed to
  // keep everything current, but mobile browsers frequently suspend/drop
  // websockets for a backgrounded tab, so a quiet poll (no `loading` toggle
  // — this must never blank the screen with a spinner) is what actually
  // keeps data from going stale until the user notices something's missing.
  // Also fires once immediately when the app comes back to the foreground,
  // so reopening it doesn't have to wait out the rest of the 30s tick.
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    const silentRefresh = () => {
      Promise.all([api.listBookings(), api.listNotifications(), api.getEarnings(provider.id)])
        .then(([requestData, notificationData, earningsData]) => {
          if (cancelled) return;
          setRequests(requestData);
          setNotifications(notificationData);
          setEarnings(earningsData);
          if (!ringingRequestRef.current) {
            const stillPending = requestData.find((r) => r.status === "Pending");
            if (stillPending) setRingingRequest(stillPending);
          }
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
  }, [provider?.id]);

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
      if (booking.status === "Completed") {
        refreshEarnings();
        refreshWallet();
      }
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
  }, [provider, refreshEarnings, refreshWallet, notificationPrefs]);

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

  // Starting and completing a job both require the code the customer sees in
  // their app — the provider asks for it in person and submits a guess here.
  const verifyJobOtp = useCallback(
    async (id, type, code) => {
      const booking = await api.verifyBookingOtp(id, type, code);
      setRequests((prev) => upsertById(prev, booking));
      if (booking.status === "Completed") {
        refreshEarnings();
        refreshWallet();
      }
      return booking;
    },
    [refreshEarnings, refreshWallet]
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

  // Editing a rejected service sends it back to the admin for another review.
  const resubmitService = useCallback(
    async (id, patch) => {
      if (!provider) return;
      const service = await api.updateProviderService(provider.id, id, patch);
      setServices((prev) => upsertById(prev, service));
      showToast("Resubmitted for approval");
      return service;
    },
    [provider, showToast]
  );

  const addService = useCallback(
    async ({ name, categorySlug, description, price, originalPrice, extraCharges, serviceArea }) => {
      if (!provider) return;
      const numericOriginal = Number(originalPrice) || 0;
      const service = await api.addProviderService(provider.id, {
        name,
        categorySlug,
        description,
        price: Number(price) || 0,
        ...(numericOriginal > 0 ? { originalPrice: numericOriginal } : {}),
        extraCharges: extraCharges || "",
        serviceArea: serviceArea || "",
      });
      setServices((prev) => upsertById(prev, service));
      showToast("Service submitted for admin approval");
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

  const acceptAgreement = useCallback(async () => {
    const updated = await api.acceptAgreement();
    setProvider(updated);
    return updated;
  }, []);

  const setAcceptingRequests = useCallback(
    async (value) => {
      if (!provider) return;
      const coverage = await api.setAcceptingRequests(provider.id, value);
      setProvider((prev) => (prev ? { ...prev, coverage } : prev));
      showToast(value ? "You're now receiving requests" : "Requests paused — your services are hidden");
      return coverage;
    },
    [provider, showToast]
  );

  const updateCoverage = useCallback(
    async (pincodes) => {
      if (!provider) return;
      const coverage = await api.updateCoverage(provider.id, pincodes);
      setProvider((prev) => (prev ? { ...prev, coverage } : prev));
      showToast("Service area updated");
      return coverage;
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
      categories,
      messages,
      earnings,
      wallet,
      loading,
      connected,
      isOffline,
      toast,
      showToast,
      getRequest,
      acceptRequest,
      rejectRequest,
      verifyJobOtp,
      loadMessages,
      sendMessage,
      toggleServiceStatus,
      addService,
      resubmitService,
      updateProfile,
      updateCoverage,
      setAcceptingRequests,
      acceptAgreement,
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
      categories,
      messages,
      earnings,
      wallet,
      loading,
      connected,
      isOffline,
      toast,
      showToast,
      getRequest,
      acceptRequest,
      rejectRequest,
      verifyJobOtp,
      loadMessages,
      sendMessage,
      toggleServiceStatus,
      addService,
      resubmitService,
      updateProfile,
      updateCoverage,
      setAcceptingRequests,
      acceptAgreement,
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
