import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";

export default function SettingsPage() {
  const { showToast } = useApp();
  const [settings, setSettings] = useState(null);
  const [feeInput, setFeeInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        setFeeInput(String(s.platformFeePct));
      })
      .catch((e) => showToast(e.message || "Failed to load settings"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const numericFee = Number(feeInput);
  const valid = feeInput.trim() !== "" && Number.isFinite(numericFee) && numericFee >= 0 && numericFee <= 100;
  const dirty = settings && numericFee !== settings.platformFeePct;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings({ platformFeePct: numericFee });
      setSettings(updated);
      showToast("Platform commission rate updated");
    } catch (e) {
      showToast(e.message || "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-md rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[14px] font-bold text-gray-900">Platform Commission</h2>
        <p className="mt-1 text-[12px] text-gray-400">
          The percentage Tikdum keeps from every completed booking — the rest goes to the provider as payout. This
          drives the numbers on Payments &amp; Transactions and Reports &amp; Analytics.
        </p>

        {settings === null ? (
          <p className="mt-4 text-[12.5px] text-gray-400">Loading…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className={labelCls}>Commission rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                className={inputCls}
              />
              {!valid && <p className="mt-1 text-[11px] text-red-500">Enter a number between 0 and 100.</p>}
            </div>
            <button
              onClick={handleSave}
              disabled={!valid || !dirty || saving}
              className="w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
