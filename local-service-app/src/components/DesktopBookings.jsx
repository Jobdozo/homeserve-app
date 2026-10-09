import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StarIcon } from "./icons";
import CategoryPhoto from "./CategoryPhoto";
import { groupBookings } from "../utils/groupBookings";

const ACTIVE = ["Pending", "Accepted", "In Progress"];
const CLOSED = ["Cancelled", "Rejected"];
const TAB_ORDER = ["All", "Pending", "Accepted", "In Progress", "Completed", "Cancelled", "Rejected"];

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

// Desktop-only bookings page: summary tiles, filter chips with counts, an
// "Upcoming" group above "Past bookings", and quick actions on every row. The
// phone list in BookingsScreen is untouched.
export default function DesktopBookings() {
  const navigate = useNavigate();
  const { bookings, getService, getProvider, addToCart } = useApp();
  const [tab, setTab] = useState("All");

  const sorted = useMemo(() => [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [bookings]);

  const counts = useMemo(() => {
    const c = { All: bookings.length };
    for (const b of bookings) c[b.status] = (c[b.status] || 0) + 1;
    return c;
  }, [bookings]);

  const stats = useMemo(() => {
    const active = bookings.filter((b) => ACTIVE.includes(b.status)).length;
    const done = bookings.filter((b) => b.status === "Completed");
    const closed = bookings.filter((b) => CLOSED.includes(b.status)).length;
    return { active, completed: done.length, closed, spent: done.reduce((n, b) => n + Number(b.amount || 0), 0) };
  }, [bookings]);

  const filtered = tab === "All" ? sorted : sorted.filter((b) => b.status === tab);
  const upcoming = tab === "All" ? filtered.filter((b) => ACTIVE.includes(b.status)) : [];
  const past = tab === "All" ? filtered.filter((b) => !ACTIVE.includes(b.status)) : filtered;

  const tiles = [
    { label: "Active", value: stats.active, tone: "text-blue-600" },
    { label: "Completed", value: stats.completed, tone: "text-emerald-600" },
    { label: "Cancelled or rejected", value: stats.closed, tone: "text-red-500" },
    { label: "Spent on completed jobs", value: `₹${stats.spent}`, tone: "text-gray-900" },
  ];

  const rebook = (serviceIds) => {
    serviceIds.forEach((id) => addToCart(id));
    navigate("/cart");
  };

  // An order with several services from one provider shows as one row: one Request ID, the total, the services listed.
  const renderGroup = (g) => renderRow(g.first, g.count > 1 ? g : null);

  const renderRow = (b, g) => {
    const service = getService(b.serviceId);
    if (!service) return null;
    const provider = getProvider(b.providerId);
    const canChat = ACTIVE.includes(b.status);
    const canRate = b.status === "Completed" && !b.reviewed;
    const canRebook = !ACTIVE.includes(b.status);
    const stop = (fn) => (e) => {
      e.stopPropagation();
      fn();
    };
    return (
      <div
        key={b.id}
        role="link"
        tabIndex={0}
        onClick={() => navigate(`/booking/${b.id}`)}
        onKeyDown={(e) => e.key === "Enter" && navigate(`/booking/${b.id}`)}
        className="flex cursor-pointer items-center gap-5 rounded-2xl bg-white p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
      >
        <div className="h-[92px] w-[92px] flex-shrink-0 overflow-hidden rounded-xl">
          <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={92} rounded="rounded-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <p className="truncate text-[17px] font-bold text-gray-900">{g ? `${g.count} services` : service.name}</p>
            <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${statusStyles[b.status] || "bg-gray-100 text-gray-600"}`}>
              {b.status}
            </span>
          </div>
          <p className="mt-1 text-[14px] text-gray-600">
            {formatDate(b.date)} · {String(b.time || "").split("–")[0].trim()}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-gray-400">
            {provider?.name ? `${provider.name} · ` : ""}
            {b.address?.line || "—"}
          </p>
          {g && <p className="mt-0.5 line-clamp-2 text-[13px] text-gray-500">{g.items.map((i) => getService(i.serviceId)?.name).filter(Boolean).join(" · ")}</p>}
          <p className="mt-0.5 text-[12px] text-gray-400">Request ID: #{b.ref || b.id}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-3">
          <p className="text-[20px] font-extrabold text-gray-900">₹{g ? g.total : b.amount}</p>
          <div className="flex items-center gap-2">
            {canChat && (
              <button onClick={stop(() => navigate(`/chat/${b.id}`))} className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-[13px] font-semibold text-gray-700 hover:border-brand hover:text-brand">
                Chat
              </button>
            )}
            {canRate && (
              <button onClick={stop(() => navigate(`/review/${b.id}`))} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-[13px] font-semibold text-amber-700 hover:bg-amber-100">
                <StarIcon filled width={12} height={12} /> Rate
              </button>
            )}
            {canRebook && (
              <button onClick={stop(() => rebook(g ? g.items.map((i) => i.serviceId) : [service.id]))} className="rounded-lg bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-dark">
                Book again
              </button>
            )}
            <button onClick={stop(() => navigate(`/booking/${b.id}`))} className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-[13px] font-semibold text-gray-700 hover:border-gray-300">
              Details
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-20">
      <section className="bg-gradient-to-b from-brand-light/70 via-white to-white">
        <div className="mx-auto max-w-6xl px-8 pb-8 pt-12">
          <h1 className="text-[40px] font-extrabold leading-tight tracking-tight text-gray-900">My bookings</h1>
          <p className="mt-2 text-[16px] text-gray-500">Track your jobs, chat with your professionals and book again in one click.</p>

          {bookings.length > 0 && (
            <div className="mt-8 grid grid-cols-4 gap-4">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-card">
                  <p className={`text-[30px] font-extrabold leading-none ${t.tone}`}>{t.value}</p>
                  <p className="mt-2 text-[13.5px] text-gray-500">{t.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-8 pt-4">
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-white px-8 py-20 text-center shadow-card">
            <span className="text-5xl">🗓️</span>
            <p className="text-[20px] font-bold text-gray-900">No bookings yet</p>
            <p className="text-[15px] text-gray-500">When you book a service it will show up here.</p>
            <button onClick={() => navigate("/categories")} className="mt-2 rounded-xl bg-brand px-7 py-3 text-[15px] font-bold text-white hover:bg-brand-dark">
              Browse services
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 pb-6">
              {TAB_ORDER.filter((t) => t === "All" || counts[t] > 0).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                    tab === t ? "bg-brand text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t}
                  <span className={`ml-1.5 ${tab === t ? "text-white/75" : "text-gray-400"}`}>{counts[t] || 0}</span>
                </button>
              ))}
            </div>

            {upcoming.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-4 text-[20px] font-extrabold tracking-tight text-gray-900">Upcoming &amp; active</h2>
                <div className="space-y-4">{groupBookings(upcoming).map(renderGroup)}</div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                {tab === "All" && <h2 className="mb-4 text-[20px] font-extrabold tracking-tight text-gray-900">Past bookings</h2>}
                <div className="space-y-4">{groupBookings(past).map(renderGroup)}</div>
              </section>
            )}

            {filtered.length === 0 && (
              <p className="rounded-2xl bg-white px-8 py-14 text-center text-[15px] text-gray-500 shadow-card">No {tab.toLowerCase()} bookings.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
