import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Email inbox: support@tikdum.com, sent and received through Postmark (server/src/mailbox.js).
// Emails are shown as plain text only. Replies carry a signature and the quoted email;
// attachments download, they never open inside the admin.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";
const time = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const size = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MAX_FILES_BYTES = 10 * 1024 * 1024;

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", base64: String(r.result).split(",")[1] || "", size: file.size });
    r.onerror = () => reject(new Error(`Couldn't read ${file.name}`));
    r.readAsDataURL(file);
  });

export default function EmailPage() {
  const { can } = useApp();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const [filter, setFilter] = useState("needs_reply");
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [status, setStatus] = useState(null);
  // ?t=<thread id> opens a thread; ?to=<address>&name=… opens the composer.
  const [openId, setOpenId] = useState(() => params.get("t"));
  const [composing, setComposing] = useState(() => (params.get("to") ? { to: params.get("to"), name: params.get("name") || "", customerId: params.get("customerId") || "", providerId: params.get("providerId") || "" } : null));

  const load = () => api.listEmail({ queue: filter === "all" ? "" : filter, q }).then(setList).catch(() => setList([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [filter, q]);
  useEffect(() => {
    api.emailStatus().then(setStatus).catch(() => {});
  }, []);

  const canSend = can("email.add");
  return (
    <div className="space-y-3">
      {status && (!status.sending || !status.receiving) && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
          {!status.sending && "Sending isn't set up yet (POSTMARK_SERVER_TOKEN on the server). "}
          {!status.receiving && "Receiving isn't set up yet (EMAIL_WEBHOOK_SECRET and the Postmark inbound webhook). "}
          Emails go out from {status.from}.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className={`overflow-hidden rounded-2xl bg-white shadow-card ${openId || composing ? "hidden lg:block" : ""}`}>
          <div className="space-y-2 border-b border-gray-100 p-3">
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Search name, email or subject" value={q} onChange={(e) => setQ(e.target.value)} />
              {canSend && (
                <button className={`${btnCls} flex-shrink-0`} onClick={() => { setOpenId(null); setComposing({}); }}>
                  New email
                </button>
              )}
            </div>
            <div className="no-scrollbar flex gap-1 overflow-x-auto">
              {[
                ["needs_reply", "Waiting"],
                ["unread", "Unread"],
                ["sent", "Answered"],
                ["all", "All"],
                ["spam", "Spam"],
              ].map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1 text-[12px] font-semibold ${filter === k ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!list ? (
            <p className="p-6 text-center text-[12.5px] text-gray-400">Loading…</p>
          ) : list.length === 0 ? (
            <p className="p-6 text-center text-[12.5px] text-gray-400">No emails here.</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-gray-50 overflow-y-auto">
              {list.map((t) => (
                <li key={t.id}>
                  <button onClick={() => { setComposing(null); setOpenId(t.id); }} className={`w-full px-3 py-2.5 text-left hover:bg-gray-50 ${openId === t.id ? "bg-amber-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-[13px] text-gray-800 ${t.unread ? "font-bold" : "font-semibold"}`}>{t.name || t.email}</p>
                      <span className="flex-shrink-0 text-[10.5px] text-gray-400">{time(t.lastMessageAt)}</span>
                    </div>
                    <p className={`truncate text-[12px] ${t.unread ? "font-semibold text-gray-800" : "text-gray-600"}`}>{t.subject}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {t.unread > 0 && <span className="flex-shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{t.unread}</span>}
                      {t.needsReply && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" title="Waiting for a reply" />}
                      <p className="truncate text-[11.5px] text-gray-400">{t.lastPreview}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {composing ? (
          <Composer
            initial={composing}
            onClose={() => setComposing(null)}
            onSent={(threadId) => {
              setComposing(null);
              setOpenId(threadId);
              load();
            }}
          />
        ) : openId ? (
          <Thread key={openId} id={openId} canSend={canSend} onBack={() => setOpenId(null)} onChanged={load} />
        ) : (
          <div className="hidden items-center justify-center rounded-2xl bg-white p-10 text-[12.5px] text-gray-400 shadow-card lg:flex">Choose an email</div>
        )}
      </div>
    </div>
  );
}

function Attachments({ message }) {
  const { showToast } = useApp();
  if (!message.attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {message.attachments.map((a, i) =>
        a.file ? (
          <button
            key={i}
            type="button"
            onClick={() => api.downloadEmailAttachment(message.id, i, a.name).catch((e) => showToast(e.message))}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-gray-700 hover:border-brand"
          >
            📎 {a.name} <span className="font-normal text-gray-400">{size(a.size)}</span>
          </button>
        ) : (
          <span key={i} className="rounded-lg border border-dashed border-gray-200 px-2.5 py-1 text-[11.5px] text-gray-400">
            📎 {a.name} — not kept ({a.skipped})
          </span>
        ),
      )}
    </div>
  );
}

// Hides the quoted earlier email ("On … wrote:" and "> " lines) behind a toggle.
function Body({ text }) {
  const [full, setFull] = useState(false);
  const lines = String(text).split("\n");
  const cut = lines.findIndex((l, i) => /^On .+wrote:\s*$/.test(l.trim()) || (l.startsWith(">") && lines.slice(i).every((x) => !x.trim() || x.startsWith(">"))));
  const shown = cut > 0 && !full ? lines.slice(0, cut).join("\n").trimEnd() : text;
  return (
    <>
      <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-gray-800">{shown}</p>
      {cut > 0 && (
        <button type="button" onClick={() => setFull((v) => !v)} className="mt-1 text-[11.5px] font-semibold text-gray-400 hover:text-gray-600">
          {full ? "Hide quoted text" : "··· Show quoted text"}
        </button>
      )}
    </>
  );
}

function FilePicker({ files, setFiles }) {
  const { showToast } = useApp();
  const ref = useRef(null);
  const add = async (list) => {
    try {
      const next = [...files, ...(await Promise.all([...list].map(readFile)))].slice(0, 5);
      if (next.reduce((n, f) => n + f.size, 0) > MAX_FILES_BYTES) return showToast("Attachments can be 10 MB in total");
      setFiles(next);
    } catch (e) {
      showToast(e.message);
    }
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {files.map((f, i) => (
        <span key={i} className="rounded-lg bg-gray-100 px-2 py-1 text-[11.5px] text-gray-700">
          📎 {f.name} ({size(f.size)}){" "}
          <button type="button" className="font-bold text-gray-400 hover:text-red-500" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
            ×
          </button>
        </span>
      ))}
      {files.length < 5 && (
        <button type="button" className="text-[12px] font-semibold text-brand-dark" onClick={() => ref.current?.click()}>
          + Attach file
        </button>
      )}
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => add(e.target.files || [])} />
    </div>
  );
}

function Thread({ id, canSend, onBack, onChanged }) {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  const load = () =>
    api
      .getEmailThread(id)
      .then((d) => {
        setData(d);
        onChanged();
      })
      .catch((e) => showToast(e.message));
  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [data?.messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.replyEmail(id, text, files.map(({ name, type, base64 }) => ({ name, type, base64 })));
      setText("");
      setFiles([]);
      showToast("Email sent");
      await load();
    } catch (err) {
      showToast(err.message);
    }
    setBusy(false);
  };
  const move = async (folder) => {
    try {
      await api.setEmailFolder(id, folder);
      showToast(folder === "spam" ? "Moved to Spam" : "Moved to the inbox");
      await load();
    } catch (err) {
      showToast(err.message);
    }
  };

  if (!data) return <div className="rounded-2xl bg-white p-10 text-center text-[12.5px] text-gray-400 shadow-card">Loading…</div>;
  const t = data.thread;
  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <button className="mb-1 text-[12.5px] font-semibold text-brand lg:hidden" onClick={onBack}>
            ← Back
          </button>
          <p className="break-words text-[14px] font-bold text-gray-900">{t.subject}</p>
          <p className="text-[11.5px] text-gray-500">
            {t.name ? `${t.name} · ` : ""}
            {t.email}
            {t.providerId ? (
              <>
                {" · "}
                <Link to={`/providers/${t.providerId}`} className="font-semibold text-brand-dark">Tikdum provider</Link>
              </>
            ) : t.customerId ? (
              " · Tikdum customer"
            ) : (
              ""
            )}
          </p>
        </div>
        {canSend && (
          <button className={ghostCls} onClick={() => move(t.folder === "spam" ? "inbox" : "spam")}>
            {t.folder === "spam" ? "Not spam" : "Spam"}
          </button>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/60 px-4 py-3" style={{ maxHeight: "62vh" }}>
        {data.messages.map((m) => (
          <div key={m.id} className={`rounded-2xl border px-3.5 py-3 ${m.direction === "in" ? "border-gray-100 bg-white" : "border-amber-100 bg-amber-50/70"}`}>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[12px] font-semibold text-gray-800">
                {m.direction === "in" ? m.fromName || m.from : `${(m.actor || "Team").split(" (")[0]} → ${m.to}`}
                {m.auto && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Auto-reply</span>}
              </p>
              <span className="text-[10.5px] text-gray-400">{time(m.at)}</span>
            </div>
            <Body text={m.text} />
            <Attachments message={m} />
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {canSend && (
        <form onSubmit={send} className="space-y-2 border-t border-gray-100 p-3">
          <textarea
            className={`${inputCls} min-h-[90px] resize-y`}
            rows={4}
            maxLength={20000}
            placeholder={`Reply to ${t.name || t.email} — your signature and their email are added below`}
            disabled={busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilePicker files={files} setFiles={setFiles} />
            <button className={btnCls} disabled={busy || !text.trim()}>
              {busy ? "Sending…" : "Send reply"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Composer({ initial, onClose, onSent }) {
  const { showToast } = useApp();
  const [to, setTo] = useState(initial.to || "");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState(initial.name ? `Hello ${initial.name},\n\n` : "");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await api.composeEmail({
        to, subject, text, name: initial.name || "", customerId: initial.customerId || undefined, providerId: initial.providerId || undefined,
        files: files.map(({ name, type, base64 }) => ({ name, type, base64 })),
      });
      showToast("Email sent");
      onSent(out.threadId);
    } catch (err) {
      showToast(err.message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={send} className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-gray-900">New email</p>
        <button type="button" className="text-[12.5px] font-semibold text-gray-500" onClick={onClose}>
          Cancel
        </button>
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-gray-700">To</label>
        <input className={inputCls} type="email" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-gray-700">Subject</label>
        <input className={inputCls} required maxLength={300} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your booking on Tikdum" />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-gray-700">Message</label>
        <textarea className={`${inputCls} min-h-[180px] resize-y`} required maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="mt-1 text-[11px] text-gray-400">The Tikdum Support signature is added at the end.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilePicker files={files} setFiles={setFiles} />
        <button className={btnCls} disabled={busy || !to.trim() || !subject.trim() || !text.trim()}>
          {busy ? "Sending…" : "Send email"}
        </button>
      </div>
    </form>
  );
}
