import { useState } from "react";
import { useNavigate } from "react-router-dom";
import QuickActionModal from "../components/QuickActionModal";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useApp } from "../context/AppContext";
import StatCard from "../components/StatCard";
import { StarIcon, GridIcon, PlusIcon, BellIcon, ChartIcon, AlertIcon, UsersIcon } from "../components/icons";
import CategoryIcon from "../components/CategoryIcon";

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

const quickActions = [
  { icon: "🗂️", label: "Add Category", type: "category" },
  { icon: "🧰", label: "Add Service", type: "service" },
  { icon: "🧑‍🔧", label: "Add Provider", type: "provider" },
  { icon: "🖼️", label: "Add Banner", type: "banner" },
  { icon: "🔔", label: "Send Notification", type: "notification" },
  { icon: "🎟️", label: "Manage Offers", type: "offer" },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { overview, activities } = useApp();
  const [activeModal, setActiveModal] = useState(null);
  if (!overview) return null;

  const { totals, bookingsByDay, recentBookings, verification, topServices, systemOverview } = overview;

  const chartData = bookingsByDay.map((d) => ({
    day: new Date(d.day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    Bookings: d.bookings,
    Completed: d.completed,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon="👥" label="Total Users" value={totals.totalUsers} tone="purple" />
        <StatCard icon="🧰" label="Service Providers" value={totals.totalProviders} tone="green" />
        <StatCard icon="📅" label="Total Bookings" value={totals.totalBookings} tone="blue" />
        <StatCard
          icon="💰"
          label="Total Revenue"
          value={`₹${totals.totalRevenue.toLocaleString("en-IN")}`}
          tone="amber"
        />
        <StatCard icon="🕒" label="Pending Requests" value={totals.pendingRequests} tone="red" />
        <StatCard icon="⭐" label="Average Rating" value={totals.averageRating || "—"} tone="brand" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-card xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-gray-900">Bookings Overview</h2>
            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-500">
              Last 7 days
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="bookingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B3FE0" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5B3FE0" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F5" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={24} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #eee" }} />
                <Area type="monotone" dataKey="Bookings" stroke="#5B3FE0" strokeWidth={2} fill="url(#bookingsGrad)" />
                <Area type="monotone" dataKey="Completed" stroke="#16A34A" strokeWidth={2} fill="url(#completedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-gray-900">Recent Bookings</h2>
            <button onClick={() => navigate("/bookings")} className="text-[11.5px] font-semibold text-brand">
              View All
            </button>
          </div>
          <div className="space-y-1">
            {recentBookings.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 hover:bg-gray-50">
                <CategoryIcon categoryId={b.service?.categoryId} size={36} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-gray-900">#{b.id}</p>
                  <p className="truncate text-[11px] text-gray-400">{b.customer?.name}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyles[b.status]}`}>
                  {b.status}
                </span>
              </div>
            ))}
            {recentBookings.length === 0 && <p className="py-6 text-center text-xs text-gray-400">No bookings yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-gray-900">Provider Verification</h2>
            <button onClick={() => navigate("/providers")} className="text-[11.5px] font-semibold text-brand">
              View All
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <VerificationBox label="Pending" value={verification.pending} tone="amber" />
            <VerificationBox label="Approved" value={verification.approved} tone="green" />
            <VerificationBox label="Rejected" value={verification.rejected} tone="red" />
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card xl:col-span-2">
          <h2 className="mb-3 text-[14px] font-bold text-gray-900">Top Performing Services</h2>
          <div className="no-scrollbar overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[12px]">
              <thead>
                <tr className="text-gray-400">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">Bookings</th>
                  <th className="pb-2 font-medium">Revenue</th>
                  <th className="pb-2 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {topServices.map((s) => (
                  <tr key={s.id} className="border-t border-gray-50">
                    <td className="flex items-center gap-2 py-2.5 font-medium text-gray-800">
                      <CategoryIcon categoryId={s.categoryId} size={26} rounded="rounded-lg" /> {s.name}
                    </td>
                    <td className="py-2.5 text-gray-500">{s.providerName}</td>
                    <td className="py-2.5 text-gray-700">{s.totalBookings}</td>
                    <td className="py-2.5 font-semibold text-gray-900">₹{s.revenue.toLocaleString("en-IN")}</td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-1 text-gray-700">
                        <StarIcon filled width={12} height={12} /> {s.rating || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="mb-3 text-[14px] font-bold text-gray-900">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={() => setActiveModal(a.type)}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-gray-50 py-3 text-center hover:bg-gray-100"
              >
                <span className="text-lg">{a.icon}</span>
                <span className="px-1 text-[10px] font-medium leading-tight text-gray-600">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <h2 className="mb-3 text-[14px] font-bold text-gray-900">System Overview</h2>
          <OverviewRow icon={<GridIcon width={14} height={14} />} label="Active Services" value={systemOverview.activeServices} />
          <OverviewRow icon={<UsersIcon width={14} height={14} />} label="Active Providers" value={systemOverview.totalProviders} />
          <OverviewRow icon={<ChartIcon width={14} height={14} />} label="Total Categories" value={systemOverview.totalCategories} />
          <OverviewRow icon={<StarIcon filled width={14} height={14} />} label="Total Reviews" value={systemOverview.totalReviews} last />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-bold text-gray-900">Recent Activities</h2>
            <BellIcon width={15} height={15} className="text-gray-300" />
          </div>
          <div className="no-scrollbar max-h-52 space-y-2.5 overflow-y-auto">
            {activities.slice(0, 6).map((a) => (
              <div key={a.id} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />
                <div className="min-w-0">
                  <p className="text-[12px] leading-snug text-gray-700">{a.message}</p>
                  <p className="text-[10.5px] text-gray-400">{new Date(a.time).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
            {activities.length === 0 && <p className="py-6 text-center text-xs text-gray-400">No activity yet.</p>}
          </div>
        </div>
      </div>

      {activeModal && <QuickActionModal type={activeModal} onClose={() => setActiveModal(null)} />}
    </div>
  );
}

function VerificationBox({ label, value, tone }) {
  const styles = {
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className={`rounded-xl px-2 py-3 text-center ${styles[tone]}`}>
      <p className="text-lg font-extrabold">{value}</p>
      <p className="text-[10px] font-medium">{label}</p>
    </div>
  );
}

function OverviewRow({ icon, label, value, last }) {
  return (
    <div className={`flex items-center justify-between py-2 ${last ? "" : "border-b border-gray-50"}`}>
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-[12.5px]">{label}</span>
      </div>
      <span className="text-[12.5px] font-bold text-gray-900">{value}</span>
    </div>
  );
}
