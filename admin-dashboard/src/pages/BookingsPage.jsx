import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import CategoryIcon from "../components/CategoryIcon";
import BookingDetailModal from "../components/BookingDetailModal";

const TABS = ["All", "Pending", "Accepted", "In Progress", "Completed", "Rejected", "Cancelled"];

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

export default function BookingsPage() {
  const { bookings, providers } = useApp();
  const [tab, setTab] = useState("All");
  const [openBookingId, setOpenBookingId] = useState(null);

  const providerName = (id) => providers.find((p) => p.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (tab === "All") return sorted;
    return sorted.filter((b) => b.status === tab);
  }, [bookings, tab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-colors ${
              tab === t ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Booking ID</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setOpenBookingId(b.id)}
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-4 py-3 font-semibold text-gray-800">#{b.id}</td>
                  <td className="flex items-center gap-2 px-4 py-3 text-gray-700">
                    <CategoryIcon categoryId={b.service?.categoryId} size={28} rounded="rounded-lg" /> {b.service?.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{b.customer?.name}</td>
                  <td className="px-4 py-3 text-gray-500">{providerName(b.providerId)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(b.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">₹{b.amount}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusStyles[b.status]}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No {tab.toLowerCase()} bookings.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openBookingId && <BookingDetailModal bookingId={openBookingId} onClose={() => setOpenBookingId(null)} />}
    </div>
  );
}
