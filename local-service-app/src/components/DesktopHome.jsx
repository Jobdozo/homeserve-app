import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { SearchIcon, StarIcon, ChevronRightIcon } from "./icons";
import { discountPct, dedupeByName, formatCount } from "../utils/format";
import CategoryIcon from "./CategoryIcon";
import CategoryPhoto from "./CategoryPhoto";
import HomeSections, { HeroBanners, PromoBanner } from "./HomeSections";
import ComingSoon from "./ComingSoon";

const PROVIDER_SITE = "https://provider.tikdum.com";

// Hero collage — the real category photos the app already ships with.
const MOSAIC = [
  { id: "home-cleaning", label: "Home cleaning", cls: "col-start-1 row-start-1 row-span-4" },
  { id: "ac-repair", label: "AC repair", cls: "col-start-2 row-start-1 row-span-2" },
  { id: "salon-spa", label: "Salon & spa", cls: "col-start-1 row-start-5 row-span-2" },
  { id: "plumbing", label: "Plumbing", cls: "col-start-2 row-start-3 row-span-4" },
];

function Icon({ d, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

const WHY = [
  {
    title: "Verified professionals",
    text: "Every provider is KYC-checked by our team before they can take a booking.",
    d: ["M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z", "M9 12l2 2 4-4"],
  },
  {
    title: "Clear prices",
    text: "You see the price and any discount before you book — no surprises at the door.",
    d: ["M20 12l-8 8-9-9V3h8l9 9z", "M7.5 7.5h.01"],
  },
  {
    title: "Booking protection",
    text: "If something goes wrong with a booking, our support team steps in to sort it out.",
    d: ["M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z", "M12 8v5", "M12 16h.01"],
  },
  {
    title: "Chat with your pro",
    text: "Message your provider inside the app and track every booking in one place.",
    d: ["M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"],
  },
];

const STEPS = [
  { n: "1", title: "Pick a service", text: "Search or browse the category you need — cleaning, repairs, pest control and more." },
  { n: "2", title: "Choose your professional", text: "Compare nearby providers, ratings and prices, then add your address and time." },
  { n: "3", title: "Relax at home", text: "Your professional arrives at your door. Pay, rate and rebook whenever you like." },
];

function SectionTitle({ title, sub, action }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[26px] font-extrabold tracking-tight text-gray-900">{title}</h2>
        {sub && <p className="mt-1 text-[15px] text-gray-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Hero({ categories, services }) {
  const navigate = useNavigate();
  const { location, locationStatus, detectLocation } = useApp();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const q = query.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return [];
    const cats = categories.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ kind: "category", id: c.id, name: c.name, categoryId: c.id }));
    const svcs = dedupeByName(services.filter((s) => s.name.toLowerCase().includes(q))).map((s) => ({
      kind: "service",
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      price: s.price,
    }));
    return [...cats, ...svcs].slice(0, 6);
  }, [q, categories, services]);

  const go = (item) => {
    navigate(item.kind === "category" ? `/category/${item.id}` : `/find-service/${item.id}`);
  };

  const locationLabel =
    locationStatus === "detecting"
      ? "Detecting your location…"
      : locationStatus === "denied"
        ? "Location off — click to enable"
        : location?.label || "Set your location";

  const tiles = categories.slice(0, 6);

  return (
    <section className="bg-gradient-to-b from-brand-light/70 via-white to-white">
      <div className="mx-auto grid max-w-6xl grid-cols-[1.05fr_1fr] items-center gap-12 px-8 pb-14 pt-12">
        <div>
          <button
            onClick={detectLocation}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-[13.5px] font-semibold text-gray-700 shadow-card hover:border-gray-300"
          >
            <span className="text-brand">●</span>
            {locationLabel}
            <span className="text-gray-400">▾</span>
          </button>

          <h1 className="mt-6 max-w-xl text-[52px] font-extrabold leading-[1.05] tracking-tight text-gray-900">
            Home services,<br />at your doorstep
          </h1>
          <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-gray-500">
            Book trusted, verified professionals for cleaning, repairs, pest control and more — across Jammu &amp; Kashmir.
          </p>

          {/* Search with live suggestions */}
          <div className="relative mt-7 max-w-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (suggestions[0]) go(suggestions[0]);
                else navigate("/search", { state: { q: query } });
              }}
              className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-card focus-within:border-brand"
            >
              <SearchIcon width={19} height={19} className="flex-shrink-0 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                placeholder='Search for "AC repair", "bathroom cleaning"…'
                className="w-full bg-transparent text-[15px] text-gray-800 outline-none placeholder:text-gray-400"
              />
              <button type="submit" className="flex-shrink-0 rounded-xl bg-brand px-5 py-2 text-[14px] font-semibold text-white hover:bg-brand-dark">
                Search
              </button>
            </form>
            {focused && suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1.5 shadow-lg">
                {suggestions.map((s) => (
                  <li key={`${s.kind}-${s.id}`}>
                    <button
                      onMouseDown={() => go(s)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                    >
                      <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg">
                        <CategoryPhoto categoryId={s.categoryId} size={36} rounded="rounded-lg" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-gray-900">{s.name}</span>
                        <span className="block text-[12px] text-gray-400">
                          {s.kind === "category" ? "Category" : `Starting ₹${s.price}`}
                        </span>
                      </span>
                      <ChevronRightIcon width={15} height={15} className="text-gray-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* "What are you looking for?" quick card */}
          {tiles.length > 0 && (
            <div className="mt-8 max-w-xl rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
              <p className="mb-4 text-[15px] font-bold text-gray-900">What are you looking for?</p>
              <div className="grid grid-cols-3 gap-3">
                {tiles.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/category/${c.id}`)}
                    className="flex flex-col items-center gap-2 rounded-xl bg-gray-50 px-2 py-3.5 text-center transition-colors hover:bg-brand-light"
                  >
                    <CategoryIcon categoryId={c.id} size={44} />
                    <span className="text-[12.5px] font-semibold leading-tight text-gray-800">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Photo collage */}
        <div className="grid h-[520px] grid-cols-2 grid-rows-6 gap-3.5">
          {MOSAIC.map((m) => (
            <button
              key={m.id}
              onClick={() => navigate(`/category/${m.id}`)}
              className={`group relative overflow-hidden rounded-2xl bg-gray-100 ${m.cls}`}
            >
              <CategoryPhoto categoryId={m.id} size={200} className="transition-transform duration-500 group-hover:scale-105" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3.5 pb-3 pt-8 text-left text-[13.5px] font-semibold text-white">
                {m.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// Numbers come from the live catalog and booking history — nothing hard-coded.
function TrustStrip({ services, categories, bookingCounts }) {
  const stats = useMemo(() => {
    const list = [];
    const rated = services.filter((s) => Number(s.reviewCount) > 0);
    const reviews = rated.reduce((n, s) => n + Number(s.reviewCount), 0);
    if (reviews > 0) {
      const avg = rated.reduce((n, s) => n + Number(s.rating) * Number(s.reviewCount), 0) / reviews;
      list.push({ value: avg.toFixed(1), label: `Average rating from ${formatCount(reviews)} review${reviews === 1 ? "" : "s"}`, star: true });
    }
    const booked = Object.values(bookingCounts || {}).reduce((n, v) => n + Number(v || 0), 0);
    if (booked > 0) list.push({ value: `${formatCount(booked)}+`, label: "Bookings made on Tikdum" });
    const svc = dedupeByName(services).length;
    if (svc > 0) list.push({ value: `${svc}+`, label: "Services to choose from" });
    if (categories.length > 0) list.push({ value: String(categories.length), label: "Service categories" });
    return list.slice(0, 4);
  }, [services, categories, bookingCounts]);

  if (stats.length === 0) return null;
  return (
    <section className="border-y border-gray-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-8 py-8" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-4">
            {s.star && <StarIcon filled width={30} height={30} />}
            <div>
              <p className="text-[28px] font-extrabold leading-none text-gray-900">{s.value}</p>
              <p className="mt-1.5 text-[13.5px] text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Spotlight({ services, banners }) {
  const navigate = useNavigate();
  const stripBanners = banners.filter((b) => !b.placement || b.placement === "strip");
  const heroBanners = banners.filter((b) => b.placement === "hero");
  const offers = useMemo(
    () =>
      dedupeByName(services)
        .map((s) => ({ service: s, pct: discountPct(s.price, s.originalPrice) }))
        .filter((x) => x.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3),
    [services]
  );
  if (heroBanners.length === 0 && stripBanners.length === 0 && offers.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-8 pt-14">
      <SectionTitle title="In the spotlight" sub="Offers and picks running right now" />
      {heroBanners.length > 0 && <HeroBanners banners={heroBanners} />}
      {stripBanners.length > 0 && (
        <div className={`grid gap-4 ${heroBanners.length > 0 ? "mt-4" : ""}`} style={{ gridTemplateColumns: `repeat(${Math.min(stripBanners.length, 3)}, minmax(0, 1fr))` }}>
          {stripBanners.slice(0, 3).map((b) => (
            <PromoBanner key={b.id} banner={b} />
          ))}
        </div>
      )}
      {offers.length > 0 && (
        <div className={`grid grid-cols-3 gap-5 ${heroBanners.length + stripBanners.length > 0 ? "mt-5" : ""}`}>
          {offers.map(({ service, pct }) => (
            <button
              key={service.id}
              onClick={() => navigate(`/find-service/${service.id}`)}
              className="group relative overflow-hidden rounded-2xl bg-white text-left shadow-card transition-shadow hover:shadow-lg"
            >
              <div className="h-44 overflow-hidden">
                <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={120} className="transition-transform duration-500 group-hover:scale-105" />
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white">{pct}% OFF</span>
              <div className="p-4">
                <p className="text-[16px] font-bold text-gray-900">{service.name}</p>
                <p className="mt-1 text-[14px] text-gray-500">
                  Starting <span className="font-semibold text-gray-900">₹{service.price}</span>{" "}
                  <span className="text-gray-400 line-through">₹{service.originalPrice}</span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryGrid({ categories }) {
  const navigate = useNavigate();
  if (categories.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-8 pt-16">
      <SectionTitle
        title="Explore all categories"
        sub="Everything for your home, in one place"
        action={
          <button onClick={() => navigate("/categories")} className="text-[14px] font-semibold text-brand hover:underline">
            See all
          </button>
        }
      />
      <div className="grid grid-cols-4 gap-5">
        {categories.slice(0, 8).map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/category/${c.id}`)}
            className="group overflow-hidden rounded-2xl bg-white text-left shadow-card transition-shadow hover:shadow-lg"
          >
            <div className="h-36 overflow-hidden">
              <CategoryPhoto categoryId={c.id} size={110} className="transition-transform duration-500 group-hover:scale-105" />
            </div>
            <p className="px-4 py-3.5 text-[15px] font-bold text-gray-900">{c.name}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-8 pt-20">
      <SectionTitle title="How Tikdum works" />
      <div className="grid grid-cols-3 gap-6">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-gray-100 bg-white p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-[16px] font-extrabold text-white">{s.n}</span>
            <p className="mt-4 text-[18px] font-bold text-gray-900">{s.title}</p>
            <p className="mt-2 text-[14.5px] leading-relaxed text-gray-500">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhyTikdum() {
  const navigate = useNavigate();
  return (
    <section className="mt-20 bg-white">
      <div className="mx-auto max-w-6xl px-8 py-16">
        <SectionTitle
          title="Why people book with Tikdum"
          action={
            <button onClick={() => navigate("/booking-protection")} className="text-[14px] font-semibold text-brand hover:underline">
              How booking protection works
            </button>
          }
        />
        <div className="grid grid-cols-4 gap-6">
          {WHY.map((w) => (
            <div key={w.title}>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">
                <Icon d={w.d} />
              </span>
              <p className="mt-4 text-[16.5px] font-bold text-gray-900">{w.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-gray-500">{w.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProviderCta() {
  return (
    <section className="mx-auto max-w-6xl px-8 pt-16">
      <div className="flex items-center justify-between gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-dark px-12 py-12 text-white">
        <div className="max-w-xl">
          <p className="text-[13px] font-bold uppercase tracking-widest text-white/70">For professionals</p>
          <h2 className="mt-2 text-[34px] font-extrabold leading-tight">Grow your business with Tikdum</h2>
          <p className="mt-3 text-[16px] text-white/80">
            Get booking requests from customers near you, manage your jobs and earnings, and build your reputation.
          </p>
        </div>
        <a
          href={PROVIDER_SITE}
          target="_blank"
          rel="noreferrer"
          className="flex-shrink-0 rounded-xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-dark hover:bg-gray-50"
        >
          Register as a professional
        </a>
      </div>
    </section>
  );
}

export default function DesktopHome() {
  const { categories, services, banners, homeLayout, noCoverage } = useApp();
  // The admin-configured sections (Super Admin → Home Layout) keep working;
  // categories get their own photo grid above, so skip that one section type.
  const configured = (homeLayout.sections || []).filter((s) => s.type !== "categories");
  // With nothing configured, still show a popular-services list rather than
  // letting HomeSections fall back to its own categories-first default.
  const sections = configured.length > 0 ? configured : [{ id: "desktop-popular", type: "popular", title: "Popular services", limit: 12 }];

  return (
    <div className="pb-20">
      <Hero categories={categories} services={services} />
      {noCoverage ? (
        <div className="mx-auto max-w-3xl px-8 pt-10">
          <ComingSoon />
        </div>
      ) : (
        <>
          <TrustStrip services={services} categories={categories} bookingCounts={homeLayout.bookingCounts} />
          <Spotlight services={services} banners={banners} />
          <CategoryGrid categories={categories} />
          {services.length > 0 && (
            <div className="mx-auto max-w-6xl px-8 pt-6">
              <HomeSections
                sections={sections}
                services={services}
                categories={categories}
                banners={banners}
                bookingCounts={homeLayout.bookingCounts}
              />
            </div>
          )}
        </>
      )}
      <HowItWorks />
      <WhyTikdum />
      <ProviderCta />
    </div>
  );
}
