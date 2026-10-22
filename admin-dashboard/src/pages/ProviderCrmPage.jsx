import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import {
  StagePill, STAGE_STYLES, LEAD_STAGES, HOLD_STAGES, KIND_LABELS,
  inputCls, labelCls, btnCls, ghostCls, Modal, DuePicker, QUICK_TIMES, dueLabel, telHref, waHref,
  LogContactModal, TaskModal, CrmDrawer,
} from "../components/CrmKit";
import CallBookings from "../components/CallBookings";

// Provider CRM: every provider and would-be provider, the follow-ups due, and the pipeline.
export default function ProviderCrmPage() {
  const { can } = useApp();
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem("crm-tab") || "followups";
    } catch {
      return "followups";
    }
  });
  const [open, setOpen] = useState(null); // subject shown in the drawer
  const [modal, setModal] = useState(null); // "lead" | "import" | "settings"
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const pick = (t) => {
    setTab(t);
    try {
      localStorage.setItem("crm-tab", t);
    } catch {
      // remembering the tab is only a convenience
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">Provider CRM</h1>
          <p className="text-[12.5px] text-gray-500">Leads, sign-ups and active providers — who to call today, and where everyone is.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("crm.manage") && <button onClick={() => setModal("settings")} className={ghostCls}>Settings</button>}
          {can("crm.add") && <button onClick={() => setModal("import")} className={ghostCls}>Import leads</button>}
          {can("crm.add") && <button onClick={() => setModal("lead")} className={btnCls}>+ Add lead</button>}
        </div>
      </div>

      <div className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
        {[["followups", "Follow-ups"], ["pipeline", "Pipeline"], ["calls", "Call bookings"]].map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${tab === k ? "bg-brand text-white" : "text-gray-500"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "followups" ? (
        <FollowUps tick={tick} onOpen={setOpen} onChanged={refresh} />
      ) : tab === "calls" ? (
        <CallBookings />
      ) : (
        <Pipeline tick={tick} onOpen={setOpen} onChanged={refresh} />
      )}

      {open && <CrmDrawer subject={open} onClose={() => setOpen(null)} onChanged={refresh} />}
      {modal === "lead" && <AddLeadModal onClose={() => setModal(null)} onSaved={(lead) => { refresh(); if (lead) setOpen(`lead:${lead.id}`); }} onOpenExisting={(s) => { setModal(null); setOpen(s); }} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ follow-ups

function FollowUps({ tick, onOpen, onChanged }) {
  const { showToast, can } = useApp();
  const [scope, setScope] = useState("mine");
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    api.crmTasks({ scope }).then(setData).catch((e) => showToast(e.message));
  }, [scope, showToast]);
  useEffect(() => {
    load();
  }, [load, tick]);
  // Keep the list fresh while it's open (automatic follow-ups arrive by themselves).
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const changed = () => {
    load();
    onChanged();
  };
  const groups = data ? [["overdue", "Overdue", data.overdue], ["today", "Today", data.today], ["upcoming", "Coming up", data.upcoming]] : [];
  const nothing = data && !data.overdue.length && !data.today.length && !data.upcoming.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[["mine", "My follow-ups"], ["all", "Everyone"], ["unassigned", "Unassigned"]].map(([k, l]) => (
          <button key={k} onClick={() => setScope(k)} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${scope === k ? "bg-ink text-white" : "bg-white text-gray-600 shadow-card"}`}>
            {l}
          </button>
        ))}
        {data?.staff?.length > 1 && (
          <select value={scope.startsWith("admin:") ? scope : ""} onChange={(e) => setScope(e.target.value || "all")} className="rounded-full border-0 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-600 shadow-card outline-none">
            <option value="">Team member…</option>
            {data.staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {!data && <p className="py-10 text-center text-[12.5px] text-gray-400">Loading…</p>}
      {nothing && (
        <div className="rounded-2xl bg-white p-10 text-center shadow-card">
          <p className="text-[14px] font-bold text-gray-900">All caught up</p>
          <p className="mt-1 text-[12.5px] text-gray-500">{scope === "mine" ? "No follow-ups for you right now. New sign-ups get a welcome call automatically." : "No open follow-ups here."}</p>
        </div>
      )}

      {groups.map(([key, label, list]) =>
        list.length ? (
          <section key={key} className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className={`flex items-center justify-between border-b px-4 py-2.5 ${key === "overdue" ? "border-red-100 bg-red-50" : "border-gray-100"}`}>
              <p className={`text-[13px] font-bold ${key === "overdue" ? "text-red-700" : "text-gray-900"}`}>{label}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${key === "overdue" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>{list.length}</span>
            </div>
            <ul className="divide-y divide-gray-50">
              {list.map((t) => (
                <TaskRow key={t.id} t={t} onOpen={onOpen} canEdit={can("crm.edit")} onLog={() => setModal({ type: "log", task: t })} onEdit={() => setModal({ type: "task", task: t })} />
              ))}
            </ul>
          </section>
        ) : null
      )}

      {data?.done?.length > 0 && (
        <section className="rounded-2xl bg-white shadow-card">
          <button onClick={() => setShowDone((v) => !v)} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
            <p className="text-[13px] font-bold text-gray-500">Done in the last 7 days</p>
            <span className="text-[12px] font-semibold text-gray-400">{showDone ? "Hide" : `Show ${data.done.length}`}</span>
          </button>
          {showDone && (
            <ul className="divide-y divide-gray-50 border-t border-gray-100">
              {data.done.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[12.5px]">
                  <button onClick={() => onOpen(t.who.subject)} className="min-w-0 text-left">
                    <span className="font-semibold text-gray-700">{t.who.businessName || t.who.name}</span>
                    <span className="text-gray-400"> · {t.title}</span>
                  </button>
                  <span className="text-[11.5px] text-gray-400">
                    {t.status === "cancelled" ? "Cancelled" : t.outcome || "Done"} · {t.doneBy ? String(t.doneBy).replace(/\s*\(\+?\d+\)$/, "") : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modal?.type === "log" && (
        <LogContactModal subject={modal.task.subject} name={modal.task.who.businessName || modal.task.who.name} task={modal.task} staff={data.staff} outcomes={data.outcomes} defaultAssigneeId={modal.task.assigneeId} onClose={() => setModal(null)} onSaved={changed} />
      )}
      {modal?.type === "task" && (
        <TaskModal subject={modal.task.subject} name={modal.task.who.businessName || modal.task.who.name} task={modal.task} staff={data.staff} taskKinds={data.taskKinds} onClose={() => setModal(null)} onSaved={changed} />
      )}
    </div>
  );
}

function TaskRow({ t, onOpen, onLog, onEdit, canEdit }) {
  const overdue = t.bucket === "overdue";
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <button onClick={() => onOpen(t.who.subject)} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[13px] font-bold text-gray-900">{t.who.businessName || t.who.name}</span>
          <StagePill stage={t.who.stage} />
          {t.who.type === "lead" && <span className="text-[10.5px] font-semibold text-gray-400">Lead</span>}
        </div>
        <p className="mt-0.5 text-[12.5px] text-gray-700">{t.title}</p>
        <p className="text-[11.5px] text-gray-400">
          {KIND_LABELS[t.kind] || t.kind} · {t.assigneeName || "Anyone"}
          {t.who.category ? ` · ${t.who.category}` : ""}
          {t.auto ? " · automatic" : ""}
        </p>
      </button>
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:flex-shrink-0 sm:flex-col sm:items-end">
        <span className={`text-[12px] font-bold tabular-nums ${overdue ? "text-red-600" : "text-gray-600"}`}>{dueLabel(t.dueAt)}</span>
        <div className="flex flex-wrap gap-1.5">
          <a href={telHref(t.who.phone)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 hover:bg-gray-50">Call</a>
          <a href={waHref(t.who.phone)} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 hover:bg-gray-50">WhatsApp</a>
          {canEdit && <button onClick={onEdit} className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 hover:bg-gray-50">Change</button>}
          {canEdit && <button onClick={onLog} className="rounded-lg bg-brand px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-brand-dark">Done</button>}
        </div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ pipeline

function Pipeline({ tick, onOpen, onChanged }) {
  const { showToast, can } = useApp();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ q: "", ownerId: "", category: "", source: "", type: "" });
  const [view, setView] = useState("board");
  const [dragging, setDragging] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(() => {
    api.crmPipeline(filters).then(setData).catch((e) => showToast(e.message));
  }, [filters, showToast]);
  useEffect(() => {
    const t = setTimeout(load, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const columns = useMemo(() => {
    if (!data) return [];
    const keys = data.stages.map((s) => s.key).filter((k) => showClosed || !["inactive", "lost"].includes(k));
    return keys.map((k) => ({ ...data.stages.find((s) => s.key === k), cards: data.cards.filter((c) => c.stage === k) }));
  }, [data, showClosed]);

  const drop = async (stage) => {
    const card = dragging;
    setDragging(null);
    if (!card || card.stage === stage || !can("crm.edit")) return;
    try {
      if (card.type === "lead") {
        if (!LEAD_STAGES.includes(stage)) return showToast("A lead moves on to Documents once they sign up in the Business app.");
        await api.crmUpdateLead(card.id, { stage });
      } else if (HOLD_STAGES.includes(stage)) {
        await api.crmUpdateProvider(card.id, { hold: stage });
      } else if (!card.autoStage) {
        await api.crmUpdateProvider(card.id, { hold: null });
        showToast("Hold cleared — the stage follows their account again");
      } else {
        return showToast("This stage follows their account (documents, approval, setup). Open them to fix what's missing.");
      }
      load();
      onChanged();
    } catch (e) {
      showToast(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-card">
        <input value={filters.q} onChange={set("q")} placeholder="Search name, phone, category, area…" className="min-w-[180px] flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
        <select value={filters.type} onChange={set("type")} className="rounded-xl border border-gray-200 px-2.5 py-2 text-[12.5px] outline-none">
          <option value="">Providers and leads</option>
          <option value="provider">Providers only</option>
          <option value="lead">Leads only</option>
        </select>
        <select value={filters.ownerId} onChange={set("ownerId")} className="rounded-xl border border-gray-200 px-2.5 py-2 text-[12.5px] outline-none">
          <option value="">Any owner</option>
          <option value="none">No owner</option>
          {data?.staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={filters.category} onChange={set("category")} className="rounded-xl border border-gray-200 px-2.5 py-2 text-[12.5px] outline-none">
          <option value="">Any category</option>
          {data?.categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={filters.source} onChange={set("source")} className="rounded-xl border border-gray-200 px-2.5 py-2 text-[12.5px] outline-none">
          <option value="">Any source</option>
          {data?.sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {[["board", "Board"], ["list", "List"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1 text-[12px] font-semibold ${view === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!data && <p className="py-10 text-center text-[12.5px] text-gray-400">Loading…</p>}

      {data && view === "board" && (
        <>
          <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {columns.map((col) => (
              <div
                key={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(col.key)}
                className={`flex w-64 flex-shrink-0 flex-col rounded-2xl bg-gray-100/80 ${dragging ? "outline-dashed outline-2 outline-offset-[-4px] outline-gray-200" : ""}`}
              >
                <div className="flex items-center justify-between px-3 pb-2 pt-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-gray-800">
                      <span className={`h-2 w-2 rounded-full ${STAGE_STYLES[col.key]?.bar}`} />
                      {col.label}
                    </p>
                    <p className="text-[10.5px] text-gray-400">{col.hint}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-gray-600">{col.cards.length}</span>
                </div>
                <div className="max-h-[68vh] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {col.cards.map((c) => (
                    <Card key={c.subject} c={c} onOpen={onOpen} onDragStart={() => setDragging(c)} draggable={can("crm.edit")} />
                  ))}
                  {col.cards.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-gray-400">—</p>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowClosed((v) => !v)} className="text-[12px] font-semibold text-gray-500 hover:text-gray-800">
            {showClosed ? "Hide Inactive and Lost" : `Show Inactive and Lost (${(data.counts.inactive || 0) + (data.counts.lost || 0)})`}
          </button>
        </>
      )}

      {data && view === "list" && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
          <table className="w-full min-w-[760px] text-left text-[12.5px]">
            <thead className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Stage</th>
                <th className="px-3 py-2.5 font-semibold">Setup</th>
                <th className="px-3 py-2.5 font-semibold">Next follow-up</th>
                <th className="px-3 py-2.5 font-semibold">Owner</th>
                <th className="px-3 py-2.5 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.cards.map((c) => (
                <tr key={c.subject} onClick={() => onOpen(c.subject)} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-gray-900">{c.businessName || c.name}</p>
                    <p className="text-[11.5px] text-gray-400">{c.phone}{c.category ? ` · ${c.category}` : ""}</p>
                  </td>
                  <td className="px-3 py-2.5"><StagePill stage={c.stage} /></td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-600">{c.checklist ? `${c.checklist.done}/${c.checklist.total}` : "—"}</td>
                  <td className={`px-3 py-2.5 ${c.nextTask?.bucket === "overdue" ? "font-semibold text-red-600" : "text-gray-600"}`}>
                    {c.nextTask ? `${dueLabel(c.nextTask.dueAt)} · ${c.nextTask.title}` : <span className="text-amber-600">None planned</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{c.ownerName || "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.cards.length === 0 && <p className="py-8 text-center text-[12.5px] text-gray-400">Nobody matches these filters.</p>}
        </div>
      )}
    </div>
  );
}

function Card({ c, onOpen, onDragStart, draggable }) {
  const overdue = c.nextTask?.bucket === "overdue";
  return (
    <button
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => onOpen(c.subject)}
      className="block w-full rounded-xl bg-white p-3 text-left shadow-card transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <p className="truncate text-[12.5px] font-bold text-gray-900">{c.businessName || c.name}</p>
      <p className="truncate text-[11px] text-gray-400">
        {c.category || "No category"}
        {c.area ? ` · ${c.area}` : ""}
      </p>
      {c.checklist && c.stage !== "active" && (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(c.checklist.done / c.checklist.total) * 100}%` }} />
          </div>
          <span className="text-[10.5px] font-semibold tabular-nums text-gray-400">{c.checklist.done}/{c.checklist.total}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`truncate text-[11px] font-semibold ${overdue ? "text-red-600" : c.nextTask ? "text-gray-500" : "text-amber-600"}`}>
          {c.nextTask ? dueLabel(c.nextTask.dueAt) : "No follow-up"}
        </span>
        {c.ownerName && (
          <span title={c.ownerName} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-[10px] font-bold text-brand-dark">
            {c.ownerName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      {c.type === "lead" && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-300">Lead · {c.source}</p>}
    </button>
  );
}

// ------------------------------------------------------------------ add lead

function AddLeadModal({ onClose, onSaved, onOpenExisting }) {
  const { showToast, admin } = useApp();
  const [meta, setMeta] = useState(null);
  const [f, setF] = useState({ name: "", phone: "", businessName: "", category: "", area: "", pincode: "", source: "Field visit", ownerId: admin?.id || "", note: "" });
  const [follow, setFollow] = useState(true);
  const [due, setDue] = useState(() => {
    const d = new Date(QUICK_TIMES[1][1]());
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [existing, setExisting] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.crmPipeline({ type: "none" }).then(setMeta).catch(() => {});
  }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const checkPhone = async () => {
    if (String(f.phone).replace(/\D/g, "").length < 10) return setExisting(null);
    try {
      setExisting((await api.crmCheckPhone(f.phone)).existing);
    } catch {
      setExisting(null);
    }
  };
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const lead = await api.crmCreateLead({ ...f, ownerId: f.ownerId || null, followUp: follow ? { title: "First call", dueAt: new Date(due).toISOString() } : null });
      showToast("Lead added");
      onSaved(lead);
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't add the lead");
      checkPhone();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Add lead" subtitle="Someone who might join — from a visit, a call, a referral…" onClose={onClose} wide>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Name *</span>
          <input value={f.name} onChange={set("name")} className={inputCls} autoFocus />
        </label>
        <label className="block">
          <span className={labelCls}>Mobile number *</span>
          <input value={f.phone} onChange={set("phone")} onBlur={checkPhone} inputMode="tel" placeholder="98765 43210" className={inputCls} />
        </label>
        {existing && (
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800 sm:col-span-2">
            {existing.name} already {existing.type === "provider" || existing.providerId ? "has a provider account" : "is a lead"} with this number.{" "}
            <button type="button" onClick={() => onOpenExisting(existing.providerId ? `provider:${existing.providerId}` : `${existing.type}:${existing.id}`)} className="font-semibold underline">
              Open them
            </button>
          </div>
        )}
        <label className="block">
          <span className={labelCls}>Business name</span>
          <input value={f.businessName} onChange={set("businessName")} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Category</span>
          <input value={f.category} onChange={set("category")} list="crm-categories" placeholder="e.g. Electrician" className={inputCls} />
          <datalist id="crm-categories">
            {(meta?.categories || []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={labelCls}>Area</span>
          <input value={f.area} onChange={set("area")} placeholder="e.g. Gandhi Nagar, Jammu" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>PIN code</span>
          <input value={f.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Source</span>
          <select value={f.source} onChange={set("source")} className={inputCls}>
            {(meta?.sources || ["Field visit"]).filter((s) => s !== "Business app sign-up").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Owner</span>
          <select value={f.ownerId} onChange={set("ownerId")} className={inputCls}>
            <option value="">Nobody</option>
            {(meta?.staff || []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={labelCls}>Note</span>
          <textarea value={f.note} onChange={set("note")} rows={2} className={`${inputCls} resize-none`} placeholder="e.g. Runs a shop near the bus stand, 3 technicians" />
        </label>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-700">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="h-4 w-4 accent-brand" />
            Plan the first call
          </label>
          {follow && (
            <div className="mt-2">
              <DuePicker value={due} onChange={setDue} />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className={ghostCls}>Cancel</button>
          <button disabled={saving || !f.name.trim() || String(f.phone).replace(/\D/g, "").length < 10} className={btnCls}>{saving ? "Adding…" : "Add lead"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ import

const COLUMN_NAMES = {
  name: ["name", "contact", "contact name", "owner", "person"],
  phone: ["phone", "mobile", "mobile number", "phone number", "number", "contact number", "whatsapp"],
  businessName: ["business", "business name", "company", "shop", "firm"],
  category: ["category", "service", "services", "trade", "work"],
  area: ["area", "city", "location", "address", "locality"],
  pincode: ["pin", "pincode", "pin code", "zip"],
};
const DEFAULT_ORDER = ["name", "phone", "businessName", "category", "area", "pincode"];

// Rows pasted from Excel (tab-separated) or a CSV file (commas, quotes allowed).
export function parseRows(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  const split = (line) => {
    if (sep === "\t") return line.split("\t").map((v) => v.trim());
    const out = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const rows = lines.map(split);
  const head = rows[0].map((h) => h.toLowerCase());
  const mapped = head.map((h) => Object.keys(COLUMN_NAMES).find((k) => COLUMN_NAMES[k].includes(h)) || null);
  const hasHeader = mapped.filter(Boolean).length >= 2;
  const order = hasHeader ? mapped : DEFAULT_ORDER;
  return (hasHeader ? rows.slice(1) : rows).map((r) => Object.fromEntries(order.map((k, i) => [k, r[i] || ""]).filter(([k]) => k)));
}

function ImportModal({ onClose, onSaved }) {
  const { showToast, admin } = useApp();
  const [meta, setMeta] = useState(null);
  const [text, setText] = useState("");
  const [source, setSource] = useState("Imported list");
  const [ownerId, setOwnerId] = useState(admin?.id || "");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.crmPipeline({ type: "none" }).then(setMeta).catch(() => {});
  }, []);
  const rows = useMemo(() => parseRows(text), [text]);
  const readFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(csv|txt|tsv)$/i.test(file.name)) return showToast("Choose a .csv file (in Excel: File → Save As → CSV), or paste the rows instead");
    file.text().then(setText);
  };
  const run = async () => {
    setSaving(true);
    try {
      const r = await api.crmImportLeads(rows, { source, ownerId: ownerId || null });
      setResult(r);
      onSaved();
    } catch (e) {
      showToast(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Import leads" subtitle="Copy the rows in Excel and paste them here, or choose a CSV file. Numbers that already exist are skipped." onClose={onClose} wide>
      {result ? (
        <div className="space-y-3">
          <p className="text-[14px] font-bold text-gray-900">{result.added} lead{result.added === 1 ? "" : "s"} added{result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.</p>
          {result.skipped.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-xl border border-gray-100">
              <table className="w-full text-[12px]">
                <tbody className="divide-y divide-gray-50">
                  {result.skipped.map((s) => (
                    <tr key={s.row}>
                      <td className="px-3 py-1.5 tabular-nums text-gray-400">Row {s.row}</td>
                      <td className="px-3 py-1.5 font-semibold text-gray-700">{s.name}</td>
                      <td className="px-3 py-1.5 text-gray-500">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={onClose} className={btnCls}>Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-gray-500">Columns: <b>Name, Phone</b>, then optionally Business name, Category, Area, PIN code — in that order, or with a heading row using those names.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={"Name\tPhone\tBusiness\tCategory\tArea\tPIN\nSunil Kumar\t9876543210\tSK Electricals\tElectrician\tGandhi Nagar\t180004"} className={`${inputCls} font-mono text-[12px]`} />
          <input type="file" accept=".csv,.txt,.tsv" onChange={readFile} className="text-[12px] text-gray-500" />
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[520px] text-[12px]">
                <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-400">
                  <tr>{DEFAULT_ORDER.map((k) => <th key={k} className="px-3 py-1.5 text-left font-semibold">{k === "businessName" ? "Business" : k === "pincode" ? "PIN" : k}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{DEFAULT_ORDER.map((k) => <td key={k} className="px-3 py-1.5 text-gray-700">{r[k] || <span className="text-gray-300">—</span>}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && <p className="px-3 py-1.5 text-[11px] text-gray-400">…and {rows.length - 5} more</p>}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Source for these leads</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
                {(meta?.sources || ["Imported list"]).filter((s) => s !== "Business app sign-up").map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Owner</span>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                <option value="">Nobody</option>
                {(meta?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className={ghostCls}>Cancel</button>
            <button onClick={run} disabled={saving || rows.length === 0} className={btnCls}>{saving ? "Importing…" : `Import ${rows.length || ""} row${rows.length === 1 ? "" : "s"}`}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ settings

function SettingsModal({ onClose }) {
  const { showToast } = useApp();
  const [s, setS] = useState(null);
  const [staff, setStaff] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.crmSettings().then(setS).catch((e) => showToast(e.message));
    api.crmPipeline({ type: "none" }).then((d) => setStaff(d.staff)).catch(() => {});
  }, [showToast]);
  const save = async () => {
    setSaving(true);
    try {
      setS(await api.crmSaveSettings(s));
      showToast("Settings saved");
      onClose();
    } catch (e) {
      showToast(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="CRM settings" onClose={onClose}>
      {!s ? (
        <p className="text-[12.5px] text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className={labelCls}>Default owner</span>
            <select value={s.defaultOwnerId || ""} onChange={(e) => setS({ ...s, defaultOwnerId: e.target.value || null })} className={inputCls}>
              <option value="">Nobody — follow-ups stay unassigned</option>
              {staff.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <span className="mt-1 block text-[11.5px] text-gray-400">Gets new leads and automatic follow-ups for providers with no owner, and their reminders.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={s.autoTasks} onChange={(e) => setS({ ...s, autoTasks: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
            <span className="text-[12.5px] text-gray-700">
              <b>Automatic follow-ups</b>
              <span className="block text-[11.5px] text-gray-400">Welcome call for new sign-ups; collect documents; review uploaded documents; help finish setup.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={s.whatsappDigest} onChange={(e) => setS({ ...s, whatsappDigest: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
            <span className="text-[12.5px] text-gray-700">
              <b>Morning WhatsApp to each team member</b>
              <span className="block text-[11.5px] text-gray-400">One message a day with their follow-ups due and overdue (only when they have some). Each is a paid WhatsApp template message.</span>
            </span>
          </label>
          {s.whatsappDigest && (
            <label className="block">
              <span className={labelCls}>Send at (India time)</span>
              <select value={s.digestHourIst} onChange={(e) => setS({ ...s, digestHourIst: Number(e.target.value) })} className={inputCls}>
                {Array.from({ length: 17 }, (_, i) => i + 5).map((h) => <option key={h} value={h}>{`${((h + 11) % 12) + 1}:00 ${h < 12 ? "am" : "pm"}`}</option>)}
              </select>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className={ghostCls}>Cancel</button>
            <button onClick={save} disabled={saving} className={btnCls}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
