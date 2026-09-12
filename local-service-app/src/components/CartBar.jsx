import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function CartBar() {
  const navigate = useNavigate();
  const { cart, getService } = useApp();

  if (cart.length === 0) return null;

  const total = cart.reduce((sum, item) => sum + (getService(item.serviceId)?.price || 0), 0);

  return (
    <div className="sticky bottom-0 flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3 lg:mx-auto lg:w-full lg:max-w-3xl lg:rounded-t-2xl lg:border lg:px-6 lg:shadow-card">
      <button
        onClick={() => navigate("/cart")}
        className="flex w-full items-center justify-between rounded-xl bg-brand px-4 py-3 text-white active:scale-[0.98]"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand">
            {cart.length}
          </span>
          {cart.length} item{cart.length > 1 ? "s" : ""} · ₹{total}
        </span>
        <span className="text-[13px] font-semibold">View Cart →</span>
      </button>
    </div>
  );
}
