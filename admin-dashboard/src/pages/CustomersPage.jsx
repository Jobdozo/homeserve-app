import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const TABS = [
  ["customers", "Customers"],
  ["attempts", "Login attempts"],
  ["deleted", "Deleted accounts"],
];

const when = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

const digits = (phone) => String(phone || "").replace(/\D/g, "");

const ATTEMPT_RESULT = {
  sent: "Code sent",
  "dev-code": "Code sent",
  "send-failed": "Code could not be sent",
  "not-admin": "Not an admin number",
  "wrong-code": "Entered a wrong code",
};

const STATUS_STYLE = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-green-100 text-green-700",
  ignored: "bg-gray-100 text-gray-500",
  "no-contact": "bg-gray-100 text-gray-500",
};

function StatusPill({ status }) {
  const label = status === "no-contact" ? "No contact details" : status.charAt(0).toUpperCase() + status.slice(1);
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.new}`}>{label}</span>;
}

function CallLinks({ phone }) {
  if (!phone) return <span className="text-gray-400">—</span>;
  const d = digits(phone);
  const wa = d.length === 10 ? `91${d}` : d;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={`tel:${phone.replace(/\s/g, "")}`} className="font-semibold text-brand hover:underline">
        {phone}
      </a>
      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-green-600 hover:underline">
        WhatsApp
      </a>
    </span>
  );
}

// Edit a follow-up note inline; saved when the field loses focus.
function NoteField({ value, onSave, disabled }) {
  const [text, setText] = useState(value || "");
  useEffect(() => setText(value || ""), [value]);
  return (
    <input
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value.slice(0, 500))}
      onBlur={() => text !== (value || "") && onSave(text)}
      placeholder={disabled ? "" : "Add a note…"}
      className="w-full min-w-[160px] rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-700 outline-none focus:border-brand disabled:bg-gray-50"
    />
  );
}

function Filters({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([id, label, count]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
            value === id ? "bg-brand text-white" : "bg-white text-gray-600 shadow-card hover:bg-gray-50"
          }`}
        >
          {label}
          {count !== undefined && <span className="ml-1.5 opacity-70">{count}</span>}
        </button>
      ))}
    </div>
  );
}

function LoginAttempts({ canEdit }) {
  const { showToast } = useApp();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("new");

  useEffect(() => {
    api
      .listLoginAttempts()
      .then(setRows)
      .catch((e) => {
        showToast(e.message || "Failed to load login attempts");
        setRows([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (id, body) => {
    try {
      const updated = await api.updateLoginAttempt(id, body);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (e) {
      showToast(e.message || "Couldn't save");
    }
  };

  const counts = useMemo(() => {
    const c = { new: 0, contacted: 0, ignored: 0 };
    (rows || []).forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [rows]);
  const shown = (rows || []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters
          value={filter}
          onChange={setFilter}
          options={[
            ["new", "To follow up", counts.new],
            ["contacted", "Contacted", counts.contacted],
            ["ignored", "Ignored", counts.ignored],
            ["all", "All", (rows || []).length],
          ]}
        />
        <p className="max-w-md text-[11.5px] text-gray-400">
          People who asked for a login code but never finished signing up or signing in. Kept for 90 days.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Tried to sign in as</th>
                <th className="px-4 py-3 font-medium">What happened</th>
                <th className="px-4 py-3 font-medium">Tries</th>
                <th className="px-4 py-3 font-medium">Last tried</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Note</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 align-top last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <CallLinks phone={r.phone} />
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-700">{r.role}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.verified && !r.hasAccount ? "Verified the code but never finished signing up" : ATTEMPT_RESULT[r.lastResult] || r.lastResult}
                    {r.failedCodes > 0 && <span className="block text-[11px] text-gray-400">{r.failedCodes} wrong code{r.failedCodes === 1 ? "" : "s"}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.requests}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {when(r.lastAt)}
                    {r.firstAt !== r.lastAt && <span className="block text-[11px] text-gray-400">First: {when(r.firstAt)}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                    {r.status === "contacted" && r.contactedBy && <span className="mt-1 block text-[11px] text-gray-400">by {r.contactedBy}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <NoteField value={r.note} disabled={!canEdit} onSave={(note) => patch(r.id, { note })} />
                  </td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <span className="flex gap-2 whitespace-nowrap">
                        {r.status !== "contacted" && (
                          <button onClick={() => patch(r.id, { status: "contacted" })} className="text-[12px] font-semibold text-brand hover:underline">
                            Mark contacted
                          </button>
                        )}
                        {r.status !== "ignored" && (
                          <button onClick={() => patch(r.id, { status: "ignored" })} className="text-[12px] font-semibold text-gray-400 hover:underline">
                            Ignore
                          </button>
                        )}
                        {r.status !== "new" && (
                          <button onClick={() => patch(r.id, { status: "new" })} className="text-[12px] font-semibold text-gray-400 hover:underline">
                            Reopen
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows !== null && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    {filter === "new" ? "Nobody is waiting for a follow-up." : "Nothing here."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DeletedAccounts({ canEdit }) {
  const { showToast } = useApp();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("reachable");

  useEffect(() => {
    api
      .listDeletedAccounts()
      .then(setRows)
      .catch((e) => {
        showToast(e.message || "Failed to load deleted accounts");
        setRows([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (id, body) => {
    try {
      const updated = await api.updateDeletedAccount(id, body);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch (e) {
      showToast(e.message || "Couldn't save");
    }
  };

  const all = rows || [];
  const reachable = all.filter((r) => r.contactOk);
  const shown = filter === "reachable" ? reachable : filter === "reasons" ? all.filter((r) => !r.contactOk) : all;

  // Why people leave, most common first — the point of keeping these records.
  const reasonCounts = useMemo(() => {
    const m = new Map();
    all.forEach((r) => m.set(r.reasonLabel, (m.get(r.reasonLabel) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters
          value={filter}
          onChange={setFilter}
          options={[
            ["reachable", "Agreed to be contacted", reachable.length],
            ["reasons", "Reason only", all.length - reachable.length],
            ["all", "All", all.length],
          ]}
        />
        <p className="max-w-md text-[11.5px] text-gray-400">
          Name and phone are kept only when the person ticked the box when deleting. Everyone else shows just their reason.
        </p>
      </div>

      {reasonCounts.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-card">
          {reasonCounts.map(([label, n]) => (
            <span key={label} className="rounded-full bg-gray-100 px-3 py-1 text-[12px] text-gray-600">
              {label} <span className="font-bold text-gray-900">{n}</span>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Deleted</th>
                <th className="px-4 py-3 font-medium">Why they left</th>
                <th className="px-4 py-3 font-medium">Bookings</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Follow-up note</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows === null && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 align-top last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-800">{r.name || "Not shared"}</span>
                    <span className="block text-[11px] capitalize text-gray-400">{r.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <CallLinks phone={r.phone} />
                    {r.detail && <span className="block text-[11px] text-gray-400">{r.detail}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{when(r.at)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.reasonLabel}
                    {r.note && <span className="mt-1 block max-w-[260px] text-[12px] italic text-gray-500">“{r.note}”</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.bookings}
                    {r.completed > 0 && <span className="block text-[11px] text-gray-400">{r.completed} completed</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.contactOk ? r.status : "no-contact"} />
                    {r.contactOk && r.status === "contacted" && r.contactedBy && <span className="mt-1 block text-[11px] text-gray-400">by {r.contactedBy}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <NoteField value={r.followUpNote} disabled={!canEdit} onSave={(followUpNote) => patch(r.id, { followUpNote })} />
                  </td>
                  <td className="px-4 py-3">
                    {canEdit && r.contactOk && (
                      <span className="flex gap-2 whitespace-nowrap">
                        {r.status !== "contacted" ? (
                          <button onClick={() => patch(r.id, { status: "contacted" })} className="text-[12px] font-semibold text-brand hover:underline">
                            Mark contacted
                          </button>
                        ) : (
                          <button onClick={() => patch(r.id, { status: "new" })} className="text-[12px] font-semibold text-gray-400 hover:underline">
                            Reopen
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows !== null && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    No records here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AllCustomers() {
  const { showToast } = useApp();
  const [customers, setCustomers] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((e) => {
        showToast(e.message || "Failed to load customers");
        setCustomers([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    );
  }, [customers, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-3 shadow-card">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, or email…"
          className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand"
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Bookings</th>
                <th className="px-4 py-3 font-medium">Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {customers === null && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="flex items-center gap-2 px-4 py-3 font-semibold text-gray-800">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-sm">
                      {c.avatar || "🧑"}
                    </span>
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{c.totalBookings}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">₹{c.totalSpent.toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {customers !== null && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { can } = useApp();
  const [tab, setTab] = useState("customers");
  const canEdit = can("customers.edit");

  return (
    <div className="space-y-4">
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold ${
              tab === id ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "customers" && <AllCustomers />}
      {tab === "attempts" && <LoginAttempts canEdit={canEdit} />}
      {tab === "deleted" && <DeletedAccounts canEdit={canEdit} />}
    </div>
  );
}
