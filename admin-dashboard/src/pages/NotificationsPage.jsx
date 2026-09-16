import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";

const AUDIENCES = [
  { value: "customers", label: "All Customers" },
  { value: "providers", label: "All Providers" },
];

export default function NotificationsPage() {
  const { sendBroadcastNotification, showToast } = useApp();
  const [audience, setAudience] = useState("customers");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState(null);

  const refresh = () =>
    api
      .listActivities(50, "notification")
      .then(setHistory)
      .catch(() => setHistory([]));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim() || sending) return;
    setSending(true);
    try {
      await sendBroadcastNotification({ audience, title: title.trim(), message: message.trim() });
      setTitle("");
      setMessage("");
      refresh();
    } catch (err) {
      showToast(err.message || "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-lg rounded-2xl bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-[14px] font-bold text-gray-900">Send a Broadcast</h2>
        <form onSubmit={submit} className="mt-3 space-y-3.5">
          <div>
            <label className={labelCls}>Send to</label>
            <div className="flex gap-2">
              {AUDIENCES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAudience(opt.value)}
                  className={`flex-1 rounded-xl border py-2 text-[12.5px] font-semibold ${
                    audience === opt.value ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend Offer!" />
          </div>
          <div>
            <label className={labelCls}>Message</label>
            <textarea
              className={inputCls}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Get 20% off all AC services this weekend."
            />
          </div>
          <button
            type="submit"
            disabled={!title.trim() || !message.trim() || sending}
            className="w-full rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {sending ? "Sending…" : "Send Notification"}
          </button>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-card">
        <h2 className="px-2 pt-2 text-[13px] font-bold text-gray-900">Recent Broadcasts</h2>
        {history === null && <p className="py-10 text-center text-sm text-gray-400">Loading…</p>}
        {history?.length === 0 && <p className="py-10 text-center text-sm text-gray-400">No broadcasts sent yet.</p>}
        <div className="mt-1 divide-y divide-gray-50">
          {history?.map((a) => (
            <div key={a.id} className="px-3 py-3">
              <p className="text-[12.5px] text-gray-700">{a.message}</p>
              <p className="mt-0.5 text-[10.5px] text-gray-400">
                {new Date(a.time).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
