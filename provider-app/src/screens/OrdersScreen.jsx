import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { groupByOrder } from "../utils/groupOrders";
import { usePhoneReadiness, firstPhoneProblem } from "../utils/readiness";
import { BellIcon, MenuIcon, AlertIcon, ClockIcon, CheckIcon, PhoneIcon, ChatIcon, NavigateIcon, StoreIcon, ShieldCheckIcon } from "../components/icons";
import { PillTabs, Card, StatusChip, Switch, Empty, inr, whenLabel } from "../components/biz";

const TABS = [
  { id: "new", label: "New", statuses: ["Pending"] },
  { id: "confirmed", label: "Confirmed", statuses: ["Accepted"] },
  { id: "working", label: "Working", statuses: ["In Progress"] },
  { id: "done", label: "Done", statuses: ["Completed"] },
  { id: "cancelled", label: "Cancelled", statuses: ["Rejected", "Cancelled", "Swapped"] },
];
const RING_SECONDS = 90;

// Orders: the online switch, anything that could silence a job alert, then every
// job by stage — new requests ring here with Accept / Decline on the card.
export default function OrdersScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { provider, requests, wallet, notifications, setAcceptingRequests, can, showToast } = useApp();
  const accepting = provider.coverage?.acceptingRequests !== false;
  const workingNow = provider.coverage?.workingNow !== false;
  const [toggling, setToggling] = useState(false);
  const [capacity, setCapacity] = useState(null);
  const [offline, setOffline] = useState(null);
  const readiness = usePhoneReadiness();
  const phoneProblem = firstPhoneProblem(readiness);
  const unread = notifications.filter((n) => !n.read).length;

  const groups = useMemo(() => {
    const sorted = [...requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return Object.fromEntries(TABS.map((t) => [t.id, groupByOrder(sorted.filter((r) => t.statuses.includes(r.status)))]));
  }, [requests]);
  const fallbackTab = groups.new.length ? "new" : groups.working.length ? "working" : "confirmed";
  const tab = params.get("tab") || fallbackTab;

  const openCount = requests.filter((r) => ["Pending", "Accepted", "In Progress"].includes(r.status)).length;
  useEffect(() => {
    api.getCapacity().then(setCapacity).catch(() => {});
  }, [openCount]);
  useEffect(() => {
    if (accepting) return setOffline(null);
    api.getInsights().then((d) => setOffline(d.offline)).catch(() => {});
  }, [accepting]);

  const toggle = async () => {
    setToggling(true);
    try {
      await setAcceptingRequests(!accepting);
    } catch (e) {
      showToast(e.message || "Couldn't update — please try again");
    } finally {
      setToggling(false);
    }
  };

  const list = groups[tab] || [];
  const confirmedToday = groups.confirmed.filter((g) => sameDay(g.first.date));

  return (
    <div className="flex flex-col pb-4 lg:mx-auto lg:w-full lg:max-w-3xl">
      {/* who / where */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 lg:px-0 lg:pt-0">
        <div className="min-w-0">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-muted">Showing orders for</p>
          <h1 className="truncate font-display text-[24px] font-extrabold leading-tight text-ink">{provider.name}</h1>
          <p className="truncate text-[12.5px] text-ink-muted">{[provider.category, provider.serviceArea].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-shrink-0 gap-2 lg:hidden">
          <button onClick={() => navigate("/notifications")} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink">
            <BellIcon width={20} height={20} />
            {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-marigold" />}
          </button>
          <button onClick={() => navigate("/profile")} aria-label="Account" className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink">
            <MenuIcon width={20} height={20} />
          </button>
        </div>
      </div>

      {/* the one switch that matters */}
      <div
        className={`mx-4 mt-3.5 flex items-center gap-3 rounded-[20px] border p-3.5 pl-4 lg:mx-0 ${
          accepting && workingNow ? "border-go-line bg-go-wash" : "border-gray-200 bg-card"
        }`}
      >
        <span className={`h-3 w-3 flex-shrink-0 rounded-full ${accepting && workingNow ? "bg-go shadow-[0_0_0_5px_rgba(43,194,122,0.22)]" : "bg-ink-faint"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-extrabold text-ink">{!accepting ? "Offline — not taking jobs" : workingNow ? "Online — taking new jobs" : "Outside your working hours"}</p>
          <p className={`text-[12.5px] ${accepting && workingNow ? "text-go-soft" : "text-ink-muted"}`}>
            {!accepting
              ? "Customers can't see or book you. Jobs in hand carry on."
              : workingNow
                ? "Customers in your area can book you now."
                : "Customers see you again when your hours start."}
          </p>
        </div>
        {can("profile.edit") ? <Switch on={accepting} onChange={toggle} disabled={toggling} label="Taking new jobs" /> : null}
      </div>

      {offline?.reason === "missed" && !accepting && (
        <p className="mx-4 mt-2 rounded-[14px] bg-marigold-wash px-3.5 py-2.5 text-[12.5px] leading-snug text-marigold-soft lg:mx-0">
          We took you offline at {new Date(offline.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })} because {offline.count} requests in a row went unanswered — so customers weren't left waiting.
        </p>
      )}

      {phoneProblem && (
        <button onClick={() => navigate("/ready")} className="mx-4 mt-2.5 flex items-center gap-2.5 rounded-[14px] bg-marigold-wash px-3.5 py-3 text-left lg:mx-0">
          <AlertIcon width={18} height={18} className="flex-shrink-0 text-marigold" />
          <span className="flex-1 text-[13px] text-marigold-soft">{phoneProblem}</span>
          <span className="text-[13px] font-extrabold text-marigold underline">Fix</span>
        </button>
      )}

      {wallet.suspended && (
        <button onClick={() => navigate("/earnings")} className="mx-4 mt-2.5 flex items-start gap-2.5 rounded-[14px] bg-red-50 px-3.5 py-3 text-left lg:mx-0">
          <AlertIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-red-500" />
          <span className="flex-1">
            <span className="block text-[13.5px] font-bold text-red-800">Wallet is at ₹0 — new jobs are paused</span>
            <span className="block text-[12.5px] text-red-700">Add money to start getting requests again.</span>
          </span>
        </button>
      )}

      {capacity?.restricted && (
        <div className="mx-4 mt-2.5 rounded-[14px] bg-marigold-wash px-3.5 py-3 lg:mx-0">
          <p className="text-[13.5px] font-bold text-marigold-soft">You're hidden from new customers for now</p>
          <ul className="mt-0.5 list-disc pl-4 text-[12.5px] leading-snug text-marigold-soft/90">
            {capacity.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <PillTabs
        className="mt-4"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        items={TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === "done" || t.id === "cancelled" ? 0 : groups[t.id].length, hot: t.id === "new" }))}
      />

      <div className="mt-3.5 flex flex-col gap-3 px-4 lg:px-0">
        {list.length === 0 ? (
          <EmptyFor tab={tab} accepting={accepting} />
        ) : (
          list.map((g, i) => (g.first.status === "Pending" ? <NewRequestCard key={g.key} group={g} big={i === 0} /> : <JobCard key={g.key} group={g} />))
        )}

        {tab === "new" && confirmedToday.length > 0 && (
          <>
            <div className="mt-2 flex items-baseline justify-between">
              <h2 className="font-display text-[19px] font-bold text-ink">Up next today</h2>
              <button onClick={() => setParams({ tab: "confirmed" }, { replace: true })} className="text-[13.5px] font-bold text-brand-dark">
                All confirmed
              </button>
            </div>
            {confirmedToday.slice(0, 3).map((g) => (
              <JobCard key={g.key} group={g} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyFor({ tab, accepting }) {
  const navigate = useNavigate();
  if (tab === "new")
    return (
      <Empty
        icon={accepting ? <CheckIcon width={30} height={30} /> : <StoreIcon width={30} height={30} />}
        title={accepting ? "No new requests right now" : "You're offline"}
        text={accepting ? "They ring here the moment a customer books you. Keep the app open or your phone ready." : "Switch Online on above when you're ready for jobs."}
        action={
          <button onClick={() => navigate("/ready")} className="mt-2 flex h-11 items-center gap-2 rounded-2xl bg-card px-4 text-[13.5px] font-bold text-ink">
            <ShieldCheckIcon width={17} height={17} /> Check this phone can ring
          </button>
        }
      />
    );
  const copy = {
    confirmed: ["Nothing confirmed", "Jobs you accept wait here until you start them."],
    working: ["No job running", "After the start code, the job shows here until it's finished."],
    done: ["No finished jobs yet", "Completed jobs and what you collected are kept here."],
    cancelled: ["Nothing cancelled", "Cancelled, declined and passed-on jobs are kept here."],
  }[tab];
  return <Empty title={copy[0]} text={copy[1]} />;
}

// A request ringing for an answer: when, who, what they chose, their note, the amount — then Accept / Decline.
function NewRequestCard({ group, big }) {
  const navigate = useNavigate();
  const { acceptRequest, rejectRequest, respondToOrder, showToast, can } = useApp();
  const [busy, setBusy] = useState(false);
  const r = group.first;
  const left = useSecondsLeft(r);
  const canAct = can("orders.act");
  const answer = async (action) => {
    setBusy(true);
    try {
      if (group.count > 1) await respondToOrder(group.orderId, action);
      else if (action === "accept") await acceptRequest(r.id);
      else await rejectRequest(r.id);
    } catch (e) {
      showToast(e.message || "Couldn't update the request");
    } finally {
      setBusy(false);
    }
  };

  if (!big) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <button onClick={() => navigate(`/requests/${r.id}`)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[15px] font-bold text-ink">{group.count > 1 ? `${group.count} services · ${r.customer?.name || "Customer"}` : r.service?.name}</p>
          <p className="truncate text-[12.5px] text-ink-muted">
            {whenLabel(r.date, r.time)} · {areaOf(r.address)}
          </p>
          <p className="text-[12.5px] font-bold text-marigold-soft tabular">
            {inr(group.total)}
            {left !== null ? ` · ${clock(left)} left` : ""}
          </p>
        </button>
        {canAct && (
          <button onClick={() => answer("accept")} disabled={busy} className="h-11 rounded-[14px] bg-go px-4 text-[14px] font-extrabold text-go-ink disabled:opacity-50">
            Accept
          </button>
        )}
      </Card>
    );
  }

  return (
    <div className="animate-fade-up overflow-hidden rounded-[22px] border-[1.5px] border-marigold bg-card shadow-[0_0_0_6px_rgba(245,165,36,0.10)]">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <span className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.12em] text-marigold">
          <BellIcon width={16} height={16} /> New request
        </span>
        {left !== null && (
          <span className="flex items-center gap-1.5 rounded-full bg-marigold-wash px-2.5 py-1 text-[12.5px] font-bold text-marigold-soft tabular">
            <ClockIcon width={14} height={14} /> {clock(left)} to accept
          </span>
        )}
      </div>
      <button onClick={() => navigate(`/requests/${r.id}`)} className="block w-full px-4 pt-2.5 text-left">
        <span className="block font-display text-[21px] font-extrabold leading-tight text-ink">{whenLabel(r.date, r.time)}</span>
        <span className="block text-[13px] text-ink-muted">
          {r.customer?.name || "Customer"} · {areaOf(r.address)}
        </span>
      </button>
      <div className="mx-4 mt-3 space-y-3 border-t border-dashed border-gray-200 pt-3">
        {group.items.map((it) => (
          <div key={it.id} className="flex justify-between gap-2.5">
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-ink">{it.service?.name}</span>
              {it.options?.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {it.options.map((o) => (
                    <span key={`${o.group}-${o.choice}`} className="rounded-lg bg-raised px-2 py-0.5 text-[12px] font-semibold text-brand-dark">
                      {o.choice}
                      {o.price ? ` +₹${o.price}` : ""}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="flex-shrink-0 text-[15px] font-extrabold text-ink tabular">{inr(it.amount)}</span>
          </div>
        ))}
      </div>
      {r.issue && <p className="mx-4 mt-3 rounded-[14px] bg-raised px-3 py-2.5 text-[13px] leading-snug text-ink-soft">“{r.issue}”</p>}
      {r.contact && <p className="mx-4 mt-2 text-[12.5px] text-ink-muted">Someone else will be at the address: {r.contact.name}</p>}
      <div className="mx-4 mt-3 flex items-baseline justify-between">
        <span className="text-[13px] text-ink-muted">You collect after the job</span>
        <span className="font-display text-[24px] font-extrabold text-ink tabular">{inr(group.total)}</span>
      </div>
      {canAct ? (
        <div className="grid grid-cols-[1fr_2fr] gap-2.5 p-4">
          <button onClick={() => answer("reject")} disabled={busy} className="h-[52px] rounded-2xl border-[1.5px] border-gray-300 text-[15px] font-extrabold text-ink disabled:opacity-50">
            Decline
          </button>
          <button onClick={() => answer("accept")} disabled={busy} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-go text-[16px] font-extrabold text-go-ink disabled:opacity-50">
            <CheckIcon width={20} height={20} strokeWidth={2.8} /> Accept job
          </button>
        </div>
      ) : (
        <p className="p-4 text-[12.5px] text-ink-muted">Ask the owner to accept or decline this request.</p>
      )}
    </div>
  );
}

// A job in hand (or past): when, who, status, and quick actions while it's live.
function JobCard({ group }) {
  const navigate = useNavigate();
  const r = group.first;
  const live = ["Accepted", "In Progress"].includes(r.status);
  const lat = r.address?.lat;
  const lng = r.address?.lng;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <button onClick={() => navigate(`/requests/${r.id}`)} className="flex justify-between gap-2.5 text-left">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-bold text-ink">{group.count > 1 ? `${r.service?.name} + ${group.count - 1} more` : r.service?.name}</span>
          <span className="block truncate text-[12.5px] text-ink-muted">
            {r.customer?.name || "Customer"} · {whenLabel(r.date, r.time)}
            {r.assignedStaff ? ` · ${r.assignedStaff.name}` : ""}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <StatusChip status={r.status} />
          <span className="text-[14px] font-extrabold text-ink tabular">{inr(group.total)}</span>
        </span>
      </button>
      {live && (
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_1.6fr] gap-2">
          {r.customer?.phone ? (
            <a href={`tel:${r.customer.phone}`} aria-label="Call customer" className="flex h-11 items-center justify-center rounded-[14px] bg-raised text-ink">
              <PhoneIcon width={18} height={18} />
            </a>
          ) : (
            <span />
          )}
          <button onClick={() => navigate(`/chat/${r.id}`)} aria-label="Chat with customer" className="flex h-11 items-center justify-center rounded-[14px] bg-raised text-ink">
            <ChatIcon width={18} height={18} />
          </button>
          {lat && lng ? (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noreferrer" aria-label="Directions" className="flex h-11 items-center justify-center rounded-[14px] bg-raised text-ink">
              <NavigateIcon width={18} height={18} />
            </a>
          ) : (
            <span />
          )}
          <button onClick={() => navigate(`/requests/${r.id}`)} className="h-11 rounded-[14px] bg-brand-glow text-[14px] font-extrabold text-ground">
            {r.status === "Accepted" ? "Start job" : "Finish job"}
          </button>
        </div>
      )}
    </Card>
  );
}

// Seconds left to answer a ringing request, or null once it's past (the server moves it on).
function useSecondsLeft(r) {
  const since = Date.parse(r.statusHistory?.Pending || r.createdAt);
  const calc = () => {
    const left = RING_SECONDS - Math.floor((Date.now() - since) / 1000);
    return left > 0 && left <= RING_SECONDS ? left : null;
  };
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
  }, [since]); // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const sameDay = (iso) => new Date(iso).toDateString() === new Date().toDateString();
// "Trikuta Nagar" from "House 14, Lane 3, Trikuta Nagar, Jammu 180012": the last named part before the PIN
function areaOf(address) {
  const parts = String(address?.line || "").split(",").map((p) => p.trim()).filter(Boolean);
  const named = parts.filter((p) => !/^\d/.test(p) && !/\b\d{6}\b/.test(p));
  return named[named.length - 1] || address?.label || "Address in request";
}
