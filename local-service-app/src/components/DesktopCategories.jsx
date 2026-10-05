import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { SearchIcon, XIcon } from "./icons";
import { dedupeByName } from "../utils/format";
import CategoryPhoto from "./CategoryPhoto";
import ComingSoon from "./ComingSoon";

// Desktop-only categories page: full-width, photo cards (categories without a
// photo get the same-shaped colour tile, so the grid reads as one set).
export default function DesktopCategories() {
  const navigate = useNavigate();
  const { categories, services, showToast, noCoverage } = useApp();
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = {};
    for (const s of dedupeByName(services)) map[s.categoryId] = (map[s.categoryId] || 0) + 1;
    return map;
  }, [services]);

  const q = query.trim().toLowerCase();
  const shown = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;

  return (
    <div className="pb-20">
      <section className="bg-gradient-to-b from-brand-light/70 via-white to-white">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-10 px-8 pb-10 pt-12">
          <div>
            <h1 className="text-[40px] font-extrabold leading-tight tracking-tight text-gray-900">All categories</h1>
            <p className="mt-2 text-[16px] text-gray-500">
              {categories.length > 0
                ? `${categories.length} categories of home services — pick one to see services and professionals near you.`
                : "Pick a category to see services and professionals near you."}
            </p>
          </div>
          {!noCoverage && categories.length > 0 && (
            <label className="flex w-[380px] flex-shrink-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-card focus-within:border-brand">
              <SearchIcon width={18} height={18} className="flex-shrink-0 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter categories…"
                className="w-full bg-transparent text-[15px] text-gray-800 outline-none placeholder:text-gray-400"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
                  <XIcon width={15} height={15} />
                </button>
              )}
            </label>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-8 pt-4">
        {noCoverage ? (
          <div className="mx-auto max-w-3xl pt-6">
            <ComingSoon />
          </div>
        ) : categories.length === 0 ? (
          <div className="grid grid-cols-4 gap-5" aria-label="Loading categories">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[232px] animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
            <p className="text-[17px] font-bold text-gray-900">No category matches “{query}”</p>
            <p className="mt-1 text-[14px] text-gray-500">Try a different word, or tell us what you need below.</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-5">
            {shown.map((c) => {
              const n = counts[c.id] || 0;
              return (
                <button
                  key={c.id}
                  onClick={() => navigate(`/category/${c.id}`)}
                  className="group overflow-hidden rounded-2xl bg-white text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="h-40 overflow-hidden">
                    <CategoryPhoto categoryId={c.id} size={150} className="transition-transform duration-500 group-hover:scale-105" />
                  </div>
                  <div className="px-4 py-3.5">
                    <p className="truncate text-[15.5px] font-bold text-gray-900">{c.name}</p>
                    <p className="mt-0.5 text-[13px] text-gray-400">{n > 0 ? `${n} service${n === 1 ? "" : "s"}` : "Browse providers"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!noCoverage && (
          <div className="mt-14 flex items-center justify-between gap-8 rounded-3xl bg-brand-light px-10 py-9">
            <div>
              <p className="text-[22px] font-extrabold text-brand-dark">Can't find the service you need?</p>
              <p className="mt-1 text-[15px] text-brand-dark/70">Tell us, we'll add it for you.</p>
            </div>
            <button
              onClick={() => showToast("Thanks! We'll notify you when it's available.")}
              className="flex-shrink-0 rounded-xl bg-brand px-7 py-3.5 text-[15px] font-bold text-white hover:bg-brand-dark"
            >
              Request a Service
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
