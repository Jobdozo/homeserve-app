import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { PlusIcon, StarIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";

const TABS = ["Active", "Pending", "Rejected", "Inactive", "Draft"];
const TAB_STATUS = { Active: "active", Pending: "pending_approval", Rejected: "rejected", Inactive: "inactive", Draft: "draft" };

export default function ServicesScreen() {
  const navigate = useNavigate();
  const { services, toggleServiceStatus, resubmitService, showToast } = useApp();
  const [tab, setTab] = useState("Active");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ name: "", price: "" });
  const [resubmitting, setResubmitting] = useState(false);

  const startEdit = (s) => {
    setEditingId(s.id);
    setDraft({ name: s.name, price: String(s.price) });
  };
  const submitEdit = async (s) => {
    const price = Number(draft.price);
    if (!draft.name.trim() || !Number.isFinite(price) || price < 0) {
      showToast("Enter a name and a valid price");
      return;
    }
    setResubmitting(true);
    try {
      await resubmitService(s.id, { name: draft.name.trim(), price });
      setEditingId(null);
    } catch (e) {
      showToast(e.message || "Couldn't resubmit — please try again");
    } finally {
      setResubmitting(false);
    }
  };

  const counts = useMemo(
    () => ({
      Active: services.filter((s) => s.status === "active").length,
      Pending: services.filter((s) => s.status === "pending_approval").length,
      Rejected: services.filter((s) => s.status === "rejected").length,
      Inactive: services.filter((s) => s.status === "inactive").length,
      Draft: services.filter((s) => s.status === "draft").length,
    }),
    [services]
  );

  const filtered = services.filter((s) => s.status === TAB_STATUS[tab]);

  return (
    <div className="flex flex-1 flex-col lg:px-8 lg:py-8">
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <h1 className="text-lg font-bold text-gray-900 lg:text-2xl">My Services</h1>
        <button
          onClick={() => navigate("/services/add")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark lg:h-10 lg:w-10"
          aria-label="Add new service"
        >
          <PlusIcon width={18} height={18} />
        </button>
      </div>

      <div className="no-scrollbar mt-3 flex gap-4 overflow-x-auto border-b border-gray-100 px-4 lg:mt-5 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-shrink-0 pb-2.5 text-[13px] font-semibold lg:text-[14px] ${tab === t ? "text-brand" : "text-gray-400"}`}
          >
            {t} ({counts[t]})
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-3 px-4 py-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-0 lg:py-6">
        {filtered.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center lg:col-span-3">
            <span className="text-3xl">🧰</span>
            <p className="text-sm text-gray-500">No {tab.toLowerCase()} services.</p>
          </div>
        )}
        {filtered.map((s) => {
          const pct = discountPct(s.price, s.originalPrice);
          return (
          <div key={s.id} className="rounded-2xl border border-gray-100 p-3 shadow-card lg:p-4">
          <div className="flex items-center gap-3">
            <CategoryIcon categoryId={s.categoryId} size={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-gray-900">{s.name}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-gray-500">Starting from ₹{s.price}</p>
                {pct > 0 && (
                  <>
                    <p className="text-[10px] text-gray-400 line-through">₹{s.originalPrice}</p>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                      {pct}% OFF
                    </span>
                  </>
                )}
              </div>
              {s.reviewCount > 0 && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                  <StarIcon filled width={12} height={12} /> {s.rating} ({formatCount(s.reviewCount)})
                </div>
              )}
            </div>
            {s.status === "pending_approval" ? (
              <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">
                Awaiting approval
              </span>
            ) : s.status === "rejected" ? (
              <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold text-red-600">Rejected</span>
            ) : s.status !== "draft" ? (
              <button
                onClick={() => toggleServiceStatus(s.id)}
                className="switch"
                data-on={s.status === "active"}
                aria-label={`Toggle ${s.name}`}
              >
                <span className="switch-knob" />
              </button>
            ) : (
              <button
                onClick={() => showToast("Publish flow coming soon")}
                className="rounded-lg bg-brand-light px-3 py-1.5 text-[11px] font-semibold text-brand-dark"
              >
                Publish
              </button>
            )}
          </div>
          {s.status === "pending_approval" && (
            <p className="mt-2 text-[11px] text-gray-400">
              Not visible to customers yet — an admin will review this service.
            </p>
          )}
          {s.status === "rejected" && (
            <div className="mt-2">
              <p className="text-[11.5px] text-red-500">
                {s.approvalNote ? `Reason: ${s.approvalNote}` : "An admin rejected this service."}
              </p>
              {editingId === s.id ? (
                <div className="mt-2 space-y-2">
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand"
                  />
                  <input
                    type="number"
                    min="0"
                    value={draft.price}
                    onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none focus:border-brand"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 rounded-lg border border-gray-200 py-2 text-[12px] font-semibold text-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => submitEdit(s)}
                      disabled={resubmitting}
                      className="flex-1 rounded-lg bg-brand py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {resubmitting ? "Sending…" : "Resubmit"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(s)}
                  className="mt-2 rounded-lg bg-brand-light px-3 py-1.5 text-[11.5px] font-semibold text-brand-dark"
                >
                  Edit & resubmit
                </button>
              )}
            </div>
          )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
