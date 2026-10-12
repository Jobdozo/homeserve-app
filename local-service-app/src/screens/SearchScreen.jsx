import { useMemo, useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { BackIcon, SearchIcon, StarIcon, ChevronRightIcon, XIcon } from "../components/icons";
import { formatCount, discountPct, dedupeByName } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import CartBar from "../components/CartBar";

export default function SearchScreen() {
  const navigate = useNavigate();
  const { categories, services, searchCatalog } = useApp();
  const routeState = useLocation().state;
  const [query, setQuery] = useState(routeState?.q || "");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // When the first load held only the top services, the server searches the rest.
  useEffect(() => {
    const t = setTimeout(() => searchCatalog(query), 350);
    return () => clearTimeout(t);
  }, [query, searchCatalog]);

  const q = query.trim().toLowerCase();

  const matchedCategories = useMemo(() => {
    if (!q) return [];
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, q]);

  const matchedServices = useMemo(() => {
    if (!q) return [];
    return dedupeByName(
      services.filter((s) => s.name.toLowerCase().includes(q) || (s.tagline || "").toLowerCase().includes(q))
    );
  }, [services, q]);

  const noResults = q && matchedCategories.length === 0 && matchedServices.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 px-4 pb-3 pt-1 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8 lg:pb-5 lg:pt-6">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-ink-soft hover:bg-gray-200"
        >
          <BackIcon width={18} height={18} />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-2.5 shadow-card">
          <SearchIcon width={17} height={17} className="flex-shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for AC repair, cleaning, plumbing..."
            className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-muted"
          />
          {query && (
            <button onClick={() => setQuery("")} className="flex-shrink-0 text-ink-muted hover:text-ink-soft">
              <XIcon width={15} height={15} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8 lg:pb-16">
        {!q && (
          <>
            <h2 className="mb-3 text-[13px] font-bold text-ink lg:text-[15px]">Browse by Category</h2>
            <div className="grid grid-cols-3 gap-3 lg:grid-cols-4 lg:gap-4">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/category/${c.id}`)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-line py-4 shadow-card hover:-translate-y-0.5 active:scale-95"
                >
                  <CategoryIcon categoryId={c.id} size={40} />
                  <span className="px-1 text-center text-[11px] font-medium leading-tight text-ink-soft">
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {noResults && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">🔍</span>
            <p className="text-sm text-ink-muted">No results for "{query}"</p>
            <p className="text-xs text-ink-muted">Try a different keyword like "AC" or "cleaning"</p>
          </div>
        )}

        {matchedCategories.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-[13px] font-bold text-ink lg:text-[15px]">Categories</h2>
            <div className="flex flex-wrap gap-2">
              {matchedCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/category/${c.id}`)}
                  className="flex items-center gap-2 rounded-full border border-line py-1.5 pl-1.5 pr-3.5 hover:bg-mist"
                >
                  <CategoryIcon categoryId={c.id} size={26} />
                  <span className="text-[12.5px] font-medium text-ink-soft">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {matchedServices.length > 0 && (
          <div>
            <h2 className="mb-2 text-[13px] font-bold text-ink lg:text-[15px]">Services</h2>
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
              {matchedServices.map((s) => {
                const pct = discountPct(s.price, s.originalPrice);
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/find-service/${s.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left shadow-card hover:-translate-y-0.5 active:scale-[0.99]"
                  >
                    <CategoryIcon categoryId={s.categoryId} imageUrl={s.imageUrl} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink">{s.name}</p>
                      {s.reviewCount > 0 && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
                          <StarIcon filled width={11} height={11} />
                          <span className="font-medium text-ink-soft">{s.rating}</span>
                          <span>({formatCount(s.reviewCount)})</span>
                        </div>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[13px] font-bold text-ink">₹{s.price}</span>
                        {pct > 0 && (
                          <>
                            <span className="text-[11px] text-ink-muted line-through">₹{s.originalPrice}</span>
                            <span className="rounded-full bg-trust-light px-1.5 py-0.5 text-[9.5px] font-bold text-trust-dark">
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
          </div>
        )}
      </div>
      <CartBar />
    </div>
  );
}
