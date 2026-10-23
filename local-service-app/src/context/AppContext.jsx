import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, setAuthToken } from "../api";
import { socket, setSocketToken } from "../socket";
import { timeSlots } from "../data/mockData";
import { detectCurrentLocation, APPROXIMATE_OVER_METERS } from "../utils/geolocation";
import { ensurePushSubscribed, onNativeNotificationTap } from "../utils/pushNotifications";
import { readSnap, writeSnap, clearSnaps, newest } from "../utils/snapshot";
import { trackMeta } from "../utils/metaPixel";

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
  // A signed-in customer sees the app at once from the saved session; the token is
  // checked in the background (a rejected one still signs out).
  const [authLoading, setAuthLoading] = useState(!initialAuth?.user);
  // What this customer last saw (bookings, notifications), drawn before fresh data arrives.
  const [saved] = useState(() => (initialAuth?.user?.id ? readSnap(`c:${initialAuth.user.id}`) : null));
  const [providers, setProviders] = useState({});
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [services, setServices] = useState([]);
  const [banners, setBanners] = useState([]);
  const [homeLayout, setHomeLayout] = useState({ sections: [], bookingCounts: {} });
  const [bookings, setBookings] = useState(saved?.bookings || []);
  const [messages, setMessages] = useState({});
  const [loading, setLoading] = useState(!saved);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState(null);
  const [cart, setCart] = useState(loadCart);
  const [notifications, setNotifications] = useState(saved?.notifications || []);
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

  // "Share my live location" (BookingDetails → LiveTracking): only while the customer has it on
  // for a booking that's Accepted or In Progress, their position goes to that booking's provider
  // every ~8 s. Nothing is shared otherwise — the provider navigates to the booked address.
  const [sharing, setSharing] = useState([]); // bookingIds
  const markSharing = useCallback((bookingId, on) => {
    setSharing((prev) => (on ? (prev.includes(bookingId) ? prev : [...prev, bookingId]) : prev.filter((x) => x !== bookingId)));
  }, []);
  const setShareLocation = useCallback(
    async (bookingId, on) => {
      await api.shareLocation(bookingId, on);
      markSharing(bookingId, on);
    },
    [markSharing]
  );
  const sharingNow = useMemo(
    () => sharing.filter((id) => bookings.some((b) => b.id === id && ["Accepted", "In Progress"].includes(b.status))),
    [sharing, bookings]
  );
  useEffect(() => {
    if (!customer || sharingNow.length === 0 || !navigator.geolocation) return undefined;
    let last = 0;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < 8000) return;
        last = now;
        api.reportLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, sharingNow.length > 0]);

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
    clearSnaps("c:");
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
  // Scaling step 1: the first load holds the top services of each category at this
  // PIN (catalogCounts = how many there really are). When some were left out, a
  // screen asks for the rest of its category, provider or search, page by page.
  const [catalogCounts, setCatalogCounts] = useState({});
  const catalogScope = useRef({ pin: undefined, partial: false, loaded: new Set(), fetched: new Set(), typePicture: new Map() });
  // A service with no picture of its own shows its type's picture (the one drawn or uploaded for the type).
  const withTypePicture = (x) => {
    const pic = catalogScope.current.typePicture.get(x.subcategoryId);
    return x.imageUrl || !pic ? x : { ...x, imageUrl: pic };
  };
  // The PIN whose catalog is on screen (saved or fresh), so a saved copy is drawn only once.
  const shownPin = useRef(null);
  const applyCatalog = useCallback((boot, layout, pincode) => {
    const typePicture = new Map((boot.subcategories || []).filter((x) => x.imageUrl).map((x) => [x.id, x.imageUrl]));
    // Same PIN as on screen (fresh data replacing the saved copy, or a reload): keep what
    // screens fetched since (a category's other services, a details page's full copy) so
    // a page opened in the first second doesn't lose them. A new PIN starts clean.
    const samePin = shownPin.current === (pincode || "");
    if (samePin) Object.assign(catalogScope.current, { partial: !!boot.partial, typePicture });
    else catalogScope.current = { pin: pincode, partial: !!boot.partial, loaded: new Set(), fetched: new Set(), typePicture };
    const fresh = boot.services.map(withTypePicture);
    const freshProviders = Object.fromEntries(boot.providers.map((p) => [p.id, p]));
    setCatalogCounts(boot.counts || {});
    setCategories(boot.categories);
    setSubcategories(boot.subcategories || []);
    if (samePin) {
      const fetched = catalogScope.current.fetched;
      setProviders((prev) => ({ ...prev, ...freshProviders }));
      setServices((prev) => {
        const byId = new Map(fresh.map((x) => [x.id, x]));
        for (const had of prev) {
          if (!fetched.has(had.id)) continue;
          const now = byId.get(had.id);
          byId.set(had.id, now && !had.lite && now.lite ? { ...had, ...now, lite: false, includes: had.includes, highlights: had.highlights } : now || had);
        }
        return [...byId.values()];
      });
    } else {
      setProviders(freshProviders);
      setServices(fresh);
    }
    setCatalogPin(pincode || "");
    if (layout) {
      setBanners(layout.banners || []);
      setHomeLayout({ sections: layout.sections || [], bookingCounts: layout.bookingCounts || {} });
    }
    shownPin.current = pincode || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The catalog last seen at this PIN shows at once; the fresh one replaces it when it lands.
  const loadCatalog = useCallback(
    async (pincode) => {
      const reqId = ++catalogReq.current;
      const savedCatalog = readSnap("catalog");
      if (savedCatalog?.boot && savedCatalog.pin === (pincode || "") && shownPin.current !== (pincode || "")) {
        applyCatalog(savedCatalog.boot, savedCatalog.layout, pincode);
      }
      try {
        const [boot, layout] = await Promise.all([api.bootstrap(pincode), api.getHomeLayout().catch(() => null)]);
        if (reqId !== catalogReq.current) return; // a newer PIN's request superseded this one
        applyCatalog(boot, layout, pincode);
        writeSnap("catalog", { pin: pincode || "", boot, layout });
      } catch (e) {
        console.error("Failed to load catalog", e);
      }
    },
    [applyCatalog]
  );

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

  // Merge services fetched later into the list. A list-card copy (lite) never
  // replaces the fuller copy a details page already loaded.
  const mergeCatalog = useCallback((list = [], provs = []) => {
    for (const x of list) catalogScope.current.fetched?.add(x.id);
    if (provs.length) setProviders((prev) => ({ ...prev, ...Object.fromEntries(provs.map((p) => [p.id, { ...prev[p.id], ...p }])) }));
    if (!list.length) return;
    setServices((prev) => {
      const byId = new Map(prev.map((s) => [s.id, s]));
      for (const raw of list) {
        const s = withTypePicture(raw);
        const had = byId.get(s.id);
        byId.set(s.id, had && !had.lite && s.lite ? { ...had, ...s, lite: false, includes: had.includes, highlights: had.highlights } : { ...had, ...s });
      }
      return [...byId.values()];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything for one category or provider (params: { category } or { provider }),
  // fetched only when the first load left some out; once per PIN.
  const loadCatalogScope = useCallback(
    async (params) => {
      const scope = catalogScope.current;
      const key = JSON.stringify(params);
      if (!scope.partial || scope.loaded.has(key)) return;
      scope.loaded.add(key);
      try {
        for (let offset = 0, i = 0; i < 20; i++) {
          const page = await api.catalog({ ...params, pincode: scope.pin, offset, limit: 100 });
          if (catalogScope.current !== scope) return; // the PIN changed meanwhile
          mergeCatalog(page.services, page.providers);
          offset += page.services.length;
          if (!page.services.length || offset >= page.total) break;
        }
      } catch (e) {
        scope.loaded.delete(key);
        console.error("Failed to load more of the catalogue", e);
      }
    },
    [mergeCatalog]
  );

  // Server-side search, for when the first load didn't hold the whole catalogue.
  const searchCatalog = useCallback(
    async (q) => {
      const scope = catalogScope.current;
      if (!scope.partial || String(q || "").trim().length < 2) return;
      try {
        const page = await api.catalog({ q: q.trim(), pincode: scope.pin, limit: 60 });
        if (catalogScope.current === scope) mergeCatalog(page.services, page.providers);
      } catch (e) {
        console.error("Catalogue search failed", e);
      }
    },
    [mergeCatalog]
  );

  // A service or provider the app refers to but hasn't loaded (a cart line, a past
  // booking's provider, a shared link), or a service page that needs its full details.
  // key -> the request in flight (or done), so a second ask waits on the first.
  const fetching = useRef(new Map());
  // Only services offered at the customer's PIN come back, so nothing outside their
  // area can reach the cart. full: every field, for a service's own page.
  const ensureServices = useCallback(
    (ids, { full = false } = {}) => {
      const scope = catalogScope.current;
      const keyOf = (id) => `s:${scope.pin || ""}:${full ? "full" : "card"}:${id}`;
      const unique = [...new Set(ids)].filter(Boolean);
      const waiting = unique.filter((id) => fetching.current.has(keyOf(id))).map((id) => fetching.current.get(keyOf(id)));
      const want = unique.filter((id) => !fetching.current.has(keyOf(id))).slice(0, 50);
      if (want.length) {
        const req = api
          .catalog({ ids: want.join(","), pincode: scope.pin, full: full ? 1 : undefined, limit: 100 })
          .then((page) => {
            if (catalogScope.current === scope) mergeCatalog(full ? page.services.map((x) => ({ ...x, lite: false })) : page.services, page.providers);
          })
          .catch(() => want.forEach((id) => fetching.current.delete(keyOf(id))));
        want.forEach((id) => fetching.current.set(keyOf(id), req));
        waiting.push(req);
      }
      return Promise.all(waiting);
    },
    [mergeCatalog]
  );
  const ensureService = useCallback((id, opts) => ensureServices([id], opts), [ensureServices]);
  const ensureProvider = useCallback(
    (id) => {
      const key = `p:${id}`;
      if (!id) return Promise.resolve();
      if (!fetching.current.has(key)) {
        fetching.current.set(
          key,
          api
            .getProvider(id)
            .then((p) => mergeCatalog([], [p]))
            .catch(() => {})
        );
      }
      return fetching.current.get(key);
    },
    [mergeCatalog]
  );
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
      // With a saved copy on screen, refresh quietly instead of showing the spinner.
      if (!readSnap(`c:${customer.id}`)) setLoading(true);
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

  // Save what's on screen (shortly after it settles) for the next open.
  useEffect(() => {
    if (!customer?.id || loading) return undefined;
    const t = setTimeout(() => writeSnap(`c:${customer.id}`, { bookings: newest(bookings), notifications: newest(notifications, 100) }), 800);
    return () => clearTimeout(t);
  }, [customer?.id, loading, bookings, notifications]);

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

  // Fill in what's referred to but not loaded: cart services, booking and service providers.
  useEffect(() => {
    if (catalogPin === null) return;
    const have = new Set(services.map((s) => s.id));
    const missing = cart.map((c) => c.serviceId).filter((id) => !have.has(id));
    if (missing.length) ensureServices(missing);
    const wanted = new Set([...bookings.map((b) => b.providerId), ...services.map((s) => s.providerId)]);
    for (const id of wanted) if (id && !providers[id]) ensureProvider(id);
  }, [catalogPin, cart, bookings, services, providers, ensureServices, ensureProvider]);
  const getBooking = useCallback((id) => bookings.find((b) => b.id === id), [bookings]);

  const createBooking = useCallback(async ({ serviceId, date, time, address, issue }) => {
    const booking = await api.createBooking({ serviceId, date, time, address, issue });
    setBookings((prev) => upsertById(prev, booking));
    trackMeta("Schedule", { value: Number(booking.amount) || 0, currency: "INR", content_name: booking.service?.name }, `order:${booking.orderId || booking.id}:schedule`);
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
  // extra: { options, optionLines, quantity, note } from the options sheet. Adding a service that's
  // already in the cart with new choices replaces its choices (one line per service).
  const addToCart = useCallback(
    (serviceId, likeServiceId, extra) => {
      setCart((prev) => {
        const existing = prev.find((item) => item.serviceId === serviceId);
        if (existing && !extra) {
          showToast("Already in your cart");
          return prev;
        }
        const chosen = extra
          ? { options: extra.options || {}, optionLines: extra.optionLines || [], quantity: extra.quantity || 1, issue: extra.note || existing?.issue || "" }
          : {};
        if (existing) {
          showToast("Choices updated");
          return prev.map((item) => (item.serviceId === serviceId ? { ...item, ...chosen } : item));
        }
        showToast("Added to cart");
        const like = (likeServiceId && prev.find((item) => item.serviceId === likeServiceId)) || prev[0] || null;
        return [...prev, { serviceId, date: like?.date || todayISO(), time: like?.time || timeSlots[1], issue: "", quantity: 1, ...chosen }];
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

  const applyOfferCode = useCallback(async (code, subtotal) => {
    setOfferError("");
    try {
      const items = cart.map(({ serviceId, quantity, options }) => ({ serviceId, quantity: quantity || 1, options: options || {} }));
      const offer = await api.validateOffer(code, subtotal, items);
      setAppliedOffer(offer);
      return offer;
    } catch (e) {
      setAppliedOffer(null);
      setOfferError(e.message || "Invalid offer code");
      throw e;
    }
  }, [cart]);

  const clearOffer = useCallback(() => {
    setAppliedOffer(null);
    setOfferError("");
  }, []);

  const checkout = useCallback(
    // confirmRepeat: the customer said "Book again" to the server's repeat-booking question.
    async (address, { referralCode, useCredits, serviceIds, note, contact, confirmRepeat } = {}) => {
      // Only book what the customer can actually see in their cart — items
      // hidden because they aren't offered in the current area stay out.
      const ordered = cart.filter((c) => !serviceIds || serviceIds.includes(c.serviceId));
      if (ordered.length === 0) return [];
      const items = ordered.map(({ serviceId, date, time, issue, quantity, options }) => ({ serviceId, date, time, issue, quantity: quantity || 1, options: options || {} }));
      const created = await api.createOrder({
        items,
        address,
        offerCode: appliedOffer?.code,
        referralCode,
        useCredits,
        note,
        contact,
        ...(confirmRepeat ? { confirmRepeat: true } : {}),
      });
      setBookings((prev) => created.reduce((acc, b) => upsertById(acc, b), prev));
      // A confirmed repeat of the same services isn't a new booking for Meta (the server skips it too).
      if (created.length && !created.every((b) => b.repeatOf)) {
        // Same event id as the server's Conversions API event, so Meta counts the order once.
        trackMeta(
          "Schedule",
          { value: created.reduce((s, b) => s + (Number(b.amount) || 0), 0), currency: "INR", content_name: created.map((b) => b.service?.name).filter(Boolean).join(", "), num_items: created.length },
          `order:${created[0].orderId || created[0].id}:schedule`
        );
      }
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
      sharing,
      markSharing,
      setShareLocation,
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
      catalogCounts,
      loadCatalogScope,
      searchCatalog,
      ensureService,
      ensureProvider,
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
      catalogCounts,
      loadCatalogScope,
      searchCatalog,
      ensureService,
      ensureProvider,
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
      sharing,
      markSharing,
      setShareLocation,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
