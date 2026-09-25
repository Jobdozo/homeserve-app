import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon } from "../components/icons";
import DisputesPage from "./DisputesPage";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";

const KIND_STYLES = {
  open: "bg-blue-100 text-blue-700",
  waiting: "bg-amber-100 text-amber-700",
  escalated: "bg-red-100 text-red-600",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-200 text-gray-600",
};
const PRIORITY_STYLES = {
  low: "bg-gray-100 text-gray-500",
  normal: "bg-sky-100 text-sky-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-600",
};
const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function Badge({ className, children }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${className}`}>{children}</span>;
}

export default function ComplaintsPage() {
  const [tab, setTab] = useState("complaints");
  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-xl bg-white p-1 shadow-card">
        {[
          ["complaints", "Complaints"],
          ["refunds", "Refund claims"],
          ["pipeline", "Pipeline & staff"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${tab === key ? "bg-brand text-white" : "text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "complaints" ? <ComplaintsBoard /> : tab === "refunds" ? <DisputesPage /> : <PipelineSettings />}
    </div>
  );
}

// ------------------------------------------------------------ list / board

function ComplaintsBoard() {
  const { showToast } = useApp();
  const [f, setF] = useState({ q: "", status: "", assignee: "", priority: "", category: "" });
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [view, setView] = useState("list");
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);

  const params = useMemo(() => Object.fromEntries(Object.entries(f).filter(([, v]) => v)), [f]);
  const load = useCallback(() => {
    const mine = ++seq.current;
    return api
      .listComplaints(params)
      .then((d) => mine === seq.current && setData(d))
      .catch((e) => showToast(e.message || "Couldn't load complaints"));
  }, [params, showToast]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    api.listStaff().then(setStaff).catch(() => {});
  }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const stages = data?.stages.filter((s) => s.active !== false) || [];
  const rows = data?.complaints || [];

  return (
    <div className="space-y-4">
      {/* pipeline tiles */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => set("status", "")}
          className={`flex-shrink-0 rounded-2xl bg-white px-4 py-2.5 text-left shadow-card ${!f.status ? "ring-2 ring-brand" : ""}`}
        >
          <p className="text-[20px] font-extrabold text-gray-900">{data ? data.total : "–"}</p>
          <p className="text-[11px] font-medium text-gray-500">All ({data ? data.open : "–"} open)</p>
        </button>
        {stages.map((s) => (
          <button
            key={s.key}
            onClick={() => set("status", f.status === s.key ? "" : s.key)}
            className={`flex-shrink-0 rounded-2xl bg-white px-4 py-2.5 text-left shadow-card ${f.status === s.key ? "ring-2 ring-brand" : ""}`}
          >
            <p className="text-[20px] font-extrabold text-gray-900">{data?.counts[s.key] || 0}</p>
            <p className="whitespace-nowrap text-[11px] font-medium text-gray-500">{s.label}</p>
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className={labelCls}>Search</label>
            <input
              className={inputCls}
              value={f.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Customer mobile / ID, provider / ID, booking, request or order ID, complaint ID"
            />
          </div>
          <div>
            <label className={labelCls}>Assigned to</label>
            <select className={inputCls} value={f.assignee} onChange={(e) => set("assignee", e.target.value)}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select className={inputCls} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="">Any</option>
              {data?.meta.priorities.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Any</option>
              {data?.meta.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
            {[
              ["list", "List"],
              ["board", "Board"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setView(key)} className={`rounded-md px-3 py-1 text-[12px] font-semibold ${view === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {label}
              </button>
            ))}
          </div>
          {Object.keys(params).length > 0 && (
            <button onClick={() => setF({ q: "", status: "", assignee: "", priority: "", category: "" })} className="text-[12px] font-semibold text-brand underline">
              Clear filters
            </button>
          )}
          <button className={`${btnCls} ml-auto`} onClick={() => setCreating(true)}>
            + New complaint
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2.5 font-medium">Complaint</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Service provider</th>
                  <th className="px-4 py-2.5 font-medium">Request</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Assigned</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-b border-gray-50 align-top last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">
                        {c.id} <Badge className={PRIORITY_STYLES[c.priority]}>{c.priority}</Badge>
                      </p>
                      <p className="max-w-[260px] truncate text-gray-600">{c.subject}</p>
                      <p className="text-[11px] text-gray-400">{c.category}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.customerName || "—"}
                      <p className="text-[11px] text-gray-400">{c.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.providerName || "—"}
                      <p className="text-[11px] text-gray-400">{c.providerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.bookingRef ? `#${c.bookingRef}` : "—"}
                      {c.orderId && <p className="text-[11px] text-gray-400">{c.orderId}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={KIND_STYLES[c.statusKind]}>{c.statusLabel}</Badge>
                      {c.reopenCount > 0 && <p className="mt-1 text-[10.5px] text-orange-600">Reopened {c.reopenCount}×</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.assignedTo?.name || <span className="text-gray-400">Unassigned</span>}</td>
                    <td className="px-4 py-3 text-[11.5px] text-gray-500">{fmt(c.updatedAt)}</td>
                  </tr>
                ))}
                {data && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      No complaints match. {data.total === 0 ? "Use “New complaint” to log the first one." : ""}
                    </td>
                  </tr>
                )}
                {!data && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s) => {
            const col = rows.filter((c) => c.status === s.key);
            return (
              <div key={s.key} className="w-64 flex-shrink-0 rounded-2xl bg-gray-100/70 p-2.5">
                <p className="mb-2 flex items-center justify-between px-1 text-[12px] font-bold text-gray-700">
                  {s.label}
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] text-gray-500">{col.length}</span>
                </p>
                <div className="space-y-2">
                  {col.map((c) => (
                    <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full rounded-xl bg-white p-3 text-left shadow-card hover:shadow-md">
                      <p className="flex items-center justify-between text-[11.5px] font-semibold text-gray-800">
                        {c.id} <Badge className={PRIORITY_STYLES[c.priority]}>{c.priority}</Badge>
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] text-gray-600">{c.subject}</p>
                      <p className="mt-1.5 text-[10.5px] text-gray-400">
                        {c.customerName || c.customerPhone || "—"} · {c.assignedTo?.name || "Unassigned"}
                      </p>
                    </button>
                  ))}
                  {col.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-gray-400">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openId && <ComplaintDetail id={openId} staff={staff} meta={data?.meta} onClose={() => setOpenId(null)} onChanged={load} />}
      {creating && (
        <NewComplaintModal
          meta={data?.meta}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            load();
            setOpenId(c.id);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------- new complaint

function NewComplaintModal({ meta, onClose, onCreated }) {
  const { showToast, providers } = useApp();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(null);
  const [picked, setPicked] = useState(null);
  const [manual, setManual] = useState(false);
  const [f, setF] = useState({ subject: "", description: "", category: "Service quality", priority: "normal", customerPhone: "", customerName: "", providerId: "" });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (term.trim().length < 2) return setResults(null);
    const t = setTimeout(() => api.lookupComplaintBookings(term.trim()).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [term]);

  const canSave = f.subject.trim() && f.description.trim() && (picked || (manual && (f.customerPhone.trim() || f.providerId)));

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const body = { ...f };
      if (picked) body.bookingId = picked.bookingId;
      onCreated(await api.createComplaint(body));
    } catch (e) {
      showToast(e.message || "Couldn't create the complaint");
      setBusy(false);
    }
  };

  return (
    <Modal title="New complaint" onClose={onClose} wide>
      <div className="space-y-3">
        {!picked && !manual && (
          <div>
            <label className={labelCls}>Find the booking</label>
            <input
              autoFocus
              className={inputCls}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Request ID (AB12CD34), booking / order ID, customer mobile or name, provider name"
            />
            {results && results.length === 0 && <p className="mt-2 text-[12px] text-gray-400">No booking found.</p>}
            <div className="mt-2 space-y-1.5">
              {results?.map((r) => (
                <button key={r.bookingId} onClick={() => setPicked(r)} className="w-full rounded-xl border border-gray-100 px-3 py-2 text-left hover:bg-gray-50">
                  <p className="text-[12.5px] font-semibold text-gray-800">
                    #{r.bookingRef} · {r.service} · {r.status}
                  </p>
                  <p className="text-[11.5px] text-gray-500">
                    {r.customerName} {r.customerPhone} → {r.providerName}
                    {r.orderId ? ` · ${r.orderId}` : ""}
                  </p>
                </button>
              ))}
            </div>
            <button onClick={() => setManual(true)} className="mt-2 text-[12px] font-semibold text-brand underline">
              No booking — enter the customer / provider manually
            </button>
          </div>
        )}

        {picked && (
          <div className="rounded-xl bg-gray-50 p-3 text-[12.5px]">
            <p className="font-semibold text-gray-800">
              #{picked.bookingRef} · {picked.service}
            </p>
            <p className="text-gray-500">
              {picked.customerName} ({picked.customerPhone}) → {picked.providerName}
            </p>
            <button onClick={() => setPicked(null)} className="mt-1 text-[11.5px] font-semibold text-brand underline">
              Choose a different booking
            </button>
          </div>
        )}

        {manual && !picked && (
          <div className="space-y-2 rounded-xl bg-gray-50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Customer mobile</label>
                <input className={inputCls} value={f.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="+91…" />
              </div>
              <div>
                <label className={labelCls}>Customer name</label>
                <input className={inputCls} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="If not a registered customer" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Service provider (optional)</label>
              <select className={inputCls} value={f.providerId} onChange={(e) => set("providerId", e.target.value)}>
                <option value="">—</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => setManual(false)} className="text-[11.5px] font-semibold text-brand underline">
              Search for a booking instead
            </button>
          </div>
        )}

        <div>
          <label className={labelCls}>Subject</label>
          <input className={inputCls} value={f.subject} maxLength={120} onChange={(e) => set("subject", e.target.value)} placeholder="Provider arrived 3 hours late" />
        </div>
        <div>
          <label className={labelCls}>What happened</label>
          <textarea className={inputCls} rows={4} value={f.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}>
              {meta?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select className={`${inputCls} capitalize`} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              {meta?.priorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className={ghostCls} onClick={onClose}>
            Cancel
          </button>
          <button className={btnCls} disabled={!canSave || busy} onClick={save}>
            {busy ? "Creating…" : "Create complaint"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- detail

const EVENT_STYLES = {
  created: ["Complaint logged", "bg-blue-500"],
  status: ["Status changed", "bg-indigo-500"],
  assign: ["Assignment", "bg-violet-500"],
  note: ["Internal note", "bg-gray-500"],
  customer_comm: ["Customer communication", "bg-emerald-500"],
  provider_comm: ["Service provider communication", "bg-orange-500"],
  evidence: ["Evidence added", "bg-teal-500"],
  resolution: ["Resolution details", "bg-green-600"],
  reopen: ["Reopened", "bg-red-500"],
  edit: ["Details edited", "bg-gray-400"],
};

function ComplaintDetail({ id, staff, meta, onClose, onChanged }) {
  const { showToast } = useApp();
  const [data, setData] = useState(null);
  const [stages, setStages] = useState([]);
  const [panel, setPanel] = useState(null); // status | reopen | null
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api
        .getComplaint(id)
        .then(setData)
        .catch((e) => showToast(e.message || "Couldn't load the complaint")),
    [id, showToast]
  );
  useEffect(() => {
    load();
    api.listComplaintStages().then(setStages).catch(() => {});
  }, [load]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) showToast(okMsg);
      await load();
      onChanged();
      return true;
    } catch (e) {
      showToast(e.message || "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <Modal title="Complaint" onClose={onClose} wide>
        <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>
      </Modal>
    );
  }
  const { complaint: c, events } = data;
  const finished = ["resolved", "closed"].includes(c.statusKind);
  const activeStages = stages.filter((s) => s.active !== false && s.key !== "reopened" && s.key !== c.status);

  return (
    <Modal
      title={`${c.id} · ${c.subject}`}
      onClose={onClose}
      wide
      header={
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge className={KIND_STYLES[c.statusKind]}>{c.statusLabel}</Badge>
          <Badge className={PRIORITY_STYLES[c.priority]}>{c.priority}</Badge>
          <span className="text-[11.5px] text-gray-400">{c.category}</span>
          {c.reopenCount > 0 && <span className="text-[11.5px] text-orange-600">Reopened {c.reopenCount}×</span>}
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        {/* left: facts + controls */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-[12.5px]">
            <Fact label="Customer" value={c.customerName} sub={c.customerPhone} />
            <Fact label="Customer ID" value={c.customerId} mono />
            <Fact label="Service provider" value={c.providerName} sub={c.providerPhone} />
            <Fact label="Provider ID" value={c.providerId} mono />
            <Fact label="Request ID" value={c.bookingRef && `#${c.bookingRef}`} />
            <Fact label="Booking ID" value={c.bookingId} mono />
            <Fact label="Order ID" value={c.orderId} />
            <Fact label="Service" value={c.service} />
            <Fact label="Opened" value={fmt(c.createdAt)} sub={`by ${c.createdBy}`} />
            <Fact label="Complaint ID" value={c.id} />
          </div>

          <div>
            <p className={labelCls}>Description</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{c.description}</p>
          </div>

          {c.resolution && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[12.5px]">
              <p className="font-semibold text-emerald-800">
                Resolution — {c.resolution.outcome}
                {c.resolution.refundAmount ? ` (₹${c.resolution.refundAmount})` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-gray-700">{c.resolution.summary}</p>
              <p className="mt-1 text-[11px] text-gray-400">
                {fmt(c.resolution.at)} by {c.resolution.by}
              </p>
            </div>
          )}

          <div>
            <label className={labelCls}>Assigned to</label>
            <select
              className={inputCls}
              disabled={busy}
              value={c.assignedTo?.id || ""}
              onChange={(e) => act(() => api.assignComplaint(c.id, e.target.value || null), "Assignment updated")}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            {finished ? (
              <button className={btnCls} onClick={() => setPanel(panel === "reopen" ? null : "reopen")}>
                Reopen complaint
              </button>
            ) : null}
            {!finished || c.statusKind === "resolved" ? (
              <button className={ghostCls} onClick={() => setPanel(panel === "status" ? null : "status")}>
                Change status
              </button>
            ) : null}
          </div>

          {panel === "status" && (
            <StatusForm
              stages={activeStages.filter((s) => !finished || ["resolved", "closed"].includes(s.kind))}
              meta={meta}
              existingResolution={c.resolution}
              busy={busy}
              onSubmit={(body) =>
                act(() => api.setComplaintStatus(c.id, body), "Status updated").then((ok) => ok && setPanel(null))
              }
            />
          )}
          {panel === "reopen" && <ReopenForm busy={busy} onSubmit={(reason) => act(() => api.reopenComplaint(c.id, reason), "Complaint reopened").then((ok) => ok && setPanel(null))} />}
        </div>

        {/* right: composer + history */}
        <div className="space-y-4">
          <Composer complaint={c} meta={meta} onDone={() => act(async () => {})} />
          <div>
            <p className={labelCls}>Complete history</p>
            <div className="space-y-0">
              {[...events].reverse().map((e) => (
                <TimelineItem key={e.id} e={e} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Fact({ label, value, sub, mono }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`break-words text-gray-800 ${mono ? "font-mono text-[11px]" : ""}`}>{value || "—"}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function StatusForm({ stages, meta, existingResolution, busy, onSubmit }) {
  const [status, setStatus] = useState(stages[0]?.key || "");
  const [note, setNote] = useState("");
  const [res, setRes] = useState({ summary: existingResolution?.summary || "", outcome: existingResolution?.outcome || "Refund issued", refundAmount: existingResolution?.refundAmount || "" });
  const target = stages.find((s) => s.key === status);
  const needsResolution = ["resolved", "closed"].includes(target?.kind);
  const ready = status && (!needsResolution || res.summary.trim());
  return (
    <div className="space-y-2.5 rounded-xl border border-gray-100 p-3">
      <div>
        <label className={labelCls}>Move to</label>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Note (optional)</label>
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {needsResolution && (
        <div className="space-y-2 rounded-lg bg-emerald-50/50 p-2.5">
          <p className="text-[11.5px] font-semibold text-emerald-800">Resolution details (required)</p>
          <textarea className={inputCls} rows={3} value={res.summary} onChange={(e) => setRes({ ...res, summary: e.target.value })} placeholder="What was decided and done" />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={res.outcome} onChange={(e) => setRes({ ...res, outcome: e.target.value })}>
              {meta?.outcomes.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <input type="number" min="0" className={inputCls} value={res.refundAmount} onChange={(e) => setRes({ ...res, refundAmount: e.target.value })} placeholder="Refund ₹ (if any)" />
          </div>
        </div>
      )}
      <button className={btnCls} disabled={!ready || busy} onClick={() => onSubmit({ status, note, ...(needsResolution ? { resolution: res } : {}) })}>
        Update status
      </button>
    </div>
  );
}

function ReopenForm({ busy, onSubmit }) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2.5 rounded-xl border border-red-100 p-3">
      <label className={labelCls}>Why is it being reopened?</label>
      <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className={btnCls} disabled={!reason.trim() || busy} onClick={() => onSubmit(reason.trim())}>
        Reopen
      </button>
    </div>
  );
}

const COMPOSER_TABS = [
  ["note", "Internal note"],
  ["customer_comm", "Customer"],
  ["provider_comm", "Service provider"],
  ["evidence", "Evidence"],
];

function Composer({ complaint, meta, onDone }) {
  const { showToast } = useApp();
  const [tab, setTab] = useState("note");
  const [text, setText] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [channel, setChannel] = useState("Phone call");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const isComm = tab === "customer_comm" || tab === "provider_comm";
  const who = tab === "customer_comm" ? "customer" : "service provider";
  const inAppWarn = isComm && direction === "outbound" && channel === "In-app notification";

  const submit = async () => {
    setBusy(true);
    try {
      if (tab === "evidence") await api.uploadComplaintEvidence(complaint.id, file, text.trim());
      else await api.addComplaintEntry(complaint.id, { type: tab, text: text.trim(), direction, channel });
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      showToast(tab === "evidence" ? "Evidence uploaded" : "Added to the history");
      await onDone();
    } catch (e) {
      showToast(e.message || "Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  const ready = tab === "evidence" ? Boolean(file) : Boolean(text.trim());

  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="mb-2.5 flex flex-wrap gap-1">
        {COMPOSER_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-3 py-1 text-[12px] font-semibold ${tab === key ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>
      {isComm && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="outbound">We sent / told the {who}</option>
            <option value="inbound">We received from the {who}</option>
          </select>
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {meta?.channels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      {tab === "evidence" && (
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mb-2 block w-full text-[12px] text-gray-600" />
      )}
      <textarea
        className={inputCls}
        rows={tab === "evidence" ? 2 : 3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          tab === "note" ? "Only staff can see this" : tab === "evidence" ? "What this file shows (optional)" : `What was ${direction === "outbound" ? "said to" : "said by"} the ${who}`
        }
      />
      {inAppWarn && <p className="mt-1 text-[11px] text-emerald-700">This will be delivered to the {who}'s app as a notification.</p>}
      {tab === "evidence" && <p className="mt-1 text-[11px] text-gray-400">Photos, PDF, Word, Excel or text — up to 15 MB.</p>}
      <div className="mt-2 flex justify-end">
        <button className={btnCls} disabled={!ready || busy} onClick={submit}>
          {busy ? "Saving…" : tab === "evidence" ? "Upload" : inAppWarn ? "Send & log" : "Add to history"}
        </button>
      </div>
    </div>
  );
}

function TimelineItem({ e }) {
  const [label, dot] = EVENT_STYLES[e.type] || [e.type, "bg-gray-400"];
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
        <span className="w-px flex-1 bg-gray-100" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <p className="text-[12.5px] font-semibold text-gray-800">
          {label}
          {e.channel && <span className="ml-1.5 font-normal text-gray-400">· {e.direction === "inbound" ? "received via" : "sent via"} {e.channel}</span>}
        </p>
        <p className="text-[10.5px] text-gray-400">
          {fmt(e.at)} · {e.actor}
        </p>
        {e.type === "status" && (
          <p className="mt-0.5 text-[12px] text-gray-600">
            {e.fromLabel} → <b>{e.toLabel}</b>
          </p>
        )}
        {e.type === "assign" && (
          <p className="mt-0.5 text-[12px] text-gray-600">
            {e.from || "Unassigned"} → <b>{e.to || "Unassigned"}</b>
          </p>
        )}
        {e.type === "edit" &&
          e.changes?.map((ch, i) => (
            <p key={i} className="mt-0.5 text-[12px] text-gray-600">
              {ch.field}: <span className="text-red-500 line-through">{String(ch.from)}</span> → <span className="text-emerald-600">{String(ch.to)}</span>
            </p>
          ))}
        {e.type === "resolution" && (
          <p className="mt-0.5 text-[12px] text-gray-600">
            {e.outcome}
            {e.refundAmount ? ` · ₹${e.refundAmount}` : ""} — {e.summary}
          </p>
        )}
        {e.text && e.type !== "resolution" && e.type !== "created" && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-gray-600">{e.text}</p>}
        {e.type === "created" && e.text && <p className="mt-0.5 text-[12.5px] text-gray-600">{e.text}</p>}
        {e.attachment && (
          <a href={`${SERVER_URL}${e.attachment.url}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2">
            {/^image\//.test(e.attachment.mime) ? (
              <img src={`${SERVER_URL}${e.attachment.url}`} alt={e.attachment.name} className="h-20 w-20 rounded-lg object-cover" />
            ) : (
              <span className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-brand underline">{e.attachment.name}</span>
            )}
          </a>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------- pipeline & staff

function PipelineSettings() {
  const { showToast } = useApp();
  const [stages, setStages] = useState(null);
  const [staff, setStaff] = useState([]);
  const [newStage, setNewStage] = useState({ label: "", kind: "open" });
  const [newStaff, setNewStaff] = useState({ name: "", phone: "", role: "" });

  const load = () => {
    api.listComplaintStages().then(setStages).catch(() => setStages([]));
    api.listStaff().then(setStaff).catch(() => {});
  };
  useEffect(load, []);

  const run = async (fn, ok) => {
    try {
      await fn();
      if (ok) showToast(ok);
      load();
      return true;
    } catch (e) {
      showToast(e.message || "Something went wrong");
      return false;
    }
  };
  const move = (i, dir) => {
    const keys = stages.map((s) => s.key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setStages(keys.map((k) => stages.find((s) => s.key === k)));
    run(() => api.reorderComplaintStages(keys));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl bg-white p-5 shadow-card">
        <h2 className="text-[14px] font-bold text-gray-900">Pipeline stages</h2>
        <p className="mt-1 text-[12px] text-gray-500">Rename, reorder or hide stages, and add your own. New Complaint, Resolved, Closed and Reopened drive the workflow, so they can be renamed but not removed.</p>
        <div className="mt-3 divide-y divide-gray-50">
          {stages?.map((s, i) => (
            <StageRow key={s.key} stage={s} i={i} last={i === stages.length - 1} move={move} run={run} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input className={`${inputCls} flex-1`} value={newStage.label} onChange={(e) => setNewStage({ ...newStage, label: e.target.value })} placeholder="New stage, e.g. Legal Review" />
          <select className={`${inputCls} w-40`} value={newStage.kind} onChange={(e) => setNewStage({ ...newStage, kind: e.target.value })}>
            <option value="open">Open</option>
            <option value="waiting">Waiting</option>
            <option value="escalated">Escalated</option>
          </select>
          <button className={btnCls} disabled={!newStage.label.trim()} onClick={() => run(() => api.createComplaintStage(newStage), "Stage added").then((ok) => ok && setNewStage({ label: "", kind: "open" }))}>
            Add stage
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-card">
        <h2 className="text-[14px] font-bold text-gray-900">Staff</h2>
        <p className="mt-1 text-[12px] text-gray-500">People complaints can be assigned to. Super Admin logins are always included.</p>
        <div className="mt-3 divide-y divide-gray-50">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-gray-800">{s.name}</p>
                <p className="text-[11px] text-gray-400">{s.source === "admin" ? "Super Admin login" : [s.role, s.phone].filter(Boolean).join(" · ") || "Staff"}</p>
              </div>
              {s.source === "staff" && (
                <button className="text-gray-300 hover:text-red-500" aria-label="Remove" onClick={() => run(() => api.removeStaff(s.id), "Staff member removed")}>
                  <XIcon width={15} height={15} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <input className={inputCls} value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} placeholder="Name" />
          <input className={inputCls} value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })} placeholder="Role" />
          <input className={inputCls} value={newStaff.phone} onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })} placeholder="Phone" />
        </div>
        <button className={`${btnCls} mt-2`} disabled={!newStaff.name.trim()} onClick={() => run(() => api.addStaff(newStaff), "Staff member added").then((ok) => ok && setNewStaff({ name: "", phone: "", role: "" }))}>
          Add staff member
        </button>
      </div>
    </div>
  );
}

function StageRow({ stage, i, last, move, run }) {
  const [label, setLabel] = useState(stage.label);
  useEffect(() => setLabel(stage.label), [stage.label]);
  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5">
      <div className="flex flex-col">
        <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-[11px] text-gray-400 hover:text-gray-800 disabled:opacity-25" aria-label="Move up">▲</button>
        <button disabled={last} onClick={() => move(i, 1)} className="px-1 text-[11px] text-gray-400 hover:text-gray-800 disabled:opacity-25" aria-label="Move down">▼</button>
      </div>
      <input
        className={`${inputCls} min-w-[140px] flex-1 ${stage.active === false ? "opacity-50" : ""}`}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label.trim() !== stage.label && run(() => api.updateComplaintStage(stage.key, { label }), "Stage renamed")}
      />
      <Badge className={KIND_STYLES[stage.kind]}>{stage.kind}</Badge>
      <button
        disabled={stage.system}
        onClick={() => run(() => api.updateComplaintStage(stage.key, { active: stage.active === false }))}
        className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold disabled:opacity-40 ${stage.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}
      >
        {stage.active !== false ? "Visible" : "Hidden"}
      </button>
      {!stage.system && (
        <button className="text-gray-300 hover:text-red-500" aria-label="Delete stage" onClick={() => window.confirm(`Delete the "${stage.label}" stage?`) && run(() => api.deleteComplaintStage(stage.key), "Stage deleted")}>
          <XIcon width={15} height={15} />
        </button>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- modal

function Modal({ title, header, onClose, wide, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-5xl" : "max-w-md"} rounded-2xl bg-white p-5 shadow-xl`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold text-gray-900">{title}</h2>
            {header}
          </div>
          <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
