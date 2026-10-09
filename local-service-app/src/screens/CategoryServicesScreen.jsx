import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { StarIcon, ChevronRightIcon } from "../components/icons";
import { formatCount, discountPct, dedupeByName } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import CartBar from "../components/CartBar";
import Seo from "../components/Seo";
import ComingSoon from "../components/ComingSoon";
import DesktopCategoryPage from "../components/DesktopCategoryPage";
import SubcategoryChips from "../components/SubcategoryChips";
import { chipsFor } from "../utils/subcategories";

export default function CategoryServicesScreen() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { categories, subcategories, services, catalogReady } = useApp();
  const [params, setParams] = useSearchParams();
  const sub = params.get("type") || "";
  const setSub = (id) => setParams(id ? { type: id } : {}, { replace: true });

  const category = categories.find((c) => c.id === categoryId);
  // Ratings/reviews stay computed from every provider's listing (real
  // activity shouldn't shrink because two providers happen to share a
  // name) — only the cards shown below are deduped by name.
  const inCategory = useMemo(() => services.filter((s) => s.categoryId === categoryId), [services, categoryId]);
  const chips = useMemo(() => chipsFor(subcategories, categoryId, inCategory), [subcategories, categoryId, inCategory]);
  // "All" is offered only while some services have no type (or a hidden one). When every
  // service is sorted into a type, the page opens on the first type instead, like Urban Company.
  const showAll = chips.length > 0 && inCategory.some((s) => !chips.some((c) => c.id === s.subcategoryId));
  // A type the customer picked earlier may vanish (hidden by admin): fall back to the default.
  const activeSub = chips.some((c) => c.id === sub) ? sub : chips.length > 0 && !showAll ? chips[0].id : "";
  const displayList = useMemo(() => dedupeByName(activeSub ? inCategory.filter((s) => s.subcategoryId === activeSub) : inCategory), [inCategory, activeSub]);

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
        <Seo title="Category Not Found" path={`/category/${categoryId}`} noindex />
        <p className="text-sm text-gray-500">Category not found.</p>
        <button onClick={() => navigate("/categories")} className="text-sm font-semibold text-brand">
          Back to Categories
        </button>
      </div>
    );
  }

  return (
    <>
    <Seo
      title={category.name}
      description={`Book ${category.name} services near you on Tikdum — compare ${displayList.length} trusted local provider${displayList.length === 1 ? "" : "s"} and book instantly over WhatsApp.`}
      path={`/category/${category.id}`}
    />
    {/* Desktop gets its own full-width page (components/DesktopCategoryPage). */}
    {isDesktop && (
    <div className="hidden lg:block">
      <DesktopCategoryPage
        category={category}
        displayList={displayList}
        aggregate={aggregate}
        hasAny={inCategory.length > 0}
        catalogReady={catalogReady}
        chips={chips}
        showAll={showAll}
        activeSub={activeSub}
        onSub={setSub}
        totalCount={dedupeByName(inCategory).length}
      />
    </div>
    )}
    <div className="flex flex-1 flex-col lg:hidden">
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
                review{aggregate.reviews === 1 ? "" : "s"})
              </div>
            ) : (
              <p className="mt-0.5 text-[11.5px] text-gray-400">
                {displayList.length} service{displayList.length === 1 ? "" : "s"} available
              </p>
            )}
          </div>
        </div>

        <SubcategoryChips chips={chips} value={activeSub} onChange={setSub} categoryId={category.id} showAll={showAll} className="mt-4" />

        {inCategory.length === 0 ? (
          catalogReady ? (
            <ComingSoon categoryName={category.name} />
          ) : (
            <p className="mt-10 text-center text-xs text-gray-400">Loading…</p>
          )
        ) : (
          <div className="mt-4 space-y-3 lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {displayList.map((s) => {
              const pct = discountPct(s.price, s.originalPrice);
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/find-service/${s.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 p-3 text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.99] lg:p-4"
                >
                  <CategoryIcon categoryId={s.categoryId} imageUrl={s.imageUrl} size={64} />
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
    </>
  );
}
