import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { PageTitle, PillTabs, Card, Delta, inr } from "../components/biz";
import { StarIcon, ChatIcon, ClockIcon, LinkIcon, UsersIcon, CalendarIcon, PhoneIcon, ShieldCheckIcon } from "../components/icons";

const FIRST_HOUR = 8;
const LAST_HOUR = 19;

// Insights: today live, how the week went on the numbers customers feel, who your
// customers are, and shortcuts. Every number sits next to what improves it.
export default function InsightsScreen() {
  const navigate = useNavigate();
  const { provider, can } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("today");
  const refs = { today: useRef(null), quality: useRef(null), customers: useRef(null) };

  useEffect(() => {
    api.getInsights().then(setData).catch((e) => setError(e.message || "Couldn't load insights"));
  }, []);

  const jump = (id) => {
    setTab(id);
    refs[id].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col pb-6 lg:mx-auto lg:w-full lg:max-w-3xl">
      <PageTitle eyebrow="Insights for" title={provider.name} />
      <PillTabs
        className="mt-3.5"
        value={tab}
        onChange={jump}
        items={[
          { id: "today", label: "Today" },
          { id: "quality", label: "Service quality" },
          { id: "customers", label: "Customers" },
        ]}
      />

      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
        {!data && !error && <Skeleton />}
        {data && (
          <>
            <div ref={refs.today} className="scroll-mt-4">
              <TodayCard today={data.today} />
            </div>

            <div ref={refs.quality} className="scroll-mt-4">
              <QualityCard week={data.week} prev={data.prevWeek} />
            </div>

            <div ref={refs.customers} className="scroll-mt-4">
              <CustomersCard customers={data.customers} />
            </div>
          </>
        )}

        <h2 className="mt-3 font-display text-[19px] font-bold text-ink">Quick links</h2>
        <div className="grid grid-cols-4 gap-2.5">
          <QuickLink icon={<StarIcon width={24} height={24} />} label="Reviews" onClick={() => navigate("/feedback")} />
          <QuickLink icon={<ChatIcon width={24} height={24} />} label="Complaints" onClick={() => navigate("/feedback?tab=complaints")} />
          <QuickLink icon={<ClockIcon width={24} height={24} />} label="Job history" onClick={() => navigate("/dashboard?tab=done")} />
          <QuickLink icon={<LinkIcon width={24} height={24} />} label="Your link" onClick={() => navigate("/grow")} />
          {can(["staff.view", "staff.manage"]) && <QuickLink icon={<UsersIcon width={24} height={24} />} label="Staff" onClick={() => navigate("/profile/staff")} />}
          {can("profile.edit") && <QuickLink icon={<CalendarIcon width={24} height={24} />} label="Hours" onClick={() => navigate("/profile/availability")} />}
          <QuickLink icon={<PhoneIcon width={24} height={24} />} label="Help" onClick={() => navigate("/profile/help")} />
          <QuickLink icon={<ShieldCheckIcon width={24} height={24} />} label="Ready check" onClick={() => navigate("/ready")} />
        </div>
      </div>
    </div>
  );
}

function TodayCard({ today }) {
  const hours = today.hourly ? today.hourly.slice(FIRST_HOUR, LAST_HOUR + 1) : null;
  const peak = hours ? Math.max(...hours) : 0;
  const top = Math.max(500, Math.ceil(peak / 500) * 500);
  const nowHour = new Date().getHours();
  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="flex items-start justify-between">
        <div className="grid grid-cols-2 gap-6">
          {today.earned !== null && (
            <div>
              <p className="text-[12.5px] text-ink-muted">Collected today</p>
              <p className="font-display text-[26px] font-extrabold text-ink tabular">{inr(today.earned)}</p>
            </div>
          )}
          <div>
            <p className="text-[12.5px] text-ink-muted">Jobs done</p>
            <p className="font-display text-[26px] font-extrabold text-ink tabular">{today.jobs}</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-go-wash px-2.5 py-1 text-[12px] font-extrabold text-go-soft">
          <span className="h-[7px] w-[7px] rounded-full bg-go" /> Live
        </span>
      </div>
      {hours && (
        <div>
          <div className="relative grid h-[120px] items-end gap-[5px] border-b border-gray-200" style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0, 1fr))` }} role="img" aria-label={`Money collected by hour today, up to ${inr(peak)} in one hour`}>
            <span className="absolute inset-x-0 top-0 border-t border-dashed border-gray-100" />
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" />
            {hours.map((v, i) => {
              const hour = FIRST_HOUR + i;
              const ahead = hour > nowHour;
              const h = ahead ? 4 : v > 0 ? Math.max(4, Math.round((v / top) * 120)) : 0;
              return <span key={hour} title={`${hourLabel(hour)}: ${inr(v)}`} className={`rounded-t-[5px] ${ahead ? "bg-gray-200" : "bg-brand-glow"}`} style={{ height: h }} />;
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-ink-muted tabular">
            {[8, 11, 14, 17, 19].map((h) => (
              <span key={h}>{hourLabel(h)}</span>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-ink-muted">Top line = {inr(top)} in an hour · grey = hours still ahead</p>
        </div>
      )}
      {today.jobs === 0 && <p className="text-[13px] text-ink-muted">No job finished yet today. Money shows here as soon as you close one with the customer's code.</p>}
    </Card>
  );
}

function QualityCard({ week, prev }) {
  const navigate = useNavigate();
  const items = [
    {
      label: "Requests missed",
      value: week.missed,
      delta: <Delta now={week.missed} before={prev.missed} goodWhenUp={false} />,
      note: "Rang out with no answer",
    },
    {
      label: "Declined",
      value: `${week.declinedPct}%`,
      delta: <Delta now={week.declinedPct} before={prev.declinedPct} goodWhenUp={false} suffix="%" />,
      note: `${week.declined} of ${week.requests} requests`,
    },
    {
      label: "Time to accept",
      value: week.avgAcceptSec === null ? "—" : week.avgAcceptSec < 90 ? `${week.avgAcceptSec} sec` : `${Math.round(week.avgAcceptSec / 60)} min`,
      delta: null,
      note: "Top pros: under 30 sec",
    },
    { label: "On time at the door", value: week.onTimePct === null ? "—" : `${week.onTimePct}%`, delta: null, note: "Started within the booked slot" },
    { label: "1–2★ jobs", value: week.lowRated, delta: null, note: week.avgRating ? `Average rating ${week.avgRating}` : "No ratings this week" },
    { label: "Online in working hours", value: week.onlinePct === null ? "—" : `${week.onlinePct}%`, delta: null, note: week.offlineHours ? `Offline ${week.offlineHours} h this week` : "No time offline" },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3.5">
        <h2 className="font-display text-[18px] font-bold text-ink">Service quality · last 7 days</h2>
        <p className="text-[12px] text-ink-muted">Customers see pros with better numbers first</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-4 p-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col gap-0.5">
            <span className="text-[12.5px] text-ink-muted">{it.label}</span>
            <span className="flex items-baseline gap-1.5 text-[20px] font-extrabold text-ink tabular">
              {it.value} {it.delta}
            </span>
            <span className="text-[12px] text-ink-muted">{it.note}</span>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <button onClick={() => navigate("/feedback")} className="h-12 w-full rounded-[14px] bg-ink text-[14.5px] font-extrabold text-ground">
          See what customers said
        </button>
      </div>
    </Card>
  );
}

function CustomersCard({ customers }) {
  const navigate = useNavigate();
  const rows = [
    { dot: "bg-ink", label: "New", note: "First booking with you, last 30 days", value: customers.new },
    { dot: "bg-go", label: "Repeat", note: "Booked you again in the last 60 days", value: customers.repeat },
    { dot: "bg-marigold", label: "Gone quiet", note: "Last booking 60–365 days ago", value: customers.quiet },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3.5">
        <h2 className="font-display text-[18px] font-bold text-ink">Customers</h2>
      </div>
      <div className="px-4 py-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between border-b border-dashed border-gray-100 py-2.5 last:border-0">
            <span className="flex items-start gap-2.5">
              <span className={`mt-1.5 h-[9px] w-[9px] rounded-full ${r.dot}`} />
              <span>
                <span className="block text-[15px] font-bold text-ink">{r.label}</span>
                <span className="block text-[12px] text-ink-muted">{r.note}</span>
              </span>
            </span>
            <span className="text-[18px] font-extrabold text-ink tabular">{r.value}</span>
          </div>
        ))}
      </div>
      {customers.quiet > 0 && (
        <div className="px-4 pb-4">
          <button onClick={() => navigate("/grow/offers")} className="h-12 w-full rounded-[14px] bg-raised text-[14.5px] font-extrabold text-ink">
            Win back {customers.quiet} customer{customers.quiet === 1 ? "" : "s"} with an offer
          </button>
        </div>
      )}
    </Card>
  );
}

function QuickLink({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 text-center text-[12.5px] font-semibold text-ink">
      <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-card">{icon}</span>
      {label}
    </button>
  );
}

function Skeleton() {
  return (
    <>
      {[220, 300, 200].map((h) => (
        <div key={h} className="animate-pulse rounded-[22px] bg-card" style={{ height: h }} />
      ))}
    </>
  );
}

const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
