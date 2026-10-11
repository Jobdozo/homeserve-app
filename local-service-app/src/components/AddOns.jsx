import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import CategoryPhoto from "./CategoryPhoto";
import { discountPct } from "../utils/format";
import { AddButton, OfferTag, inr } from "./ui";

// "Add more services": other services from the same provider as the ones the
// customer is looking at or has in the cart, one tap to add. Same provider
// means the same visit — an added service takes the date and time of the first
// item already in the cart, and the customer can still change either.
export default function AddOns({ anchorIds, title = "Add more services", subtitle }) {
  const { services, cart, getService } = useApp();

  const options = useMemo(() => {
    const anchors = anchorIds.map(getService).filter(Boolean);
    const providers = new Set(anchors.map((a) => a.providerId));
    // Ones already added stay in the row (as a − 1 + counter) so the row doesn't jump.
    const taken = new Set(anchorIds);
    const seenNames = new Set(anchors.map((a) => a.name.trim().toLowerCase()));
    const out = [];
    const ranked = services
      .filter((s) => providers.has(s.providerId) && !taken.has(s.id))
      .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0) || a.price - b.price);
    for (const s of ranked) {
      const key = s.name.trim().toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      out.push(s);
      if (out.length >= 12) break;
    }
    return out;
  }, [anchorIds, services, getService]);

  if (options.length === 0) return null;
  const likeId = cart[0]?.serviceId;

  return (
    <section className="min-w-0 max-w-full">
      <h2 className="font-display text-[19px] font-extrabold leading-tight text-ink lg:text-xl">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-muted lg:text-[13px]">{subtitle}</p>}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {options.map((s) => {
          const pct = discountPct(s.price, s.originalPrice);
          return (
            <div key={s.id} className="flex w-[156px] flex-shrink-0 flex-col gap-1.5 lg:w-[176px]">
              <div className="relative h-[116px] overflow-hidden rounded-2xl bg-brand-light">
                <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={156} rounded="" />
                {pct > 0 && <OfferTag className="absolute left-2 top-2 !text-[10.5px]">{pct}% OFF</OfferTag>}
                <AddButton service={s} likeServiceId={likeId} size="sm" className="absolute bottom-2 right-2 w-[78px]" />
              </div>
              <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-ink">{s.name}</p>
              <span className="flex items-baseline gap-1.5">
                <b className="text-[14px] text-ink">{inr(s.price)}</b>
                {pct > 0 && <s className="text-[11.5px] text-ink-muted">{inr(s.originalPrice)}</s>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
