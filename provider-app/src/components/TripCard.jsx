import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { Card } from "./biz";
import { NavigateIcon } from "./icons";
import { loadGoogleMaps, mapsKey } from "../utils/googleMaps";
import { bearing, decodePolyline, km, remaining, routeAhead, QUIET_MAP_STYLE, VEHICLE_PATH, PIN_PATH } from "../utils/tripMath";
import FullScreenTrip from "./FullScreenTrip";

// The trip on an accepted job (server: liveLocation.js, tripRoutes.js). A map shows the road route
// from this phone to the customer, the vehicle turning the way they ride and the customer's pin;
// "Slide to start trip" starts sharing this phone's position with the customer, and it stops by
// itself when the start code is entered. Location only updates while Tikdum is open — the card
// says so.

const ROUTE = "#1B1530";
const PIN = "#16A34A";
const firstName = (name) => String(name || "the customer").trim().split(/\s+/)[0];

function TripMap({ me, heading, destination, route }) {
  const el = useRef(null);
  const api = useRef(null);
  const [state, setState] = useState("loading"); // loading | ready | none

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const key = await mapsKey();
        if (!key) throw new Error("no key");
        const g = await loadGoogleMaps(key);
        if (gone) return;
        const { Map, Polyline } = await g.maps.importLibrary("maps");
        const { Marker } = await g.maps.importLibrary("marker");
        const m = new Map(el.current, { center: destination, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: "cooperative", clickableIcons: false, styles: QUIET_MAP_STYLE });
        const line = new Polyline({ map: m, strokeColor: ROUTE, strokeOpacity: 0.9, strokeWeight: 5 });
        const pin = new Marker({ map: m, position: destination, zIndex: 1, icon: { path: PIN_PATH, fillColor: PIN, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, scale: 1, anchor: new g.maps.Point(0, 0) } });
        let vehicle = null;
        let fitted = false;
        api.current = {
          update: (pos, deg, points) => {
            line.setPath(points);
            if (pos) {
              vehicle = vehicle || new Marker({ map: m, zIndex: 2 });
              vehicle.setIcon({ path: VEHICLE_PATH, rotation: deg || 0, fillColor: ROUTE, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2.5, scale: 1.15, anchor: new g.maps.Point(0, 0) });
              vehicle.setPosition(pos);
              if (!fitted) {
                const b = new g.maps.LatLngBounds();
                b.extend(pin.getPosition());
                b.extend(pos);
                points.forEach((p) => b.extend(p));
                // Already there (or nearly): a street-level view, not the closest zoom Google allows.
                if (km(b.getNorthEast().toJSON(), b.getSouthWest().toJSON()) < 0.15) {
                  m.setCenter(b.getCenter());
                  m.setZoom(16);
                } else m.fitBounds(b, 48);
                fitted = true;
              }
            }
          },
        };
        setState("ready");
      } catch {
        if (!gone) setState("none"); // no map: the card still works without it
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    // From this phone on (a straight line until Google's route arrives); none once at the door.
    api.current?.update(me, heading, routeAhead(route?.polyline ? decodePolyline(route.polyline) : [], me, destination));
  }, [state, me?.lat, me?.lng, heading, route?.polyline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "none") return null;
  return <div ref={el} className="h-[230px] w-full overflow-hidden rounded-2xl bg-raised" />;
}

// Drag the knob to the end to start (an accidental tap does nothing).
function SlideToStart({ label, onDone, busy }) {
  const track = useRef(null);
  const [x, setX] = useState(0);
  const drag = useRef(null);
  const KNOB = 52;
  const max = () => Math.max(1, (track.current?.clientWidth || 300) - KNOB - 8);
  const down = (e) => {
    if (busy) return;
    drag.current = { start: e.clientX - x };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => drag.current && setX(Math.min(max(), Math.max(0, e.clientX - drag.current.start)));
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    if (x >= max() * 0.85) {
      setX(max());
      onDone();
    } else setX(0);
  };
  useEffect(() => {
    if (!busy) setX(0);
  }, [busy]);
  return (
    <div ref={track} className="relative h-[60px] select-none overflow-hidden rounded-2xl bg-brand">
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 text-[14.5px] font-extrabold uppercase tracking-wide text-white">
        {busy ? "Starting…" : label} »
      </span>
      <button
        type="button"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onDone()}
        className="absolute top-1 flex h-[52px] w-[52px] touch-none items-center justify-center rounded-xl bg-white text-brand shadow"
        style={{ left: 4 + x, transition: drag.current ? "none" : "left 0.2s" }}
      >
        <NavigateIcon width={22} height={22} />
      </button>
    </div>
  );
}

export default function TripCard({ request, destination, mapsUrl, customerSharing, route }) {
  const { trips, setTrip, myFix, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const [heading, setHeading] = useState(0);
  const [full, setFull] = useState(false);
  const last = useRef(null);
  const onTrip = trips.includes(request.id);
  const who = firstName(request.customer?.name);
  const me = onTrip && myFix ? { lat: myFix.lat, lng: myFix.lng } : null;
  const left = me && destination ? remaining(me, destination, route) : null;

  // Turn the vehicle the way this phone moved (ignoring a few metres of GPS jitter).
  useEffect(() => {
    if (!me) return;
    const prev = last.current;
    if (prev && km(prev, me) > 0.008) setHeading(bearing(prev, me));
    if (!prev || km(prev, me) > 0.008) last.current = me;
  }, [me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    setBusy(true);
    try {
      await setTrip(request.id, !onTrip);
      showToast(onTrip ? "Stopped sharing your location" : `${who} can now see you coming`);
      setFull(!onTrip); // starting opens the full-screen trip; stopping closes it
    } catch (e) {
      showToast(e.message || "Couldn't change the trip");
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-3 p-4">
      {onTrip ? (
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-go">On the way · sharing live location</p>
            <p className="mt-0.5 text-[16px] font-extrabold text-ink">
              {left == null ? "Finding your location…" : left.km < 0.15 ? "You've arrived" : `${left.km.toFixed(1)} km · about ${left.minutes} min to ${who}`}
            </p>
            {customerSharing && <p className="text-[12px] font-semibold text-go-soft">{who} is sharing their live location — directions follow them.</p>}
          </div>
          <button onClick={toggle} disabled={busy} className="flex-shrink-0 rounded-xl bg-raised px-3 py-2 text-[12.5px] font-bold text-ink-muted disabled:opacity-60">
            {busy ? "…" : "Stop"}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-[16px] font-extrabold text-ink">Leaving for {who}'s place?</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">Start the trip so {who} can see you coming. It stops by itself when you enter the start code.</p>
        </div>
      )}

      {destination && <TripMap me={me} heading={heading} destination={destination} route={onTrip ? route : null} />}

      {onTrip ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setFull(true)} className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-brand text-[14px] font-bold text-white">
              <NavigateIcon width={17} height={17} /> Full screen
            </button>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-raised text-[14px] font-bold text-ink">
                Google Maps
              </a>
            )}
          </div>
          {full && (
            <FullScreenTrip
              request={request}
              me={me}
              heading={heading}
              destination={destination}
              route={route}
              mapsUrl={mapsUrl}
              who={who}
              onStop={toggle}
              stopping={busy}
              onClose={() => setFull(false)}
            />
          )}
          <p className="text-[11.5px] leading-snug text-ink-muted">Keep Tikdum open on the way — your location only updates while the app is on screen.</p>
        </>
      ) : (
        <SlideToStart label="Slide to start trip" onDone={toggle} busy={busy} />
      )}
    </Card>
  );
}
