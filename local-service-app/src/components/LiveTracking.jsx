import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { socket } from "../socket";
import { useApp } from "../context/AppContext";
import { mapsKey, loadGoogleMaps } from "../utils/googleMaps";
import { MapPinIcon } from "./icons";

// Live tracking on a booking (server: liveLocation.js). Once the professional taps "Start trip",
// their position arrives every few seconds over the live connection and moves on the map
// towards the booked address, with the distance and a rough arrival time. The customer can
// also share their own live location with the professional (e.g. they're not at home).

const HOME = "#5B3FE0";
const PRO = "#16A34A";
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

// Straight-line distance in km.
function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
// Roads wind (×1.3) and city traffic averages ~20 km/h: an honest "about", not a promise.
export function etaMinutes(distanceKm) {
  return Math.max(1, Math.round(((distanceKm * 1.3) / 20) * 60));
}

function LiveMap({ home, pro }) {
  const el = useRef(null);
  const map = useRef(null); // { setPro, setHome, destroy }
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    const start = pro || home;
    (async () => {
      try {
        const key = await mapsKey();
        const g = key ? await loadGoogleMaps(key) : null;
        if (g && !gone) {
          const { Map } = await g.maps.importLibrary("maps");
          const { Marker } = await g.maps.importLibrary("marker");
          const m = new Map(el.current, { center: start, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false });
          const dot = (fill, scale) => ({ path: g.maps.SymbolPath.CIRCLE, scale, fillColor: fill, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3 });
          const markers = {};
          const place = (k, at, fill, scale) => {
            if (!at) return;
            if (!markers[k]) markers[k] = new Marker({ map: m, icon: dot(fill, scale), zIndex: k === "pro" ? 2 : 1 });
            markers[k].setPosition(at);
          };
          let fitted = false;
          const fit = () => {
            if (fitted || !markers.pro || !markers.home) return;
            const b = new g.maps.LatLngBounds();
            b.extend(markers.pro.getPosition());
            b.extend(markers.home.getPosition());
            m.fitBounds(b, 48);
            fitted = true;
          };
          map.current = {
            setHome: (at) => (place("home", at, HOME, 8), fit()),
            setPro: (at) => (place("pro", at, PRO, 10), fit()),
            destroy: () => g.maps.event.clearInstanceListeners(m),
          };
        }
      } catch {
        // fall through to OpenStreetMap
      }
      if (gone) return;
      if (!map.current) {
        const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], 15);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
        const markers = {};
        const place = (k, at, color, radius) => {
          if (!at) return;
          if (!markers[k]) markers[k] = L.circleMarker([at.lat, at.lng], { radius, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 }).addTo(m);
          markers[k].setLatLng([at.lat, at.lng]);
        };
        let fitted = false;
        const fit = () => {
          if (fitted || !markers.pro || !markers.home) return;
          m.fitBounds(L.latLngBounds([markers.pro.getLatLng(), markers.home.getLatLng()]), { padding: [40, 40] });
          fitted = true;
        };
        requestAnimationFrame(() => m.invalidateSize());
        map.current = {
          setHome: (at) => (place("home", at, HOME, 8), fit()),
          setPro: (at) => (place("pro", at, PRO, 10), fit()),
          destroy: () => m.remove(),
        };
      }
      setReady(true);
    })();
    return () => {
      gone = true;
      map.current?.destroy();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && home) map.current?.setHome(home);
  }, [ready, home?.lat, home?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ready && pro) map.current?.setPro(pro);
  }, [ready, pro?.lat, pro?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-[220px] w-full overflow-hidden rounded-2xl bg-mist" />;
}

export default function LiveTracking({ booking, who = "Your professional" }) {
  const { sharing, markSharing, setShareLocation, showToast } = useApp();
  const [pro, setPro] = useState(null); // { lat, lng, accuracy, updatedAt }
  const [trip, setTrip] = useState(null); // { startedAt } while on the way
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const sharingThis = sharing.includes(booking.id);
  const home = isNum(booking.address?.lat) && isNum(booking.address?.lng) ? { lat: booking.address.lat, lng: booking.address.lng } : null;

  // The latest position and whether a trip / share is on (also after a reload), every 30 s as a
  // safety net; live updates arrive over the socket in between.
  useEffect(() => {
    let off = false;
    const poll = () =>
      api
        .getBookingLiveLocation(booking.id)
        .then((r) => {
          if (off) return;
          if (isNum(r.lat)) setPro(r);
          setTrip(r.trip || null);
          markSharing(booking.id, Boolean(r.share));
        })
        .catch((e) => {
          if (off) return;
          // 404 "not available yet" still says whether a trip is on
          setTrip(e?.data?.trip || null);
        });
    poll();
    const t = setInterval(poll, 30000);
    const onLocation = (u) => u.bookingId === booking.id && u.who === "provider" && setPro(u);
    const onTrip = (u) => {
      if (u.bookingId !== booking.id) return;
      if (u.kind === "trip") setTrip(u.active ? { startedAt: u.startedAt } : null);
      if (u.kind === "share") markSharing(booking.id, u.active);
    };
    socket.on("location:update", onLocation);
    socket.on("trip:updated", onTrip);
    const clock = setInterval(() => tick((n) => n + 1), 15000); // "updated 20 s ago"
    return () => {
      off = true;
      clearInterval(t);
      clearInterval(clock);
      socket.off("location:update", onLocation);
      socket.off("trip:updated", onTrip);
    };
  }, [booking.id, markSharing]);

  const toggleShare = async () => {
    setBusy(true);
    try {
      await setShareLocation(booking.id, !sharingThis);
      showToast(sharingThis ? "Stopped sharing your location" : `${who} can now see where you are`);
    } catch (e) {
      showToast(e.message || "Couldn't change location sharing");
    }
    setBusy(false);
  };

  const onTheWay = booking.status === "Accepted" && trip;
  const distance = onTheWay && pro && home ? km(pro, home) : null;
  const ago = pro?.updatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(pro.updatedAt)) / 1000)) : null;
  const stale = ago != null && ago > 120;

  return (
    <div className="mt-3 space-y-2.5">
      {onTheWay ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-trust-dark">On the way</p>
              <p className="text-[16px] font-extrabold text-ink">
                {distance == null ? "Finding their location…" : distance < 0.15 ? "Arriving now" : `About ${etaMinutes(distance)} min away`}
              </p>
            </div>
            {distance != null && distance >= 0.15 && <span className="text-[13px] font-bold text-ink-muted tabular">{distance.toFixed(1)} km</span>}
          </div>
          <LiveMap home={home} pro={pro && isNum(pro.lat) ? { lat: pro.lat, lng: pro.lng } : null} />
          <p className="text-[11.5px] text-ink-muted">
            {stale
              ? `Last seen ${Math.round(ago / 60)} min ago — their phone may have the Tikdum app closed.`
              : ago != null
                ? `Updated ${ago < 10 ? "just now" : `${ago} s ago`} · arrival time is an estimate`
                : "The map updates as they move"}
          </p>
        </>
      ) : pro && isNum(pro.lat) ? (
        // An older Business app (no "Start trip") still reports every 30 s: offer that as before.
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${pro.lat},${pro.lng}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-2xl bg-mist px-3 py-2.5 text-[13px] font-bold text-brand"
        >
          <span className="flex items-center gap-1.5">
            <MapPinIcon width={15} height={15} /> See where they are
          </span>
          {typeof pro.accuracy === "number" && <span className="text-[11.5px] font-medium text-ink-muted">±{Math.round(pro.accuracy)} m</span>}
        </a>
      ) : (
        booking.status === "Accepted" && (
          <p className="flex items-center gap-1.5 rounded-2xl bg-mist px-3 py-2.5 text-[12.5px] text-ink-muted">
            <MapPinIcon width={14} height={14} /> You'll see {who === "Your professional" ? "them" : who} on a map once they start the trip.
          </p>
        )
      )}
      <button
        type="button"
        onClick={toggleShare}
        disabled={busy}
        className={`flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-[13px] font-bold ${sharingThis ? "bg-trust-light text-trust-dark" : "bg-mist text-ink"} disabled:opacity-60`}
      >
        <span>{sharingThis ? "Sharing your live location" : "Share my live location"}</span>
        <span className="text-[11.5px] font-semibold text-ink-muted">{sharingThis ? "Tap to stop" : "If you're not at the booked address"}</span>
      </button>
    </div>
  );
}
