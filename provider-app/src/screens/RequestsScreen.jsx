import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { FilterIcon, MapPinIcon } from "../components/icons";
import CategoryIcon from "../components/CategoryIcon";

// Each tab is a pure function of the booking's status, so a request moves
// between tabs by itself as the order workflow advances (Pending → Open once
// accepted → In Progress once the start OTP is verified → Completed), or to
// Rejected if declined/cancelled — no manual bookkeeping.
const TAB_STATUSES = {
  Pending: ["Pending"],
  Open: ["Accepted"],
  "In Progress": ["In Progress"],
  Completed: ["Completed"],
  Rejected: ["Rejected", "Cancelled"],
};
const TABS = Object.keys(TAB_STATUSES);

export default function RequestsScreen() {
  const navigate = useNavigate();
  const { requests, acceptRequest, rejectRequest, showToast } = useApp();
  const [tab, setTab] = useState("Pending");

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t, requests.filter((r) => TAB_STATUSES[t].includes(r.status)).length])),
    [requests]
  );

  const filtered = useMemo(() => {
    const sorted = [...requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted.filter((r) => TAB_STATUSES[tab].includes(r.status));
  }, [requests, tab]);

  return (
    <div className="flex flex-1 flex-col lg:px-8 lg:py-8">
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <h1 className="text-lg font-bold text-gray-900 lg:text-2xl">Incoming Requests</h1>
        <button
          onClick={() => showToast("Filters coming soon")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          <FilterIcon width={17} height={17} />
        </button>
      </div>

      <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto border-b border-gray-100 px-4 lg:mt-5 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-shrink-0 whitespace-nowrap pb-2.5 text-[13px] font-semibold lg:text-[14px] ${tab === t ? "text-brand" : "text-gray-400"}`}
          >
            {t} ({counts[t]})
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 px-4 py-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-0 lg:py-6">
        {filtered.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center lg:col-span-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-gray-500">No {tab.toLowerCase()} requests.</p>
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="rounded-2xl border border-gray-100 p-3 shadow-card lg:p-4">
            <button onClick={() => navigate(`/requests/${r.id}`)} className="flex w-full items-start gap-3 text-left">
              <CategoryIcon categoryId={r.service?.categoryId} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {r.status === "Pending" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700">
                      NEW
                    </span>
                  )}
                  <p className="truncate text-[13.5px] font-semibold text-gray-900">{r.service?.name}</p>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                  <MapPinIcon width={12} height={12} />
                  <span className="truncate">{r.address?.line}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10.5px] text-gray-400">{timeAgo(r.createdAt)}</span>
                  <span className="text-[13px] font-bold text-brand">₹{r.amount}</span>
                </div>
              </div>
            </button>
            {r.status === "Pending" && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => rejectRequest(r.id)}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50 active:scale-[0.98]"
                >
                  Reject
                </button>
                <button
                  onClick={() => acceptRequest(r.id)}
                  className="flex-1 rounded-lg bg-brand py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark active:scale-[0.98]"
                >
                  Accept
                </button>
              </div>
            )}
            {r.status !== "Pending" && (
              <div className="mt-2">
                <StatusPill status={r.status} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    Accepted: "bg-emerald-100 text-emerald-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Completed: "bg-gray-200 text-gray-600",
    Rejected: "bg-red-100 text-red-600",
    Cancelled: "bg-red-100 text-red-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}>{status}</span>;
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
