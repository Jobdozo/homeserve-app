// Small shared pieces of the Business app's dark design (see the redesign canvas).
import { useNavigate } from "react-router-dom";
import { BackIcon } from "./icons";

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// "SHOWING ORDERS FOR" / big name — the top of every main tab.
export function PageTitle({ eyebrow, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 lg:px-0 lg:pt-0">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-ink-muted">{eyebrow}</p>}
        <h1 className="font-display text-[24px] font-extrabold leading-tight text-ink lg:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-shrink-0 gap-2">{right}</div>}
    </div>
  );
}

// A screen opened from a tab: back button, title, optional action.
export function SubHeader({ title, subtitle, right, back = -1 }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 px-4 pt-4 lg:px-0 lg:pt-0">
      <button onClick={() => navigate(back)} aria-label="Back" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-card text-ink lg:hidden">
        <BackIcon width={20} height={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[21px] font-extrabold text-ink lg:text-[26px]">{title}</h1>
        {subtitle && <p className="truncate text-[12.5px] text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Pill tabs; `items` = [{ id, label, count }]
export function PillTabs({ items, value, onChange, className = "" }) {
  return (
    <div role="tablist" className={`no-scrollbar flex gap-2 overflow-x-auto px-4 lg:px-0 ${className}`}>
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] transition-colors ${
              on ? "bg-ink font-extrabold text-ground" : "bg-card font-bold text-ink"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`rounded-full px-1.5 text-[12px] ${t.hot ? "bg-marigold font-extrabold text-marigold-ink" : on ? "text-ground/70" : "text-ink-muted"}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`rounded-[22px] bg-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mt-2 flex items-baseline justify-between">
      <h2 className="font-display text-[19px] font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

// Order status in the provider's words.
export const JOB_STATUS = {
  Pending: { label: "New", cls: "bg-marigold-wash text-marigold-soft" },
  Accepted: { label: "Confirmed", cls: "bg-brand-light text-brand-dark" },
  "In Progress": { label: "Working", cls: "bg-brand-glow text-ground" },
  Completed: { label: "Done", cls: "bg-go-wash text-go-soft" },
  Rejected: { label: "Declined", cls: "bg-red-50 text-red-700" },
  Cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-700" },
  Swapped: { label: "Passed on", cls: "bg-gray-100 text-ink-muted" },
};
export function StatusChip({ status }) {
  const s = JOB_STATUS[status] || JOB_STATUS.Pending;
  return <span className={`flex-shrink-0 whitespace-nowrap rounded-lg px-2 py-0.5 text-[12px] font-bold ${s.cls}`}>{s.label}</span>;
}

export function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={onChange} className="switch disabled:opacity-50" data-on={!!on}>
      <span className="switch-knob" />
    </button>
  );
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon && <span className="mb-1 flex h-20 w-20 items-center justify-center rounded-full bg-card text-ink-muted">{icon}</span>}
      <p className="font-display text-[19px] font-bold text-ink">{title}</p>
      {text && <p className="max-w-[300px] text-[13.5px] leading-relaxed text-ink-muted">{text}</p>}
      {action}
    </div>
  );
}

// "▲ 22%" / "▼ 4%" — `goodWhenUp` says which way is good news.
export function Delta({ now, before, goodWhenUp = true, suffix = "" }) {
  if (before === null || before === undefined || now === null || now === undefined) return null;
  const diff = Math.round((now - before) * 10) / 10;
  if (!diff) return null;
  const good = goodWhenUp ? diff > 0 : diff < 0;
  return (
    <span className={`text-[12.5px] font-bold ${good ? "text-go-soft" : "text-red-400"}`}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}
      {suffix}
    </span>
  );
}

export const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("") || "?";

// "Today 4–6 PM", "Tomorrow 10 AM–12 PM", "Thu 15 Oct · 4–6 PM"
export function whenLabel(date, time) {
  const d = new Date(date);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dd - t0) / 86400000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${shortSlot(time)}`;
}
export function shortSlot(slot) {
  const m = String(slot || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return slot || "";
  const t = (h, mm) => `${Number(h)}${mm === "00" ? "" : `:${mm}`}`;
  return m[3].toUpperCase() === m[6].toUpperCase()
    ? `${t(m[1], m[2])}–${t(m[4], m[5])} ${m[6].toUpperCase()}`
    : `${t(m[1], m[2])} ${m[3].toUpperCase()}–${t(m[4], m[5])} ${m[6].toUpperCase()}`;
}
