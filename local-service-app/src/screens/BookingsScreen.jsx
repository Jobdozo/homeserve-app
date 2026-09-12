import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import CategoryIcon from "../components/CategoryIcon";

const TABS = ["All", "Pending", "Accepted", "In Progress", "Completed"];

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

export default function BookingsScreen() {
  const navigate = useNavigate();
  const { bookings, getService } = useApp();
  const [tab, setTab] = useState("All");

  const filtered = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (tab === "All") return sorted;
    return sorted.filter((b) => b.status === tab);
  }, [bookings, tab]);

  // Bookings created from the same cart checkout share an orderId — group
  // those together; anything else (including pre-cart bookings) stays standalone.
  const groups = useMemo(() => {
    const byOrder = new Map();
    const standalone = [];
    filtered.forEach((b) => {
      if (b.orderId) {
        if (!byOrder.has(b.orderId)) byOrder.set(b.orderId, []);
        byOrder.get(b.orderId).push(b);
      } else {
        standalone.push(b);
      }
    });
    const result = [];
    byOrder.forEach((items, orderId) => {
      if (items.length > 1) result.push({ orderId, items });
      else standalone.push(items[0]);
    });
    standalone.forEach((b) => result.push({ orderId: null, items: [b] }));
    result.sort((a, b) => new Date(b.items[0].createdAt) - new Date(a.items[0].createdAt));
    return result;
  }, [filtered]);

  return (
    <div className="flex flex-1 flex-col lg:px-8 lg:py-8">
      <h1 className="px-4 pt-1 text-lg font-bold text-gray-900 lg:px-0 lg:pt-0 lg:text-2xl">My Bookings</h1>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mt-5 lg:flex-wrap lg:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors lg:px-4 lg:py-2 lg:text-sm ${
              tab === t ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 flex-1 space-y-3 px-4 pb-4 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-0">
        {groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-gray-50 py-12 text-center lg:col-span-2">
            <span className="text-3xl">🗓️</span>
            <p className="text-sm text-gray-500">No {tab !== "All" ? tab.toLowerCase() : ""} bookings yet.</p>
            <button onClick={() => navigate("/categories")} className="text-xs font-semibold text-brand">
              Book a service
            </button>
          </div>
        )}

        {groups.map((group) =>
          group.orderId ? (
            <div key={group.orderId} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-card lg:p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11.5px] font-semibold text-gray-500">
                  Order #{group.orderId} · {group.items.length} services
                </p>
                <p className="text-[12.5px] font-bold text-gray-900">
                  ₹{group.items.reduce((sum, b) => sum + b.amount, 0)}
                </p>
              </div>
              <div className="space-y-2">
                {group.items.map((b) => {
                  const service = getService(b.serviceId);
                  if (!service) return null;
                  return (
                    <BookingRow key={b.id} booking={b} service={service} onClick={() => navigate(`/booking/${b.id}`)} compact />
                  );
                })}
              </div>
            </div>
          ) : (
            (() => {
              const b = group.items[0];
              const service = getService(b.serviceId);
              if (!service) return null;
              return (
                <BookingRow
                  key={b.id}
                  booking={b}
                  service={service}
                  onClick={() => navigate(`/booking/${b.id}`)}
                  wrapped
                />
              );
            })()
          )
        )}
      </div>
    </div>
  );
}

function BookingRow({ booking: b, service, onClick, compact, wrapped }) {
  const row = (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 text-left ${
        wrapped ? "rounded-2xl bg-white p-3 shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.99] lg:p-4" : "rounded-xl hover:bg-gray-50"
      }`}
    >
      <CategoryIcon categoryId={service.categoryId} size={compact ? 44 : 56} className="lg:scale-110" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13.5px] font-semibold text-gray-900 lg:text-[15px]">{service.name}</p>
          <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyles[b.status]}`}>
            {b.status}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-gray-400">Booking ID: #{b.id}</p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[11px] text-gray-500 lg:text-[12.5px]">
            {formatDate(b.date)} · {b.time.split("–")[0].trim()}
          </p>
          {!compact && <p className="text-[12.5px] font-bold text-gray-900 lg:text-[14px]">₹{b.amount}</p>}
        </div>
      </div>
    </button>
  );
  return row;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
