import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import CategoryPhoto from "./CategoryPhoto";
import { discountPct } from "../utils/format";

// "Add more services": other services from the same provider as the ones the
// customer is looking at or has in the cart, one tap to add. Same provider
// means the same visit — an added service takes the date and time of the first
// item already in the cart, and the customer can still change either.
export default function AddOns({ anchorIds, title = "Add more services", subtitle }) {
  const { services, cart, addToCart, getService } = useApp();

  const options = useMemo(() => {
    const anchors = anchorIds.map(getService).filter(Boolean);
    const providers = new Set(anchors.map((a) => a.providerId));
    const taken = new Set([...anchorIds, ...cart.map((c) => c.serviceId)]);
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
  }, [anchorIds, services, cart, getService]);

  if (options.length === 0) return null;
  const likeId = cart[0]?.serviceId;

  return (
    <section>
      <h2 className="text-[15px] font-bold text-gray-900 lg:text-lg">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11.5px] text-gray-400 lg:text-[13px]">{subtitle}</p>}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {options.map((s) => {
          const pct = discountPct(s.price, s.originalPrice);
          return (
            <div key={s.id} className="w-[148px] flex-shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card lg:w-[176px]">
              <div className="h-[92px] overflow-hidden bg-gray-100 lg:h-[108px]">
                <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={120} rounded="" />
              </div>
              <div className="p-2.5">
                <p className="line-clamp-2 min-h-[32px] text-[12px] font-semibold leading-snug text-gray-900">{s.name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-gray-900">₹{s.price}</span>
                  {pct > 0 && <span className="text-[10.5px] text-gray-400 line-through">₹{s.originalPrice}</span>}
                </div>
                <button
                  onClick={() => addToCart(s.id, likeId)}
                  className="mt-2 w-full rounded-lg border border-brand py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-light active:scale-[0.98]"
                >
                  + Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
