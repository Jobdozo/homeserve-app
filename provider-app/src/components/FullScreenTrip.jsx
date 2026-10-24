import { useEffect, useMemo, useRef, useState } from "react";
import { NavigateIcon, PhoneIcon, XIcon } from "./icons";
import { loadGoogleMaps, mapsKey } from "../utils/googleMaps";
import { decodePolyline, km, nextTurn, remaining, routeAhead, turnArrow, QUIET_MAP_STYLE, VEHICLE_PATH, PIN_PATH } from "../utils/tripMath";

// The trip full screen (TripCard → "Full screen"): the map follows this phone at street level, the
// next turn from Google's steps (server tripRoutes.js) sits on top, and the time, distance and
// arrival clock, Call, Google Maps and Stop sit at the bottom. The screen stays on while it's open,
// and turns can be spoken ("Voice"), each once, when they're under 150 m away.

const ROUTE = "#1B1530";
const PIN = "#16A34A";
const VOICE_KEY = "tikdum.tripVoice";

const distance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const clock = (minutes) => new Date(Date.now() + minutes * 60000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function readVoice() {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

// Keep the screen on while the trip is open (Android WebView and Chrome support it; elsewhere nothing happens).
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let gone = false;
    const take = async () => {
      try {
        if (!gone && document.visibilityState === "visible" && navigator.wakeLock) lock = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed here */
      }
    };
    take();
    // The lock drops when the app goes to the background; take it again on return.
    document.addEventListener("visibilitychange", take);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", take);
      lock?.release().catch(() => {});
    };
  }, []);
}

function FollowMap({ me, heading, destination, points, onState }) {
  const el = useRef(null);
  const api = useRef(null);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const followRef = useRef(true);

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
        const m = new Map(el.current, { center: me || destination, zoom: 17, disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false, styles: QUIET_MAP_STYLE });
        const line = new Polyline({ map: m, strokeColor: ROUTE, strokeOpacity: 0.9, strokeWeight: 7 });
        new Marker({ map: m, position: destination, zIndex: 1, icon: { path: PIN_PATH, fillColor: PIN, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, scale: 1.2, anchor: new g.maps.Point(0, 0) } });
        let vehicle = null;
        // Dragging the map stops following until "Re-centre".
        m.addListener("dragstart", () => {
          followRef.current = false;
          setFollowing(false);
        });
        api.current = {
          update: (pos, deg, path) => {
            line.setPath(path);
            if (!pos) return;
            vehicle = vehicle || new Marker({ map: m, zIndex: 2 });
            vehicle.setIcon({ path: VEHICLE_PATH, rotation: deg || 0, fillColor: ROUTE, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, scale: 1.4, anchor: new g.maps.Point(0, 0) });
            vehicle.setPosition(pos);
            if (followRef.current) m.panTo(pos);
          },
          recentre: (pos) => {
            if (pos) m.panTo(pos);
            m.setZoom(17);
          },
        };
        setReady(true);
      } catch {
        if (!gone) onState?.("none");
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) api.current?.update(me, heading, points);
  }, [ready, me?.lat, me?.lng, heading, points]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div ref={el} className="absolute inset-0 bg-raised" />
      {!following && (
        <button
          onClick={() => {
            followRef.current = true;
            setFollowing(true);
            api.current?.recentre(me);
          }}
          className="absolute right-4 z-10 flex h-11 items-center gap-1.5 rounded-full bg-card px-4 text-[13.5px] font-bold text-ink shadow-float"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 200px)" }}
        >
          <NavigateIcon width={16} height={16} /> Re-centre
        </button>
      )}
    </>
  );
}

export default function FullScreenTrip({ request, me, heading, destination, route, mapsUrl, who, onStop, stopping, onClose }) {
  const [voice, setVoice] = useState(readVoice);
  const [noMap, setNoMap] = useState(false);
  const spoken = useRef(new Set());
  useWakeLock();

  const routePoints = useMemo(() => (route?.polyline ? decodePolyline(route.polyline) : []), [route?.polyline]);
  const points = useMemo(() => routeAhead(routePoints, me, destination), [routePoints, me?.lat, me?.lng, destination?.lat, destination?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = me && destination ? remaining(me, destination, route) : null;
  const arrived = left != null && km(me, destination) < 0.15;
  const turn = arrived ? null : nextTurn(routePoints, route?.steps, me);
  const [main, hint] = String(turn?.step.instruction || "").split("\n");
  const phone = request.customer?.phone || request.contact?.phone;

  // Speak each turn once, when it's close.
  useEffect(() => {
    if (!voice || !window.speechSynthesis) return;
    const say = (text, id) => {
      if (spoken.current.has(id)) return;
      spoken.current.add(id);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-IN";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    };
    if (arrived) say(`You've arrived at ${who}'s place`, "arrived");
    else if (turn && turn.metres < 150) say(`In ${distance(turn.metres).replace("m", "metres")}, ${main}`, `${turn.step.lat},${turn.step.lng}`);
  }, [voice, arrived, turn?.step.lat, turn?.step.lng, turn && turn.metres < 150]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    if (!on) window.speechSynthesis?.cancel();
    try {
      localStorage.setItem(VOICE_KEY, on ? "on" : "off");
    } catch {
      /* fine without */
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-raised" role="dialog" aria-modal="true" aria-label={`Trip to ${who}`}>
      {destination && !noMap && <FollowMap me={me} heading={heading} destination={destination} points={points} onState={() => setNoMap(true)} />}

      {/* Next turn */}
      <div className="absolute inset-x-0 top-0 z-10 px-3" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <div className="flex items-start gap-3">
          <div className="flex min-h-[84px] flex-1 items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-xl" style={{ background: arrived ? "#12301F" : "#2A1A7A" }}>
            {arrived ? (
              <p className="text-[19px] font-extrabold leading-tight">You've arrived · ask {who} for the start code</p>
            ) : turn ? (
              <>
                <span className="w-12 flex-shrink-0 text-center text-[40px] font-extrabold leading-none">{turnArrow(turn.step.maneuver)}</span>
                <div className="min-w-0">
                  <p className="text-[24px] font-extrabold leading-none tabular-nums">{distance(turn.metres)}</p>
                  <p className="mt-1 text-[15px] font-bold leading-snug">{main}</p>
                  {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-white/70">{hint}</p>}
                </div>
              </>
            ) : (
              <p className="text-[16px] font-bold leading-snug">{me ? `Head to ${who}'s place` : "Finding your location…"}</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Exit full screen" className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-float">
            <XIcon width={20} height={20} />
          </button>
        </div>
        <button
          onClick={toggleVoice}
          aria-pressed={voice}
          className={`mt-2 h-9 rounded-full px-3.5 text-[12.5px] font-bold shadow ${voice ? "bg-card text-ink" : "bg-card/80 text-ink-muted"}`}
        >
          {voice ? "🔊 Voice on" : "🔇 Voice off"}
        </button>
      </div>

      {/* Time, distance, actions */}
      <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-card px-4 pt-4 shadow-float" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
        <div className="flex items-baseline justify-between gap-3">
          {left == null ? (
            <p className="text-[16px] font-bold text-ink-muted">Finding your location…</p>
          ) : arrived ? (
            <p className="text-[20px] font-extrabold text-go">At {who}'s place</p>
          ) : (
            <>
              <p className="text-[26px] font-extrabold leading-none text-go tabular-nums">{left.minutes} min</p>
              <p className="text-[14px] font-bold text-ink-muted tabular-nums">
                {left.km.toFixed(1)} km · arrive {clock(left.minutes)}
              </p>
            </>
          )}
        </div>
        {noMap && <p className="mt-1 text-[12px] text-ink-muted">The map couldn't load — use Google Maps for directions.</p>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {phone ? (
            <a href={`tel:${phone}`} className="flex h-[52px] items-center justify-center gap-1.5 rounded-2xl bg-raised text-[14px] font-bold text-ink">
              <PhoneIcon width={17} height={17} /> Call
            </a>
          ) : (
            <span className="flex h-[52px] items-center justify-center rounded-2xl bg-raised text-[13px] font-bold text-ink-muted">No phone</span>
          )}
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex h-[52px] items-center justify-center gap-1.5 rounded-2xl bg-raised text-[14px] font-bold text-ink">
              <NavigateIcon width={17} height={17} /> Maps
            </a>
          ) : (
            <span />
          )}
          <button onClick={onStop} disabled={stopping} className="h-[52px] rounded-2xl bg-red-50 text-[14px] font-bold text-red-600 disabled:opacity-60">
            {stopping ? "…" : "Stop trip"}
          </button>
        </div>
      </div>
    </div>
  );
}
