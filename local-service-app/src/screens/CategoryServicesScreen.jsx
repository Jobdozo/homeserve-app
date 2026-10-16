import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { useApp } from "../context/AppContext";
import { BackIcon, SearchIcon } from "../components/icons";
import { formatCount, discountPct, dedupeByName } from "../utils/format";
import CategoryPhoto from "../components/CategoryPhoto";
import { RatingPill, PhotoPriceTag, OfferTag, inr } from "../components/ui";

// Quick filters over the list (client-side, nothing to load).
const FILTERS = [
  { id: "top", label: "Rated 4.5+", test: (s) => s.reviewCount > 0 && s.rating >= 4.5 },
  { id: "budget", label: "Under ₹500", test: (s) => Number(s.price) < 500 },
  { id: "offer", label: "Offers", test: (s) => discountPct(s.price, s.originalPrice) > 0 },
];
import CartBar from "../components/CartBar";
import Seo from "../components/Seo";
import ComingSoon from "../components/ComingSoon";
import DesktopCategoryPage from "../components/DesktopCategoryPage";
import SubcategoryChips from "../components/SubcategoryChips";
import { chipsFor } from "../utils/subcategories";
import { CatalogLoading } from "../utils/useCatalogItem";

export default function CategoryServicesScreen() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { categories, subcategories, services, catalogReady, homeLayout, loadCatalogScope } = useApp();
  useEffect(() => {
    if (catalogReady && categoryId) loadCatalogScope({ category: categoryId });
  }, [catalogReady, categoryId, loadCatalogScope]);
  const [filter, setFilter] = useState("");
  const counts = homeLayout?.bookingCounts || {};
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

  // How many professionals offer each service name here (the same name groups on the next screen).
  // …and their combined rating, so a name isn't "New" just because the listing shown has no reviews yet.
  const vendorCount = useMemo(() => {
    const out = {};
    for (const s of inCategory) {
      const k = `${s.categoryId}|${String(s.name || "").trim().toLowerCase()}`;
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }, [inCategory]);
  const nameRating = useMemo(() => {
    const acc = {};
    for (const s of inCategory) {
      if (!s.reviewCount) continue;
      const k = `${s.categoryId}|${String(s.name || "").trim().toLowerCase()}`;
      const a = (acc[k] = acc[k] || { reviews: 0, sum: 0 });
      a.reviews += s.reviewCount;
      a.sum += s.rating * s.reviewCount;
    }
    return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { count: a.reviews, rating: Math.round((a.sum / a.reviews) * 10) / 10 }]));
  }, [inCategory]);
  const pros = useMemo(() => new Set(inCategory.map((s) => s.providerId)).size, [inCategory]);
  const minPrice = useMemo(() => (inCategory.length ? Math.min(...inCategory.map((s) => Number(s.price) || 0)) : null), [inCategory]);
  // Most booked first, then best reviewed; then the quick filter.
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    return [...displayList]
      .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || b.reviewCount - a.reviewCount)
      .filter((s) => !f || f.test(s));
  }, [displayList, filter, counts]);

  const aggregate = useMemo(() => {
    const rated = inCategory.filter((s) => s.reviewCount > 0);
    if (!rated.length) return null;
    const totalReviews = rated.reduce((sum, s) => sum + s.reviewCount, 0);
    const weighted = rated.reduce((sum, s) => sum + s.rating * s.reviewCount, 0) / totalReviews;
    return { rating: Math.round(weighted * 10) / 10, reviews: totalReviews };
  }, [inCategory]);

  // Until the catalog has arrived the category isn't known yet: show loading, never
  // "not found" (with its noindex), or Google may record a real category as missing.
  if (!category && !catalogReady) return <CatalogLoading />;
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
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:hidden">
      <div className="bg-white px-4 pb-0 pt-2 shadow-[0_1px_0_#E8E5F2]">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink active:scale-95">
            <BackIcon width={19} height={19} />
          </button>
          <button onClick={() => navigate("/search")} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-mist px-3.5 text-left text-[14px] text-ink-muted active:scale-[0.99]">
            <SearchIcon width={17} height={17} className="flex-shrink-0 text-brand" strokeWidth={2.4} />
            <span className="truncate">Search in {category.name}</span>
          </button>
        </div>
        <div className="pb-1 pt-3.5">
          <h1 className="font-display text-[28px] font-extrabold leading-[1.05] text-ink">{category.name}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {pros} professional{pros === 1 ? "" : "s"} near you{minPrice != null ? ` · from ${inr(minPrice)}` : ""}
            {aggregate ? ` · ${aggregate.rating}★` : ""}
          </p>
        </div>
        <SubcategoryChips chips={chips} value={activeSub} onChange={setSub} categoryId={category.id} showAll={showAll} className="-mx-4 mt-3 px-4" />
      </div>

      {inCategory.length === 0 ? (
        catalogReady ? (
          <div className="p-4">
            <ComingSoon categoryName={category.name} />
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-36 rounded-[22px]" />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3.5">
            {FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(on ? "" : f.id)}
                  aria-pressed={on}
                  className={`flex h-[38px] flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-semibold transition-colors ${
                    on ? "bg-ink text-white" : "border border-line bg-white text-ink"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3.5 px-4 pb-6">
            {shown.length === 0 && <p className="py-10 text-center text-[13px] text-ink-muted">Nothing matches that filter here.</p>}
            {shown.map((s, i) => {
              const pct = discountPct(s.price, s.originalPrice);
              const key = `${s.categoryId}|${s.name.trim().toLowerCase()}`;
              const vendors = vendorCount[key] || 1;
              const r = nameRating[key] || { rating: s.rating, count: 0 };
              const count = counts[s.id] || 0;
              if (i === 0) {
                return (
                  <button key={s.id} onClick={() => navigate(`/find-service/${s.id}`)} className="animate-fade-up overflow-hidden rounded-[22px] bg-white text-left shadow-card active:scale-[0.99]">
                    <span className="relative block h-[200px]">
                      <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={200} />
                      <PhotoPriceTag className="absolute left-3 top-3">
                        {s.name} · {inr(s.price)}
                        {pct > 0 && <s className="ml-1 opacity-60">{inr(s.originalPrice)}</s>}
                      </PhotoPriceTag>
                      {pct > 0 && <OfferTag className="absolute bottom-3 left-3">{pct}% OFF</OfferTag>}
                    </span>
                    <span className="flex flex-col gap-1.5 p-3.5">
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-display text-[19px] font-bold leading-tight text-ink">{s.name}</span>
                        <RatingPill rating={r.rating} count={r.count} showCount />
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <span className="rounded-lg bg-trust-light px-2 py-1 text-[12px] font-semibold text-trust-dark">
                          {vendors} pro{vendors === 1 ? "" : "s"} near you
                        </span>
                        {count > 0 && <span className="rounded-lg bg-mist px-2 py-1 text-[12px] font-semibold text-brand-dark">Booked {formatCount(count)} times</span>}
                      </span>
                    </span>
                  </button>
                );
              }
              return (
                <button key={s.id} onClick={() => navigate(`/find-service/${s.id}`)} className="flex animate-fade-up gap-3 rounded-[22px] bg-white p-3 text-left shadow-card active:scale-[0.99]">
                  <span className="relative h-[116px] w-[100px] flex-shrink-0 overflow-hidden rounded-2xl">
                    <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={100} />
                    {pct > 0 && <OfferTag className="absolute left-1.5 top-1.5 !px-1.5 !text-[10.5px]">{pct}% OFF</OfferTag>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{s.name}</span>
                      <RatingPill rating={r.rating} count={r.count} size="sm" />
                    </span>
                    <span className="text-[12.5px] text-ink-muted">
                      {vendors} pro{vendors === 1 ? "" : "s"} near you{count > 0 ? ` · booked ${formatCount(count)}×` : ""}
                    </span>
                    {s.includes?.[0] && <span className="line-clamp-1 text-[12.5px] text-ink-muted">{s.includes[0]}</span>}
                    <span className="mt-auto flex items-baseline gap-1.5">
                      <span className="font-display text-[18px] font-extrabold text-ink">{inr(s.price)}</span>
                      {pct > 0 && <s className="text-[12px] text-ink-muted">{inr(s.originalPrice)}</s>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <CartBar />
    </div>
    </>
  );
}
