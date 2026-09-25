import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { MapPinIcon } from "../components/icons";
import { detectCurrentLocation } from "../utils/geolocation";

export default function SavedAddressScreen() {
  const navigate = useNavigate();
  const { customer, saveAddress, showToast } = useApp();
  const existing = customer?.address;

  const [label, setLabel] = useState(existing?.label || "Home");
  const [line, setLine] = useState(existing?.line || "");
  const [pincode, setPincode] = useState(existing?.pincode || "");
  const [coords, setCoords] = useState(existing ? { lat: existing.lat, lng: existing.lng } : null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleDetect = async () => {
    setDetecting(true);
    setError("");
    try {
      const loc = await detectCurrentLocation();
      setLine(loc.line);
      if (loc.pincode) setPincode(loc.pincode);
      setCoords({ lat: loc.lat, lng: loc.lng });
      showToast("Location detected — review and save below");
    } catch (e) {
      setError(e.message || "Couldn't detect your location");
    } finally {
      setDetecting(false);
    }
  };

  const valid = line.trim().length > 0 && /^\d{4,10}$/.test(pincode.trim());

  const handleSave = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveAddress({
        label: label.trim() || "Home",
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

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Saved Address" maxWidth="lg:max-w-2xl" />

      <form onSubmit={handleSave} className="flex-1 space-y-4 px-4 pb-8 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <p className="text-[12.5px] text-gray-500">
          Your PIN code determines which nearby service providers you'll see in the app.
        </p>

        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand-light/40 py-3 text-[13px] font-semibold text-brand-dark disabled:opacity-50"
        >
          <MapPinIcon width={16} height={16} />
          {detecting ? "Detecting…" : "Use current location to fill this in"}
        </button>

        <div>
          <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Home, Office, ..."
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand"
          />
        </div>

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
            placeholder="e.g. 110001"
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand"
          />
        </div>

        {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={!valid || saving}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Address"}
        </button>
      </form>
    </div>
  );
}
