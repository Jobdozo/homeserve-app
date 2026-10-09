import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { BellIcon, StarIcon, ShieldCheckIcon, TrendUpIcon, TrendDownIcon, AlertIcon, MapPinIcon } from "../components/icons";
import BatteryOptimizationBanner from "../components/BatteryOptimizationBanner";
import CategoryIcon from "../components/CategoryIcon";
import Avatar from "../components/Avatar";
import { groupByOrder } from "../utils/groupOrders";

// Phone: one stack, top to bottom (the numbers on the `order-*` classes keep that order).
// Computer: two columns — your work on the left (new requests, open jobs, numbers), your
// account on the right (receiving switch, earnings, wallet, today).
export default function DashboardScreen() {
  const navigate = useNavigate();
  const { provider: providerProfile, requests, earnings, wallet, notifications, setAcceptingRequests, acceptRequest, rejectRequest, respondToOrder, showToast } = useApp();
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

  const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const newOnes = useMemo(() => groupByOrder(requests.filter((r) => r.status === "Pending").sort(byNewest)).slice(0, 5), [requests]);
  const openJobs = useMemo(() => requests.filter((r) => ["Accepted", "In Progress"].includes(r.status)).sort(byNewest).slice(0, 5), [requests]);

  return (
    <div className="flex flex-col pb-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-6 lg:px-8 lg:pb-8 lg:pt-6">
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        {/* Provider header */}
        <div className="order-1 lg:order-none flex items-center justify-between bg-brand px-4 pb-5 pt-1 text-white lg:rounded-2xl lg:px-8 lg:py-6">
          <div className="flex items-center gap-3 lg:gap-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white/20 text-2xl lg:h-14 lg:w-14 lg:text-3xl">
              <Avatar provider={providerProfile} />
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
          <button onClick={() => navigate("/notifications")} className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 lg:hidden">
            <BellIcon width={17} height={17} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="order-3 lg:order-none empty:hidden">
          <BatteryOptimizationBanner />
        </div>

        {capacity?.restricted && (
          <div className="order-4 lg:order-none mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-card lg:mx-0 lg:mt-0 lg:p-5">
            <AlertIcon width={20} height={20} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-[13px] font-bold text-amber-700">Your services are hidden from new customers</p>
              <ul className="mt-0.5 list-disc pl-4 text-[11.5px] leading-snug text-amber-700">
                {capacity.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-amber-600">They become visible again once these requests are completed or resolved.</p>
            </div>
          </div>
        )}

        {wallet.suspended && (
          <div className="order-5 lg:order-none mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-card lg:mx-0 lg:mt-0 lg:p-5">
            <AlertIcon width={20} height={20} className="mt-0.5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-[13px] font-bold text-red-700">Account paused — wallet balance ₹0</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-red-600">
                You won't receive new job requests until your account is recharged. Contact Tikdum support to recharge.
              </p>
            </div>
          </div>
        )}

        {/* Numbers */}
        <div className="order-7 lg:order-none mx-4 mt-3 grid grid-cols-3 gap-2 lg:mx-0 lg:mt-0 lg:grid-cols-6 lg:gap-3">
          <StatBox value={stats.newRequests} label="New requests" onClick={() => navigate("/requests")} />
          <StatBox value={stats.pending} label="Open jobs" onClick={() => navigate("/requests")} />
          <StatBox value={stats.inProgress} label="In progress" onClick={() => navigate("/requests")} />
          <StatBox value={stats.completed} label="Completed" onClick={() => navigate("/requests")} />
          <StatBox value={providerProfile.rating} label="Rating" />
          <StatBox value={`${providerProfile.responseRate}%`} label="Response rate" />
        </div>

        {/* Work waiting for you (computer only — on a phone these live in Requests) */}
        <div className="hidden lg:block">
          <Panel
            title="New requests"
            action={newOnes.length > 0 ? { label: "See all", onClick: () => navigate("/requests") } : null}
            empty={newOnes.length === 0 ? "No new requests right now. They appear here the moment a customer books you." : null}
          >
            {newOnes.map((g) => {
              const r = g.first;
              const answer = (action) =>
                (g.count > 1 ? respondToOrder(g.orderId, action) : action === "accept" ? acceptRequest(r.id) : rejectRequest(r.id)).catch((e) =>
                  showToast(e.message || "Couldn't update the request")
                );
              return (
              <div key={g.key} className="flex items-center gap-3 border-b border-gray-50 py-3 last:border-0">
                <CategoryIcon categoryId={r.service?.categoryId} size={44} />
                <button onClick={() => navigate(`/requests/${r.id}`)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[13.5px] font-semibold text-gray-900">{g.count > 1 ? `${g.count} services · ${r.customer?.name || "Customer"}` : r.service?.name}</p>
                  <p className="flex items-center gap-1 truncate text-[11.5px] text-gray-500">
                    <MapPinIcon width={12} height={12} /> {r.address?.line || "—"}
                  </p>
                </button>
                <p className="text-[14px] font-bold text-brand">₹{g.total}</p>
                <button onClick={() => answer("reject")} className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-[12.5px] font-semibold text-gray-600 hover:bg-gray-50">
                  Reject
                </button>
                <button onClick={() => answer("accept")} className="rounded-lg bg-brand px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-dark">
                  Accept
                </button>
              </div>
              );
            })}
          </Panel>
        </div>

        <div className="hidden lg:block">
          <Panel
            title="Jobs in hand"
            action={openJobs.length > 0 ? { label: "See all", onClick: () => navigate("/requests") } : null}
            empty={openJobs.length === 0 ? "Jobs you accept show up here until they are done." : null}
          >
            {openJobs.map((r) => (
              <button key={r.id} onClick={() => navigate(`/requests/${r.id}`)} className="flex w-full items-center gap-3 border-b border-gray-50 py-3 text-left last:border-0 hover:bg-gray-50/60">
                <CategoryIcon categoryId={r.service?.categoryId} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-gray-900">{r.service?.name}</p>
                  <p className="truncate text-[11.5px] text-gray-500">
                    {r.customer?.name || "Customer"} · {r.address?.line || "—"}
                  </p>
                </div>
                <span className={"rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + (r.status === "In Progress" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
                  {r.status}
                </span>
                <p className="w-16 text-right text-[14px] font-bold text-gray-900">₹{r.amount}</p>
              </button>
            ))}
          </Panel>
        </div>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <div
          className={`order-2 lg:order-none mx-4 flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-card lg:mx-0 ${
            accepting ? "-mt-4 border-gray-100 bg-white lg:mt-0" : "mt-3 border-amber-200 bg-amber-50 lg:mt-0"
          }`}
        >
          <div>
            <p className="text-[13px] font-bold text-gray-900">{accepting ? "Receiving new requests" : "Not receiving new requests"}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              {!accepting ? "Your services are hidden from customers. Jobs already in progress continue as normal." : providerProfile.coverage?.workingNow === false ? "You are outside your working hours, so customers can't see your services right now. Change them in Manage Availability." : "Customers in your area can see and book your services."}
            </p>
          </div>
          <button onClick={toggleAccepting} disabled={togglingRequests} className="switch flex-shrink-0 disabled:opacity-50" data-on={accepting} aria-label="Toggle receiving requests">
            <span className="switch-knob" />
          </button>
        </div>

        {/* Earnings card */}
        <div className="order-6 lg:order-none mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white p-4 shadow-card lg:mx-0 lg:mt-0 lg:p-5">
          <div>
            <p className="text-[11px] text-gray-400">Earnings this month</p>
            <p className="text-2xl font-extrabold text-gray-900 lg:text-3xl">₹{earnings.thisMonth.toLocaleString("en-IN")}</p>
            <p className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${earnings.changePct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {earnings.changePct >= 0 ? <TrendUpIcon width={12} height={12} /> : <TrendDownIcon width={12} height={12} />}
              {earnings.changePct >= 0 ? "+" : ""}
              {earnings.changePct}% from last month
            </p>
          </div>
          <button onClick={() => navigate("/earnings")} className="rounded-xl bg-brand-light px-4 py-2.5 text-xs font-semibold text-brand-dark hover:bg-brand/20 lg:px-5">
            Details
          </button>
        </div>

        {/* Wallet — computer only (the phone shows it on Earnings) */}
        <div className="hidden rounded-2xl bg-white p-5 shadow-card lg:block">
          <p className="text-[11px] text-gray-400">Wallet balance</p>
          <p className={"text-2xl font-extrabold " + (wallet.suspended ? "text-red-600" : "text-gray-900")}>₹{Number(wallet.balance || 0).toLocaleString("en-IN")}</p>
          <p className="mt-1 text-[11.5px] leading-snug text-gray-500">
            Tikdum's fee is taken from this when you accept a request. Keep it topped up to stay visible to customers.
          </p>
        </div>

        {/* Today's overview */}
        <div className="order-8 lg:order-none mx-4 mt-4 rounded-2xl bg-white p-4 shadow-card lg:mx-0 lg:mt-0 lg:p-5">
          <h2 className="mb-3 text-[13.5px] font-bold text-gray-900 lg:text-[15px]">Today's overview</h2>
          <OverviewRow color="bg-brand" label="New requests" value={stats.newRequests} />
          <OverviewRow color="bg-amber-400" label="Open jobs" value={stats.pending} />
          <OverviewRow color="bg-blue-500" label="Jobs in progress" value={stats.inProgress} />
          <OverviewRow color="bg-emerald-500" label="Completed" value={stats.completed} last />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, action, empty, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
        {action && (
          <button onClick={action.onClick} className="text-[12.5px] font-semibold text-brand hover:underline">
            {action.label}
          </button>
        )}
      </div>
      {empty ? <p className="py-6 text-center text-[13px] text-gray-400">{empty}</p> : children}
    </div>
  );
}

function StatBox({ value, label, onClick }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white py-3 shadow-card lg:py-5">
      <p className="text-lg font-extrabold text-gray-900 lg:text-xl">{value}</p>
      <p className="px-1 text-center text-[10px] text-gray-400 lg:text-[11.5px]">{label}</p>
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
