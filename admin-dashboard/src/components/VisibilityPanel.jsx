import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const STATUS_STYLE = {
  pass: ["✓", "bg-emerald-100 text-emerald-700"],
  fail: ["✕", "bg-red-100 text-red-600"],
  na: ["–", "bg-gray-100 text-gray-400"],
};
const inputCls = "w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";

// Why a provider is (or isn't) shown to customers: every visibility rule with
// its outcome, a customer-PIN test, and the Super Admin override.
export default function VisibilityPanel({ providerId }) {
  const { showToast, can } = useApp();
  const [data, setData] = useState(null);
  const [pin, setPin] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .getProviderVisibility(providerId, pin.trim())
        .then(setData)
        .catch(() => setData(null)),
    [providerId, pin]
  );
  useEffect(() => {
    const t = setTimeout(load, pin ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, pin]);

  const setOverride = async (mode) => {
    setBusy(true);
    try {
      await api.setVisibilityOverride(providerId, { mode, hours: hours.trim() === "" ? "indefinite" : Number(hours), note: note.trim() });
      showToast(mode ? `Provider set to always ${mode}` : "Override removed");
      setNote("");
      await load();
    } catch (e) {
      showToast(e.message || "Couldn't change the override");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="text-[12px] text-gray-400">Loading…</p>;
  const ov = data.override;

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${data.visible ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
        <p className="text-[13px] font-bold">{data.visible ? "Shown to customers" : "Hidden from customers"}</p>
        {!data.visible && data.providerIssues[0] && <p className="max-w-[60%] text-right text-[11.5px]">{data.providerIssues.join(" · ")}</p>}
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Test with a customer PIN code</label>
        <input className={inputCls} value={pin} inputMode="numeric" maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 560001 (leave blank to skip)" />
      </div>

      <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
        {data.checks.map((c) => {
          const [icon, cls] = STATUS_STYLE[c.status];
          return (
            <li key={c.key} className="flex items-start gap-2.5 px-3 py-2">
              <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${cls}`}>{icon}</span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-gray-800">
                  {c.label}
                  {c.soft && <span className="ml-1.5 text-[10px] font-normal text-gray-400">(an “always show” override can bypass this)</span>}
                </p>
                <p className="text-[11.5px] text-gray-400">{c.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {data.bypassed.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] text-amber-700">Bypassed by the override: {data.bypassed.join("; ")}</p>}

      {data.services.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Services</p>
          <div className="space-y-1">
            {data.services.map((s) => (
              <p key={s.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-[12px]">
                <span className="text-gray-700">{s.name}</span>
                <span className={s.issues.length ? "text-red-500" : "text-emerald-600"}>{s.issues.length ? s.issues.join(", ") : "Shown"}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {can("providers.edit") && (
        <div className="space-y-2 rounded-lg border border-gray-100 p-3">
          <p className="text-[12px] font-bold text-gray-800">Super Admin override</p>
          {ov ? (
            <p className={`rounded-lg px-3 py-2 text-[11.5px] font-medium ${ov.mode === "show" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              Always {ov.mode}
              {ov.until ? ` until ${new Date(ov.until).toLocaleString("en-IN")}` : " (until you remove it)"}
              {ov.note ? ` — ${ov.note}` : ""}
            </p>
          ) : (
            <p className="text-[11.5px] text-gray-400">No override — the standard rules decide.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} type="number" min="1" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Hours (blank = no end)" />
            <input className={inputCls} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => setOverride("show")} className="rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50">
              Always show
            </button>
            <button disabled={busy} onClick={() => setOverride("hide")} className="rounded-lg bg-red-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50">
              Always hide
            </button>
            {ov && (
              <button disabled={busy} onClick={() => setOverride(null)} className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-600 disabled:opacity-50">
                Remove override
              </button>
            )}
          </div>
          <p className="text-[10.5px] text-gray-400">
            “Always show” skips the soft rules (PIN area, request limits, online requirement) but never approval, verification, wallet, the requests switch or an inactive service/category. “Always hide” beats everything.
          </p>
        </div>
      )}
    </div>
  );
}
