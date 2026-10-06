import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { detectPreciseLocation, reverseGeocode, searchPlaces, APPROXIMATE_OVER_METERS } from "../utils/geolocation";
import { useApp } from "../context/AppContext";
import { XIcon } from "./icons";

// Jammu — only used as a starting view when nothing better is known.
const DEFAULT_CENTER = [32.7266, 74.857];

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

// Pick an exact spot: the map moves under a fixed centre pin (like food-delivery
// apps), "My location" asks the GPS for its best fix, and the address + PIN are
// looked up for wherever the pin ends up. This is how an address gets to within
// a few metres — the phone's GPS alone can't promise that.
export default function LocationPicker({ initial, onConfirm, onClose, title = "Pin your exact location" }) {
  const { location: lastKnown } = useApp();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const locateAbort = useRef(null);

  const start = isNum(initial?.lat) && isNum(initial?.lng) ? initial : isNum(lastKnown?.lat) && isNum(lastKnown?.lng) ? lastKnown : null;

  const [center, setCenter] = useState(start ? { lat: start.lat, lng: start.lng } : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] });
  const [accuracy, setAccuracy] = useState(null);
  const [locating, setLocating] = useState(false);
  const [place, setPlace] = useState(null); // { line, label, pincode } for the pin
  const [geocoding, setGeocoding] = useState(true);
  const [pin, setPin] = useState(initial?.pincode || "");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // ---- map setup (once) ----
  useEffect(() => {
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView(
      [center.lat, center.lng],
      initial && isNum(initial.lat) ? 18 : start ? 17 : 13
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    map.on("moveend", () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
    });
    mapRef.current = map;
    // The container is laid out after mount (modal) — tell Leaflet its real size.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(raf);
      locateAbort.current?.abort();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- look up the address for wherever the pin is (debounced) ----
  useEffect(() => {
    const controller = new AbortController();
    setGeocoding(true);
    const timer = setTimeout(async () => {
      try {
        const p = await reverseGeocode(center.lat, center.lng, controller.signal);
        if (controller.signal.aborted) return;
        setPlace(p);
        if (p.pincode) setPin(p.pincode);
        setNotice((n) => (n.startsWith("Couldn't look up") ? "" : n));
      } catch (e) {
        if (controller.signal.aborted) return;
        setPlace(null);
        setNotice("Couldn't look up the address here — enter the PIN code below.");
      } finally {
        if (!controller.signal.aborted) setGeocoding(false);
      }
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [center.lat, center.lng]);

  // ---- search a place by name (most computers have no GPS) ----
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, controller.signal);
        if (!controller.signal.aborted) setResults(found);
      } catch (e) {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const goTo = (r) => {
    mapRef.current?.setView([r.lat, r.lng], 18, { animate: true });
    setQuery("");
    setResults([]);
    setNotice("");
  };

  // ---- "My location": the device's best GPS fix ----
  const locate = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    locateAbort.current?.abort();
    const controller = new AbortController();
    locateAbort.current = controller;
    setLocating(true);
    setNotice("");
    try {
      const fix = await detectPreciseLocation({
        targetMeters: 10,
        maxWaitMs: 20000,
        signal: controller.signal,
        onProgress: (b) => {
          map.setView([b.lat, b.lng], Math.max(map.getZoom(), 18), { animate: false });
          if (circleRef.current) circleRef.current.remove();
          circleRef.current = L.circle([b.lat, b.lng], { radius: b.accuracy, color: "#5B3FE0", weight: 1, fillColor: "#5B3FE0", fillOpacity: 0.12 }).addTo(map);
          setAccuracy(b.accuracy);
        },
      });
      setAccuracy(fix.accuracy);
      if (fix.accuracy > APPROXIMATE_OVER_METERS) {
        setNotice("This device can only give a city-level location (it has no GPS). Search for your area above, or drag the map so the pin is on your door.");
      }
    } catch (e) {
      if (e.code === 0) return; // cancelled
      setNotice(
        e.code === 1
          ? "Location is off for this site. Allow it in your browser or phone settings, or just drag the map to your spot."
          : "Couldn't get a GPS fix. Drag the map so the pin sits on your door."
      );
    } finally {
      if (locateAbort.current === controller) setLocating(false);
    }
  }, []);

  // Unless we're adjusting a spot they already chose, snap to where they are right away.
  useEffect(() => {
    if (!isNum(initial?.lat)) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pinValid = /^\d{4,10}$/.test(pin.trim());
  const lat = Number(center.lat.toFixed(6));
  const lng = Number(center.lng.toFixed(6));

  const confirm = () => {
    if (!pinValid) return;
    onConfirm({
      lat,
      lng,
      label: place?.label || "Pinned location",
      line: place?.line || `Pinned location (${lat}, ${lng})`,
      pincode: pin.trim(),
      accuracy,
    });
  };

  const accTone = accuracy == null ? "" : accuracy <= 10 ? "bg-emerald-600" : accuracy <= 30 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 lg:items-center lg:p-6" onClick={onClose}>
      <div className="flex w-full flex-col bg-white lg:h-[680px] lg:max-w-3xl lg:overflow-hidden lg:rounded-3xl lg:shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 lg:px-6 lg:py-4">
          <div>
            <p className="text-[16px] font-bold text-gray-900 lg:text-[18px]">{title}</p>
            <p className="text-[12px] text-gray-400">Drag the map so the pin sits exactly on your door.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200">
            <XIcon width={16} height={16} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          <div ref={mapEl} className="absolute inset-0" />

          {/* Search a place by name */}
          <div className="absolute left-3 right-14 top-3 z-[700]">
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-black/5 focus-within:ring-brand">
              <span aria-hidden="true" className="text-gray-400">⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && results[0] && goTo(results[0])}
                placeholder="Search your area, e.g. Sunjwan, Jammu"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(""); setResults([]); }} aria-label="Clear search" className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              )}
            </div>
            {(results.length > 0 || (searching && query.trim().length >= 3)) && (
              <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5">
                {searching && results.length === 0 && <li className="px-3 py-2 text-[12.5px] text-gray-400">Searching…</li>}
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => goTo(r)} className="block w-full px-3 py-2 text-left hover:bg-gray-50">
                      <span className="block truncate text-[13px] font-semibold text-gray-800">{r.label}</span>
                      {r.sub && <span className="block truncate text-[11.5px] text-gray-400">{r.sub}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fixed centre pin: its tip is the chosen spot. */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
            <svg width="38" height="50" viewBox="0 0 38 50" fill="none">
              <path d="M19 49C19 49 36 31.5 36 18.5C36 9.1 28.4 1.5 19 1.5C9.6 1.5 2 9.1 2 18.5C2 31.5 19 49 19 49Z" fill="#5B3FE0" stroke="#fff" strokeWidth="2.5" />
              <circle cx="19" cy="18.5" r="6.5" fill="#fff" />
            </svg>
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[400] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35" />

          {(accuracy != null || locating) && (
            <div className="absolute left-3 top-[3.9rem] z-[600] flex flex-col items-start gap-1.5">
              <span className={`rounded-full px-3 py-1 text-[12px] font-semibold text-white shadow ${accTone || "bg-gray-700"}`}>
                {locating && accuracy == null ? "Finding your exact spot…" : `GPS accuracy ±${accuracy} m${locating ? " · improving…" : ""}`}
              </span>
              {accuracy != null && accuracy > 30 && !locating && (
                <span className="max-w-[260px] rounded-lg bg-white/95 px-3 py-1.5 text-[11.5px] leading-snug text-gray-600 shadow">
                  The signal is weak here — drag the map to fine-tune the pin.
                </span>
              )}
            </div>
          )}

          <button
            onClick={locate}
            disabled={locating}
            className="absolute bottom-24 right-3 z-[600] flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-brand shadow-lg hover:bg-gray-50 disabled:opacity-60 lg:bottom-16"
          >
            <span aria-hidden="true">◎</span> {locating ? "Locating…" : "My location"}
          </button>
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3.5 lg:px-6 lg:py-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-400">Pinned address</p>
          <p className="mt-0.5 min-h-[2.4em] text-[14px] font-medium leading-snug text-gray-800">
            {geocoding ? "Finding the address…" : place?.line || `Pinned location (${lat}, ${lng})`}
          </p>
          {notice && <p className="mt-1 text-[12px] font-medium text-amber-700">{notice}</p>}
          <div className="mt-3 flex items-end gap-3">
            <label className="w-32 flex-shrink-0 text-[12px] font-semibold text-gray-600">
              PIN code
              <input
                value={pin}
                inputMode="numeric"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-brand"
              />
            </label>
            <button
              onClick={confirm}
              disabled={!pinValid || geocoding}
              className="flex-1 rounded-xl bg-brand py-3 text-[14px] font-bold text-white shadow-card hover:bg-brand-dark disabled:opacity-50"
            >
              {geocoding ? "Finding address…" : !pinValid ? "Enter the PIN code" : "Confirm this location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
