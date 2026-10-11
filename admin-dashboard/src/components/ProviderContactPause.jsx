import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const digits = (phone) => String(phone || "").replace(/[^0-9]/g, "");
const waNumber = (phone) => {
  const d = digits(phone);
  return d.length === 10 ? `91${d}` : d;
};

// Call, WhatsApp and an in-app notice for one provider.
export function ProviderContact({ provider }) {
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.messageProviders([provider.id], title.trim(), message.trim());
      showToast("Notification sent");
      setOpen(false);
      setTitle("");
      setMessage("");
    } catch (err) {
      showToast(err.message || "Couldn't send it");
    } finally {
      setSending(false);
    }
  };
  const btn = "rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:border-brand hover:text-brand";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {provider.phone && (
          <>
            <a href={`tel:${digits(provider.phone)}`} className={btn}>
              📞 Call
            </a>
            <a href={`https://wa.me/${waNumber(provider.phone)}`} target="_blank" rel="noreferrer" className={btn}>
              💬 WhatsApp
            </a>
          </>
        )}
        <button onClick={() => setOpen((v) => !v)} className={btn}>
          🔔 Send notification
        </button>
      </div>
      {open && (
        <form onSubmit={send} className="mt-2 space-y-2 rounded-xl border border-gray-100 p-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={120} className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Message — it appears in their app's notifications" maxLength={1000} className="w-full resize-none rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] font-semibold text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={sending || !title.trim() || !message.trim()} className="rounded-lg bg-brand px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Pause: hides the provider from customers with a reason, optionally until a date; jobs already running continue.
export function ProviderPause({ provider, onChanged }) {
  const { showToast } = useApp();
  const [pause, setPause] = useState(undefined);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.getProviderPause(provider.id).then((p) => setPause(p || null)).catch(() => setPause(null));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  const act = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      showToast(done);
      setReason("");
      setUntil("");
      await load();
      onChanged?.();
    } catch (e) {
      showToast(e.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (pause === undefined) return null;
  if (pause) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <div className="text-[12.5px] text-red-800">
          <p className="font-bold">Paused — hidden from customers</p>
          <p>
            {pause.reason}
            {pause.until ? ` · until ${new Date(pause.until).toLocaleDateString("en-IN")}` : " · until you lift it"}
          </p>
        </div>
        <button disabled={busy} onClick={() => act(() => api.resumeProvider(provider.id), "Pause lifted")} className="rounded-lg bg-white px-3.5 py-1.5 text-[12px] font-semibold text-red-700 shadow-sm disabled:opacity-50">
          Lift pause
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act(() => api.pauseProvider(provider.id, reason.trim(), until ? new Date(`${until}T23:59:59`).toISOString() : null), "Provider paused");
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="min-w-[200px] flex-1 text-[11px] font-semibold text-gray-500">
        Reason (the provider sees it)
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Complaints under review" className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] font-normal outline-none focus:border-brand" />
      </label>
      <label className="text-[11px] font-semibold text-gray-500">
        Until (optional)
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] font-normal outline-none focus:border-brand" />
      </label>
      <button type="submit" disabled={busy || !reason.trim()} className="rounded-lg border border-red-200 px-3.5 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
        Pause provider
      </button>
    </form>
  );
}
