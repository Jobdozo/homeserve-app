import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { StarIcon, ChevronRightIcon } from "./icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryPhoto from "./CategoryPhoto";

const PROTECTION = [
  "Genuine service guarantee",
  "Damage protection up to ₹1,000",
  "Fair price guarantee",
  "SOS & emergency help",
];

const SORTS = [
  { id: "rating", label: "Best rated" },
  { id: "price", label: "Lowest price" },
];

// Desktop-only "choose your professional" page. Same data as the phone screen
// (ServiceProvidersScreen); only the presentation changes.
export default function DesktopServiceProviders({ anchor, category, vendors }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState("rating");

  const list = useMemo(() => {
    const l = [...vendors];
    if (sort === "price") return l.sort((a, b) => a.service.price - b.service.price || b.service.rating - a.service.rating);
    return l;
  }, [vendors, sort]);

  const lowest = vendors.length ? Math.min(...vendors.map((v) => v.service.price)) : anchor.price;

  return (
    <div className="pb-20">
      <section className="relative h-[220px] overflow-hidden bg-gray-900">
        <div className="absolute inset-0">
          <CategoryPhoto categoryId={anchor.categoryId} imageUrl={anchor.imageUrl} size={240} className="object-[center_45%]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/20" />
        <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-8 pb-8 text-white">
          <nav className="mb-3 flex items-center gap-2 text-[13px] text-white/70">
            <Link to="/home" className="hover:text-white">Home</Link>
            {category && (
              <>
                <span>/</span>
                <Link to={`/category/${category.id}`} className="hover:text-white">{category.name}</Link>
              </>
            )}
            <span>/</span>
            <span className="text-white">{anchor.name}</span>
          </nav>
          <h1 className="text-[38px] font-extrabold leading-tight tracking-tight">{anchor.name}</h1>
          <p className="mt-1.5 text-[15px] text-white/80">
            {vendors.length} professional{vendors.length === 1 ? "" : "s"} available in your area
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_340px] items-start gap-10 px-8 pt-10">
        {/* Providers */}
        <div>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[22px] font-extrabold tracking-tight text-gray-900">Choose your professional</h2>
            {vendors.length > 1 && (
              <div className="flex items-center gap-2">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                      sort === s.id ? "bg-brand text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {list.map(({ service: s, provider: p }) => {
              const pct = discountPct(s.price, s.originalPrice);
              // Service area is free text; a bare number ("30") says nothing, so skip it
              // and phrase distances ("5 km") as a sentence.
              const rawArea = String(p?.serviceArea || "").trim();
              const area = /[a-z]/i.test(rawArea) ? (/^\d/.test(rawArea) ? `Serves within ${rawArea}` : rawArea) : "";
              const sub = s.tagline || area;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/service/${s.id}`)}
                  className="group flex w-full items-center gap-5 rounded-2xl bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-[34px]">
                    {p?.avatar || "🧑"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-bold text-gray-900">{p?.name || "Service provider"}</p>
                    {sub && <p className="mt-0.5 truncate text-[13.5px] text-gray-400">{sub}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
                      {s.reviewCount > 0 ? (
                        <span className="flex items-center gap-1 text-gray-500">
                          <StarIcon filled width={14} height={14} />
                          <span className="font-semibold text-gray-800">{s.rating}</span>
                          <span>({formatCount(s.reviewCount)})</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">New on Tikdum</span>
                      )}
                      <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available in your area
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[22px] font-extrabold text-gray-900">₹{s.price}</span>
                      {pct > 0 && <span className="text-[14px] text-gray-400 line-through">₹{s.originalPrice}</span>}
                    </div>
                    {pct > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">{pct}% OFF</span>}
                    <span className="mt-1 flex items-center gap-1 text-[13.5px] font-semibold text-brand group-hover:underline">
                      View &amp; book <ChevronRightIcon width={14} height={14} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary sidebar */}
        <aside className="sticky top-6 space-y-4">
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <div className="h-40 overflow-hidden">
              <CategoryPhoto categoryId={anchor.categoryId} imageUrl={anchor.imageUrl} size={140} />
            </div>
            <div className="p-5">
              <p className="text-[15px] font-bold text-gray-900">{anchor.name}</p>
              <p className="mt-1 text-[13px] text-gray-400">Starting from</p>
              <p className="text-[26px] font-extrabold leading-tight text-gray-900">₹{lowest}</p>
              <p className="mt-2 text-[13px] text-gray-500">Pick a professional on the left to see details and book.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-card">
            <p className="text-[14px] font-bold text-gray-900">Booking through Tikdum includes</p>
            <ul className="mt-3 space-y-2.5">
              {PROTECTION.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[13.5px] text-gray-600">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-600">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <Link to="/booking-protection" className="mt-4 inline-block text-[13px] font-semibold text-brand hover:underline">
              How booking protection works
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
