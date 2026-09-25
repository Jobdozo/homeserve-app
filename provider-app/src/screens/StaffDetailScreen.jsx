import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import StaffForm from "../components/StaffForm";
import { ROLE_STYLES, timeAgo } from "./StaffScreen";

export default function StaffDetailScreen() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const { can, staff: me, showToast, services } = useApp();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("pending");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.getStaffMember(staffId).then(setData).catch((e) => showToast(e.message || "Couldn't load"));
  useEffect(() => {
    load();
  }, [staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader title="Staff member" />
        <p className="py-16 text-center text-[13px] text-gray-400">Loading…</p>
      </div>
    );
  }
  const s = data.staff;
  const isSelf = me?.id === s.id;
  const serviceNames = (s.serviceIds || []).map((id) => services.find((x) => x.id === id)?.name).filter(Boolean);

  const toggleActive = async () => {
    setBusy(true);
    try {
      await api.updateStaff(s.id, { active: s.active === false });
      showToast(s.active === false ? "Staff member reactivated" : "Staff member deactivated");
      await load();
    } catch (e) {
      showToast(e.message || "Couldn't update");
    } finally {
      setBusy(false);
    }
  };

  const lists = { pending: data.pendingOrders, completed: data.completedOrders };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title={s.name} subtitle={s.phone} />
      <div className="flex-1 space-y-4 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="rounded-2xl border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ROLE_STYLES[s.role] || "bg-gray-100 text-gray-600"}`}>{s.role}</span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}>{s.active !== false ? "Active" : "Deactivated"}</span>
            <span className="text-[11.5px] text-gray-400">Last signed in {timeAgo(s.lastLoginAt)}</span>
          </div>
          <div className="mt-3 space-y-1.5 text-[12.5px] text-gray-600">
            <p>
              <span className="text-gray-400">Services: </span>
              {serviceNames.length ? serviceNames.join(", ") : "Any service"}
            </p>
            <p>
              <span className="text-gray-400">Areas: </span>
              {s.pincodes?.length ? s.pincodes.join(", ") : "Any area"}
            </p>
            <p>
              <span className="text-gray-400">Access: </span>
              {s.permissions.length} permission{s.permissions.length === 1 ? "" : "s"}
            </p>
          </div>
          {can("staff.manage") && !isSelf && (
            <div className="mt-4 flex gap-2">
              <button onClick={() => setEditing(true)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[12.5px] font-semibold text-gray-700">
                Edit &amp; permissions
              </button>
              <button onClick={toggleActive} disabled={busy} className={`flex-1 rounded-xl py-2.5 text-[12.5px] font-semibold disabled:opacity-50 ${s.active === false ? "bg-brand text-white" : "border border-red-200 text-red-600"}`}>
                {s.active === false ? "Reactivate" : "Deactivate"}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {[
            ["pending", `Pending (${data.pendingOrders.length})`],
            ["completed", `Completed (${data.completedOrders.length})`],
            ["activity", "Activity"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex-1 rounded-lg py-2 text-[12px] font-semibold ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab !== "activity" && (
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {lists[tab].length === 0 && <p className="py-10 text-center text-[13px] text-gray-400">No {tab} orders.</p>}
            {lists[tab].map((o) => (
              <button key={o.id} onClick={() => navigate(`/requests/${o.id}`)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-gray-900">{o.service}</span>
                  <span className="block text-[11.5px] text-gray-400">
                    #{o.ref || o.id.slice(0, 8)} · {o.customerName} · {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                </span>
                <span className="flex-shrink-0 text-right">
                  <span className="block text-[12.5px] font-bold text-gray-800">₹{o.amount}</span>
                  <span className="block text-[10.5px] text-gray-500">{o.status}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {data.activity.length === 0 && <p className="py-10 text-center text-[13px] text-gray-400">No activity yet.</p>}
            {data.activity.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-[12.5px] text-gray-800">
                  {a.action}
                  {a.detail ? ` — ${a.detail}` : ""}
                </p>
                <p className="text-[11px] text-gray-400">{new Date(a.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <StaffForm
          staff={s}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </div>
  );
}
