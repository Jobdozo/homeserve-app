import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { StarIcon, CheckIcon, XIcon } from "../components/icons";

const TABS = ["All", "Pending", "Approved", "Rejected"];

const verificationStyles = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

export default function ProvidersPage() {
  const { providers, approveProvider, rejectProvider } = useApp();
  const [tab, setTab] = useState("All");

  const filtered = useMemo(() => {
    if (tab === "All") return providers;
    return providers.filter((p) => p.verificationStatus === tab.toLowerCase());
  }, [providers, tab]);

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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-2xl">
                {p.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-gray-900">{p.name}</p>
                <p className="truncate text-[11.5px] text-gray-500">{p.category}</p>
                {p.reviews > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                    <StarIcon filled width={12} height={12} /> {p.rating} ({p.reviews}+ reviews)
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-400">No reviews yet</p>
                )}
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verificationStyles[p.verificationStatus]}`}
              >
                {p.verificationStatus}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              <span>{p.live ? "🟢 Connected via Provider App" : "⚪ Managed by admin (no live app)"}</span>
            </div>

            {p.phone && <p className="mt-2 text-[11.5px] text-gray-400">{p.phone}</p>}

            {p.verificationStatus === "pending" && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => rejectProvider(p.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-[12px] font-semibold text-red-600 active:scale-[0.98]"
                >
                  <XIcon width={13} height={13} /> Reject
                </button>
                <button
                  onClick={() => approveProvider(p.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-[12px] font-semibold text-white active:scale-[0.98]"
                >
                  <CheckIcon width={13} height={13} /> Approve
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-gray-400">No {tab.toLowerCase()} providers.</p>
        )}
      </div>
    </div>
  );
}
