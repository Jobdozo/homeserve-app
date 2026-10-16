import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { BackIcon, SearchIcon, MapPinIcon, ChevronRightIcon, ShieldCheckIcon } from "../components/icons";
import { RatingPill, OfferTag, ProviderMark, SectionTitle, inr } from "../components/ui";
import { discountPct } from "../utils/format";
import CategoryPhoto from "../components/CategoryPhoto";
import Seo from "../components/Seo";

// tikdum.com/jammu (every service in the city) and tikdum.com/jammu/ac-repair (one category in
// the city): who really serves the city, what they offer and for how much, the areas covered,
// and the common questions — all from live data (server/src/cityPages.js). An address that
// isn't a city page goes home, as any unknown address does.
export default function CityPageScreen() {
  const { city, categoryId } = useParams();
  const [page, setPage] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setPage(null);
    setMissing(false);
    api
      .cityPage(city, categoryId)
      .then((p) => alive && setPage(p))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [city, categoryId]);

  if (missing) return <Navigate to="/home" replace />;
  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:mx-auto lg:w-full lg:max-w-3xl">
      {!page ? <Loading /> : page.kind === "city" ? <CityHub page={page} /> : <CityCategory page={page} />}
    </div>
  );
}

function Header({ title, subtitle, searchLabel }) {
  const navigate = useNavigate();
  return (
    <div className="bg-white px-4 pb-4 pt-2 shadow-[0_1px_0_#E8E5F2] lg:rounded-b-3xl">
      <div className="flex items-center gap-2.5">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/home"))} aria-label="Go back" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink active:scale-95">
          <BackIcon width={19} height={19} />
        </button>
        <button onClick={() => navigate("/search")} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-mist px-3.5 text-left text-[14px] text-ink-muted active:scale-[0.99]">
          <SearchIcon width={17} height={17} className="flex-shrink-0 text-brand" strokeWidth={2.4} />
          <span className="truncate">{searchLabel}</span>
        </button>
      </div>
      <div className="pt-3.5">
        <h1 className="font-display text-[28px] font-extrabold leading-[1.05] text-ink lg:text-[34px]">{title}</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

// The most-offered services first; the full list is on the category page.
const SHOWN = 12;

const ratingText = (r) => (r ? ` · ${r.rating}★ from ${r.reviews} review${r.reviews === 1 ? "" : "s"}` : "");

function CityCategory({ page }) {
  const navigate = useNavigate();
  const { city, category } = page;
  const n = page.providers.length;
  return (
    <>
      <Seo
        title={`${category.name} in ${city.name}${page.from ? ` — from ${inr(page.from)}` : ""}`}
        description={`Book ${/\bservices?$/i.test(category.name.trim()) ? category.name : `${category.name} services`} in ${city.name} on Tikdum: ${n} verified local provider${n === 1 ? "" : "s"}, ${page.serviceCount} service${page.serviceCount === 1 ? "" : "s"}${page.from ? ` from ${inr(page.from)}` : ""}${page.rating ? `, rated ${page.rating.rating}★` : ""}. Serving ${page.areas.slice(0, 3).map((a) => a.name).join(", ")}${page.areas.length > 3 ? " and more" : ""}.`}
        path={`/${city.slug}/${category.id}`}
      />
      <Header
        title={`${category.name} in ${city.name}`}
        searchLabel={`Search in ${category.name}`}
        subtitle={`${n} verified provider${n === 1 ? "" : "s"}${page.from != null ? ` · from ${inr(page.from)}` : ""}${ratingText(page.rating)}`}
      />

      <section className="px-4 pt-5">
        <SectionTitle>Services &amp; prices</SectionTitle>
        <div className="mt-3 flex flex-col gap-3">
          {page.services.slice(0, SHOWN).map((s) => {
            const pct = discountPct(s.price, s.originalPrice);
            return (
              <button key={s.id} onClick={() => navigate(`/find-service/${s.id}`)} className="flex gap-3 rounded-[22px] bg-white p-3 text-left shadow-card active:scale-[0.99]">
                <span className="relative h-[96px] w-[88px] flex-shrink-0 overflow-hidden rounded-2xl">
                  <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={100} />
                  {pct > 0 && <OfferTag className="absolute left-1.5 top-1.5 !px-1.5 !text-[10.5px]">{pct}% OFF</OfferTag>}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{s.name}</span>
                    <RatingPill rating={s.rating} count={s.reviews} size="sm" />
                  </span>
                  <span className="text-[12.5px] text-ink-muted">
                    {s.providers} pro{s.providers === 1 ? "" : "s"} in {city.name}
                  </span>
                  {s.include && <span className="line-clamp-1 text-[12.5px] text-ink-muted">{s.include}</span>}
                  <span className="mt-auto flex items-baseline gap-1.5">
                    <span className="text-[11.5px] font-semibold text-ink-muted">from</span>
                    <span className="font-display text-[18px] font-extrabold text-ink">{inr(s.price)}</span>
                    {pct > 0 && <s className="text-[12px] text-ink-muted">{inr(s.originalPrice)}</s>}
                  </span>
                </span>
              </button>
            );
          })}
          {page.services.length > SHOWN && (
            <Link to={`/category/${category.id}`} className="flex items-center justify-center gap-1 rounded-[18px] border border-line bg-white py-3 text-[14px] font-bold text-brand active:scale-[0.99]">
              See all {page.services.length} {category.name} services
              <ChevronRightIcon width={16} height={16} />
            </Link>
          )}
        </div>
      </section>

      <section className="px-4 pt-7">
        <SectionTitle>{category.name} providers in {city.name}</SectionTitle>
        <div className="mt-3 flex flex-col gap-2.5">
          {page.providers.map((p) => (
            <Link key={p.id} to={`/provider/${p.id}`} className="flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-card active:scale-[0.99]">
              <ProviderMark provider={p} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-bold text-ink">{p.name}</span>
                <span className="flex items-center gap-1 text-[12.5px] text-ink-muted">
                  <ShieldCheckIcon width={13} height={13} className="text-trust" />
                  Verified · {p.services} service{p.services === 1 ? "" : "s"}
                  {p.from != null ? ` · from ${inr(p.from)}` : ""}
                </span>
              </span>
              <RatingPill rating={p.rating} count={p.reviews} size="sm" />
            </Link>
          ))}
        </div>
      </section>

      <Areas page={page} />
      <Faqs faqs={page.faqs} />

      <section className="px-4 pb-8 pt-7">
        <SectionTitle>More services in {city.name}</SectionTitle>
        <div className="mt-3 flex flex-wrap gap-2">
          {page.others.map((o) => (
            <Link key={o.id} to={`/${city.slug}/${o.id}`} className="rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold text-ink active:scale-[0.98]">
              {o.name} in {city.name}
            </Link>
          ))}
          <Link to={`/category/${category.id}`} className="rounded-xl bg-ink px-3 py-2 text-[13px] font-semibold text-white active:scale-[0.98]">
            All {category.name} →
          </Link>
        </div>
      </section>
    </>
  );
}

function CityHub({ page }) {
  const { city } = page;
  return (
    <>
      <Seo
        title={`Home Services in ${city.name}`}
        description={`Book trusted home services in ${city.name} on Tikdum — ${page.categories.slice(0, 4).map((c) => c.name).join(", ")}${page.categories.length > 4 ? " and more" : ""}. ${page.providers} verified provider${page.providers === 1 ? "" : "s"} serving ${page.areas.length} area${page.areas.length === 1 ? "" : "s"}, with prices shown before you book.`}
        path={`/${city.slug}`}
      />
      <Header
        title={`Home services in ${city.name}`}
        searchLabel={`Search services in ${city.name}`}
        subtitle={`${page.providers} verified provider${page.providers === 1 ? "" : "s"} · ${page.categories.length} kinds of service${ratingText(page.rating)}`}
      />
      <section className="px-4 pt-5">
        <SectionTitle>What you can book</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {page.categories.map((c) => (
            <Link key={c.id} to={`/${city.slug}/${c.id}`} className="overflow-hidden rounded-[20px] bg-white shadow-card active:scale-[0.99]">
              <span className="block h-[96px]">
                <CategoryPhoto categoryId={c.id} imageUrl={c.imageUrl} size={200} />
              </span>
              <span className="flex flex-col gap-0.5 p-3">
                <span className="text-[14px] font-bold leading-snug text-ink">{c.name}</span>
                <span className="text-[12px] text-ink-muted">
                  {c.providers} pro{c.providers === 1 ? "" : "s"}
                  {c.from != null ? ` · from ${inr(c.from)}` : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Areas page={page} />
      <div className="pb-8">
        <Faqs faqs={page.faqs} />
      </div>
    </>
  );
}

function Areas({ page }) {
  if (!page.areas?.length) return null;
  return (
    <section className="px-4 pt-7">
      <SectionTitle>Areas we cover in {page.city.name}</SectionTitle>
      <div className="mt-3 flex flex-wrap gap-2">
        {page.areas.map((a) => (
          <span key={a.name} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-ink shadow-card">
            <MapPinIcon width={14} height={14} className="text-brand" />
            {a.name}
            <span className="font-normal text-ink-muted">{a.pincodes.join(", ")}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

function Faqs({ faqs }) {
  if (!faqs?.length) return null;
  return (
    <section className="px-4 pt-7">
      <SectionTitle>Common questions</SectionTitle>
      <div className="mt-3 overflow-hidden rounded-[20px] bg-white shadow-card">
        {faqs.map((f, i) => (
          <details key={f.q} className={`group ${i ? "border-t border-line" : ""}`} open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[14.5px] font-bold text-ink">
              {f.q}
              <ChevronRightIcon width={16} height={16} className="flex-shrink-0 text-ink-muted transition-transform group-open:rotate-90" />
            </summary>
            <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Loading() {
  return (
    <div className="space-y-3 p-4">
      <div className="skeleton h-24 rounded-[22px]" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-28 rounded-[22px]" />
      ))}
    </div>
  );
}
