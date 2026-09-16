import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const TABS = ["All", "open", "in_review", "resolved", "rejected"];
const TAB_LABEL = { All: "All", open: "Open", in_review: "In Review", resolved: "Resolved", rejected: "Rejected" };
const STATUS_STYLES = {
  open: "bg-amber-100 text-amber-700",
  in_review: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-gray-200 text-gray-600",
};

export default function DisputesPage() {
  const { showToast } = useApp();
  const [disputes, setDisputes] = useState(null);
  const [tab, setTab] = useState("All");
  const [noteDraft, setNoteDraft] = useState({});
  const [busyId, setBusyId] = useState(null);

  const refresh = () =>
    api
      .listDisputes(tab === "All" ? undefined : tab)
      .then(setDisputes)
      .catch((e) => {
        showToast(e.message || "Failed to load disputes");
        setDisputes([]);
      });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const setStatus = async (dispute, status) => {
    setBusyId(dispute.id);
    try {
      await api.updateDispute(dispute.id, { status, resolutionNote: noteDraft[dispute.id] ?? dispute.resolutionNote ?? "" });
      showToast(`Dispute marked ${TAB_LABEL[status] || status}`);
      refresh();
    } catch (e) {
      showToast(e.message || "Failed to update dispute");
    } finally {
      setBusyId(null);
    }
  };

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

      <div className="space-y-3">
        {disputes === null && <p className="py-10 text-center text-sm text-gray-400">Loading…</p>}
        {disputes?.length === 0 && <p className="py-10 text-center text-sm text-gray-400">No disputes.</p>}
        {disputes?.map((d) => (
          <div key={d.id} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLES[d.status]}`}>
                    {TAB_LABEL[d.status] || d.status}
                  </span>
                  <span className="text-[10.5px] text-gray-400">
                    Raised by {d.raisedBy === "provider" ? "provider" : "customer"}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold text-gray-900">{d.category}</p>
                <p className="mt-0.5 text-[12.5px] text-gray-600">{d.description}</p>
              </div>
              <p className="text-[10.5px] text-gray-400">
                {new Date(d.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-gray-500 sm:grid-cols-4">
              <span>Booking #{d.bookingId}</span>
              {d.orderId && <span>Order #{d.orderId}</span>}
              <span>{d.serviceName}</span>
              <span>{d.customerName} / {d.providerName}</span>
            </div>

            {d.resolutionNote && d.status !== "open" && d.status !== "in_review" && (
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-600">
                <span className="font-semibold">Resolution: </span>
                {d.resolutionNote}
              </p>
            )}

            {(d.status === "open" || d.status === "in_review") && (
              <div className="mt-3 space-y-2 border-t border-gray-50 pt-3">
                <textarea
                  value={noteDraft[d.id] ?? d.resolutionNote ?? ""}
                  onChange={(e) => setNoteDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  rows={2}
                  placeholder="Resolution note (shown to whoever filed this)..."
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-800 outline-none placeholder:text-gray-400"
                />
                <div className="flex flex-wrap gap-2">
                  {d.status === "open" && (
                    <button
                      onClick={() => setStatus(d, "in_review")}
                      disabled={busyId === d.id}
                      className="rounded-lg bg-blue-100 px-3 py-1.5 text-[12px] font-semibold text-blue-700 disabled:opacity-50"
                    >
                      Mark In Review
                    </button>
                  )}
                  <button
                    onClick={() => setStatus(d, "resolved")}
                    disabled={busyId === d.id}
                    className="rounded-lg bg-emerald-100 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 disabled:opacity-50"
                  >
                    Mark Resolved
                  </button>
                  <button
                    onClick={() => setStatus(d, "rejected")}
                    disabled={busyId === d.id}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-600 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
