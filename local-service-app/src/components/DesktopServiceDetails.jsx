import { Link, useNavigate } from "react-router-dom";
import { StarIcon, CheckIcon } from "./icons";
import { formatCount } from "../utils/format";
import CategoryPhoto from "./CategoryPhoto";

// Desktop-only service detail page: photo + what's included on the left, a
// sticky booking card on the right. Same data and cart actions as the phone
// screen (ServiceDetailsScreen).
export default function DesktopServiceDetails({ service, provider, category, pct, inCart, onCart }) {
  const navigate = useNavigate();

  return (
    <div className="pb-20">
      <div className="mx-auto max-w-6xl px-8 pt-8">
        <nav className="flex items-center gap-2 text-[13px] text-gray-400">
          <Link to="/home" className="hover:text-brand">Home</Link>
          {category && (
            <>
              <span>/</span>
              <Link to={`/category/${category.id}`} className="hover:text-brand">{category.name}</Link>
            </>
          )}
          <span>/</span>
          <span className="text-gray-700">{service.name}</span>
        </nav>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-[1.15fr_1fr] items-start gap-12 px-8 pt-6">
        {/* Left: photo + details */}
        <div>
          <div className="h-[420px] overflow-hidden rounded-3xl bg-gray-100">
            <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={200} rounded="" />
          </div>

          {service.includes?.length > 0 && (
            <section className="mt-10">
              <h2 className="text-[22px] font-extrabold tracking-tight text-gray-900">What's included</h2>
              <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3.5">
                {service.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] text-gray-700">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckIcon width={13} height={13} strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10 rounded-2xl bg-brand-light/60 p-6">
            <p className="text-[16px] font-bold text-brand-dark">Booking through Tikdum is protected</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-brand-dark/75">
              Genuine service guarantee, damage protection up to ₹10,000, fair price guarantee and SOS help — only for bookings made in the app.
            </p>
            <Link to="/booking-protection" className="mt-3 inline-block text-[13.5px] font-semibold text-brand hover:underline">
              Learn more
            </Link>
          </section>
        </div>

        {/* Right: sticky booking card */}
        <aside className="sticky top-6 rounded-3xl bg-white p-8 shadow-card">
          {service.isAd && (
            <span className="mb-3 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700">
              Sponsored
            </span>
          )}
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-gray-900">{service.name}</h1>

          <div className="mt-3 flex items-center gap-2 text-[15px] text-gray-500">
            {service.reviewCount > 0 ? (
              <>
                <StarIcon filled width={17} height={17} />
                <span className="font-bold text-gray-900">{service.rating}</span>
                <span>({formatCount(service.reviewCount)} review{service.reviewCount === 1 ? "" : "s"})</span>
              </>
            ) : (
              <span className="text-gray-400">New service — no reviews yet</span>
            )}
          </div>

          {provider && (
            <button
              onClick={() => navigate(`/provider/${provider.id}`)}
              className="mt-4 flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 text-left hover:border-brand/40"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light text-[22px]">{provider.avatar || "🧑"}</span>
              <span>
                <span className="block text-[12px] text-gray-400">Provided by</span>
                <span className="block text-[15px] font-bold text-gray-900">{provider.name}</span>
              </span>
            </button>
          )}

          {(service.tagline || service.description) && (
            <p className="mt-4 text-[14.5px] leading-relaxed text-gray-500">{service.tagline || service.description}</p>
          )}

          {service.highlights?.length > 0 && (
            <div className="mt-6 grid grid-cols-4 gap-3">
              {service.highlights.map((h) => (
                <div key={h.label} className="flex flex-col items-center gap-1.5 rounded-xl bg-gray-50 px-1.5 py-4 text-center">
                  <span className="text-2xl">{h.icon}</span>
                  <span className="text-[11.5px] font-medium leading-tight text-gray-600">{h.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 border-t border-gray-100 pt-6">
            <p className="text-[13px] text-gray-400">Starting from</p>
            <div className="mt-0.5 flex items-center gap-3">
              <p className="text-[34px] font-extrabold leading-none text-gray-900">₹{service.price}</p>
              {pct > 0 && (
                <>
                  <p className="text-[17px] text-gray-400 line-through">₹{service.originalPrice}</p>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[12px] font-bold text-emerald-700">{pct}% OFF</span>
                </>
              )}
            </div>
            <button
              onClick={onCart}
              className="mt-5 w-full rounded-xl bg-brand py-4 text-[16px] font-bold text-white shadow-card transition-colors hover:bg-brand-dark active:scale-[0.99]"
            >
              {inCart ? "Go to Cart" : "Add to Cart"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
