import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { socket } from "../socket";
import { useApp } from "../context/AppContext";
import { mapsKey, loadGoogleMaps } from "../utils/googleMaps";
import { bearing, decodePolyline, km, remaining, QUIET_MAP_STYLE, VEHICLE_PATH, PIN_PATH } from "../utils/tripMath";
import { MapPinIcon } from "./icons";

// Live tracking on a booking (server: liveLocation.js, tripRoutes.js). Once the professional starts
// the trip, their position arrives every few seconds over the live connection: a vehicle that
// turns the way they're riding moves along the road route to the booked address (pin), with
// Google's distance and travel time. The customer can also share their own live location.

const ROUTE = "#1B1530";
const PIN = "#16A34A";
const isNum = (n) => typeof n === "number" && Number.isFinite(n);

function LiveMap({ home, pro, heading, route }) {
  const el = useRef(null);
  const map = useRef(null); // { setHome, setPro, setRoute, destroy }
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let gone = false;
    const start = pro || home;
    (async () => {
      try {
        const key = await mapsKey();
        const g = key ? await loadGoogleMaps(key) : null;
        if (g && !gone) {
          const { Map, Polyline } = await g.maps.importLibrary("maps");
          const { Marker } = await g.maps.importLibrary("marker");
          const m = new Map(el.current, { center: start, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false, styles: QUIET_MAP_STYLE });
          let homeM = null;
          let proM = null;
          const line = new Polyline({ map: m, strokeColor: ROUTE, strokeOpacity: 0.9, strokeWeight: 5 });
          let fitted = false;
          const fit = () => {
            if (fitted || !proM || !homeM) return;
            const b = new g.maps.LatLngBounds();
            b.extend(proM.getPosition());
            b.extend(homeM.getPosition());
            line.getPath().forEach((p) => b.extend(p));
            const ne = b.getNorthEast().toJSON();
            const sw = b.getSouthWest().toJSON();
            // Already there (or nearly): a street-level view, not the closest zoom Google allows.
            if (km(ne, sw) < 0.15) {
              m.setCenter(b.getCenter());
              m.setZoom(16);
            } else m.fitBounds(b, 56);
            fitted = true;
          };
          map.current = {
            setHome: (at) => {
              homeM = homeM || new Marker({ map: m, zIndex: 1, icon: { path: PIN_PATH, fillColor: PIN, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, scale: 1, anchor: new g.maps.Point(0, 0) } });
              homeM.setPosition(at);
              fit();
            },
            setPro: (at, deg) => {
              proM = proM || new Marker({ map: m, zIndex: 2 });
              proM.setIcon({ path: VEHICLE_PATH, rotation: deg || 0, fillColor: ROUTE, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2.5, scale: 1.15, anchor: new g.maps.Point(0, 0) });
              proM.setPosition(at);
              fit();
            },
            setRoute: (points) => {
              line.setPath(points);
              if (fitted) return;
              fit();
            },
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
        const line = L.polyline([], { color: ROUTE, weight: 5, opacity: 0.9 }).addTo(m);
        const vehicle = (deg) =>
          L.divIcon({
            className: "",
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            html: `<svg width="28" height="28" viewBox="-14 -14 28 28" style="transform:rotate(${deg || 0}deg)"><path d="${VEHICLE_PATH}" fill="${ROUTE}" stroke="#fff" stroke-width="2.5"/></svg>`,
          });
        const pinIcon = L.divIcon({ className: "", iconSize: [26, 40], iconAnchor: [13, 40], html: `<svg width="26" height="40" viewBox="-13 -40 26 40"><path d="${PIN_PATH}" fill="${PIN}" stroke="#fff" stroke-width="2"/></svg>` });
        let homeM = null;
        let proM = null;
        let fitted = false;
        const fit = () => {
          if (fitted || !proM || !homeM) return;
          m.fitBounds(L.latLngBounds([proM.getLatLng(), homeM.getLatLng(), ...line.getLatLngs()]), { padding: [40, 40], maxZoom: 16 });
          fitted = true;
        };
        requestAnimationFrame(() => m.invalidateSize());
        map.current = {
          setHome: (at) => {
            homeM = homeM || L.marker([at.lat, at.lng], { icon: pinIcon }).addTo(m);
            homeM.setLatLng([at.lat, at.lng]);
            fit();
          },
          setPro: (at, deg) => {
            proM = proM || L.marker([at.lat, at.lng], { icon: vehicle(deg), zIndexOffset: 100 }).addTo(m);
            proM.setLatLng([at.lat, at.lng]);
            proM.setIcon(vehicle(deg));
            fit();
          },
          setRoute: (points) => {
            line.setLatLngs(points.map((p) => [p.lat, p.lng]));
            fit();
          },
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
    if (ready && pro) map.current?.setPro(pro, heading);
  }, [ready, pro?.lat, pro?.lng, heading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready) return;
    // The road route from where it was drawn; until then, a straight line so there's always a line.
    let points = route?.polyline ? decodePolyline(route.polyline) : pro && home ? [pro, home] : [];
    // Start the line at the vehicle and drop the part already ridden (up to the nearest point).
    if (pro && points.length > 1) {
      let nearest = 0;
      points.forEach((p, i) => {
        if (km(p, pro) < km(points[nearest], pro)) nearest = i;
      });
      points = [pro, ...points.slice(Math.min(nearest + 1, points.length - 1))];
    }
    map.current?.setRoute(points);
  }, [ready, route?.polyline, pro?.lat, pro?.lng, home?.lat, home?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-[260px] w-full overflow-hidden rounded-2xl bg-mist" />;
}

export default function LiveTracking({ booking, who = "Your professional" }) {
  const { sharing, markSharing, setShareLocation, showToast } = useApp();
  const [pro, setPro] = useState(null); // { lat, lng, accuracy, updatedAt }
  const [heading, setHeading] = useState(0);
  const [route, setRoute] = useState(null); // { polyline, distanceMeters, durationSeconds, from }
  const [trip, setTrip] = useState(null); // { startedAt } while on the way
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const sharingThis = sharing.includes(booking.id);
  const home = isNum(booking.address?.lat) && isNum(booking.address?.lng) ? { lat: booking.address.lat, lng: booking.address.lng } : null;

  // A new position: turn the vehicle the way it moved (ignoring GPS jitter of a few metres).
  const lastPos = useRef(null);
  const takePosition = (p) => {
    if (!isNum(p?.lat)) return;
    const prev = lastPos.current;
    if (prev && km(prev, p) > 0.008) setHeading(bearing(prev, p));
    if (!prev || km(prev, p) > 0.008) lastPos.current = p;
    setPro(p);
  };

  // The latest position, route and whether a trip / share is on (also after a reload), every 30 s
  // as a safety net; live updates arrive over the socket in between.
  useEffect(() => {
    let off = false;
    const poll = () =>
      api
        .getBookingLiveLocation(booking.id)
        .then((r) => {
          if (off) return;
          takePosition(r);
          setTrip(r.trip || null);
          if (r.route) setRoute(r.route);
          markSharing(booking.id, Boolean(r.share));
        })
        .catch((e) => {
          if (off) return;
          // 404 "not available yet" still says whether a trip is on
          setTrip(e?.data?.trip || null);
        });
    poll();
    const t = setInterval(poll, 30000);
    const onLocation = (u) => u.bookingId === booking.id && u.who === "provider" && takePosition(u);
    const onRoute = (u) => u.bookingId === booking.id && setRoute(u);
    const onTrip = (u) => {
      if (u.bookingId !== booking.id) return;
      if (u.kind === "trip") {
        setTrip(u.active ? { startedAt: u.startedAt } : null);
        if (!u.active) setRoute(null);
      }
      if (u.kind === "share") markSharing(booking.id, u.active);
    };
    socket.on("location:update", onLocation);
    socket.on("route:update", onRoute);
    socket.on("trip:updated", onTrip);
    const clock = setInterval(() => tick((n) => n + 1), 15000); // "updated 20 s ago"
    return () => {
      off = true;
      clearInterval(t);
      clearInterval(clock);
      socket.off("location:update", onLocation);
      socket.off("route:update", onRoute);
      socket.off("trip:updated", onTrip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const left = onTheWay && pro && home ? remaining(pro, home, route) : null;
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
                {left == null ? "Finding their location…" : left.km < 0.15 ? "Arriving now" : `Arriving in about ${left.minutes} min`}
              </p>
            </div>
            {left != null && left.km >= 0.15 && <span className="text-[13px] font-bold text-ink-muted tabular">{left.km.toFixed(1)} km</span>}
          </div>
          <LiveMap home={home} pro={pro && isNum(pro.lat) ? { lat: pro.lat, lng: pro.lng } : null} heading={heading} route={route} />
          <p className="text-[11.5px] text-ink-muted">
            {stale
              ? `Last seen ${Math.round(ago / 60)} min ago — their phone may have the Tikdum app closed.`
              : ago != null
                ? `Updated ${ago < 10 ? "just now" : `${ago} s ago`} · ${left?.byRoad ? "time by road from Google, may change with traffic" : "arrival time is an estimate"}`
                : "The map updates as they move"}
          </p>
        </>
      ) : pro && isNum(pro.lat) ? (
        // An older Business app (no trips) still reports every 30 s: offer that as before.
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
