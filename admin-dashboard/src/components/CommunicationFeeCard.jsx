import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";

// Same formula as the server (store.js calcCommunicationFee) — used only for
// the live preview of unsaved values; billing always uses the server's.
function previewFee(amount, f) {
  const amt = Number(amount) || 0;
  const pct = Number(f.pct) || 0;
  const min = Number(f.min) || 0;
  const max = Number(f.max) || 0;
  if (!f.enabled || amt <= 0 || amt < (Number(f.applyFrom) || 0)) return 0;
  let fee = (amt * pct) / 100;
  if (min > 0) fee = Math.max(fee, min);
  if (max > 0) fee = Math.min(fee, max);
  return Math.round(Math.min(fee, amt));
}

const toForm = (s) => ({
  enabled: s.communicationFeeEnabled !== false,
  pct: String(s.communicationFeePct),
  max: String(s.communicationFeeMax || 0),
  min: String(s.communicationFeeMin || 0),
  basis: s.communicationFeeBasis || "order",
  applyFrom: String(s.communicationFeeApplyFrom || 0),
});

export default function CommunicationFeeCard() {
  const { showToast } = useApp();
  const [saved, setSaved] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState("500");

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSaved(s);
        setF(toForm(s));
      })
      .catch((e) => showToast(e.message || "Failed to load settings"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!f) {
    return (
      <div className="max-w-md rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[14px] font-bold text-gray-900">Communication Fee</h2>
        <p className="mt-4 text-[12.5px] text-gray-400">Loading…</p>
      </div>
    );
  }

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const pct = Number(f.pct);
  const min = Number(f.min);
  const max = Number(f.max);
  const problem =
    f.pct.trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100
      ? "Percentage must be between 0 and 100."
      : [f.max, f.min, f.applyFrom].some((v) => v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0))
        ? "Amounts must be 0 or more."
        : max > 0 && min > max
          ? "Minimum fee can't be higher than the maximum fee."
          : null;
  const dirty = JSON.stringify(f) !== JSON.stringify(toForm(saved));

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        communicationFeeEnabled: f.enabled,
        communicationFeePct: pct,
        communicationFeeMax: max || 0,
        communicationFeeMin: min || 0,
        communicationFeeBasis: f.basis,
        communicationFeeApplyFrom: Number(f.applyFrom) || 0,
      });
      setSaved(updated);
      setF(toForm(updated));
      showToast("Communication fee updated");
    } catch (e) {
      showToast(e.message || "Failed to update the communication fee");
    } finally {
      setSaving(false);
    }
  };

  const rows = [200, 1000, Number(sample) || 0].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <div className="max-w-md rounded-2xl bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Communication Fee</h2>
          <p className="mt-1 text-[12px] text-gray-400">
            Charged to the provider's wallet when a job is completed: the percentage of the applicable amount, kept
            between the minimum and maximum. Default: 10% or ₹40, whichever is lower. Feeds Payments &amp; Transactions
            and Reports.
          </p>
        </div>
        <label className="flex flex-shrink-0 items-center gap-1.5 text-[12px] font-semibold text-gray-700">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          {f.enabled ? "On" : "Off"}
        </label>
      </div>

      <div className={`mt-4 space-y-3 ${f.enabled ? "" : "opacity-50"}`}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Percentage (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={f.pct} onChange={(e) => set("pct", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Maximum (₹)</label>
            <input type="number" min="0" step="1" value={f.max} onChange={(e) => set("max", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Minimum (₹)</label>
            <input type="number" min="0" step="1" value={f.min} onChange={(e) => set("min", e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="-mt-1 text-[11px] text-gray-400">Maximum 0 = no cap. Minimum 0 = no floor.</p>

        <div>
          <label className={labelCls}>Applicable amount</label>
          <select value={f.basis} onChange={(e) => set("basis", e.target.value)} className={inputCls}>
            <option value="order">Order amount (what the customer booked, after discounts)</option>
            <option value="service">Service price (the listed price of the service)</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Only charge orders of at least (₹)</label>
          <input type="number" min="0" step="1" value={f.applyFrom} onChange={(e) => set("applyFrom", e.target.value)} className={inputCls} />
          <p className="mt-1 text-[11px] text-gray-400">Orders below this amount pay no fee. 0 = every order.</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-gray-400">Preview</p>
          <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
            Try ₹
            <input type="number" min="1" value={sample} onChange={(e) => setSample(e.target.value)} className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-[12px]" />
          </label>
        </div>
        <div className="mt-2 space-y-1">
          {rows.map((amt) => {
            const raw = (amt * (pct || 0)) / 100;
            return (
              <div key={amt} className="flex items-center justify-between text-[12.5px] text-gray-600">
                <span>
                  ₹{amt.toLocaleString("en-IN")} <span className="text-[11px] text-gray-400">({pct || 0}% = ₹{Math.round(raw * 100) / 100})</span>
                </span>
                <span className="font-semibold text-gray-900">Fee ₹{previewFee(amt, f)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {problem && <p className="mt-3 text-[11.5px] text-red-500">{problem}</p>}
      <button
        onClick={save}
        disabled={Boolean(problem) || !dirty || saving}
        className="mt-4 w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:w-auto sm:px-6"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
