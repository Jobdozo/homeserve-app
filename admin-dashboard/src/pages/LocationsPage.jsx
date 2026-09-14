import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { MapPinIcon, XIcon } from "../components/icons";

const TABS = ["All", "Active", "Inactive"];

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";
const primaryBtnCls =
  "w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:w-auto sm:px-6";

export default function LocationsPage() {
  const { showToast } = useApp();
  const [locations, setLocations] = useState(null);
  const [tab, setTab] = useState("All");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    api
      .listServiceableLocations()
      .then(setLocations)
      .catch((e) => {
        showToast(e.message || "Failed to load locations");
        setLocations([]);
      });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!locations) return [];
    if (tab === "Active") return locations.filter((l) => l.active);
    if (tab === "Inactive") return locations.filter((l) => !l.active);
    return locations;
  }, [locations, tab]);

  const valid = /^\d{6}$/.test(pincode.trim()) && city.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await api.createServiceableLocation({ pincode: pincode.trim(), city: city.trim(), area: area.trim() || undefined });
      setPincode("");
      setCity("");
      setArea("");
      showToast("PIN code added");
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to add location");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (l) => {
    try {
      await api.updateServiceableLocation(l.id, { active: !l.active });
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to update location");
    }
  };

  const remove = async (l) => {
    try {
      await api.deleteServiceableLocation(l.id);
      showToast(`${l.pincode} removed`);
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to remove location");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
            <MapPinIcon width={16} height={16} />
          </span>
          <h2 className="text-[14px] font-bold text-gray-900">Add a serviceable PIN code</h2>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_1fr_auto] sm:items-end">
          <div>
            <label className={labelCls}>PIN code</label>
            <input
              className={inputCls}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="110001"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="New Delhi" />
          </div>
          <div>
            <label className={labelCls}>Area (optional)</label>
            <input className={inputCls} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Connaught Place" />
          </div>
          <button type="submit" disabled={!valid || busy} className={primaryBtnCls}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
        <p className="mt-2 text-[11px] text-gray-400">
          Customers can only check out with an address in an active PIN code below — everything else is blocked at checkout.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-colors ${
              tab === t ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">PIN code</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Area</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Remove</th>
              </tr>
            </thead>
            <tbody>
              {locations === null && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-mono font-semibold text-gray-800">{l.pincode}</td>
                  <td className="px-4 py-3 text-gray-700">{l.city}</td>
                  <td className="px-4 py-3 text-gray-500">{l.area || "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(l)} className="switch" data-on={l.active} aria-label={`Toggle ${l.pincode}`}>
                      <span className="switch-knob" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(l)} className="text-gray-300 hover:text-red-500" aria-label={`Remove ${l.pincode}`}>
                      <XIcon width={15} height={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {locations !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No {tab === "All" ? "" : tab.toLowerCase() + " "}PIN codes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
