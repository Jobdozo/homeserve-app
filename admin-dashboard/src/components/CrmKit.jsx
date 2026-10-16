import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon } from "./icons";

// Shared pieces of the Provider CRM: stage pills, the "log a call" and follow-up forms,
// and the 360 panel (used in the CRM drawer and on the provider's own page).

export const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
export const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400";
export const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
export const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";

export const STAGE_STYLES = {
  lead: { pill: "bg-gray-100 text-gray-600", bar: "bg-gray-300" },
  contacted: { pill: "bg-sky-100 text-sky-700", bar: "bg-sky-400" },
  interested: { pill: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-400" },
  documents: { pill: "bg-amber-100 text-amber-700", bar: "bg-amber-400" },
  review: { pill: "bg-orange-100 text-orange-700", bar: "bg-orange-400" },
  onboarding: { pill: "bg-violet-100 text-violet-700", bar: "bg-violet-400" },
  active: { pill: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  at_risk: { pill: "bg-red-100 text-red-600", bar: "bg-red-500" },
  inactive: { pill: "bg-gray-200 text-gray-600", bar: "bg-gray-500" },
  lost: { pill: "bg-rose-50 text-rose-500", bar: "bg-rose-300" },
};
export const STAGE_LABELS = {
  lead: "Lead", contacted: "Contacted", interested: "Interested", documents: "Documents pending", review: "Under review",
  onboarding: "Onboarding", active: "Active", at_risk: "At risk", inactive: "Inactive", lost: "Lost / Rejected",
};
export const KIND_LABELS = { call: "Call", whatsapp: "WhatsApp", visit: "Visit", documents: "Documents", review: "Review", setup: "Setup help", other: "Other" };
export const LEAD_STAGES = ["lead", "contacted", "interested", "lost"];
export const HOLD_STAGES = ["at_risk", "inactive", "lost"];

export function StagePill({ stage, className = "" }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STAGE_STYLES[stage]?.pill || "bg-gray-100 text-gray-600"} ${className}`}>{STAGE_LABELS[stage] || stage}</span>;
}

export const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "";

// "Overdue 2 d", "Today 4:30 pm", "Tomorrow 11:00 am", "Mon 21 Oct"
export function dueLabel(iso, now = Date.now()) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(d) - day(new Date(now))) / 86400000);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (d.getTime() < now) {
    const late = now - d.getTime();
    if (late < 3600000) return `Overdue ${Math.max(1, Math.round(late / 60000))} min`;
    if (late < 86400000) return `Overdue ${Math.round(late / 3600000)} h`;
    return `Overdue ${Math.round(late / 86400000)} d`;
  }
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString("en-IN", { weekday: "short" })} ${time}`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const digits = (p) => String(p || "").replace(/\D/g, "");
export const telHref = (phone) => `tel:${String(phone || "").replace(/[^\d+]/g, "")}`;
export const waHref = (phone) => {
  const d = digits(phone);
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
};

// datetime-local value in this browser's time zone
const toLocalInput = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const at = (days, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};
export const QUICK_TIMES = [
  ["In 1 hour", () => Date.now() + 3600000],
  ["Tomorrow 11 am", () => at(1, 11)],
  ["In 3 days", () => at(3, 11)],
  ["Next week", () => at(7, 11)],
];

export function DuePicker({ value, onChange }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {QUICK_TIMES.map(([label, fn]) => (
          <button key={label} type="button" onClick={() => onChange(toLocalInput(fn()))} className="rounded-full border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold text-gray-600 hover:border-brand hover:text-brand">
            {label}
          </button>
        ))}
      </div>
      <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-gray-900">{title}</p>
            {subtitle && <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Log a call / WhatsApp / visit / note; optionally closes the follow-up it answered and books the next one.
export function LogContactModal({ subject, name, task, staff = [], outcomes = [], defaultAssigneeId, onClose, onSaved }) {
  const { showToast, admin } = useApp();
  const [kind, setKind] = useState(task?.kind === "whatsapp" ? "whatsapp" : task?.kind === "visit" ? "visit" : "call");
  const [outcome, setOutcome] = useState("");
  const [text, setText] = useState("");
  const [nextOn, setNextOn] = useState(false);
  const [nextTitle, setNextTitle] = useState("");
  const [nextDue, setNextDue] = useState(toLocalInput(at(1, 11)));
  const [nextAssignee, setNextAssignee] = useState(defaultAssigneeId || admin?.id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Outcomes that usually need another try suggest the next follow-up.
    if (["Not reachable", "Call back later", "Documents promised", "Will finish setup", "Interested"].includes(outcome)) {
      setNextOn(true);
      setNextTitle((t) => t || (outcome === "Not reachable" ? "Try calling again" : outcome === "Documents promised" ? "Check documents uploaded" : outcome === "Will finish setup" ? "Check setup finished" : "Follow up"));
    }
  }, [outcome]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.crmLogContact({
        subject, kind, outcome: kind === "note" ? null : outcome || null, text, taskId: task?.id || null,
        next: nextOn ? { title: nextTitle || "Follow up", dueAt: new Date(nextDue).toISOString(), assigneeId: nextAssignee || null, kind: "call" } : null,
      });
      showToast(task ? "Saved and follow-up closed" : "Saved");
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Log contact" subtitle={task ? `${name} · ${task.title}` : name} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {[["call", "Call"], ["whatsapp", "WhatsApp"], ["visit", "Visit"], ["note", "Note"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`flex-1 rounded-lg py-1.5 text-[12px] font-semibold ${kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {l}
            </button>
          ))}
        </div>
        {kind !== "note" && (
          <div>
            <span className={labelCls}>Result</span>
            <div className="flex flex-wrap gap-1.5">
              {outcomes.map((o) => (
                <button key={o} type="button" onClick={() => setOutcome(o === outcome ? "" : o)} className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${o === outcome ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-600"}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="block">
          <span className={labelCls}>{kind === "note" ? "Note" : "What was said (optional)"}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder={kind === "note" ? "Private to your team" : "e.g. Will upload Aadhaar tonight"} />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-700">
          <input type="checkbox" checked={nextOn} onChange={(e) => setNextOn(e.target.checked)} className="h-4 w-4 accent-brand" />
          Set the next follow-up
        </label>
        {nextOn && (
          <div className="space-y-2 rounded-xl bg-gray-50 p-3">
            <input value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} placeholder="What to do next" className={inputCls} />
            <DuePicker value={nextDue} onChange={setNextDue} />
            <select value={nextAssignee} onChange={(e) => setNextAssignee(e.target.value)} className={inputCls}>
              <option value="">Anyone (unassigned)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghostCls}>Cancel</button>
          <button disabled={saving || (kind === "note" && !text.trim())} className={btnCls}>{saving ? "Saving…" : task ? "Save & close follow-up" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

// New follow-up, or change one (time, person, what).
export function TaskModal({ subject, name, task, staff = [], taskKinds = [], defaultAssigneeId, onClose, onSaved }) {
  const { showToast, admin } = useApp();
  const [title, setTitle] = useState(task?.title || "");
  const [kind, setKind] = useState(task?.kind || "call");
  const [due, setDue] = useState(toLocalInput(task ? Date.parse(task.dueAt) : at(1, 11)));
  const [assigneeId, setAssigneeId] = useState(task ? task.assigneeId || "" : defaultAssigneeId || admin?.id || "");
  const [note, setNote] = useState(task?.note || "");
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { title, kind, dueAt: new Date(due).toISOString(), assigneeId: assigneeId || null, note };
      if (task) await api.crmUpdateTask(task.id, data);
      else await api.crmCreateTask({ subject, ...data });
      showToast(task ? "Follow-up updated" : "Follow-up added");
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={task ? "Change follow-up" : "New follow-up"} subtitle={name} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className={labelCls}>What needs doing</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Call about GST certificate" autoFocus />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(taskKinds.length ? taskKinds : Object.keys(KIND_LABELS)).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${k === kind ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-600"}`}>
              {KIND_LABELS[k] || k}
            </button>
          ))}
        </div>
        <div>
          <span className={labelCls}>When</span>
          <DuePicker value={due} onChange={setDue} />
        </div>
        <label className="block">
          <span className={labelCls}>Who</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
            <option value="">Anyone (unassigned)</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={ghostCls}>Cancel</button>
          <button disabled={saving || !title.trim() || !due} className={btnCls}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}

const TIMELINE_DOT = {
  call: "bg-sky-500", whatsapp: "bg-emerald-500", visit: "bg-indigo-500", note: "bg-gray-400", stage: "bg-violet-500", owner: "bg-gray-400",
  task: "bg-brand", "task-created": "bg-brand/40", lead: "bg-gray-400", system: "bg-brand", document: "bg-amber-500", change: "bg-gray-300",
  booking: "bg-emerald-400", declined: "bg-red-400", complaint: "bg-red-500",
};
const TIMELINE_LABEL = { call: "Call", whatsapp: "WhatsApp", visit: "Visit", note: "Note", document: "Document", booking: "Booking", declined: "Request", complaint: "Complaint", change: "Account" };

// Everything about one provider or lead: stage, owner, checklist, follow-ups, timeline.
export function CrmPanel({ subject, onChanged, showProviderLink = true }) {
  const { showToast, can } = useApp();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { type: "log" | "task", task? }
  const [timelineFilter, setTimelineFilter] = useState("all");
  const canEdit = can("crm.edit");
  const canAdd = can("crm.add");

  const load = useCallback(() => {
    api.crmDetail(subject).then((x) => { setD(x); setError(null); }).catch((e) => setError(e.message));
  }, [subject]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  const changed = () => {
    load();
    onChanged?.();
  };

  if (error) return <p className="py-8 text-center text-[12.5px] text-red-500">{error}</p>;
  if (!d) return <p className="py-8 text-center text-[12.5px] text-gray-400">Loading…</p>;
  const { card } = d;
  const isLead = card.type === "lead";

  const setStage = async (stage) => {
    try {
      if (isLead) {
        const lostReason = stage === "lost" ? window.prompt("Why are they not joining? (optional)") || "" : undefined;
        await api.crmUpdateLead(card.id, { stage, lostReason });
      } else {
        const hold = HOLD_STAGES.includes(stage) ? stage : null;
        const holdReason = hold ? window.prompt(`Reason for "${STAGE_LABELS[hold]}" (optional)`) || "" : undefined;
        await api.crmUpdateProvider(card.id, { hold, holdReason });
      }
      changed();
    } catch (e) {
      showToast(e.message);
    }
  };
  const setOwner = async (ownerId) => {
    try {
      if (isLead) await api.crmUpdateLead(card.id, { ownerId });
      else await api.crmUpdateProvider(card.id, { ownerId });
      changed();
    } catch (e) {
      showToast(e.message);
    }
  };
  const finish = async (task, status) => {
    try {
      await api.crmUpdateTask(task.id, { status });
      changed();
    } catch (e) {
      showToast(e.message);
    }
  };

  // A provider's stage follows their account; by hand only a hold (at risk, inactive, lost) can be set or cleared.
  const stageOptions = isLead ? LEAD_STAGES : [...new Set([card.autoStage ? card.stage : null, ...HOLD_STAGES].filter(Boolean))];
  const shownTimeline = d.timeline.filter((t) => timelineFilter === "all" || (timelineFilter === "contact" ? ["call", "whatsapp", "visit", "note", "task", "task-created"].includes(t.kind) : !["call", "whatsapp", "visit", "note", "task", "task-created"].includes(t.kind)));

  return (
    <div className="space-y-4">
      {/* who */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-bold text-gray-900">{card.businessName || card.name}</p>
            <StagePill stage={card.stage} />
            {isLead && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500">No app account yet</span>}
          </div>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            {card.businessName ? `${card.name} · ` : ""}
            {card.phone}
            {card.category ? ` · ${card.category}` : ""}
            {card.area ? ` · ${card.area}` : ""}
          </p>
          {card.holdReason && <p className="mt-1 text-[12px] text-gray-500">Reason: {card.holdReason}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <a href={telHref(card.phone)} className={ghostCls}>Call</a>
          <a href={waHref(card.phone)} target="_blank" rel="noreferrer" className={ghostCls}>WhatsApp</a>
          {canAdd && <button onClick={() => setModal({ type: "log" })} className={btnCls}>Log contact</button>}
        </div>
      </div>

      {/* stage, owner, source */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelCls}>Stage</span>
          <select value={card.stage} disabled={!canEdit} onChange={(e) => setStage(e.target.value)} className={inputCls}>
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
                {!isLead && s === card.stage && card.autoStage ? " (from their account)" : ""}
              </option>
            ))}
            {!isLead && !card.autoStage && <option value="">Clear — follow their account</option>}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Owner</span>
          <select value={card.ownerId || ""} disabled={!canEdit} onChange={(e) => setOwner(e.target.value || null)} className={inputCls}>
            <option value="">Nobody</option>
            {d.staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div>
          <span className={labelCls}>Source</span>
          <p className="py-2 text-[12.5px] text-gray-700">{card.source}</p>
        </div>
      </div>

      {/* onboarding checklist */}
      {d.checklist && (
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-bold text-gray-900">Onboarding checklist</p>
            <span className="text-[12px] font-semibold text-gray-500 tabular-nums">{d.checklist.done} of {d.checklist.total}</span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(d.checklist.done / d.checklist.total) * 100}%` }} />
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {d.checklist.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 text-[12.5px]">
                <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i.done ? "bg-emerald-500 text-white" : "border border-gray-300 text-transparent"}`}>✓</span>
                <span className={i.done ? "text-gray-700" : "text-gray-900 font-semibold"}>
                  {i.label}
                  {i.detail && <span className="block text-[11px] font-normal text-gray-400">{i.detail}</span>}
                </span>
              </li>
            ))}
            <li className="flex items-start gap-2 text-[12.5px]">
              <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${d.checklist.firstJob ? "bg-emerald-500 text-white" : "border border-dashed border-gray-300 text-transparent"}`}>✓</span>
              <span className="text-gray-500">
                First job completed <span className="text-[11px] text-gray-400">({d.jobs?.completed || 0} done, {d.jobs?.open || 0} open)</span>
              </span>
            </li>
          </ul>
          {showProviderLink && (
            <Link to={`/providers/${card.id}`} className="mt-3 inline-block text-[12px] font-semibold text-brand">
              Open full provider page (documents, services, approve) →
            </Link>
          )}
        </div>
      )}

      {/* follow-ups */}
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-bold text-gray-900">Follow-ups</p>
          {canAdd && <button onClick={() => setModal({ type: "task" })} className="text-[12px] font-semibold text-brand">+ Add follow-up</button>}
        </div>
        {d.openTasks.length === 0 && <p className="text-[12px] text-gray-400">Nothing planned. Add a follow-up so they aren't forgotten.</p>}
        <div className="space-y-2">
          {d.openTasks.map((t) => (
            <div key={t.id} className={`rounded-lg border px-3 py-2 ${t.bucket === "overdue" ? "border-red-200 bg-red-50/50" : "border-gray-100"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-gray-900">{t.title}</p>
                <span className={`text-[11.5px] font-semibold tabular-nums ${t.bucket === "overdue" ? "text-red-600" : "text-gray-500"}`}>{dueLabel(t.dueAt)}</span>
              </div>
              <p className="text-[11.5px] text-gray-400">
                {KIND_LABELS[t.kind] || t.kind} · {t.assigneeName || "Anyone"}
                {t.auto ? " · automatic" : ""}
                {t.note ? ` · ${t.note}` : ""}
              </p>
              {canEdit && (
                <div className="mt-1.5 flex flex-wrap gap-3 text-[12px] font-semibold">
                  <button onClick={() => setModal({ type: "log", task: t })} className="text-brand">Done — log result</button>
                  <button onClick={() => setModal({ type: "task", task: t })} className="text-gray-500 hover:text-gray-800">Change</button>
                  <button onClick={() => finish(t, "cancelled")} className="text-gray-400 hover:text-red-600">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* timeline */}
      <div className="rounded-xl border border-gray-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-bold text-gray-900">Timeline</p>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {[["all", "All"], ["contact", "Contacts"], ["account", "Account & jobs"]].map(([k, l]) => (
              <button key={k} onClick={() => setTimelineFilter(k)} className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${timelineFilter === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {shownTimeline.length === 0 && <p className="text-[12px] text-gray-400">Nothing yet.</p>}
        <ol className="relative space-y-3 border-l border-gray-100 pl-4">
          {shownTimeline.map((t, i) => (
            <li key={i} className="relative">
              <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${TIMELINE_DOT[t.kind] || "bg-gray-300"}`} />
              <p className="text-[12.5px] text-gray-800">
                {TIMELINE_LABEL[t.kind] && <span className="font-semibold">{TIMELINE_LABEL[t.kind]}: </span>}
                {t.outcome && <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">{t.outcome}</span>}
                {t.text}
              </p>
              <p className="text-[11px] text-gray-400">
                {when(t.at)}
                {t.by ? ` · ${String(t.by).replace(/\s*\(\+?\d+\)$/, "")}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {isLead && can("crm.delete") && (
        <button
          onClick={async () => {
            if (!window.confirm(`Delete the lead ${card.name}? Their notes and follow-ups are deleted too.`)) return;
            try {
              await api.crmDeleteLead(card.id);
              showToast("Lead deleted");
              onChanged?.({ deleted: true });
            } catch (e) {
              showToast(e.message);
            }
          }}
          className="text-[12px] font-semibold text-gray-400 hover:text-red-600"
        >
          Delete this lead
        </button>
      )}

      {modal?.type === "log" && (
        <LogContactModal subject={card.subject} name={card.businessName || card.name} task={modal.task} staff={d.staff} outcomes={d.outcomes} defaultAssigneeId={card.ownerId} onClose={() => setModal(null)} onSaved={changed} />
      )}
      {modal?.type === "task" && (
        <TaskModal subject={card.subject} name={card.businessName || card.name} task={modal.task} staff={d.staff} taskKinds={d.taskKinds} defaultAssigneeId={card.ownerId} onClose={() => setModal(null)} onSaved={changed} />
      )}
    </div>
  );
}

// The 360 panel in a side drawer (CRM page).
export function CrmDrawer({ subject, onClose, onChanged }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <div className="mb-3 flex justify-end">
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <XIcon width={20} height={20} />
          </button>
        </div>
        <CrmPanel
          subject={subject}
          onChanged={(x) => {
            onChanged?.();
            if (x?.deleted) onClose();
          }}
        />
      </div>
    </div>
  );
}
