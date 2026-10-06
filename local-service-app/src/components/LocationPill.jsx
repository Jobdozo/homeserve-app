import { lazy, Suspense, useState } from "react";
import { useApp } from "../context/AppContext";

// The map (Leaflet) is only needed when a customer opens it, so it loads on demand.
const LocationPicker = lazy(() => import("./LocationPicker"));

// The "where are you" button on the home page. Tapping it opens the map so the
// customer can set their exact spot: a laptop has no GPS and often guesses the
// wrong city, so an automatic guess alone isn't good enough.
export default function LocationPill({ variant = "desktop" }) {
  const { location, locationStatus, locationApproximate, setPinnedLocation } = useApp();
  const [picking, setPicking] = useState(false);

  const label =
    locationStatus === "detecting" && !location
      ? "Detecting your location…"
      : location?.label || (locationStatus === "denied" ? "Location off — tap to set" : "Set your location");

  const cls =
    variant === "desktop"
      ? "inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[13.5px] font-semibold text-gray-700 shadow-card hover:border-gray-300"
      : "flex items-center gap-1 text-sm font-semibold text-gray-900";

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button onClick={() => setPicking(true)} className={cls}>
          {variant === "desktop" ? <span className="text-brand">●</span> : <span>📍</span>}
          <span className="max-w-[260px] truncate">{label}</span>
          <span className="text-gray-400">▾</span>
        </button>
        {locationApproximate && (
          <button
            onClick={() => setPicking(true)}
            className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-200"
            title="This is a city-level guess. Tap to set your exact spot."
          >
            Approximate · set exact spot
          </button>
        )}
      </span>
      {picking && (
        <Suspense fallback={null}>
          <LocationPicker
            title="Set your location"
            initial={location && !locationApproximate ? { lat: location.lat, lng: location.lng, pincode: location.pincode } : null}
            onClose={() => setPicking(false)}
            onConfirm={(loc) => {
              setPinnedLocation(loc);
              setPicking(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
