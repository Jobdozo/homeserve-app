import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { StarIcon, ChevronRightIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryPhoto from "../components/CategoryPhoto";
import CartBar from "../components/CartBar";

// Same service, every vendor offering it: tapping a service card anywhere in
// the app lands here first instead of jumping straight into one provider's
// listing, so a customer can compare who's available before picking one.
// `services` (from AppContext) is already scoped to the customer's own PIN
// code server-side (see store.listServices' pincode filter), so every row
// here is already a real, bookable option in their area — nothing further
// to filter for that.
//
// Vendors are grouped by exact service name within the same category, since
// that's the only cross-provider signal the catalog has today: a Service
// Catalog item (Super Admin → Services → Catalog) applied to several
// providers keeps the same name on all of them, which is what makes them
// group here. A one-off, differently-worded listing groups with itself only.
const norm = (s) => String(s || "").trim().toLowerCase();

export default function ServiceProvidersScreen() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const { services, categories, getProvider } = useApp();

  const anchor = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const category = categories.find((c) => c.id === anchor?.categoryId);

  const vendors = useMemo(() => {
    if (!anchor) return [];
    return services
      .filter((s) => s.categoryId === anchor.categoryId && norm(s.name) === norm(anchor.name))
      .map((s) => ({ service: s, provider: getProvider(s.providerId) }))
      .sort((a, b) => b.service.rating - a.service.rating || a.service.price - b.service.price);
  }, [services, anchor, getProvider]);

  if (!anchor) {
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
      <ScreenHeader title={anchor.name} maxWidth="lg:max-w-3xl" />

      <div className="flex-1 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8 lg:pb-16">
        <p className="text-[12.5px] text-gray-400">
          {category?.name ? `${category.name} · ` : ""}
          {vendors.length} vendor{vendors.length === 1 ? "" : "s"} available in your area
        </p>

        <div className="mt-4 space-y-3 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {vendors.map(({ service: s, provider: p }) => {
            const pct = discountPct(s.price, s.originalPrice);
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/service/${s.id}`)}
                className="flex w-full items-start gap-3 rounded-2xl border border-gray-100 p-3 text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.99] lg:p-4"
              >
                <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={64} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-gray-900 lg:text-[14.5px]">
                    {p?.name || "Service provider"}
                  </p>
                  {(s.tagline || p?.serviceArea) && (
                    <p className="truncate text-[11px] text-gray-400">{s.tagline || p.serviceArea}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13.5px] font-bold text-gray-900">₹{s.price}</span>
                    {pct > 0 && (
                      <>
                        <span className="text-[11.5px] text-gray-400 line-through">₹{s.originalPrice}</span>
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
                          {pct}% OFF
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {s.reviewCount > 0 ? (
                      <span className="flex items-center gap-1 text-[11px] text-gray-500">
                        <StarIcon filled width={11} height={11} />
                        <span className="font-medium text-gray-700">{s.rating}</span>
                        <span>({formatCount(s.reviewCount)})</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400">New — no reviews yet</span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available in your area
                    </span>
                  </div>
                </div>
                <ChevronRightIcon width={16} height={16} className="mt-1 flex-shrink-0 text-gray-300" />
              </button>
            );
          })}
        </div>
      </div>
      <CartBar />
    </div>
  );
}
