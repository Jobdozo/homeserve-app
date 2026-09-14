import { useNavigate, useParams } from "react-router-dom";
import ScreenHeader from "../components/ScreenHeader";
import { StarIcon, CheckIcon } from "../components/icons";
import { useApp } from "../context/AppContext";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";

export default function ServiceDetailsScreen() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { getService, getProvider, cart, addToCart } = useApp();
  const service = getService(serviceId);
  const provider = service ? getProvider(service.providerId) : null;
  const pct = service ? discountPct(service.price, service.originalPrice) : 0;
  const inCart = service ? cart.some((item) => item.serviceId === service.id) : false;

  if (!service) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Service not found.</p>
        <button onClick={() => navigate("/home")} className="text-sm font-semibold text-brand">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Service Details" maxWidth="lg:max-w-5xl" />

      <div className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-5xl lg:flex-row lg:gap-10 lg:px-8 lg:pb-16">
        <div className="flex h-40 flex-shrink-0 items-center justify-center overflow-hidden lg:h-72 lg:w-80 lg:flex-shrink-0 lg:rounded-3xl">
          <CategoryIcon categoryId={service.categoryId} size={160} variant="vivid" fill rounded="" />
        </div>

        <div className="flex-1 px-4 pb-24 pt-4 lg:px-0 lg:pb-0 lg:pt-0">
          <h1 className="text-xl font-bold text-gray-900 lg:text-3xl">{service.name}</h1>
          {service.reviewCount > 0 ? (
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <StarIcon filled width={15} height={15} />
              <span className="font-semibold text-gray-800">{service.rating}</span>
              <span>({formatCount(service.reviewCount)})</span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-400">New service — no reviews yet</p>
          )}
          {provider && (
            <button
              onClick={() => navigate(`/provider/${provider.id}`)}
              className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-gray-500 hover:text-brand"
            >
              <span>{provider.avatar}</span> by <span className="font-semibold underline">{provider.name}</span>
            </button>
          )}
          {(service.tagline || service.description) && (
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500 lg:max-w-lg lg:text-[14px]">
              {service.tagline || service.description}
            </p>
          )}

          <p className="mt-3 text-xs text-gray-400 lg:hidden">Starting from</p>
          <div className="flex items-center gap-2 lg:hidden">
            <p className="text-2xl font-extrabold text-brand">₹{service.price}</p>
            {pct > 0 && (
              <>
                <p className="text-sm text-gray-400 line-through">₹{service.originalPrice}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  {pct}% OFF
                </span>
              </>
            )}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 lg:max-w-lg lg:gap-3">
            {service.highlights.map((h) => (
              <div
                key={h.label}
                className="flex flex-col items-center gap-1 rounded-xl bg-gray-50 px-1.5 py-3 text-center lg:gap-1.5 lg:py-4"
              >
                <span className="text-xl lg:text-2xl">{h.icon}</span>
                <span className="text-[9.5px] font-medium leading-tight text-gray-600 lg:text-[11px]">{h.label}</span>
              </div>
            ))}
          </div>

          {service.includes?.length > 0 && (
            <>
              <h2 className="mt-5 text-[15px] font-bold text-gray-900 lg:text-lg">Service Includes</h2>
              <ul className="mt-2 space-y-2 lg:max-w-lg">
                {service.includes.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[13px] text-gray-700 lg:text-[14px]">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckIcon width={12} height={12} strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-8 hidden items-center gap-5 lg:flex">
            <div>
              <p className="text-xs text-gray-400">Starting from</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-extrabold text-gray-900">₹{service.price}</p>
                {pct > 0 && (
                  <>
                    <p className="text-sm text-gray-400 line-through">₹{service.originalPrice}</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {pct}% OFF
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => (inCart ? navigate("/cart") : addToCart(service.id))}
              className="rounded-xl bg-brand px-8 py-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-dark active:scale-[0.98]"
            >
              {inCart ? "Go to Cart" : "Add to Cart"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-100 bg-white px-4 py-3 lg:hidden">
        <div>
          <p className="text-[11px] text-gray-400">Starting from</p>
          <div className="flex items-center gap-1.5">
            <p className="text-lg font-extrabold text-gray-900">₹{service.price}</p>
            {pct > 0 && <p className="text-[11px] text-gray-400 line-through">₹{service.originalPrice}</p>}
          </div>
        </div>
        <button
          onClick={() => (inCart ? navigate("/cart") : addToCart(service.id))}
          className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-card active:scale-[0.98]"
        >
          {inCart ? "Go to Cart" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}
