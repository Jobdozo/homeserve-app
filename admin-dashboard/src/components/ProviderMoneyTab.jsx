import { useEffect, useState } from "react";
import { api } from "../api";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const LABEL = { recharge: "Recharge", fee: "Platform fee", refund: "Refund", deduction: "Deduction" };

// Money: wallet history (recharges, the fee taken on each order), and the GST invoices for those fees.
export default function ProviderMoneyTab({ providerId, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("ledger");

  useEffect(() => {
    api.getProviderMoney(providerId).then(setData).catch((e) => setError(e.message || "Couldn't load the wallet history"));
  }, [providerId, refreshKey]);

  if (error) return <p className="rounded-xl bg-red-50 p-4 text-[12.5px] text-red-600">{error}</p>;
  if (!data) return <p className="text-[12.5px] text-gray-400">Loading wallet history…</p>;
  return (
    <div className="space-y-4">
      {data.low && (
        <p className={`rounded-xl px-4 py-3 text-[12.5px] font-semibold ${data.balance <= 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          {data.balance <= 0 ? "The wallet is empty — this provider isn't getting new requests until it's recharged." : `The wallet is low (${inr(data.balance)}). Remind the provider to recharge.`}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Balance", inr(data.balance)],
          ["Recharged in total", inr(data.totals.recharged)],
          ["Fees taken in total", inr(data.totals.fees)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-100 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-1 text-[18px] font-bold tabular-nums text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        {[
          ["ledger", `Wallet history (${data.ledger.length})`],
          ["fees", `Fee per order (${data.fees.length})`],
          ["invoices", `GST invoices (${data.invoices.length})`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${view === key ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="max-h-[50vh] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full text-left text-[12.5px]">
          <tbody>
            {view === "ledger" &&
              data.ledger.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{when(r.at)}</td>
                  <td className="px-3 py-2 text-gray-800">
                    {LABEL[r.type] || r.type}
                    {r.note ? <span className="text-gray-400"> · {r.note}</span> : null}
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${r.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {r.amount < 0 ? "−" : "+"}
                    {inr(Math.abs(r.amount))}
                  </td>
                </tr>
              ))}
            {view === "fees" &&
              data.fees.map((f) => (
                <tr key={f.bookingId} className="border-b border-gray-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{when(f.at)}</td>
                  <td className="px-3 py-2 text-gray-800">
                    #{f.ref} · {f.service || "Service"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-800">{inr(f.fee)}</td>
                </tr>
              ))}
            {view === "invoices" &&
              data.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{inv.date}</td>
                  <td className="px-3 py-2 text-gray-800">
                    <span className="font-mono text-[11.5px]">{inv.number}</span> · {inv.type === "credit_note" ? "Credit note" : "Tax invoice"}
                    {inv.bookingRef ? <span className="text-gray-400"> · #{inv.bookingRef}</span> : null}
                    {inv.status === "cancelled" ? <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">cancelled</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-800">{inr(inv.total)}</td>
                </tr>
              ))}
            {((view === "ledger" && !data.ledger.length) || (view === "fees" && !data.fees.length) || (view === "invoices" && !data.invoices.length)) && (
              <tr>
                <td className="px-3 py-8 text-center text-gray-400">Nothing yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {view === "invoices" && data.invoices.length > 0 && <p className="text-[11px] text-gray-400">Open Accounting &amp; GST to print or download an invoice.</p>}
    </div>
  );
}
