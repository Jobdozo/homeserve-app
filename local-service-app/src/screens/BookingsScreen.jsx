import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { useApp } from "../context/AppContext";
import CategoryPhoto from "../components/CategoryPhoto";
import DesktopBookings from "../components/DesktopBookings";
import { BookingsIcon, ChevronRightIcon } from "../components/icons";
import { TabTitle, EmptyState, inr } from "../components/ui";

const ACTIVE = ["Pending", "Accepted", "In Progress"];
const TABS = [
  { id: "all", label: "All", test: () => true },
  { id: "active", label: "Active", test: (b) => ACTIVE.includes(b.status) },
  { id: "done", label: "Done", test: (b) => b.status === "Completed" },
  { id: "cancelled", label: "Cancelled", test: (b) => b.status === "Cancelled" || b.status === "Rejected" },
];

// Status as a coloured pill, in the customer's words.
const STATUS = {
  Pending: { text: "Waiting to accept", cls: "bg-marigold-light text-marigold-dark" },
  Accepted: { text: "Confirmed", cls: "bg-brand-light text-brand-dark" },
  "In Progress": { text: "In progress", cls: "bg-brand text-white" },
  Completed: { text: "Done", cls: "bg-trust-light text-trust-dark" },
  Cancelled: { text: "Cancelled", cls: "bg-red-50 text-red-600" },
  Rejected: { text: "Not accepted", cls: "bg-red-50 text-red-600" },
};

export default function BookingsScreen() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { bookings, getService, getProvider } = useApp();
  const [tab, setTab] = useState("all");

  // Bookings from the same checkout share an orderId — one card per order and provider.
  const groups = useMemo(() => {
    const t = TABS.find((x) => x.id === tab);
    const sorted = [...bookings].filter(t.test).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const byKey = new Map();
    const out = [];
    for (const b of sorted) {
      const key = b.orderId ? `${b.orderId}|${b.providerId}` : b.id;
      if (!byKey.has(key)) {
        const g = { key, items: [] };
        byKey.set(key, g);
        out.push(g);
      }
      byKey.get(key).items.push(b);
    }
    return out;
  }, [bookings, tab]);
  // one order with several services is one visit
  const activeCount = new Set(bookings.filter((b) => ACTIVE.includes(b.status)).map((b) => (b.orderId ? `${b.orderId}|${b.providerId}` : b.id))).size;

  return (
    <>
      {/* Desktop gets its own full-width page (components/DesktopBookings). */}
      {isDesktop && (
        <div className="hidden lg:block">
          <DesktopBookings />
        </div>
      )}
      <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-4 lg:hidden">
        <TabTitle title="My bookings" subtitle={activeCount ? `${activeCount} active right now` : bookings.length ? "All your visits in one place" : undefined} />

        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`h-[38px] flex-shrink-0 rounded-xl px-4 text-[13.5px] font-semibold transition-colors ${tab === t.id ? "bg-ink text-white" : "border border-line bg-white text-ink"}`}
            >
              {t.label}
              {t.id === "active" && activeCount > 0 && <span className="ml-1.5 rounded-full bg-marigold px-1.5 text-[11px] font-extrabold text-ink">{activeCount}</span>}
            </button>
          ))}
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={<BookingsIcon width={28} height={28} />}
            title={tab === "all" ? "No bookings yet" : `Nothing ${TABS.find((t) => t.id === tab).label.toLowerCase()} here`}
            text={tab === "all" ? "Book a trusted professional in a minute — you'll follow every step here." : undefined}
            action="Book a service"
            onAction={() => navigate("/categories")}
          />
        ) : (
          <div className="flex flex-col gap-3 px-4">
            {groups.map(({ key, items }, i) => {
              const first = items[0];
              const service = getService(first.serviceId) || first.service || {};
              const provider = getProvider(first.providerId);
              const st = STATUS[first.status] || STATUS.Pending;
              const total = items.reduce((sum, b) => sum + (b.amount || 0), 0);
              const names = items.map((b) => b.service?.name || getService(b.serviceId)?.name).filter(Boolean);
              return (
                <button
                  key={key}
                  onClick={() => navigate(`/booking/${first.id}`)}
                  className="flex animate-fade-up gap-3 rounded-[20px] bg-white p-3 text-left shadow-card active:scale-[0.99]"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <span className="relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-2xl bg-brand-light">
                    <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={72} />
                    {items.length > 1 && (
                      <span className="absolute bottom-1 right-1 rounded-md bg-ink/80 px-1.5 text-[10.5px] font-bold text-white">+{items.length - 1}</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">
                        {names[0]}
                        {names.length > 1 && <span className="font-semibold text-ink-muted"> + {names.length - 1} more</span>}
                      </span>
                      <span className={`flex-shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.text}</span>
                    </span>
                    <span className="truncate text-[12.5px] text-ink-muted">
                      {formatWhen(first.date, first.time)}
                      {provider?.name ? ` · ${provider.name}` : ""}
                    </span>
                    <span className="mt-auto flex items-center justify-between">
                      <span className="text-[11.5px] text-ink-muted">#{first.ref || first.id.slice(0, 8)}</span>
                      <span className="flex items-center gap-1 text-[14.5px] font-extrabold text-ink tabular">
                        {inr(total)} <ChevronRightIcon width={15} height={15} className="text-ink-muted" />
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// "Sun 12 Oct · 10 AM"
function formatWhen(iso, time) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const start = String(time || "").split("–")[0].trim().replace(":00", "");
  return start ? `${day} · ${start}` : day;
}
