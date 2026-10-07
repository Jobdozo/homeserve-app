import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Agent Office: the task board + the CEO chat (see server/src/office.js).
// Proposed tasks/goals come from the CEO agent and wait for a person.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "");
const COLUMNS = [
  ["proposed", "Proposed by CEO"],
  ["open", "To do"],
  ["in_progress", "In progress"],
  ["review", "Review"],
];
const PRIORITY = { urgent: "bg-red-100 text-red-700", high: "bg-amber-100 text-amber-700", normal: "bg-gray-100 text-gray-600", low: "bg-gray-50 text-gray-400" };

function useRun() {
  const { showToast } = useApp();
  return async (fn, ok) => {
    try {
      const out = await fn();
      if (ok) showToast(ok);
      return out ?? true;
    } catch (e) {
      showToast(e.message || "Something went wrong");
      return null;
    }
  };
}

const sender = (m) => (m.from.type === "agent" ? `🤖 ${m.from.name}` : m.from.type === "system" ? "System" : m.from.name);

// ------------------------------------------------------------------ tasks

export function TasksPanel({ canApprove, canManage }) {
  const [data, setData] = useState(null);
  const [goals, setGoals] = useState(null);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const run = useRun();

  const load = () => {
    api.listOfficeTasks().then(setData).catch(() => setData({ tasks: [] }));
    api.listOfficeGoals().then(setGoals).catch(() => setGoals({ goals: [] }));
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <p className="rounded-2xl bg-white p-10 text-center text-[12.5px] text-gray-400 shadow-card">Loading…</p>;
  const tasks = data.tasks || [];
  const closed = tasks.filter((t) => ["done", "cancelled", "rejected"].includes(t.status));

  return (
    <div className="space-y-4">
      <GoalsCard goals={goals} canApprove={canApprove} canManage={canManage} reload={load} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-gray-500">The CEO agent proposes tasks; nothing it proposes starts until you approve. Agents can move their own tasks to "Review" — only a person marks them done.</p>
        {canManage && <button className={btnCls} onClick={() => setAdding(true)}>+ New task</button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map(([key, label]) => {
          const list = tasks.filter((t) => t.status === key);
          return (
            <div key={key} className="rounded-2xl bg-white p-3 shadow-card">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-gray-400">
                {label} <span className="font-normal">({list.length})</span>
              </p>
              <div className="space-y-2">
                {list.map((t) => (
                  <button key={t.id} onClick={() => setOpen(t.id)} className="w-full rounded-xl border border-gray-100 p-2.5 text-left hover:border-brand/40 hover:bg-amber-50/40">
                    <p className="text-[12.5px] font-semibold text-gray-800">{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${PRIORITY[t.priority]}`}>{t.priority}</span>
                      <span className="text-gray-400">{t.assignee ? `→ ${t.assignee.name}` : "unassigned"}</span>
                    </div>
                  </button>
                ))}
                {list.length === 0 && <p className="py-3 text-center text-[11.5px] text-gray-300">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
      <button className="text-[12px] font-semibold text-brand" onClick={() => setShowClosed(!showClosed)}>
        {showClosed ? "Hide" : "Show"} finished tasks ({closed.length})
      </button>
      {showClosed && (
        <ul className="divide-y divide-gray-50 rounded-2xl bg-white shadow-card">
          {closed.map((t) => (
            <li key={t.id}>
              <button onClick={() => setOpen(t.id)} className="flex w-full justify-between px-4 py-2 text-left text-[12.5px] hover:bg-gray-50">
                <span className="text-gray-700">{t.title}</span>
                <span className="text-gray-400">{t.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <TaskDrawer id={open} meta={data} canApprove={canApprove} canManage={canManage} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && <NewTaskModal meta={data} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} run={run} />}
    </div>
  );
}

function assigneeOptions(meta) {
  return [
    ...(meta.assignees || []).map((a) => ({ value: `agent|${a.id}|${a.name}`, label: `🤖 ${a.name}` })),
    { value: "person|owner|Owner", label: "👤 Owner" },
    ...(meta.staff || []).map((s) => ({ value: `person|${s.id}|${s.name}`, label: `👤 ${s.name}` })),
  ];
}
const toAssignee = (v) => {
  if (!v) return null;
  const [type, id, ...name] = v.split("|");
  return { type, id, name: name.join("|") };
};
const fromAssignee = (a) => (a ? `${a.type}|${a.id}|${a.name}` : "");

function GoalsCard({ goals, canApprove, canManage, reload }) {
  const [text, setText] = useState("");
  const run = useRun();
  if (!goals) return null;
  const decide = async (id, decision) => {
    await run(() => api.decideOfficeGoal(id, decision));
    reload();
  };
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-[13px] font-bold text-gray-900">This week's goals <span className="font-normal text-gray-400">(week of {goals.week})</span></p>
      <ul className="mt-2 space-y-1.5">
        {goals.goals.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${g.status === "approved" ? "bg-emerald-100 text-emerald-700" : g.status === "done" ? "bg-sky-100 text-sky-700" : g.status === "rejected" ? "bg-gray-100 text-gray-400" : "bg-amber-100 text-amber-700"}`}>{g.status}</span>
            <span className={`flex-1 ${g.status === "rejected" ? "text-gray-400 line-through" : "text-gray-700"}`}>{g.text}</span>
            {canApprove && g.status === "proposed" && (
              <>
                <button className={ghostCls} onClick={() => decide(g.id, "rejected")}>Reject</button>
                <button className={btnCls} onClick={() => decide(g.id, "approved")}>Approve</button>
              </>
            )}
            {canApprove && g.status === "approved" && <button className={ghostCls} onClick={() => decide(g.id, "done")}>Mark done</button>}
          </li>
        ))}
        {goals.goals.length === 0 && <li className="text-[12px] text-gray-400">No goals yet. The CEO agent proposes them on Mondays, or add your own.</li>}
      </ul>
      {canManage && (
        <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await run(() => api.addOfficeGoal(text), "Goal added"); setText(""); reload(); }}>
          <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a goal, e.g. Verify 3 new providers" maxLength={300} />
          <button className={ghostCls}>Add</button>
        </form>
      )}
    </div>
  );
}

function NewTaskModal({ meta, onClose, onSaved, run }) {
  const [f, setF] = useState({ title: "", description: "", priority: "normal", assignee: "", dueDate: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="New task" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const ok = await run(() => api.createOfficeTask({ ...f, assignee: toAssignee(f.assignee) }), "Task created"); if (ok) onSaved(); }}>
        <input className={inputCls} placeholder="Title" value={f.title} onChange={set("title")} maxLength={140} />
        <textarea className={`${inputCls} min-h-[90px]`} placeholder="Details (optional)" value={f.description} onChange={set("description")} />
        <div className="grid grid-cols-2 gap-2">
          <select className={inputCls} value={f.priority} onChange={set("priority")}>
            {(meta.priorities || []).map((p) => <option key={p}>{p}</option>)}
          </select>
          <input className={inputCls} type="date" value={f.dueDate} onChange={set("dueDate")} />
        </div>
        <select className={inputCls} value={f.assignee} onChange={set("assignee")}>
          <option value="">Unassigned</option>
          {assigneeOptions(meta).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostCls} onClick={onClose}>Cancel</button>
          <button className={btnCls} disabled={!f.title.trim()}>Create</button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDrawer({ id, meta, canApprove, canManage, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const run = useRun();
  const load = () => api.getOfficeTask(id).then(setData).catch(() => setData(null));
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);
  if (!data) return null;
  const t = data.task;
  const act = async (fn, ok) => {
    await run(fn, ok);
    load();
    onChanged();
  };
  return (
    <Modal title={t.title} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${PRIORITY[t.priority]}`}>{t.priority}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{t.status.replace("_", " ")}</span>
        <span className="text-gray-400">by {t.createdBy.name} · {fmt(t.createdAt)}</span>
      </div>
      {t.description && <p className="mb-3 whitespace-pre-line text-[12.5px] text-gray-700">{t.description}</p>}
      {t.result && <p className="mb-3 whitespace-pre-line rounded-xl bg-emerald-50 p-3 text-[12.5px] text-emerald-900">Result: {t.result}</p>}

      {t.status === "proposed" && canApprove && (
        <div className="mb-3 flex gap-2">
          <button className={ghostCls} onClick={() => act(() => api.decideOfficeTask(id, false, window.prompt("Reason (optional)") || ""), "Rejected")}>Reject</button>
          <button className={btnCls} onClick={() => act(() => api.decideOfficeTask(id, true), "Approved")}>Approve</button>
        </div>
      )}
      {canManage && !["proposed", "rejected"].includes(t.status) && (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <select className={inputCls} value={t.status} onChange={(e) => act(() => api.updateOfficeTask(id, { status: e.target.value }))}>
            {["open", "in_progress", "review", "done", "cancelled"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <select className={inputCls} value={t.priority} onChange={(e) => act(() => api.updateOfficeTask(id, { priority: e.target.value }))}>
            {(meta.priorities || []).map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className={inputCls} value={fromAssignee(t.assignee)} onChange={(e) => act(() => api.updateOfficeTask(id, { assignee: toAssignee(e.target.value) }))}>
            <option value="">Unassigned</option>
            {assigneeOptions(meta).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
        {data.messages.map((m) => (
          <div key={m.id} className="text-[12.5px]">
            <span className="font-semibold text-gray-700">{sender(m)}</span> <span className="text-[10.5px] text-gray-400">{fmt(m.at)}</span>
            <p className="whitespace-pre-line text-gray-700">{m.text}</p>
          </div>
        ))}
        {data.messages.length === 0 && <p className="text-[12px] text-gray-400">No messages yet.</p>}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await act(() => api.addOfficeTaskMessage(id, text)); setText(""); }}>
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment on this task" maxLength={4000} />
        <button className={btnCls} disabled={!text.trim()}>Send</button>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------- CEO chat

export function CeoChatPanel({ hasCeo }) {
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);
  const run = useRun();
  const load = () => api.getCeoThread().then(setMsgs).catch(() => setMsgs([]));
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [msgs?.length]);
  const waiting = msgs && msgs.length > 0 && msgs[msgs.length - 1].from.type === "person";
  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[14px] font-bold text-gray-900">CEO chat</p>
        <p className="text-[12px] text-gray-500">
          Ask the CEO agent anything about the business. It answers from the agents' reports and can propose tasks for your approval. You can also chat from WhatsApp: messages from the owner number to the business number land here.
        </p>
        {!hasCeo && <p className="mt-1 text-[12px] font-semibold text-amber-700">No CEO agent yet — add one in Agents (Type: CEO) to get answers.</p>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50/60 px-4 py-3" style={{ maxHeight: "60vh" }}>
        {msgs?.map((m) => (
          <div key={m.id} className={`flex ${m.from.type === "agent" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] shadow-sm ${m.from.type === "agent" ? "bg-violet-100 text-violet-900" : "bg-amber-100 text-amber-900"}`}>
              <p className="whitespace-pre-line break-words">{m.text}</p>
              <p className="mt-1 text-right text-[10px] opacity-60">
                {sender(m)} · {fmt(m.at)}{m.channel === "whatsapp" ? " · WhatsApp" : ""}
              </p>
            </div>
          </div>
        ))}
        {msgs?.length === 0 && <p className="py-10 text-center text-[12.5px] text-gray-400">Say hi — e.g. "What needs my attention today?"</p>}
        {waiting && hasCeo && <p className="text-center text-[11.5px] text-gray-400">The CEO agent usually replies within a minute…</p>}
        <div ref={bottom} />
      </div>
      <form className="flex gap-2 border-t border-gray-100 p-3" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; setBusy(true); await run(() => api.sendCeoMessage(text)); setText(""); setBusy(false); load(); }}>
        <textarea className={`${inputCls} min-h-[42px] flex-1 resize-none`} rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the CEO agent" />
        <button className={btnCls} disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}

function Modal({ title, onClose, wide, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="h-7 w-7 rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
