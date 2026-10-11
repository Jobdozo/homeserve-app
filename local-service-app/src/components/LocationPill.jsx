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

  // On the night-violet home header: the area in big type, the city under it.
  if (variant === "dark") {
    const [area, ...rest] = String(label).split(",");
    return (
      <>
        <span className="flex min-w-0 flex-col gap-1.5">
          <button onClick={() => setPicking(true)} className="flex min-w-0 flex-col items-start text-left active:opacity-80">
            <span className="flex max-w-full items-center gap-1.5 font-display text-[19px] font-bold text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span className="truncate">{area}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="flex-shrink-0">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
            {(rest.join(",").trim() || location?.pincode) && (
              <span className="max-w-full truncate pl-6 text-[12.5px] text-[#C9C0F2]">{rest.join(",").trim() || `PIN ${location.pincode}`}</span>
            )}
          </button>
          {locationApproximate && (
            <button onClick={() => setPicking(true)} className="ml-6 w-fit rounded-full bg-marigold px-2.5 py-0.5 text-[11px] font-bold text-ink">
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
