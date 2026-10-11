import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const STATUS_STYLE = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-100 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
  Swapped: "bg-violet-100 text-violet-700",
};
const FILTERS = ["All", "Pending", "Accepted", "In Progress", "Completed", "Cancelled"];
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);

// Orders & performance: the numbers that decide who gets work, then this provider's orders.
export default function ProviderOrdersTab({ providerId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    setData(null);
    api.getProviderPerformance(providerId).then(setData).catch((e) => setError(e.message || "Couldn't load orders"));
  }, [providerId]);

  const rows = useMemo(() => (data ? data.bookings.filter((b) => filter === "All" || b.status === filter) : []), [data, filter]);
  if (error) return <p className="rounded-xl bg-red-50 p-4 text-[12.5px] text-red-600">{error}</p>;
  if (!data) return <p className="text-[12.5px] text-gray-400">Loading orders…</p>;
  const s = data.stats;
  const maxEarn = Math.max(1, ...s.earningsByMonth.map((m) => m.amount));
  const tiles = [
    ["Acceptance rate", pct(s.acceptanceRate), `${s.declined} declined · ${s.timedOut} timed out`],
    ["Avg. response", s.avgResponseSeconds === null ? "—" : s.avgResponseSeconds < 60 ? `${s.avgResponseSeconds} sec` : `${Math.round(s.avgResponseSeconds / 60)} min`, "from request to accept"],
    ["Completion rate", pct(s.completionRate), `${s.completed} completed`],
    ["Cancelled", s.cancelled, "by customer or support"],
    ["Complaints", s.complaints, `${s.openComplaints} open`],
    ["Orders", s.total, `${s.pending} new · ${s.open} in hand`],
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-gray-100 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-1 text-[20px] font-bold tabular-nums text-gray-900">{value}</p>
            <p className="text-[11px] text-gray-400">{hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-100 p-4">
        <p className="text-[13px] font-bold text-gray-900">Last 6 months</p>
        <div className="mt-3 grid grid-cols-6 items-end gap-3">
          {s.earningsByMonth.map((m, i) => {
            const r = s.ratingByMonth[i];
            return (
              <div key={m.month} className="flex flex-col items-center gap-1 text-center">
                <span className="text-[11px] font-semibold tabular-nums text-gray-700">₹{m.amount.toLocaleString("en-IN")}</span>
                <div className="flex h-24 w-full items-end rounded bg-gray-50">
                  <div className="w-full rounded bg-brand/70" style={{ height: `${Math.max(2, (m.amount / maxEarn) * 100)}%` }} title={`${m.jobs} jobs`} />
                </div>
                <span className="text-[11px] text-gray-500">{monthName(m.month)}</span>
                <span className="text-[10.5px] text-gray-400">
                  {m.jobs} job{m.jobs === 1 ? "" : "s"}
                  {r?.average ? ` · ★ ${r.average}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100">
        <div className="flex flex-wrap gap-1.5 border-b border-gray-100 p-3">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${filter === f ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-gray-50">
                  <td className="px-3 py-2 font-mono text-[11.5px] text-gray-500">#{b.ref || b.id.slice(0, 8)}</td>
                  <td className="px-3 py-2 text-gray-800">{b.service || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{b.customer || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{b.date || String(b.createdAt).slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-800">₹{b.amount}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[b.status] || "bg-gray-100 text-gray-600"}`}>{b.status}</span>
                    {b.rating ? <span className="ml-1.5 text-[11px] text-amber-600">★ {b.rating}</span> : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                    No {filter === "All" ? "" : filter.toLowerCase()} orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">Time-outs are counted from today onwards; earlier declines are counted from requests left as Rejected.</p>
    </div>
  );
}
