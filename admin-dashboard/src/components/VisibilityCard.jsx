import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";

// Settings for the online/availability rule of the overall service visibility logic.
export default function VisibilityCard() {
  const { showToast } = useApp();
  const [saved, setSaved] = useState(null);
  const [required, setRequired] = useState(false);
  const [minutes, setMinutes] = useState("30");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSaved(s);
        setRequired(Boolean(s.visibilityRequireOnline));
        setMinutes(String(s.visibilityOnlineGraceMinutes ?? 30));
      })
      .catch(() => {});
  }, []);

  if (!saved) return null;
  const n = Number(minutes);
  const valid = Number.isFinite(n) && n >= 1 && n <= 1440;
  const dirty = required !== Boolean(saved.visibilityRequireOnline) || n !== (saved.visibilityOnlineGraceMinutes ?? 30);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.updateSettings({ visibilityRequireOnline: required, visibilityOnlineGraceMinutes: n });
      setSaved(updated);
      showToast("Visibility settings updated");
    } catch (e) {
      showToast(e.message || "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md rounded-2xl bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-[14px] font-bold text-gray-900">Provider Visibility</h2>
      <p className="mt-1 text-[12px] text-gray-400">
        A provider is shown to a customer only when they're approved and verified, their account is active, requests are switched on,
        the service and its category are approved and active, the customer's PIN is in their area, and they're under the open-request
        and old-request limits. A Super Admin override on the provider can force them shown or hidden. Check any provider's full
        checklist from their profile in Providers.
      </p>
      <label className="mt-4 flex items-start gap-2 text-[12.5px] font-semibold text-gray-800">
        <input type="checkbox" className="mt-0.5" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span>
          Only show providers who are online
          <span className="block text-[11.5px] font-normal text-gray-400">Off by default — an offline provider still gets the request as a notification.</span>
        </span>
      </label>
      {required && (
        <div className="mt-3">
          <label className="mb-1 block text-[12.5px] font-semibold text-gray-700">“Online” means seen within (minutes)</label>
          <input type="number" min="1" max="1440" className={inputCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          {!valid && <p className="mt-1 text-[11px] text-red-500">Enter 1 to 1440 minutes.</p>}
        </div>
      )}
      <button onClick={save} disabled={!dirty || !valid || busy} className="mt-4 w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:w-auto sm:px-6">
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
