import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import CategoryPhoto from "./CategoryPhoto";
import { ArrowRightIcon } from "./icons";
import { cartTotals } from "../utils/cartMath";
import { inr } from "./ui";

// Follows the customer once something is in the cart: what's in it, the total,
// and the way to the booking. The total gently bumps whenever it changes.
export default function CartBar() {
  const navigate = useNavigate();
  const { cart, getService } = useApp();
  if (cart.length === 0) return null;
  const { count, total } = cartTotals(cart, getService);
  const first = getService(cart[0].serviceId);

  return (
    <div className="sticky bottom-0 z-20 flex-shrink-0 animate-slide-up px-4 pb-3 pt-2 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-6">
      <button
        onClick={() => navigate("/cart")}
        className="flex h-[60px] w-full items-center gap-3 rounded-[18px] bg-brand px-3.5 text-left text-white shadow-cta transition-transform active:scale-[0.98]"
      >
        <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border-2 border-white bg-brand-light">
          {first && <CategoryPhoto categoryId={first.categoryId} imageUrl={first.imageUrl} size={36} rounded="rounded-full" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14.5px] font-bold">
            {count} service{count === 1 ? "" : "s"} added
          </span>
          <span key={total} className="w-fit animate-bump text-[12px] text-white/80 tabular">
            {inr(total)} · one visit
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[14.5px] font-bold">
          Continue <ArrowRightIcon width={16} height={16} strokeWidth={2.6} />
        </span>
      </button>
    </div>
  );
}
