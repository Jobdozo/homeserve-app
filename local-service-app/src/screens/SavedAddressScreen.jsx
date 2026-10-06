import { lazy, Suspense, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { MapPinIcon } from "../components/icons";

// The map (Leaflet) is only needed when a customer opens it, so it loads on demand.
const LocationPicker = lazy(() => import("../components/LocationPicker"));

const SLOTS = [
  { key: "home", label: "Home" },
  { key: "office", label: "Office" },
];

export default function SavedAddressScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { customer, saveAddress, removeOfficeAddress, showToast } = useApp();
  const [slot, setSlot] = useState(params.get("slot") === "office" ? "office" : "home");
  const existing = slot === "office" ? customer?.address?.office : customer?.address;

  const [line, setLine] = useState(existing?.line || "");
  const [pincode, setPincode] = useState(existing?.pincode || "");
  const [coords, setCoords] = useState(existing ? { lat: existing.lat, lng: existing.lng } : null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const switchSlot = (next) => {
    if (next === slot) return;
    const target = next === "office" ? customer?.address?.office : customer?.address;
    setSlot(next);
    setLine(target?.line || "");
    setPincode(target?.pincode || "");
    setCoords(target ? { lat: target.lat, lng: target.lng } : null);
    setError("");
  };

  const valid = line.trim().length > 0 && /^\d{4,10}$/.test(pincode.trim());

  const handleSave = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveAddress({
        slot,
        label: slot === "office" ? "Office" : "Home",
        line: line.trim(),
        pincode: pincode.trim(),
        lat: coords?.lat,
        lng: coords?.lng,
      });
      navigate(-1);
    } catch (e) {
      setError(e.message || "Couldn't save your address");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOffice = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await removeOfficeAddress();
      setLine("");
      setPincode("");
      setCoords(null);
    } catch (e) {
      setError(e.message || "Couldn't remove the address");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Saved Addresses" maxWidth="lg:max-w-2xl" />

      <form onSubmit={handleSave} className="flex-1 space-y-4 px-4 pb-8 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {SLOTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => switchSlot(s.key)}
              className={`rounded-lg py-2 text-[13px] font-semibold ${slot === s.key ? "bg-white text-brand shadow-card" : "text-gray-500"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="text-[12.5px] text-gray-500">
          Pick Home, Office or your current location when you check out. The PIN code decides which providers can take the booking.
        </p>

        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand-light/40 py-3 text-[13px] font-semibold text-brand-dark"
        >
          <MapPinIcon width={16} height={16} />
          {coords ? "Adjust the pin on the map" : "Pin exact location on the map"}
        </button>

        <div>
          <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Address</label>
          <textarea
            value={line}
            onChange={(e) => setLine(e.target.value)}
            rows={3}
            placeholder="House/flat no., street, area, city"
            className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">PIN code</label>
          <input
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder="e.g. 180012"
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={!valid || saving}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${slot === "office" ? "Office" : "Home"} Address`}
        </button>

        {slot === "office" && customer?.address?.office && (
          <button
            type="button"
            onClick={handleRemoveOffice}
            disabled={saving}
            className="w-full py-2 text-[12.5px] font-semibold text-red-500 disabled:opacity-50"
          >
            Remove Office address
          </button>
        )}
      </form>
      {picking && (
        <Suspense fallback={null}>
          <LocationPicker
            initial={coords ? { lat: coords.lat, lng: coords.lng, pincode } : null}
            title={`Pin your ${slot === "office" ? "office" : "home"}`}
            onClose={() => setPicking(false)}
            onConfirm={(loc) => {
              setLine(loc.line);
              setPincode(loc.pincode);
              setCoords({ lat: loc.lat, lng: loc.lng });
              setPicking(false);
              showToast("Pinned — review and save below");
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
