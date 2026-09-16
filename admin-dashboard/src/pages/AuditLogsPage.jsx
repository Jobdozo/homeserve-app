import { useEffect, useState } from "react";
import { api } from "../api";

const TABS = ["All", "booking", "provider", "service", "review", "dispute"];
const TAB_LABEL = { All: "All", booking: "Bookings", provider: "Providers", service: "Services", review: "Reviews", dispute: "Disputes" };
const TYPE_STYLES = {
  booking: "bg-blue-100 text-blue-700",
  provider: "bg-violet-100 text-violet-700",
  service: "bg-emerald-100 text-emerald-700",
  review: "bg-amber-100 text-amber-700",
  dispute: "bg-red-100 text-red-700",
};

export default function AuditLogsPage() {
  const [activities, setActivities] = useState([]);
  const [tab, setTab] = useState("All");

  // Fetched per-tab from the server (not filtered client-side out of one
  // capped list) — a low-volume type like "review" can otherwise have every
  // one of its entries pushed out of the most-recent-N window by noisier
  // types (bookings, services) long before it ever shows up.
  useEffect(() => {
    api.listActivities(100, tab === "All" ? undefined : tab).then(setActivities);
  }, [tab]);

  const filtered = activities;

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
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-card">
        {filtered.length === 0 && <p className="py-10 text-center text-sm text-gray-400">No activity yet.</p>}
        <div className="divide-y divide-gray-50">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-3 py-3">
              <span className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_STYLES[a.type] || "bg-gray-100 text-gray-600"}`}>
                {a.type}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-gray-700">{a.message}</p>
                <p className="mt-0.5 text-[10.5px] text-gray-400">
                  {new Date(a.time).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
