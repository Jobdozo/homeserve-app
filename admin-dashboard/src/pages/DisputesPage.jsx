import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { CheckIcon, XIcon } from "../components/icons";

const TABS = ["Pending", "Approved", "Rejected", "All"];

const statusStyles = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

export default function DisputesPage() {
  const { bookings, providers, showToast } = useApp();
  const [claims, setClaims] = useState(null);
  const [tab, setTab] = useState("Pending");
  const [busyId, setBusyId] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});

  const load = () => api.listRefundClaims().then(setClaims).catch(() => setClaims([]));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = (claims || []).filter((c) => tab === "All" || c.status === tab.toLowerCase());

  const resolve = async (claim, status) => {
    setBusyId(claim.id);
    try {
      await api.resolveRefundClaim(claim.id, status, noteDraft[claim.id]);
      showToast(`Claim ${status}`);
      await load();
    } catch (err) {
      showToast(err.message || "Failed to update claim");
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
            {t}
          </button>
        ))}
      </div>

      {claims === null && <p className="py-16 text-center text-sm text-gray-400">Loading…</p>}
      {claims !== null && filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-gray-400">No {tab.toLowerCase()} refund claims.</p>
      )}

      {filtered.map((claim) => {
        const booking = bookings.find((b) => b.id === claim.bookingId);
        const providerName = providers.find((p) => p.id === booking?.providerId)?.name || "—";
        return (
          <div key={claim.id} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900">
                  {booking?.customer?.name || claim.customerId} · Booking #{claim.bookingId}
                </p>
                <p className="text-[11.5px] text-gray-400">
                  {booking?.service?.name || "Service"} · {providerName}
                </p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusStyles[claim.status]}`}>
                {claim.status}
              </span>
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-gray-600">{claim.reason}</p>
            <p className="mt-2 text-[11px] text-gray-400">
              Submitted {new Date(claim.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>

            {claim.status === "pending" ? (
              <div className="mt-3 space-y-2">
                <input
                  value={noteDraft[claim.id] || ""}
                  onChange={(e) => setNoteDraft((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                  placeholder="Note to customer (optional)"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand"
                />
                <div className="flex gap-2">
                  <button
                    disabled={busyId === claim.id}
                    onClick={() => resolve(claim, "rejected")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-[12px] font-semibold text-red-600 active:scale-[0.98] disabled:opacity-50"
                  >
                    <XIcon width={13} height={13} /> Reject
                  </button>
                  <button
                    disabled={busyId === claim.id}
                    onClick={() => resolve(claim, "approved")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-[12px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
                  >
                    <CheckIcon width={13} height={13} /> Approve
                  </button>
                </div>
              </div>
            ) : (
              claim.adminNote && (
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-500">Note: {claim.adminNote}</p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
