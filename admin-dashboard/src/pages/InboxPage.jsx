import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// WhatsApp inbox: customer chats from the business number. Chats in "AI" mode
// are answered by the Customer Support agent; replying yourself takes the chat
// over ("Team" mode) until you hand it back.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";
const time = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "");

export default function InboxPage() {
  const { can } = useApp();
  const [filter, setFilter] = useState("needs_reply");
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = () => {
    const params = filter === "needs_reply" ? { queue: "needs_reply" } : filter === "all" ? {} : { mode: filter };
    api.listInbox({ ...params, q }).then(setList).catch(() => setList([]));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [filter, q]);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className={`overflow-hidden rounded-2xl bg-white shadow-card ${openId ? "hidden lg:block" : ""}`}>
        <div className="space-y-2 border-b border-gray-100 p-3">
          <input className={inputCls} placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {[
              ["needs_reply", "Waiting"],
              ["human", "Team"],
              ["ai", "AI"],
              ["all", "All"],
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
          <p className="p-6 text-center text-[12.5px] text-gray-400">No chats here.</p>
        ) : (
          <ul className="max-h-[70vh] divide-y divide-gray-50 overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <button onClick={() => setOpenId(c.id)} className={`w-full px-3 py-2.5 text-left hover:bg-gray-50 ${openId === c.id ? "bg-amber-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-gray-800">{c.name || c.phone}</p>
                    <span className="flex-shrink-0 text-[10.5px] text-gray-400">{time(c.lastMessageAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <ModeBadge mode={c.mode} />
                    {c.needsReply && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" title="Waiting for a reply" />}
                    <p className="truncate text-[11.5px] text-gray-500">{c.lastPreview}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {openId ? (
        <Conversation key={openId} id={openId} canReply={can("inbox.add")} onBack={() => setOpenId(null)} onChanged={load} />
      ) : (
        <div className="hidden items-center justify-center rounded-2xl bg-white p-10 text-[12.5px] text-gray-400 shadow-card lg:flex">Choose a chat</div>
      )}
    </div>
  );
}

function ModeBadge({ mode }) {
  return mode === "ai" ? (
    <span className="flex-shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">AI</span>
  ) : (
    <span className="flex-shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Team</span>
  );
}

function Conversation({ id, canReply, onBack, onChanged }) {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);

  const load = () => api.getInboxConversation(id).then(setData).catch((e) => showToast(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [id]);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [data?.messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const msg = await api.replyInbox(id, text);
      setText("");
      if (!msg.delivered) showToast("Saved, but WhatsApp didn't accept the message — check MSG91");
      await load();
      onChanged();
    } catch (err) {
      showToast(err.message);
    }
    setBusy(false);
  };

  const setMode = async (mode) => {
    try {
      await api.setInboxMode(id, mode);
      showToast(mode === "ai" ? "AI will answer this chat again" : "You've taken over this chat");
      await load();
      onChanged();
    } catch (err) {
      showToast(err.message);
    }
  };

  if (!data) return <div className="rounded-2xl bg-white p-10 text-center text-[12.5px] text-gray-400 shadow-card">Loading…</div>;
  const c = data.conversation;
  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <button className="text-[12.5px] font-semibold text-brand lg:hidden" onClick={onBack}>
            ← Back
          </button>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-gray-900">{c.name || c.phone}</p>
            <p className="text-[11.5px] text-gray-400">
              {c.phone} · {c.customerId ? "Tikdum customer" : "No Tikdum account"}
            </p>
          </div>
          <ModeBadge mode={c.mode} />
        </div>
        {canReply && (c.mode === "ai" ? (
          <button className={ghostCls} onClick={() => setMode("human")}>Take over</button>
        ) : (
          <button className={ghostCls} onClick={() => setMode("ai")}>Hand back to AI</button>
        ))}
      </div>
      {c.mode === "human" && c.handoffReason && (
        <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[12px] text-amber-800">Handed to the team: {c.handoffReason}</p>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50/60 px-4 py-3" style={{ maxHeight: "60vh" }}>
        {data.messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-[12.5px] shadow-sm ${m.direction === "in" ? "bg-white text-gray-800" : m.sender === "ai" ? "bg-violet-100 text-violet-900" : "bg-amber-100 text-amber-900"}`}>
              <p className="whitespace-pre-line break-words">{m.text}</p>
              <p className="mt-1 text-right text-[10px] opacity-60">
                {m.direction === "out" && (m.sender === "ai" ? "AI · " : `${(m.actor || "Team").split(" (")[0]} · `)}
                {time(m.at)}
                {m.direction === "out" && m.delivered === false && " · not delivered"}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {canReply && (
        <form onSubmit={send} className="flex gap-2 border-t border-gray-100 p-3">
          <textarea
            className={`${inputCls} min-h-[42px] flex-1 resize-none`}
            rows={2}
            maxLength={1500}
            placeholder={c.canReply ? (c.mode === "ai" ? "Reply yourself (takes the chat over from the AI)" : "Type a reply") : "Over 24h since the customer wrote — WhatsApp needs an approved template now"}
            disabled={!c.canReply || busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className={btnCls} disabled={!c.canReply || busy || !text.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
