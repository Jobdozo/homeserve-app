import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import CategoryIcon from "../components/CategoryIcon";
import BookingDetailModal from "../components/BookingDetailModal";
import { usePagedList, useDebounced } from "../utils/usePagedList";

const TABS = ["All", "Pending", "Accepted", "In Progress", "Completed", "Rejected", "Cancelled"];

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

// Every booking, newest first, a page at a time from the server (scaling step 5):
// the status tabs and the search box (booking code, customer, provider, service,
// phone) are worked out in the database, so this stays fast with any number of bookings.
export default function BookingsPage() {
  const { bookings, providers } = useApp();
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [openBooking, setOpenBooking] = useState(null);

  const list = usePagedList(
    ({ offset, limit }) => api.listBookingsPage({ status: tab === "All" ? undefined : tab, q: q || undefined, offset, limit }),
    `${tab}|${q}`
  );

  // Live updates: rows on screen take a new status as it happens, and a brand-new
  // booking (it arrives at the top of the app's recent list) refreshes the first page.
  const newest = useRef(bookings[0]?.id);
  useEffect(() => {
    list.patch(bookings);
    if (newest.current && bookings[0]?.id !== newest.current) list.reload();
    newest.current = bookings[0]?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  const providerName = (id) => providers.find((p) => p.id === id)?.name || "—";
  const rows = list.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, customer, provider, service or phone"
          aria-label="Search bookings"
          className="min-w-[240px] flex-1 rounded-2xl border border-gray-100 bg-white px-4 py-2.5 text-[13px] text-gray-800 shadow-card outline-none focus:border-brand"
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Request ID</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setOpenBooking(b)}
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="px-4 py-3 font-semibold text-gray-800">#{b.ref || b.id}</td>
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
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusStyles[b.status] || "bg-gray-100 text-gray-600"}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
              {list.items === null && !list.error && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    Loading bookings…
                  </td>
                </tr>
              )}
              {list.items !== null && rows.length === 0 && !list.error && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    {q ? `No bookings match “${q}”.` : `No ${tab === "All" ? "" : `${tab.toLowerCase()} `}bookings.`}
                  </td>
                </tr>
              )}
              {list.error && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-red-500">
                    {list.error}.{" "}
                    <button onClick={list.reload} className="font-semibold text-brand underline">
                      Try again
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-[12.5px] text-gray-500">
            <span>
              Showing {rows.length.toLocaleString("en-IN")} of {list.total.toLocaleString("en-IN")}
            </span>
            {list.hasMore && (
              <button
                onClick={list.loadMore}
                disabled={list.loading}
                className="rounded-xl border border-gray-200 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {list.loading ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>

      {openBooking && <BookingDetailModal bookingId={openBooking.id} fallback={openBooking} onClose={() => setOpenBooking(null)} />}
    </div>
  );
}
