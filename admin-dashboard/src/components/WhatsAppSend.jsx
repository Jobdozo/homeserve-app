import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Sends a WhatsApp from the company number through MSG91 — no wa.me tab.
// Within 24 hours of the person's last message it goes as plain text; after
// that WhatsApp only allows the approved template, which carries the text.
// target: { providerId } or { phone, name, customerId }.
const time = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const hoursLeft = (iso) => Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 3600000));

export function WhatsAppDialog({ target, onClose }) {
  const { showToast } = useApp();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    api
      .getWhatsAppStatus(target)
      .then(setStatus)
      .catch((e) => setError(e.message || "Couldn't check this number"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.providerId, target.phone]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const out = await api.sendWhatsApp(target, text.trim());
      showToast(out.via === "template" ? "WhatsApp sent (as the approved template)" : "WhatsApp sent");
      setText("");
      await load();
    } catch (err) {
      showToast(err.message || "Couldn't send it");
    } finally {
      setSending(false);
    }
  };

  const who = status?.name || target.name || "";
  let note = null;
  if (status && !status.configured) note = { tone: "red", text: "WhatsApp (MSG91) isn't set up on the server, so nothing can be sent." };
  else if (status?.windowOpen) note = { tone: "green", text: `They messaged us ${time(status.lastInboundAt)} — you can write anything for the next ${hoursLeft(status.windowClosesAt)} h.` };
  else if (status?.template) note = { tone: "amber", text: `They haven't messaged us in the last 24 hours, so this goes inside the approved template "${status.template}".` };
  else if (status) note = { tone: "red", text: "They haven't messaged us in the last 24 hours. WhatsApp then only allows an approved template, and none is set up yet (MSG91_NOTICE_TEMPLATE). Ask them to message our number first, or set up the template." };
  const tones = { green: "bg-green-50 text-green-800", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-gray-900">WhatsApp{who ? ` · ${who}` : ""}</h2>
            <p className="text-[12px] text-gray-500">{status?.phone || target.phone || "…"} · from the company number</p>
          </div>
          <button onClick={onClose} className="text-[18px] leading-none text-gray-400 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
          {!status && !error && <p className="text-[12px] text-gray-400">Checking…</p>}
          {note && <p className={`rounded-xl px-3 py-2 text-[12px] ${tones[note.tone]}`}>{note.text}</p>}
          {status?.messages?.length > 0 && (
            <div className="space-y-1.5">
              {status.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[12px] ${m.direction === "out" ? "bg-green-100 text-gray-800" : "bg-gray-100 text-gray-800"}`}>
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {time(m.at)}
                      {m.template ? " · template" : ""}
                      {m.direction === "out" && m.delivered === false ? " · not delivered" : ""}
                    </p>
                  </div>
                </div>
              ))}
              {status.conversationId && (
                <Link to={`/inbox?c=${encodeURIComponent(status.conversationId)}`} onClick={onClose} className="block pt-1 text-center text-[11.5px] font-semibold text-brand hover:underline">
                  Open the full chat in WhatsApp inbox
                </Link>
              )}
            </div>
          )}
        </div>

        <form onSubmit={send} className="space-y-2 border-t border-gray-100 px-5 py-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Write the message…"
            disabled={!status?.canSend}
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand disabled:bg-gray-50"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">{text.length}/1000</span>
            <button type="submit" disabled={sending || !status?.canSend || !text.trim()} className="rounded-xl bg-green-600 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-green-700 disabled:opacity-40">
              {sending ? "Sending…" : "Send on WhatsApp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// A button that opens the dialog; className styles the button.
export default function WhatsAppSend({ target, className, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children || "💬 WhatsApp"}
      </button>
      {open && <WhatsAppDialog target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
