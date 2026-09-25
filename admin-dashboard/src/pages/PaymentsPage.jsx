import { useEffect, useState } from "react";
import { api } from "../api";
import CategoryIcon from "../components/CategoryIcon";

export default function PaymentsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
  const totalFees = transactions.reduce((sum, t) => sum + t.platformFee, 0);
  const totalPayouts = transactions.reduce((sum, t) => sum + t.payout, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-[11px] text-gray-400">Total Revenue</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">₹{totalRevenue.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-[11px] text-gray-400">Communication Fees</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">₹{totalFees.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-[11px] text-gray-400">Provider Payouts</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-900">₹{totalPayouts.toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Platform Fee</th>
                <th className="px-4 py-3 font-medium">Payout</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-800">#{t.ref || t.id}</td>
                  <td className="flex items-center gap-2 px-4 py-3 text-gray-700">
                    <CategoryIcon categoryId={t.categoryId} size={26} rounded="rounded-lg" /> {t.service}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.providerName}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">₹{t.amount}</td>
                  <td className="px-4 py-3 text-red-500">-₹{t.platformFee}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">₹{t.payout}</td>
                </tr>
              ))}
              {!loading && transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No completed transactions yet.
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
