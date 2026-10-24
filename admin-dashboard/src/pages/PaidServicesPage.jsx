import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Everything Tikdum pays for and when it ends (server: paidServices.js). The Renewals Bot
// (agents/src/renewals.js) reminds the owner on WhatsApp 30, 14, 7, 3 and 1 days before,
// on the day and while overdue. Domain and HTTPS dates are read automatically.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";

const BILLING = { yearly: "Yearly", monthly: "Monthly", prepaid: "Prepaid wallet", usage: "Pay as you use", free: "Free" };
const EVERY = [[12, "Every year"], [1, "Every month"], [3, "Every 3 months"], [6, "Every 6 months"], [24, "Every 2 years"], [36, "Every 3 years"], [0, "Doesn't repeat"]];
const DATE_LABEL = { prepaid: "Check balance by", usage: "Next bill / card check", free: "Ends on" };

const fmtDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const money = (s) => (s.cost ? `${s.currency === "USD" ? "$" : "₹"}${Number(s.cost).toLocaleString("en-IN")}` : "");

function DaysPill({ s }) {
  const { level, daysLeft } = s.status || {};
  if (level === "no-date") return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11.5px] font-bold text-gray-500">Add the date</span>;
  const text = daysLeft < 0 ? `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue` : daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `${daysLeft} days`;
  const cls = level === "overdue" ? "bg-red-600 text-white" : level === "urgent" ? "bg-red-100 text-red-700" : level === "soon" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700";
  return <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold tabular-nums ${cls}`}>{text}</span>;
}

const EMPTY = { name: "", vendor: "", usedFor: "", billing: "yearly", every: 12, cost: "", currency: "INR", renewsOn: "", autoRenew: false, renewUrl: "", notes: "", check: "", checkTarget: "" };

function EditForm({ initial, onSave, onCancel, busy }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, cost: initial?.cost ?? "", renewsOn: initial?.renewsOn || "", check: initial?.check || "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const auto = Boolean(f.check);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, every: Number(f.every), cost: f.cost === "" ? null : Number(f.cost) });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Service</span>
          <input className={inputCls} value={f.name} onChange={set("name")} placeholder="e.g. Hostinger VPS" required maxLength={80} />
        </label>
        <label>
          <span className={labelCls}>Company</span>
          <input className={inputCls} value={f.vendor} onChange={set("vendor")} placeholder="e.g. Hostinger" maxLength={80} />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>What it's used for</span>
        <input className={inputCls} value={f.usedFor} onChange={set("usedFor")} placeholder="What stops working if it lapses" maxLength={300} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className={labelCls}>How it's paid</span>
          <select className={inputCls} value={f.billing} onChange={set("billing")}>
            {Object.entries(BILLING).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Repeats</span>
          <select className={inputCls} value={f.every} onChange={set("every")}>
            {EVERY.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <label className="flex-1">
            <span className={labelCls}>Cost</span>
            <input className={inputCls} type="number" min="0" step="0.01" value={f.cost} onChange={set("cost")} placeholder="Optional" />
          </label>
          <label className="w-[84px]">
            <span className={labelCls}>&nbsp;</span>
            <select className={inputCls} value={f.currency} onChange={set("currency")}>
              <option value="INR">₹ INR</option>
              <option value="USD">$ USD</option>
            </select>
          </label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={labelCls}>{DATE_LABEL[f.billing] || "Ends / renews on"}</span>
          <input className={inputCls} type="date" value={f.renewsOn} onChange={set("renewsOn")} disabled={auto} />
          {auto && <span className="mt-1 block text-[11.5px] text-gray-500">Read automatically twice a day.</span>}
        </label>
        <label>
          <span className={labelCls}>Renew / billing link</span>
          <input className={inputCls} type="url" value={f.renewUrl} onChange={set("renewUrl")} placeholder="https://…" maxLength={300} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Read the date automatically</span>
          <select className={inputCls} value={f.check} onChange={set("check")}>
            <option value="">No — I'll enter it</option>
            <option value="domain">Yes — domain name expiry</option>
            <option value="ssl">Yes — HTTPS certificate expiry</option>
          </select>
        </label>
        {auto && (
          <label>
            <span className={labelCls}>{f.check === "domain" ? "Domain" : "Websites (comma-separated)"}</span>
            <input className={inputCls} value={f.checkTarget} onChange={set("checkTarget")} placeholder={f.check === "domain" ? "tikdum.com" : "tikdum.com, api.tikdum.com"} required maxLength={300} />
          </label>
        )}
      </div>
      <label className="flex items-center gap-2 text-[13px] text-gray-700">
        <input type="checkbox" checked={f.autoRenew} onChange={set("autoRenew")} className="h-4 w-4 accent-brand" />
        Renews by itself (auto-renew on) — fewer reminders: 7 days, 1 day and on the day
      </label>
      <label className="block">
        <span className={labelCls}>Notes</span>
        <textarea className={`${inputCls} min-h-[64px]`} value={f.notes} onChange={set("notes")} placeholder="Login email, plan name, who pays…" maxLength={500} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl bg-gray-100 px-4 py-2.5 text-[13px] font-semibold text-gray-700">
          Cancel
        </button>
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function ServiceRow({ s, onEdit, onRenewed, onDelete }) {
  const { level } = s.status || {};
  const stripe = level === "overdue" || level === "urgent" ? "border-l-red-500" : level === "soon" ? "border-l-amber-400" : level === "no-date" ? "border-l-gray-300" : "border-l-emerald-400";
  return (
    <div className={`rounded-2xl border-l-4 bg-white p-4 shadow-card ${stripe}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-gray-900">
            {s.name}
            {s.vendor && <span className="font-medium text-gray-500"> · {s.vendor}</span>}
          </p>
          {s.usedFor && <p className="mt-0.5 text-[12.5px] leading-snug text-gray-600">{s.usedFor}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{BILLING[s.billing] || s.billing}{money(s) && ` · ${money(s)}`}</span>
            {s.autoRenew && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Auto-renew</span>}
            {s.check && (
              <span className={`rounded-full px-2 py-0.5 ${s.lastCheck && !s.lastCheck.ok ? "bg-red-50 text-red-700" : "bg-violet-50 text-violet-700"}`} title={s.lastCheck?.error || s.lastCheck?.detail || ""}>
                {s.lastCheck && !s.lastCheck.ok ? "Automatic check failing" : "Date read automatically"}
              </span>
            )}
          </div>
          {s.notes && <p className="mt-2 text-[12px] leading-snug text-gray-500">{s.notes}</p>}
        </div>
        <div className="text-right">
          <DaysPill s={s} />
          <p className="mt-1.5 text-[12px] font-semibold text-gray-700 tabular-nums">{s.renewsOn ? fmtDate(s.renewsOn) : "—"}</p>
          <p className="text-[11px] text-gray-400">{DATE_LABEL[s.billing] || "Ends / renews on"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {s.renewUrl && (
          <a href={s.renewUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white">
            Open billing ↗
          </a>
        )}
        {!s.check && s.renewsOn && (
          <button onClick={onRenewed} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-[12.5px] font-semibold text-emerald-700">
            Renewed / paid
          </button>
        )}
        <button onClick={onEdit} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12.5px] font-semibold text-gray-700">
          Edit
        </button>
        <button onClick={onDelete} className="ml-auto rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-gray-400 hover:text-red-600">
          Remove
        </button>
      </div>
    </div>
  );
}

export default function PaidServicesPage() {
  const { showToast } = useApp();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | item
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.listPaidServices().then(setItems).catch((e) => showToast(e.message || "Couldn't load paid services")), [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await load();
      return true;
    } catch (e) {
      showToast(e.message || "Couldn't save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async (data) => {
    const ok = await run(() => (editing === "new" ? api.addPaidService(data) : api.updatePaidService(editing.id, data)), "Saved");
    if (ok) setEditing(null);
  };
  const renewed = (s) => {
    const msg = s.every > 0 ? `Mark ${s.name} as renewed? The date moves on by ${EVERY.find(([k]) => k === s.every)?.[1].toLowerCase().replace("every ", "") || `${s.every} months`}.` : `Mark ${s.name} as renewed? It has no repeat, so the date is cleared — add the new one with Edit.`;
    if (window.confirm(msg)) run(() => api.renewedPaidService(s.id), "Marked as renewed");
  };
  const remove = (s) => window.confirm(`Remove ${s.name}? The bot stops reminding you about it.`) && run(() => api.deletePaidService(s.id), "Removed");
  const checkNow = () => run(async () => setItems(await api.checkPaidServicesNow()), "Dates checked");

  const count = (fn) => (items || []).filter(fn).length;
  const overdue = count((s) => s.status.level === "overdue");
  const week = count((s) => s.status.level === "urgent");
  const month = count((s) => s.status.level === "soon");
  const noDate = count((s) => s.status.level === "no-date" && s.billing !== "free");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[640px]">
            <h2 className="text-[14px] font-bold text-gray-900">Renewals Bot</h2>
            <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
              Reminds you on WhatsApp and in AI Agents 30, 14, 7, 3 and 1 days before each date, on the day, and every 2 days while it's overdue — plus a list every Monday. After paying, tap
              “Renewed / paid” so the date moves on. Domain and HTTPS dates are read automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={checkNow} disabled={busy} className="rounded-xl bg-gray-100 px-3.5 py-2 text-[12.5px] font-semibold text-gray-700 disabled:opacity-60">
              Check dates now
            </button>
            <button onClick={() => setEditing("new")} className="rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-white">
              + Add service
            </button>
          </div>
        </div>
        {items && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Overdue", overdue, overdue ? "text-red-600" : "text-gray-400"],
              ["Within 7 days", week, week ? "text-red-600" : "text-gray-400"],
              ["Within 30 days", month, month ? "text-amber-600" : "text-gray-400"],
              ["Need a date", noDate, noDate ? "text-gray-800" : "text-gray-400"],
            ].map(([label, n, cls]) => (
              <div key={label} className="rounded-xl bg-gray-50 px-3 py-2">
                <p className={`text-[20px] font-extrabold tabular-nums ${cls}`}>{n}</p>
                <p className="text-[11.5px] font-semibold text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <h3 className="mb-3 text-[14px] font-bold text-gray-900">{editing === "new" ? "Add a paid service" : `Edit ${editing.name}`}</h3>
          <EditForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
        </div>
      )}

      {!items ? (
        <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((s) => (
            <ServiceRow key={s.id} s={s} onEdit={() => (setEditing(s), window.scrollTo({ top: 0, behavior: "smooth" }))} onRenewed={() => renewed(s)} onDelete={() => remove(s)} />
          ))}
        </div>
      )}
    </div>
  );
}
