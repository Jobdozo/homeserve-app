// Small shared pieces of the Tikdum look: rating badge, Verified badge, the
// ADD button that turns into a − 2 + counter, and section titles. Colours and
// fonts come from tailwind.config.js (brand, ink, marigold, trust, font-display).
import { useState } from "react";
import { SERVER_URL } from "../api";
import { StarIcon, ShieldCheckIcon, PlusIcon, MinusIcon } from "./icons";
import { useApp } from "../context/AppContext";
import { useAddService } from "./optionsSheetContext";
import { formatCount } from "../utils/format";

export const MAX_QUANTITY = 50;

// Green badge: "4.8 ★". New listings (no reviews) say "New" instead of a fake number.
export function RatingPill({ rating, count, size = "md", showCount = false }) {
  const small = size === "sm";
  if (!count) {
    return (
      <span className={`inline-flex items-center rounded-lg bg-brand-light font-bold text-brand-dark ${small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-[12px]"}`}>
        New
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded-lg bg-trust font-bold text-white ${small ? "px-1.5 py-0.5 text-[11.5px]" : "px-2 py-1 text-[13px]"}`}
        aria-label={`Rated ${rating} out of 5`}
      >
        {Number(rating).toFixed(1)}
        <StarIcon filled width={small ? 10 : 12} height={small ? 10 : 12} fill="#fff" stroke="#fff" />
      </span>
      {showCount && <span className="text-[10.5px] text-ink-muted underline decoration-dotted">{formatCount(count)} review{count === 1 ? "" : "s"}</span>}
    </span>
  );
}

export function VerifiedBadge({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold text-trust ${className}`}>
      <ShieldCheckIcon width={14} height={14} />
      Verified
    </span>
  );
}

// "Kitchen Deep Clean · ₹3,500" laid over a photo.
export function PhotoPriceTag({ children, className = "" }) {
  return <span className={`rounded-[10px] bg-ink/80 px-2 py-1 text-[12px] font-semibold text-white backdrop-blur-sm ${className}`}>{children}</span>;
}

export function OfferTag({ children, className = "" }) {
  return <span className={`whitespace-nowrap rounded-lg bg-marigold px-2 py-0.5 text-[11.5px] font-extrabold text-ink ${className}`}>{children}</span>;
}

// Letter-spaced capitals for section labels ("MOST BOOKED IN JAMMU").
export function SectionLabel({ children, className = "" }) {
  return <p className={`text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-muted ${className}`}>{children}</p>;
}

export function SectionTitle({ children, action, className = "" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <h2 className="font-display text-[20px] font-extrabold leading-tight text-ink lg:text-2xl">{children}</h2>
      {action}
    </div>
  );
}

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// − 2 + . variant "solid" (violet, on photos) or "outline".
export function QtyStepper({ value, onChange, variant = "solid", size = "md", label = "" }) {
  const solid = variant === "solid";
  const h = size === "lg" ? "h-[54px]" : size === "sm" ? "h-[34px]" : "h-10";
  const w = size === "lg" ? "w-11" : size === "sm" ? "w-[30px]" : "w-9";
  return (
    <div className={`flex items-center justify-between rounded-xl ${h} ${solid ? "bg-brand text-white shadow-cta" : "border-[1.5px] border-brand text-brand"}`}>
      <button type="button" aria-label={`One less${label ? ` ${label}` : ""}`} onClick={() => onChange(value - 1)} className={`flex ${h} ${w} items-center justify-center active:scale-90`}>
        <MinusIcon width={15} height={15} strokeWidth={3} />
      </button>
      <span key={value} className="min-w-[18px] animate-pop text-center text-[15px] font-extrabold tabular">
        {value}
      </span>
      <button
        type="button"
        aria-label={`One more${label ? ` ${label}` : ""}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QUANTITY}
        className={`flex ${h} ${w} items-center justify-center active:scale-90 disabled:opacity-40`}
      >
        <PlusIcon width={15} height={15} strokeWidth={3} />
      </button>
    </div>
  );
}

// ADD for one service; once added it becomes the quantity counter. onAdd lets a
// caller open the options sheet instead of adding straight away.
export function AddButton({ service, likeServiceId, onAdd, className = "", size = "md" }) {
  const { cart, updateCartItem, removeFromCart } = useApp();
  const addService = useAddService();
  const line = cart.find((c) => c.serviceId === service.id);
  if (line) {
    const qty = line.quantity || 1;
    return (
      <div className={className}>
        <QtyStepper
          value={qty}
          size={size}
          label={service.name}
          onChange={(n) => (n <= 0 ? removeFromCart(service.id) : updateCartItem(service.id, { quantity: Math.min(n, MAX_QUANTITY) }))}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (onAdd ? onAdd(service) : addService(service, likeServiceId))}
      className={`flex items-center justify-center rounded-xl border-[1.5px] border-brand bg-white font-extrabold tracking-wide text-brand shadow-card transition-transform active:scale-95 ${
        size === "sm" ? "h-[34px] text-[13px]" : "h-10 text-[15px]"
      } ${className}`}
    >
      ADD
    </button>
  );
}

// A provider's photo or logo, else their initials on night violet ("SH").
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase() || "T";
}
export function ProviderMark({ provider, className = "h-12 w-12 rounded-2xl text-[18px]" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`flex flex-shrink-0 items-center justify-center overflow-hidden bg-brand-night font-display font-extrabold text-marigold ${className}`}>
      {provider?.photoUrl && !failed ? (
        <img src={`${SERVER_URL}${provider.photoUrl}`} alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        initials(provider?.name)
      )}
    </span>
  );
}

// "8" -> "8 yrs experience"; text a provider typed ("26 years") stays as typed.
export const expLabel = (e) => (/^\d+(\.\d+)?$/.test(String(e || "").trim()) ? `${String(e).trim()} ${Number(e) === 1 ? "yr" : "yrs"} experience` : String(e || "").trim());

// Service area as customers read it: a bare number is a radius in km.
export const areaLabel = (a) => {
  const t = String(a || "").trim();
  return /^\d+(\.\d+)?$/.test(t) ? `${t} km around` : t;
};

// Title row for the main tabs (Bookings, Categories, Messages, Profile).
export function TabTitle({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-3">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-extrabold leading-tight text-ink">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// Friendly empty state: icon in a soft tile, a line, and one action.
export function EmptyState({ icon, title, text, action, onAction }) {
  return (
    <div className="mx-4 mt-6 flex flex-col items-center gap-2 rounded-[22px] bg-white px-6 py-10 text-center shadow-card">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-light text-brand">{icon}</span>
      <p className="mt-1 font-display text-[19px] font-extrabold text-ink">{title}</p>
      {text && <p className="max-w-[260px] text-[13px] leading-relaxed text-ink-muted">{text}</p>}
      {action && (
        <button onClick={onAction} className="mt-2 rounded-2xl bg-brand px-5 py-2.5 text-[14px] font-bold text-white shadow-cta active:scale-[0.98]">
          {action}
        </button>
      )}
    </div>
  );
}
