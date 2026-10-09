import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StarIcon } from "./icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryPhoto from "./CategoryPhoto";
import { TypeTile } from "./SubcategoryChips";

// Desktop category page for a category that has types (e.g. AC Services ->
// Window / Split / VRF AC), laid out like Urban Company's service page:
// a "Select a service" panel of picture tiles on the left, the services of the
// chosen type in the middle, and a trust + cart panel on the right.
export default function TypedCategoryLayout({ category, displayList, chips, activeSub, onSub, totalCount, aggregate }) {
  const navigate = useNavigate();
  const { cart, homeLayout } = useApp();
  const counts = homeLayout?.bookingCounts || {};
  const activeName = chips.find((c) => c.id === activeSub)?.name || category.name;

  // Most booked first, then best reviewed.
  const list = useMemo(
    () => [...displayList].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || b.reviewCount - a.reviewCount),
    [displayList, counts]
  );

  return (
    <div className="pb-20">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-8 py-6">
          <nav className="mb-2 flex items-center gap-2 text-[13px] text-gray-400">
            <Link to="/home" className="hover:text-gray-700">Home</Link>
            <span>/</span>
            <Link to="/categories" className="hover:text-gray-700">Categories</Link>
            <span>/</span>
            <span className="text-gray-700">{category.name}</span>
          </nav>
          <h1 className="text-[30px] font-extrabold tracking-tight text-gray-900">{category.name}</h1>
          {aggregate && (
            <p className="mt-1 flex items-center gap-1.5 text-[14px] text-gray-500">
              <StarIcon filled width={14} height={14} />
              <span className="font-semibold text-gray-800">{aggregate.rating}</span>
              <span>({formatCount(aggregate.reviews)} review{aggregate.reviews === 1 ? "" : "s"})</span>
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-[250px_minmax(0,1fr)_290px] items-start gap-8 px-8 pt-8">
        {/* Select a service */}
        <aside className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="mb-4 text-[13.5px] font-semibold text-gray-800">Select a service</p>
          <div role="tablist" aria-label="Type" className="grid grid-cols-3 gap-x-2 gap-y-4">
            <TypeTile name="All" categoryId={category.id} active={activeSub === ""} onClick={() => onSub("")} />
            {chips.map((c) => (
              <TypeTile key={c.id} name={c.name} imageUrl={c.imageUrl} categoryId={category.id} active={activeSub === c.id} onClick={() => onSub(c.id)} />
            ))}
          </div>
        </aside>

        {/* Services of the chosen type */}
        <main>
          <h2 className="text-[22px] font-bold text-gray-900">{activeName}</h2>
          <p className="mb-2 mt-0.5 text-[13px] text-gray-400">
            {list.length} service{list.length === 1 ? "" : "s"}
            {activeSub ? "" : ` across ${chips.length} type${chips.length === 1 ? "" : "s"}`}
          </p>
          {list.map((s) => {
            const pct = discountPct(s.price, s.originalPrice);
            return (
              <div key={s.id} className="flex gap-5 border-b border-gray-100 py-6 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[16.5px] font-semibold text-gray-900">{s.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-gray-500">
                    {s.reviewCount > 0 ? (
                      <>
                        <StarIcon filled width={13} height={13} />
                        <span className="font-medium text-gray-700">{s.rating}</span>
                        <span>({formatCount(s.reviewCount)} reviews)</span>
                      </>
                    ) : (
                      <span className="text-gray-400">New — no reviews yet</span>
                    )}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2">
                    <span className="text-[16px] font-bold text-gray-900">₹{s.price}</span>
                    {pct > 0 && (
                      <>
                        <span className="text-[13px] text-gray-400 line-through">₹{s.originalPrice}</span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{pct}% OFF</span>
                      </>
                    )}
                  </p>
                  {s.includes?.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-dashed border-gray-200 pt-3 text-[13px] text-gray-500">
                      {s.includes.slice(0, 2).map((t) => (
                        <li key={t} className="flex gap-2">
                          <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-gray-400" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button onClick={() => navigate(`/find-service/${s.id}`)} className="mt-3 text-[13.5px] font-semibold text-brand hover:underline">
                    View details
                  </button>
                </div>
                <div className="relative h-[112px] w-[112px] flex-shrink-0">
                  <div className="h-full w-full overflow-hidden rounded-xl bg-gray-50">
                    <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={112} rounded="rounded-xl" />
                  </div>
                  <button
                    onClick={() => navigate(`/find-service/${s.id}`)}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-brand bg-white px-6 py-1.5 text-[13px] font-semibold text-brand shadow-sm hover:bg-brand-light"
                  >
                    Book
                  </button>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <p className="py-16 text-center text-sm text-gray-400">No services here yet.</p>}
        </main>

        {/* Trust + cart */}
        <aside className="sticky top-24 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[14px] font-bold text-gray-900">Tikdum promise</p>
            <ul className="mt-3 space-y-2 text-[13px] text-gray-600">
              {["Verified professionals", "Hassle-free booking", "Transparent pricing"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center">
            {cart.length > 0 ? (
              <>
                <p className="text-[14px] font-semibold text-gray-900">
                  {cart.length} item{cart.length === 1 ? "" : "s"} in your cart
                </p>
                <button onClick={() => navigate("/cart")} className="mt-3 w-full rounded-xl bg-brand py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-dark">
                  View cart
                </button>
              </>
            ) : (
              <p className="py-4 text-[13px] text-gray-400">No items in your cart</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
