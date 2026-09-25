import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon } from "./icons";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12px] font-semibold text-gray-700";

const Ctx = createContext(null);

function describe(c) {
  if (!c.enabled) return "No charge";
  return `${c.pct}%${c.max > 0 ? `, max ₹${c.max}` : ""}${c.min > 0 ? `, min ₹${c.min}` : ""}`;
}

// Loads the global default plus every per-service / per-category override once
// for the Services & Categories module, and resolves what applies to a row:
// the service's own charge, else its category's, else the global default.
export function CommunicationChargesProvider({ children }) {
  const { showToast } = useApp();
  const [data, setData] = useState({ defaults: null, overrides: [] });
  const [target, setTarget] = useState(null); // { type, id, name }

  const load = useCallback(() => api.getCommunicationFees().then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(() => {
    const find = (type, id) => data.overrides.find((o) => o.entityType === type && o.entityId === id);
    return {
      defaults: data.defaults,
      own: find,
      // { label, source } describing what a service/category is charged.
      effective(type, id, categoryId) {
        const svc = type === "service" ? find("service", id) : null;
        const cat = find("category", type === "service" ? categoryId : id);
        const o = svc || cat;
        if (o) return { label: describe(o), source: svc ? "service" : "category" };
        return { label: data.defaults ? describe(data.defaults) : "…", source: "default" };
      },
      open: (t) => setTarget(t),
    };
  }, [data]);

  const save = async (form, clear) => {
    try {
      if (clear) await api.clearCommunicationFee(target.type, target.id);
      else await api.setCommunicationFee(target.type, target.id, form);
      showToast(clear ? "Custom charge removed" : "Communication charge saved");
      await load();
      setTarget(null);
    } catch (e) {
      showToast(e.message || "Couldn't save the communication charge");
    }
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {target && <ChargeModal target={target} ctx={value} onClose={() => setTarget(null)} onSave={save} />}
    </Ctx.Provider>
  );
}

export const useCommunicationCharges = () => useContext(Ctx);

const SOURCE_STYLES = {
  service: "bg-violet-100 text-violet-700",
  category: "bg-blue-100 text-blue-700",
  default: "bg-gray-100 text-gray-500",
};
const SOURCE_TEXT = { service: "service", category: "category", default: "default" };

// Small "Charges" button + a chip showing the rule that applies.
export function ChargesCell({ type, id, name, categoryId }) {
  const cc = useCommunicationCharges();
  if (!cc) return null;
  const eff = cc.effective(type, id, categoryId);
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[11.5px] text-gray-700">{eff.label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${SOURCE_STYLES[eff.source]}`}>
        {SOURCE_TEXT[eff.source]}
      </span>
      <button
        onClick={() => cc.open({ type, id, name, categoryId })}
        className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600"
      >
        Set charge
      </button>
    </div>
  );
}

function ChargeModal({ target, ctx, onClose, onSave }) {
  const existing = ctx.own(target.type, target.id);
  const [f, setF] = useState({
    enabled: existing ? existing.enabled !== false : true,
    pct: String(existing?.pct ?? ctx.defaults?.pct ?? 10),
    max: String(existing?.max ?? ctx.defaults?.max ?? 40),
    min: String(existing?.min ?? ctx.defaults?.min ?? 0),
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const pct = Number(f.pct);
  const max = Number(f.max || 0);
  const min = Number(f.min || 0);
  const problem =
    f.pct.trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100
      ? "Percentage must be between 0 and 100."
      : !Number.isFinite(max) || !Number.isFinite(min) || max < 0 || min < 0
        ? "Amounts must be 0 or more."
        : max > 0 && min > max
          ? "Minimum can't be higher than the maximum."
          : null;

  const preview = (amt) => {
    if (!f.enabled) return 0;
    let fee = (amt * pct) / 100;
    if (min > 0) fee = Math.max(fee, min);
    if (max > 0) fee = Math.min(fee, max);
    return Math.round(Math.min(fee, amt));
  };

  const fallback =
    target.type === "service"
      ? `its category's charge if one is set, otherwise the default (${ctx.defaults ? describe(ctx.defaults) : "…"})`
      : `the default (${ctx.defaults ? describe(ctx.defaults) : "…"})`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-gray-900">Communication charge</h2>
            <p className="text-[12px] text-gray-500">
              {target.type === "service" ? "Service" : "Category"}: {target.name}
            </p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>

        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-800">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          Charge providers a communication fee on this {target.type}
        </label>

        <div className={`mt-3 grid grid-cols-3 gap-3 ${f.enabled ? "" : "opacity-50"}`}>
          <div>
            <label className={labelCls}>Percentage (%)</label>
            <input type="number" min="0" max="100" step="0.1" className={inputCls} value={f.pct} onChange={(e) => set("pct", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Maximum (₹)</label>
            <input type="number" min="0" className={inputCls} value={f.max} onChange={(e) => set("max", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Minimum (₹)</label>
            <input type="number" min="0" className={inputCls} value={f.min} onChange={(e) => set("min", e.target.value)} />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">Maximum 0 = no cap. Minimum 0 = no floor.</p>

        {!problem && (
          <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
            ₹200 order → ₹{preview(200)} · ₹1,000 order → ₹{preview(1000)}
          </p>
        )}
        <p className="mt-3 text-[11.5px] text-gray-400">
          {target.type === "service"
            ? "A service's own charge always wins over its category's and the platform default."
            : "Applies to every service in this category that has no charge of its own."}{" "}
          Only completed jobs after you save are affected; past jobs keep the fee they paid.
        </p>
        {problem && <p className="mt-2 text-[11.5px] text-red-500">{problem}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {existing ? (
            <button onClick={() => onSave(null, true)} className="rounded-xl border border-red-200 px-3 py-2 text-[12.5px] font-semibold text-red-600">
              Remove custom charge
            </button>
          ) : (
            <span className="text-[11.5px] text-gray-400">Currently uses {fallback}.</span>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600">
              Cancel
            </button>
            <button
              disabled={Boolean(problem)}
              onClick={() => onSave({ enabled: f.enabled, pct, max, min }, false)}
              className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
