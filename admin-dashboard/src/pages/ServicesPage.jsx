import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { StarIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";

const TABS = ["All", "Active", "Inactive", "Draft"];

const statusStyles = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-200 text-gray-600",
  draft: "bg-amber-100 text-amber-700",
};

export default function ServicesPage() {
  const { services, providers, toggleServiceStatus } = useApp();
  const [tab, setTab] = useState("All");

  const providerName = (id) => providers.find((p) => p.id === id)?.name || "—";

  const filtered = useMemo(() => {
    if (tab === "All") return services;
    return services.filter((s) => s.status === tab.toLowerCase());
  }, [services, tab]);

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
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400">
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Moderate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const pct = discountPct(s.price, s.originalPrice);
                return (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="flex items-center gap-2 px-4 py-3 font-semibold text-gray-800">
                    <CategoryIcon categoryId={s.categoryId} size={28} rounded="rounded-lg" /> {s.name}
                  </td>
                  <td className="px-4 py-3 text-gray-500 capitalize">{s.categoryId?.replace(/-/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-500">{providerName(s.providerId)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900">₹{s.price}</span>
                      {pct > 0 && (
                        <>
                          <span className="text-[11px] text-gray-400 line-through">₹{s.originalPrice}</span>
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                            {pct}% OFF
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {s.reviewCount > 0 ? (
                      <span className="flex items-center gap-1 text-gray-700">
                        <StarIcon filled width={12} height={12} /> {s.rating} ({formatCount(s.reviewCount)})
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${statusStyles[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.status !== "draft" && (
                      <button
                        onClick={() => toggleServiceStatus(s.id, s.status)}
                        className="switch"
                        data-on={s.status === "active"}
                        aria-label={`Toggle ${s.name}`}
                      >
                        <span className="switch-knob" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No {tab.toLowerCase()} services.
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
