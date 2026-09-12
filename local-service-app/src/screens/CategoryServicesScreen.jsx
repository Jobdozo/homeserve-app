import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { StarIcon, ChevronRightIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import CartBar from "../components/CartBar";

export default function CategoryServicesScreen() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { categories, services, showToast } = useApp();

  const category = categories.find((c) => c.id === categoryId);
  const inCategory = useMemo(() => services.filter((s) => s.categoryId === categoryId), [services, categoryId]);

  const aggregate = useMemo(() => {
    const rated = inCategory.filter((s) => s.reviewCount > 0);
    if (!rated.length) return null;
    const totalReviews = rated.reduce((sum, s) => sum + s.reviewCount, 0);
    const weighted = rated.reduce((sum, s) => sum + s.rating * s.reviewCount, 0) / totalReviews;
    return { rating: Math.round(weighted * 10) / 10, reviews: totalReviews };
  }, [inCategory]);

  if (!category) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Category not found.</p>
        <button onClick={() => navigate("/categories")} className="text-sm font-semibold text-brand">
          Back to Categories
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title={category.name} maxWidth="lg:max-w-3xl" />

      <div className="flex-1 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8 lg:pb-16">
        <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3 lg:p-5">
          <CategoryIcon categoryId={category.id} size={48} className="lg:scale-110" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-gray-900 lg:text-base">{category.name}</p>
            {aggregate ? (
              <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500">
                <StarIcon filled width={12} height={12} />
                <span className="font-semibold text-gray-700">{aggregate.rating}</span>({formatCount(aggregate.reviews)}{" "}
                bookings)
              </div>
            ) : (
              <p className="mt-0.5 text-[11.5px] text-gray-400">
                {inCategory.length} service{inCategory.length === 1 ? "" : "s"} available
              </p>
            )}
          </div>
        </div>

        {inCategory.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">🛠️</span>
            <p className="text-sm text-gray-500">No providers in {category.name} yet.</p>
            <button
              onClick={() => showToast("Thanks! We'll notify you when it's available.")}
              className="mt-1 text-xs font-semibold text-brand"
            >
              Notify me when available
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {inCategory.map((s) => {
              const pct = discountPct(s.price, s.originalPrice);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/service/${s.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 p-3 text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.99] lg:p-4"
                >
                  <CategoryIcon categoryId={s.categoryId} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-gray-900 lg:text-[14.5px]">{s.name}</p>
                    {s.reviewCount > 0 ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                        <StarIcon filled width={11} height={11} />
                        <span className="font-medium text-gray-700">{s.rating}</span>
                        <span>({formatCount(s.reviewCount)})</span>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-gray-400">New — no reviews yet</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
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
                  </div>
                  <ChevronRightIcon width={16} height={16} className="flex-shrink-0 text-gray-300" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <CartBar />
    </div>
  );
}
