import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../api";
import { StarIcon } from "../components/icons";

const STATUS_COLORS = {
  Pending: "#F59E0B",
  Accepted: "#16A34A",
  "In Progress": "#2563EB",
  Completed: "#6B7280",
  Rejected: "#DC2626",
  Cancelled: "#DC2626",
};

export default function ReportsPage() {
  const [reports, setReports] = useState(null);

  useEffect(() => {
    api.getReports().then(setReports);
  }, []);

  if (!reports) return null;

  const categoryData = reports.revenueByCategory.map((c) => ({ name: c.categoryName, revenue: c.revenue }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[14px] font-bold text-gray-900">Revenue by Category</h2>
        {categoryData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No completed bookings yet.</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F5" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #eee" }} />
                <Bar dataKey="revenue" fill="#5B3FE0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="mb-3 text-[14px] font-bold text-gray-900">Booking Status Distribution</h2>
          <div className="space-y-2.5">
            {reports.statusDistribution.map((s) => {
              const total = reports.statusDistribution.reduce((sum, x) => sum + x.count, 0);
              const pct = total ? Math.round((s.count / total) * 100) : 0;
              return (
                <div key={s.status} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-24 flex-shrink-0 text-gray-500">{s.status}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: STATUS_COLORS[s.status] || "#9CA3AF" }}
                    />
                  </div>
                  <span className="w-14 flex-shrink-0 text-right font-semibold text-gray-700">
                    {s.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-gray-900">Provider Leaderboard</h2>
            <span className="text-[11px] text-gray-400">Platform revenue: ₹{reports.platformRevenue.toLocaleString("en-IN")}</span>
          </div>
          <div className="space-y-2">
            {reports.providerLeaderboard.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-gray-50 p-2.5">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500">
                  {i + 1}
                </span>
                <span className="text-lg">{p.avatar}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-gray-800">{p.name}</p>
                  <div className="flex items-center gap-1 text-[10.5px] text-gray-400">
                    <StarIcon filled width={10} height={10} /> {p.rating} · {p.completedBookings} completed
                  </div>
                </div>
                <p className="flex-shrink-0 text-[13px] font-bold text-gray-900">₹{p.revenue.toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
