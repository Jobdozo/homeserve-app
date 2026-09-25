import { useEffect, useState } from "react";
import { api } from "../api";
import { XIcon } from "./icons";

const ACTION_LABELS = {
  "service.create": "Service created",
  "service.update": "Service edited",
  "service.approve": "Service approved",
  "service.reject": "Service rejected",
  "service.activate": "Service activated",
  "service.deactivate": "Service deactivated",
  "service.delete": "Service deleted",
  "category.create": "Category created",
  "category.update": "Category edited",
  "category.activate": "Category activated",
  "category.deactivate": "Category deactivated",
  "category.delete": "Category deleted",
};

const FIELD_LABELS = {
  name: "Name",
  tagline: "Tagline",
  price: "Price (₹)",
  originalPrice: "Original price (₹)",
  distanceLabel: "Distance label",
  icon: "Icon",
  categoryId: "Category",
  includes: "Included items",
  status: "Status",
  active: "Active",
  reason: "Reason",
  provider: "Provider",
};

function show(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function ChangeList({ entries, showEntity }) {
  if (entries === null) return <p className="py-6 text-center text-[12px] text-gray-400">Loading…</p>;
  if (entries.length === 0) return <p className="py-6 text-center text-[12px] text-gray-400">No recorded changes yet.</p>;
  return (
    <div className="divide-y divide-gray-50">
      {entries.map((e) => (
        <div key={e.id} className="px-3 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-[12.5px] font-semibold text-gray-800">
              {ACTION_LABELS[e.action] || e.action}
              {showEntity && e.entityName ? <span className="font-normal text-gray-500"> — {e.entityName}</span> : null}
            </p>
            <p className="text-[10.5px] text-gray-400">
              {new Date(e.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
          <p className="text-[10.5px] text-gray-400">by {e.actor}</p>
          {e.changes.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {e.changes.map((c, i) => (
                <li key={i} className="text-[11.5px] text-gray-600">
                  <span className="font-medium text-gray-700">{FIELD_LABELS[c.field] || c.field}:</span>{" "}
                  <span className="text-red-500 line-through decoration-red-300">{show(c.from)}</span>
                  {" → "}
                  <span className="text-emerald-600">{show(c.to)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function ChangeHistoryModal({ entityType, entityId, title, onClose }) {
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    api
      .listAdminChanges({ entityType, entityId })
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [entityType, entityId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-bold text-gray-900">Change history — {title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>
        <ChangeList entries={entries} />
      </div>
    </div>
  );
}
