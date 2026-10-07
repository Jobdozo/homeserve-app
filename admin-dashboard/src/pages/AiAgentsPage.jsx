import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon } from "../components/icons";
import { TasksPanel, CeoChatPanel } from "./AgentOffice";

// AI Agents: approve what agents propose, read their alerts and reports, and
// manage the agent accounts themselves (role, on/off, daily AI budget, key).
// The server enforces all of this — see server/src/agents.js.

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400";
const btnCls = "rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50";
const ghostCls = "rounded-xl border border-gray-200 px-3 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50";
const dangerCls = "rounded-xl border border-red-200 px-3 py-2 text-[12.5px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50";
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "Never");
const SEVERITY = {
  critical: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
};
const STATUS = {
  pending: "bg-amber-100 text-amber-700",
  executing: "bg-sky-100 text-sky-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-gray-200 text-gray-600",
  expired: "bg-gray-100 text-gray-400",
};

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

export default function AiAgentsPage() {
  const { can } = useApp();
  const [tab, setTab] = useState("approvals");
  const [config, setConfig] = useState(null);
  const [hasCeo, setHasCeo] = useState(true);
  const run = useRun();
  useEffect(() => {
    api.listAiAgents().then((d) => setHasCeo(d.agents.some((a) => a.kind === "ceo" && a.active))).catch(() => {});
  }, [tab]);

  const loadConfig = () => api.getAiConfig().then(setConfig).catch(() => {});
  useEffect(() => {
    loadConfig();
  }, []);

  const toggleAll = async () => {
    const next = !config.enabled;
    const out = await run(() => api.setAiConfig({ enabled: next }), next ? "AI agents switched on" : "All AI agents stopped");
    if (out) setConfig(out);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-card">
          {[
            ["approvals", "Approvals"],
            ["tasks", "Tasks"],
            ["ceo", "CEO chat"],
            ["feed", "Alerts & reports"],
            ["teams", "Teams"],
            ["agents", "Agents"],
            ["knowledge", "Support agent"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${tab === key ? "bg-brand text-white" : "text-gray-500"}`}>
              {label}
            </button>
          ))}
        </div>
        {config && (
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-card">
            <span className={`h-2.5 w-2.5 rounded-full ${config.enabled ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[12.5px] font-semibold text-gray-700">{config.enabled ? "AI agents running" : "All AI agents stopped"}</span>
            {can("ai.manage") && (
              <button className={config.enabled ? dangerCls : btnCls} onClick={toggleAll}>
                {config.enabled ? "Stop all" : "Start all"}
              </button>
            )}
          </div>
        )}
      </div>
      {tab === "approvals" && <ApprovalsPanel canDecide={can("ai.approve")} />}
      {tab === "tasks" && <TasksPanel canApprove={can("ai.approve")} canManage={can("ai.manage")} />}
      {tab === "ceo" && <CeoChatPanel hasCeo={hasCeo} />}
      {tab === "feed" && <FeedPanel />}
      {tab === "agents" && <AgentsPanel canManage={can("ai.manage")} />}
      {tab === "teams" && <AgentsPanel canManage={can("ai.manage")} view="teams" />}
      {tab === "knowledge" && config && <KnowledgePanel config={config} onSaved={setConfig} canEdit={can("ai.manage")} />}
    </div>
  );
}

// ---------------------------------------------------------------- knowledge

// Every line below matches how the Tikdum apps work today (checked against the
// code). Hours and service areas aren't in the code — the owner fills those in.
const KNOWLEDGE_TEMPLATE = `About Tikdum: book trusted local home-service providers (plumbers, electricians, cleaners and more) in the Tikdum app. Customer app: "Tikdum" on the Play Store.
Support hours: (fill in, e.g. 8 AM - 9 PM every day)
Areas we serve: (fill in)

Booking: open the app, pick a service, add it to the cart and check out. You are not charged when booking - payment is after the service is completed.
Each booking has a request ID on the booking screen. Ask the customer for it if they have more than one booking.
If a provider declines, Tikdum automatically tries another provider in the same category.
Provider's phone number: shown in the app on the booking once the provider has accepted (and while the job is in progress).

Cancel: My Bookings -> open the booking -> "Cancel Booking". Possible while the booking is Pending or Accepted. Once the job has started, the customer can't cancel in the app - a team member helps.
Reschedule: not possible in the app. The customer can cancel and book again for the new time, or a team member can help.

Job OTPs: after the provider accepts, the booking screen shows a Start OTP. Share it with the provider only once they have arrived. When the job is done and the customer is happy, they share the Completion OTP. Never share an OTP with anyone over the phone or chat - Tikdum staff never ask for it.

Booking protection (only for bookings made in the Tikdum app): genuine service guarantee, damage protection up to Rs 1,000, fair price guarantee, SOS emergency help. Problems with a booking: open the booking -> "Something wrong with this booking?" - a team member reviews every claim.

Become a provider: install "Tikdum Business" from the Play Store and sign up with your mobile number. Our team verifies new providers before they get jobs.
Delete account: in the app, Profile -> Delete account.
Other contact: email support@tikdum.com.`;

function KnowledgePanel({ config, onSaved, canEdit }) {
  const [text, setText] = useState(config.supportKnowledge || "");
  const [saving, setSaving] = useState(false);
  const run = useRun();
  const setAutoSend = async (on) => {
    if (on && !window.confirm("The support AI will reply to customers on WhatsApp by itself (refunds, safety and complaints still go to a person). Turn on?")) return;
    const out = await run(() => api.setAiConfig({ supportAutoSend: on }), on ? "Support AI now replies by itself" : "Review mode: the AI only drafts replies");
    if (out) onSaved(out);
  };
  const dirty = text !== (config.supportKnowledge || "");
  const save = async () => {
    setSaving(true);
    const out = await run(() => api.setAiConfig({ supportKnowledge: text }), "Support knowledge saved");
    if (out) onSaved(out);
    setSaving(false);
  };
  return (
    <div className="space-y-4">
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold text-gray-900">How the WhatsApp support agent replies</h2>
          <p className="text-[12px] text-gray-500">
            {config.supportAutoSend
              ? "Auto-send: it replies to customers itself. Refunds, safety, legal and abusive chats, and anything it isn't sure about, still go to your team."
              : "Review mode: it writes a suggested reply on each chat (Inbox → AI drafts) and a person sends, edits or discards it. Nothing reaches customers without a person."}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-shrink-0 rounded-xl border border-gray-200 p-0.5">
            <button className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${!config.supportAutoSend ? "bg-brand text-white" : "text-gray-500"}`} onClick={() => config.supportAutoSend && setAutoSend(false)}>
              Review mode
            </button>
            <button className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold ${config.supportAutoSend ? "bg-brand text-white" : "text-gray-500"}`} onClick={() => !config.supportAutoSend && setAutoSend(true)}>
              Auto-send
            </button>
          </div>
        )}
      </div>
    </div>
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <h2 className="text-[14px] font-bold text-gray-900">What the WhatsApp support agent may tell customers</h2>
      <p className="mb-3 text-[12px] text-gray-500">
        The agent answers only from this text and the customer's own bookings. Anything not covered here goes to your team. Keep it factual: hours, areas, how to cancel or reschedule in the app, payment rules. Don't put phone numbers, passwords or internal notes here.
      </p>
      <textarea
        className={`${inputCls} min-h-[320px] font-mono text-[12px]`}
        value={text}
        maxLength={8000}
        disabled={!canEdit}
        placeholder={KNOWLEDGE_TEMPLATE}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">{text.length} / 8000 characters</span>
        {canEdit && (
          <div className="flex gap-2">
            {!text && (
              <button className={ghostCls} onClick={() => setText(KNOWLEDGE_TEMPLATE)}>
                Start from Tikdum basics
              </button>
            )}
            <button className={btnCls} disabled={!dirty || saving} onClick={save}>
              Save
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ---------------------------------------------------------------- approvals

function ApprovalsPanel({ canDecide }) {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(null);
  const run = useRun();

  const load = () => api.listAiActions(status).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [status]);

  const decide = async (a, approve) => {
    let note;
    if (!approve) {
      note = window.prompt("Reason for rejecting (optional)") ?? null;
      if (note === null) return;
    }
    setBusy(a.id);
    await run(() => (approve ? api.approveAiAction(a.id) : api.rejectAiAction(a.id, note)), approve ? "Approved and done" : "Proposal rejected");
    setBusy(null);
    load();
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Waiting for a person</h2>
          <p className="text-[12px] text-gray-500">Agents can't approve providers, decide refunds, close complaints or message everyone. They propose it here; approving runs it as you, with your permissions.</p>
        </div>
        <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          {["pending", "approved", "rejected", "expired"].map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {!rows ? (
        <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">Nothing {status} right now.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-800">{a.title}</p>
                  <p className="text-[11.5px] text-gray-400">
                    {a.agentName} · {fmt(a.createdAt)} · <span className="font-mono">{a.type}</span>
                    {a.decidedBy && ` · ${a.status} by ${a.decidedBy}`}
                  </p>
                  {a.summary && <p className="mt-1 whitespace-pre-line text-[12.5px] text-gray-600">{a.summary}</p>}
                  {a.lastError && <p className="mt-1 text-[12px] text-red-600">Last attempt failed: {a.lastError}</p>}
                  {a.note && <p className="mt-1 text-[12px] text-gray-500">Note: {a.note}</p>}
                  <button className="mt-1 text-[11.5px] font-semibold text-brand" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    {open === a.id ? "Hide details" : "Why, and exactly what will run"}
                  </button>
                  {open === a.id && (
                    <div className="mt-2 space-y-2 rounded-xl bg-gray-50 p-3 text-[12px] text-gray-600">
                      {a.reasoning && <p className="whitespace-pre-line">{a.reasoning}</p>}
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-gray-500">
                        {a.request.method} /api{a.request.path}
                        {"\n"}
                        {JSON.stringify(a.request.body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${STATUS[a.status] || STATUS.pending}`}>{a.status}</span>
                  {canDecide && a.status === "pending" && (
                    <>
                      <button className={ghostCls} disabled={busy === a.id} onClick={() => decide(a, false)}>
                        Reject
                      </button>
                      <button className={btnCls} disabled={busy === a.id} onClick={() => decide(a, true)}>
                        Approve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- feed

function FeedPanel() {
  const [kind, setKind] = useState("");
  const [unacked, setUnacked] = useState(true);
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const run = useRun();

  const load = () => api.listAiFeed({ kind, unacked }).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [kind, unacked]);

  const ack = async (id) => {
    await run(() => api.ackAiFeed(id));
    load();
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Alerts & reports</h2>
          <p className="text-[12px] text-gray-500">What the agents noticed and sent you. Mark items as seen to clear them.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className={`${inputCls} w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All</option>
            <option value="alert">Alerts</option>
            <option value="report">Reports</option>
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
            <input type="checkbox" checked={unacked} onChange={(e) => setUnacked(e.target.checked)} /> Unseen only
          </label>
        </div>
      </div>
      {!rows ? (
        <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-[12.5px] text-gray-400">All clear.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {rows.map((f) => (
            <li key={f.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY[f.severity] || SEVERITY.info}`}>{f.kind === "report" ? "report" : f.severity}</span>
                    <p className="text-[13px] font-semibold text-gray-800">{f.title}</p>
                  </div>
                  <p className="text-[11.5px] text-gray-400">
                    {f.agentName} · {fmt(f.createdAt)}
                    {f.refs?.bookingId && ` · booking ${f.refs.bookingId}`}
                    {f.ackedBy && ` · seen by ${f.ackedBy}`}
                  </p>
                  {f.body && (
                    <>
                      <p className={`mt-1 whitespace-pre-line text-[12.5px] text-gray-600 ${open === f.id ? "" : "line-clamp-3"}`}>{f.body}</p>
                      {f.body.length > 240 && (
                        <button className="text-[11.5px] font-semibold text-brand" onClick={() => setOpen(open === f.id ? null : f.id)}>
                          {open === f.id ? "Show less" : "Show all"}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {!f.ackedAt && (
                  <button className={ghostCls} onClick={() => ack(f.id)}>
                    Mark seen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- agents

function AgentsPanel({ canManage, view = "list" }) {
  const [agents, setAgents] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [newKey, setNewKey] = useState(null); // { name, apiKey }
  const run = useRun();

  const load = () => api.listAiAgents().then((d) => setAgents(d.agents)).catch(() => setAgents([]));
  useEffect(() => {
    load();
    api.listRoles().then((r) => setRoles(r.filter((x) => !["super_admin", "admin"].includes(x.id)))).catch(() => {});
    api.getAiCatalog().then((d) => setCatalog(d.teams)).catch(() => setCatalog([]));
  }, []);

  const save = async (form) => {
    const out = await run(
      () => (form.id ? api.updateAiAgent(form.id, form) : api.createAiAgent(form)),
      form.id ? "Agent updated" : "Agent created"
    );
    if (!out) return;
    setEditing(null);
    if (out.apiKey) setNewKey({ name: out.agent.name, apiKey: out.apiKey });
    load();
  };

  const rotate = async (a) => {
    if (!window.confirm(`Make a new key for ${a.name}? The old key stops working immediately, so update the worker's settings right after.`)) return;
    const out = await run(() => api.rotateAiAgentKey(a.id), "New key created");
    if (out?.apiKey) setNewKey({ name: a.name, apiKey: out.apiKey });
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.name}? Its key stops working immediately.`)) return;
    await run(() => api.deleteAiAgent(a.id), "Agent deleted");
    load();
  };

  const addFromRole = (role, team) =>
    setEditing({
      name: role.name, description: role.description, roleId: role.role, template: role.key, team,
      kind: role.how === "ceo" ? "ceo" : role.how === "specialist" ? "specialist" : role.how === "engineer" ? "engineer" : "standard",
      instructions: role.instructions || "", dailyBudgetUsd: role.how === "rules" ? 0 : 1,
    });

  if (view === "teams") {
    return (
      <>
        <TeamsView catalog={catalog} agents={agents} canManage={canManage} onAdd={addFromRole} onEdit={setEditing} />
        {editing && <AgentModal agent={editing} roles={roles} onClose={() => setEditing(null)} onSave={save} />}
        {newKey && <KeyModal {...newKey} onClose={() => setNewKey(null)} />}
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Agent accounts {agents ? `(${agents.length})` : ""}</h2>
          <p className="text-[12px] text-gray-500">Each agent works under one staff role, limited to viewing plus a few safe actions. It never gets Super Admin, Admin, user management or settings.</p>
        </div>
        {canManage && (
          <button className={btnCls} onClick={() => setEditing({ dailyBudgetUsd: 1 })}>
            + Add agent
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5 font-medium">Agent</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Last seen</th>
              <th className="px-4 py-2.5 font-medium">AI spend today</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {agents?.map((a) => (
              <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <p className="font-semibold text-gray-800">
                    {a.name} {a.kind === "ceo" && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">CEO</span>}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {a.description || "—"} · key {a.keyPrefix}…
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10.5px] font-semibold text-violet-700">{a.roleName}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${a.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>{a.active ? "On" : "Off"}</span>
                  {a.lastStatus && a.lastStatus !== "ok" && <p className="mt-0.5 text-[11px] text-amber-600">{a.lastStatus}: {a.lastNote}</p>}
                </td>
                <td className="px-4 py-3 text-[11.5px] text-gray-500">{fmt(a.lastSeenAt)}</td>
                <td className="px-4 py-3 text-[11.5px] text-gray-600">
                  ${a.usage.costUsd.toFixed(3)} / ${Number(a.dailyBudgetUsd).toFixed(2)}
                  <span className="block text-[10.5px] text-gray-400">{a.usage.calls} AI calls</span>
                </td>
                <td className="px-4 py-3">
                  {canManage && (
                    <div className="flex justify-end gap-1.5">
                      <button className={ghostCls} onClick={() => run(() => api.updateAiAgent(a.id, { active: !a.active }), a.active ? "Agent switched off" : "Agent switched on").then(load)}>
                        {a.active ? "Switch off" : "Switch on"}
                      </button>
                      <button className={ghostCls} onClick={() => setEditing(a)}>
                        Edit
                      </button>
                      <button className={ghostCls} onClick={() => rotate(a)}>
                        New key
                      </button>
                      <button className={dangerCls} onClick={() => remove(a)}>
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {agents?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  No agents yet. Add one per job (for example "Reporting Agent" with the Reporting / Management role).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <AgentModal agent={editing} roles={roles} onClose={() => setEditing(null)} onSave={save} />}
      {newKey && <KeyModal {...newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

function AgentModal({ agent, roles, onClose, onSave }) {
  const [form, setForm] = useState({
    id: agent.id, name: agent.name || "", description: agent.description || "", roleId: agent.roleId || "", dailyBudgetUsd: agent.dailyBudgetUsd ?? 1,
    kind: agent.kind || "standard", team: agent.team || "", template: agent.template || undefined, instructions: agent.instructions || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ ...form, dailyBudgetUsd: Number(form.dailyBudgetUsd) });
    setSaving(false);
  };
  return (
    <Modal title={agent.id ? "Edit agent" : "Add AI agent"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Reporting Agent" />
        </div>
        <div>
          <label className={labelCls}>What it does (optional)</label>
          <input className={inputCls} value={form.description} onChange={set("description")} placeholder="Daily business summary" />
        </div>
        <div>
          <label className={labelCls}>Role</label>
          <select className={inputCls} value={form.roleId} onChange={set("roleId")}>
            <option value="">Choose a role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={form.kind} onChange={set("kind")}>
            <option value="standard">Standard agent</option>
            <option value="ceo">CEO (chief of staff) — reads all reports, proposes tasks, chats with you</option>
            <option value="specialist">Specialist — drafts work for tasks you assign it (Marketing, SEO, Analyst…)</option>
            <option value="engineer">Engineering — works on GitHub through pull requests only</option>
          </select>
        </div>
        {form.kind === "engineer" && (
          <div>
            <label className={labelCls}>Engineering role</label>
            <select className={inputCls} value={form.template || ""} onChange={set("template")}>
              <option value="">Choose…</option>
              {ENGINEER_ROLES.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">Needs the GitHub App set up on the server (see agents/README.md). It can open pull requests and comment; only you can approve and merge, and deploys stay manual.</p>
          </div>
        )}
        <div>
          <label className={labelCls}>Team</label>
          <select className={inputCls} value={form.team} onChange={set("team")}>
            <option value="">—</option>
            {TEAM_OPTIONS.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        {form.kind === "engineer" && (
          <div>
            <label className={labelCls}>Team notes (optional — coding conventions, areas to avoid)</label>
            <textarea className={`${inputCls} min-h-[90px] font-mono text-[11.5px]`} maxLength={6000} value={form.instructions} onChange={set("instructions")} />
          </div>
        )}
        {form.kind === "specialist" && (
          <div>
            <label className={labelCls}>Instructions (what this specialist does and how)</label>
            <textarea className={`${inputCls} min-h-[160px] font-mono text-[11.5px]`} maxLength={6000} value={form.instructions} onChange={set("instructions")} />
            <p className="mt-1 text-[11px] text-gray-400">It only works on tasks assigned to it in the Tasks tab, and only writes drafts for you to review — it can't publish or send anything.</p>
          </div>
        )}
        <div>
          <label className={labelCls}>Daily AI budget (USD)</label>
          <input className={inputCls} type="number" min="0" max="100" step="0.1" value={form.dailyBudgetUsd} onChange={set("dailyBudgetUsd")} />
          <p className="mt-1 text-[11px] text-gray-400">The agent stops calling the AI for the rest of the day (IST) once it reaches this. Rule-based checks keep running.</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ghostCls} onClick={onClose}>
            Cancel
          </button>
          <button className={btnCls} disabled={saving || !form.name || !form.roleId || (form.kind === "engineer" && !form.template)}>
            {agent.id ? "Save" : "Create agent"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KeyModal({ name, apiKey, onClose }) {
  const { showToast } = useApp();
  const copy = () =>
    navigator.clipboard
      ?.writeText(apiKey)
      .then(() => showToast("Key copied"))
      .catch(() => showToast("Copy failed — select the key and copy it manually"));
  return (
    <Modal title={`API key for ${name}`} onClose={onClose}>
      <p className="mb-2 text-[12.5px] text-gray-600">Copy this now — it won't be shown again. Put it in the agents worker's settings on the server (never in the app code or Git).</p>
      <div className="break-all rounded-xl bg-gray-50 p-3 font-mono text-[12px] text-gray-800">{apiKey}</div>
      <div className="mt-3 flex justify-end gap-2">
        <button className={ghostCls} onClick={copy}>
          Copy
        </button>
        <button className={btnCls} onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-3 py-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const TEAM_OPTIONS = [
  ["leadership", "Leadership"],
  ["operations", "Operations"],
  ["marketing", "Marketing"],
  ["planning", "Planning"],
  ["rnd", "R&D"],
  ["engineering", "Engineering"],
];
const ENGINEER_ROLES = [
  ["bug_triage", "Bug Triage — complaints → GitHub issues + proposed fix tasks"],
  ["developer", "Developer — writes fixes as pull requests"],
  ["reviewer", "Code Reviewer — comments on every pull request"],
  ["tester", "Tester — adds tests, explains CI failures"],
];
const HOW = {
  rules: ["Rules, no AI", "bg-gray-100 text-gray-600"],
  ai: ["AI", "bg-violet-100 text-violet-700"],
  ceo: ["CEO", "bg-violet-100 text-violet-700"],
  specialist: ["Specialist (AI)", "bg-sky-100 text-sky-700"],
  engineer: ["Engineering (AI · GitHub)", "bg-indigo-100 text-indigo-700"],
  planned: ["Not built yet", "bg-amber-100 text-amber-700"],
};

// The org chart: every planned role per team, which ones are running, and
// one-click "Add" for roles that are available. Agents created before teams
// existed are matched by name.
function TeamsView({ catalog, agents, canManage, onAdd, onEdit }) {
  if (!catalog || !agents) return <p className="rounded-2xl bg-white p-10 text-center text-[12.5px] text-gray-400 shadow-card">Loading…</p>;
  const findAgent = (role) => agents.find((a) => a.template === role.key) || agents.find((a) => a.name.toLowerCase() === role.name.toLowerCase());
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-gray-500">
        Your AI organisation. Green = running. "Add" creates the agent (you then put its key on the server). Specialists work on tasks you or the CEO assign in the Tasks tab and only write drafts for review.
      </p>
      {catalog.map((team) => {
        const running = team.roles.filter((r) => findAgent(r)).length;
        return (
          <div key={team.key} className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="border-b border-gray-100 px-4 py-3">
              <p className="text-[14px] font-bold text-gray-900">
                {team.name} <span className="text-[12px] font-normal text-gray-400">· {running}/{team.roles.length} agents</span>
              </p>
              <p className="text-[12px] text-gray-500">{team.description}</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {team.roles.map((r) => {
                const a = findAgent(r);
                const [label, cls] = HOW[r.how] || HOW.planned;
                return (
                  <li key={r.key} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${a ? (a.active ? "bg-emerald-500" : "bg-gray-300") : "bg-gray-200"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-gray-800">
                        {r.name} <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
                      </p>
                      <p className="text-[11.5px] text-gray-500">{r.description}</p>
                      {a && <p className="text-[11px] text-gray-400">{a.active ? "On" : "Off"} · last seen {a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "never (key not on server yet?)"}</p>}
                    </div>
                    {canManage && a && <button className={ghostCls} onClick={() => onEdit(a)}>Edit</button>}
                    {canManage && !a && r.how !== "planned" && <button className={btnCls} onClick={() => onAdd(r, team.key)}>Add</button>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
