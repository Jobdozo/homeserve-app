import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

export default function CustomersPage() {
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
