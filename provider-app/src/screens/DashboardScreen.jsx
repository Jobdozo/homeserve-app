import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { BellIcon, StarIcon, ShieldCheckIcon, TrendUpIcon, TrendDownIcon, AlertIcon } from "../components/icons";

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { provider: providerProfile, requests, earnings, wallet, notifications, setAcceptingRequests, showToast } = useApp();
  const accepting = providerProfile.coverage?.acceptingRequests !== false;
  const [togglingRequests, setTogglingRequests] = useState(false);
  const [capacity, setCapacity] = useState(null);
  const openRequestCount = requests.filter((r) => ["Pending", "Accepted", "In Progress"].includes(r.status)).length;
  useEffect(() => {
    api.getCapacity().then(setCapacity).catch(() => {});
  }, [openRequestCount]);
  const toggleAccepting = async () => {
    setTogglingRequests(true);
    try {
      await setAcceptingRequests(!accepting);
    } catch (e) {
      showToast(e.message || "Couldn't update — please try again");
    } finally {
      setTogglingRequests(false);
    }
  };
  const unreadCount = notifications.filter((n) => !n.read).length;

  const stats = useMemo(() => {
    const newRequests = requests.filter((r) => r.status === "Pending").length;
    const inProgress = requests.filter((r) => r.status === "In Progress").length;
    const completed = requests.filter((r) => r.status === "Completed").length;
    const pending = requests.filter((r) => r.status === "Accepted").length;
    return { newRequests, inProgress, completed, pending };
  }, [requests]);

  return (
    <div className="flex flex-col pb-4 lg:pb-8">
      {/* Provider header */}
      <div className="flex items-center justify-between bg-brand px-4 pb-5 pt-1 text-white lg:mt-6 lg:rounded-2xl lg:px-8 lg:py-6">
        <div className="flex items-center gap-3 lg:gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-2xl lg:h-14 lg:w-14 lg:text-3xl">
            {providerProfile.avatar}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-[14.5px] font-bold lg:text-lg">{providerProfile.name}</p>
              {providerProfile.verified && <ShieldCheckIcon width={14} height={14} className="text-emerald-200" />}
            </div>
            <p className="text-[11px] text-white/80 lg:text-[13px]">{providerProfile.category}</p>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/90 lg:text-[13px]">
              <StarIcon filled width={12} height={12} /> {providerProfile.rating} ({providerProfile.reviews}+ Reviews)
            </div>
          </div>
        </div>
        <button
          onClick={() => navigate("/notifications")}
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 lg:hidden"
        >
          <BellIcon width={17} height={17} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      <div
        className={`mx-4 flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-card lg:mx-8 lg:mt-6 ${
          accepting ? "-mt-4 border-gray-100 bg-white" : "mt-3 border-amber-200 bg-amber-50"
        }`}
      >
        <div>
          <p className="text-[13px] font-bold text-gray-900">
            {accepting ? "Receiving new requests" : "Not receiving new requests"}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
            {accepting
              ? "Customers in your area can see and book your services."
              : "Your services are hidden from customers. Jobs already in progress continue as normal."}
          </p>
        </div>
        <button
          onClick={toggleAccepting}
          disabled={togglingRequests}
          className="switch flex-shrink-0 disabled:opacity-50"
          data-on={accepting}
          aria-label="Toggle receiving requests"
        >
          <span className="switch-knob" />
        </button>
      </div>

      {capacity?.restricted && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-card lg:mx-8 lg:p-6">
          <AlertIcon width={20} height={20} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div>
            <p className="text-[13px] font-bold text-amber-700">Your services are hidden from new customers</p>
            <ul className="mt-0.5 list-disc pl-4 text-[11.5px] leading-snug text-amber-700">
              {capacity.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-amber-600">
              They become visible again once these requests are completed or resolved.
            </p>
          </div>
        </div>
      )}

      {wallet.suspended && (
        <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-card lg:mx-8 lg:mt-6 lg:p-6">
          <AlertIcon width={20} height={20} className="mt-0.5 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-[13px] font-bold text-red-700">Account paused — wallet balance ₹0</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-red-600">
              You won't receive new job requests until your account is recharged. Contact Tikdum support to recharge.
            </p>
          </div>
        </div>
      )}

      {/* Earnings card */}
      <div className="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white p-4 shadow-card lg:mx-8 lg:mt-6 lg:p-6">
        <div>
          <p className="text-[11px] text-gray-400">Earnings This Month</p>
          <p className="text-2xl font-extrabold text-gray-900 lg:text-3xl">₹{earnings.thisMonth.toLocaleString("en-IN")}</p>
          <p
            className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${
              earnings.changePct >= 0 ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {earnings.changePct >= 0 ? <TrendUpIcon width={12} height={12} /> : <TrendDownIcon width={12} height={12} />}
            {earnings.changePct >= 0 ? "+" : ""}
            {earnings.changePct}% from last month
          </p>
        </div>
        <button
          onClick={() => navigate("/earnings")}
          className="rounded-xl bg-brand-light px-4 py-2.5 text-xs font-semibold text-brand-dark hover:bg-brand/20 lg:px-6 lg:py-3 lg:text-sm"
        >
          Payout
        </button>
      </div>

      {/* Stats grid */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2 lg:mx-8 lg:mt-4 lg:grid-cols-3 lg:gap-3">
        <StatBox value={stats.newRequests} label="New Requests" onClick={() => navigate("/requests")} />
        <StatBox value={stats.inProgress} label="In Progress" onClick={() => navigate("/requests")} />
        <StatBox value={stats.completed} label="Completed" onClick={() => navigate("/requests")} />
        <StatBox value={providerProfile.rating} label="Rating" />
        <StatBox value={`${providerProfile.reviews}+`} label="Reviews" />
        <StatBox value={`${providerProfile.responseRate}%`} label="Response Rate" />
      </div>

      {/* Today's overview */}
      <div className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-card lg:mx-8 lg:mt-4 lg:max-w-lg lg:p-6">
        <h2 className="mb-3 text-[13.5px] font-bold text-gray-900 lg:text-[15px]">Today's Overview</h2>
        <OverviewRow color="bg-brand" label="New Requests" value={stats.newRequests} />
        <OverviewRow color="bg-amber-400" label="Open Jobs" value={stats.pending} />
        <OverviewRow color="bg-blue-500" label="Jobs in Progress" value={stats.inProgress} />
        <OverviewRow color="bg-emerald-500" label="Completed Today" value={stats.completed} last />
      </div>
    </div>
  );
}

function StatBox({ value, label, onClick }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white py-3 shadow-card lg:py-5">
      <p className="text-lg font-extrabold text-gray-900 lg:text-xl">{value}</p>
      <p className="px-1 text-center text-[10px] text-gray-400">{label}</p>
    </Comp>
  );
}

function OverviewRow({ color, label, value, last }) {
  return (
    <div className={`flex items-center justify-between py-2 ${last ? "" : "border-b border-gray-50"}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="text-[13px] text-gray-600">{label}</span>
      </div>
      <span className="text-[13px] font-bold text-gray-900">{value}</span>
    </div>
  );
}
