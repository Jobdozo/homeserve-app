import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StarIcon } from "./icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryPhoto from "./CategoryPhoto";
import CategoryBannerImage from "./CategoryBannerImage";
import CategoryIcon from "./CategoryIcon";
import ComingSoon from "./ComingSoon";
import TypedCategoryLayout from "./TypedCategoryLayout";

const SORTS = [
  { id: "popular", label: "Popular" },
  { id: "rating", label: "Top rated" },
  { id: "discount", label: "Biggest discount" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
];

// Desktop-only category page: photo banner, sort bar, 4-column service grid and
// a strip of other categories. The mobile list in CategoryServicesScreen is
// untouched.
export default function DesktopCategoryPage({ category, displayList, aggregate, hasAny, catalogReady, chips = [], showAll = true, activeSub = "", onSub, totalCount }) {
  const navigate = useNavigate();
  const { categories, homeLayout } = useApp();
  const [sort, setSort] = useState("popular");
  const counts = homeLayout?.bookingCounts || {};

  const sorted = useMemo(() => {
    const list = [...displayList];
    const pct = (s) => discountPct(s.price, s.originalPrice);
    switch (sort) {
      case "rating":
        return list.sort((a, b) => (b.reviewCount > 0) - (a.reviewCount > 0) || b.rating - a.rating || b.reviewCount - a.reviewCount);
      case "discount":
        return list.sort((a, b) => pct(b) - pct(a));
      case "price-asc":
        return list.sort((a, b) => a.price - b.price);
      case "price-desc":
        return list.sort((a, b) => b.price - a.price);
      default:
        return list.sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || b.reviewCount - a.reviewCount);
    }
  }, [displayList, sort, counts]);

  const others = categories.filter((c) => c.id !== category.id).slice(0, 10);

  if (chips.length > 0) {
    return <TypedCategoryLayout category={category} displayList={displayList} chips={chips} showAll={showAll} activeSub={activeSub} onSub={onSub} totalCount={totalCount} aggregate={aggregate} />;
  }

  return (
    <div className="pb-20">
      {/* Banner */}
      <section className="relative h-[280px] overflow-hidden bg-gray-900">
        <div className="absolute inset-0">
          <CategoryBannerImage category={category} categoryId={category.id} size={300} fallbackClassName="object-[center_62%]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-8 pb-9 text-white">
          <nav className="mb-3 flex items-center gap-2 text-[13px] text-white/70">
            <Link to="/home" className="hover:text-white">Home</Link>
            <span>/</span>
            <Link to="/categories" className="hover:text-white">Categories</Link>
            <span>/</span>
            <span className="text-white">{category.name}</span>
          </nav>
          <h1 className="text-[44px] font-extrabold leading-tight tracking-tight">{category.name}</h1>
          <div className="mt-2 flex items-center gap-4 text-[15px] text-white/85">
            <span>
              {displayList.length} service{displayList.length === 1 ? "" : "s"}
            </span>
            {aggregate && (
              <span className="flex items-center gap-1.5">
                <StarIcon filled width={15} height={15} />
                <span className="font-semibold text-white">{aggregate.rating}</span>
                <span className="text-white/70">({formatCount(aggregate.reviews)} review{aggregate.reviews === 1 ? "" : "s"})</span>
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-8">
        {!hasAny ? (
          <div className="mx-auto max-w-3xl pt-10">
            {catalogReady ? <ComingSoon categoryName={category.name} /> : <p className="py-16 text-center text-sm text-gray-400">Loading…</p>}
          </div>
        ) : (
          <>
            {/* Sort bar */}
            <div className="flex items-center justify-between gap-6 pb-6 pt-8">
              <div className="flex flex-wrap items-center gap-2">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                      sort === s.id ? "bg-brand text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Service grid */}
            <div className="grid grid-cols-4 gap-5">
              {sorted.map((s) => {
                const pct = discountPct(s.price, s.originalPrice);
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/find-service/${s.id}`)}
                    className="group relative flex flex-col justify-start overflow-hidden rounded-2xl bg-white text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    {pct > 0 && (
                      <span className="absolute left-3 top-3 z-10 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white">
                        {pct}% OFF
                      </span>
                    )}
                    <div className="h-44 w-full flex-shrink-0 overflow-hidden">
                      <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={140} className="transition-transform duration-500 group-hover:scale-105" />
                    </div>
                    <div className="flex w-full flex-1 flex-col p-4">
                      <p className="line-clamp-2 min-h-[2.6em] text-[15px] font-bold leading-snug text-gray-900">{s.name}</p>
                      {/* Always reserve the rating row so prices line up across cards. */}
                      <div className="mt-1.5 flex h-[18px] items-center gap-1 text-[13px] text-gray-500">
                        {s.reviewCount > 0 && (
                          <>
                            <StarIcon filled width={13} height={13} />
                            <span className="font-semibold text-gray-700">{s.rating}</span>
                            <span>({formatCount(s.reviewCount)})</span>
                          </>
                        )}
                      </div>
                      <div className="mt-auto flex items-baseline gap-2 pt-2">
                        <span className="text-[17px] font-extrabold text-gray-900">₹{s.price}</span>
                        {pct > 0 && <span className="text-[13px] text-gray-400 line-through">₹{s.originalPrice}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Other categories */}
        {others.length > 0 && (
          <section className="pt-16">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-[24px] font-extrabold tracking-tight text-gray-900">Explore other categories</h2>
              <Link to="/categories" className="text-[14px] font-semibold text-brand hover:underline">
                See all
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {others.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/category/${c.id}`)}
                  className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-white py-2 pl-2 pr-5 text-[14px] font-semibold text-gray-800 transition-colors hover:border-brand hover:text-brand"
                >
                  <CategoryIcon categoryId={c.id} size={32} rounded="rounded-full" />
                  {c.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
