import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import StaffForm from "../components/StaffForm";
import { ChevronRightIcon } from "../components/icons";

export const ROLE_STYLES = {
  "Company Admin": "bg-violet-100 text-violet-700",
  Manager: "bg-indigo-100 text-indigo-700",
  Supervisor: "bg-blue-100 text-blue-700",
  Technician: "bg-emerald-100 text-emerald-700",
  "Field Staff": "bg-teal-100 text-teal-700",
  "Customer Support": "bg-amber-100 text-amber-700",
  Accountant: "bg-orange-100 text-orange-700",
};

export function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default function StaffScreen() {
  const navigate = useNavigate();
  const { can, showToast } = useApp();
  const [tab, setTab] = useState("staff");
  const [staff, setStaff] = useState(null);
  const [activity, setActivity] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = () => {
    api.listStaff().then(setStaff).catch((e) => {
      setStaff([]);
      showToast(e.message || "Couldn't load staff");
    });
    api.getStaffActivity().then(setActivity).catch(() => setActivity([]));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title="Staff Management"
        subtitle={staff ? `${staff.filter((s) => s.active !== false).length} active · ${staff.length} total` : ""}
        right={
          can("staff.manage") && (
            <button onClick={() => setAdding(true)} className="rounded-full bg-brand px-3.5 py-2 text-[12px] font-semibold text-white">
              + Add
            </button>
          )
        }
      />

      <div className="flex-1 space-y-4 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {[
            ["staff", "Staff"],
            ["activity", "Recent activity"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex-1 rounded-lg py-2 text-[12.5px] font-semibold ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "staff" && (
          <div className="space-y-2.5">
            {staff === null && <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>}
            {staff?.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
                <p className="text-[13.5px] font-semibold text-gray-800">No staff yet</p>
                <p className="mt-1 text-[12px] text-gray-500">Add employees so they can take orders with their own login. You choose what each person can see and do.</p>
              </div>
            )}
            {staff?.map((s) => (
              <button key={s.id} onClick={() => navigate(`/profile/staff/${s.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 p-3.5 text-left hover:bg-gray-50">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-[15px] font-bold text-brand-dark">{s.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-gray-900">{s.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROLE_STYLES[s.role] || "bg-gray-100 text-gray-600"}`}>{s.role}</span>
                    {s.active === false && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Deactivated</span>}
                  </span>
                  <span className="block text-[11.5px] text-gray-400">{s.phone}</span>
                  <span className="block text-[11.5px] text-gray-500">
                    {s.pending} pending · {s.completed} completed · active {timeAgo(s.lastActiveAt)}
                  </span>
                </span>
                <ChevronRightIcon width={16} height={16} className="text-gray-300" />
              </button>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {activity === null && <p className="py-10 text-center text-[13px] text-gray-400">Loading…</p>}
            {activity?.length === 0 && <p className="py-10 text-center text-[13px] text-gray-400">No activity yet.</p>}
            {activity?.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-[12.5px] text-gray-800">
                  <b>{a.staffName}</b> · {a.action}
                  {a.detail ? ` — ${a.detail}` : ""}
                </p>
                <p className="text-[11px] text-gray-400">
                  {new Date(a.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {a.bookingId && (
                    <button onClick={() => navigate(`/requests/${a.bookingId}`)} className="ml-2 font-semibold text-brand underline">
                      View order
                    </button>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <StaffForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}
