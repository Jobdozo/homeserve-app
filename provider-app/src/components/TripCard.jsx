import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Card } from "./biz";
import { NavigateIcon } from "./icons";

// "Start trip" on an accepted job (server: liveLocation.js). While it's on, the customer sees this
// phone's position moving on a map with a rough arrival time; it stops by itself when the start
// code is entered. Location only updates while Tikdum is open — the card says so.

function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const firstName = (name) => String(name || "the customer").trim().split(/\s+/)[0];

export default function TripCard({ request, destination, mapsUrl, customerSharing }) {
  const { trips, setTrip, myFix, showToast } = useApp();
  const [busy, setBusy] = useState(false);
  const onTrip = trips.includes(request.id);
  const who = firstName(request.customer?.name);
  const distance = onTrip && myFix && destination ? km(myFix, destination) : null;

  const toggle = async () => {
    setBusy(true);
    try {
      await setTrip(request.id, !onTrip);
      showToast(onTrip ? "Stopped sharing your location" : `${who} can now see you coming`);
    } catch (e) {
      showToast(e.message || "Couldn't change the trip");
    }
    setBusy(false);
  };

  if (!onTrip) {
    return (
      <Card className="space-y-3 p-4">
        <div>
          <p className="text-[16px] font-extrabold text-ink">Leaving for {who}'s place?</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
            Start the trip so {who} can see you coming on a map. It stops by itself when you enter the start code.
          </p>
        </div>
        <button onClick={toggle} disabled={busy} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-extrabold text-white disabled:opacity-60">
          <NavigateIcon width={18} height={18} /> {busy ? "Starting…" : "Start trip"}
        </button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-go">On the way · sharing live location</p>
          <p className="mt-0.5 text-[16px] font-extrabold text-ink">
            {distance == null ? "Finding your location…" : distance < 0.15 ? "You've arrived" : `${distance.toFixed(1)} km to ${who}`}
          </p>
          {customerSharing && <p className="text-[12px] font-semibold text-go-soft">{who} is sharing their live location — directions follow them.</p>}
        </div>
        <button onClick={toggle} disabled={busy} className="flex-shrink-0 rounded-xl bg-raised px-3 py-2 text-[12.5px] font-bold text-ink-muted disabled:opacity-60">
          {busy ? "…" : "Stop"}
        </button>
      </div>
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-raised text-[14px] font-bold text-ink">
          <NavigateIcon width={17} height={17} /> Navigate in Google Maps
        </a>
      )}
      <p className="text-[11.5px] leading-snug text-ink-muted">
        Keep Tikdum open on the way — your location only updates while the app is on screen.
      </p>
    </Card>
  );
}
