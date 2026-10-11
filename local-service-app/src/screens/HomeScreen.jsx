import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { BellIcon, SearchIcon, ChevronRightIcon, CartIcon, ArrowRightIcon, ShieldCheckIcon, LockIcon, UmbrellaIcon, GridIcon } from "../components/icons";
import { useApp } from "../context/AppContext";
import { discountPct } from "../utils/format";
import CategoryPhoto from "../components/CategoryPhoto";
import CartBar from "../components/CartBar";
import HomeSections, { HeroBanners } from "../components/HomeSections";
import Seo, { SITE_URL } from "../components/Seo";
import ComingSoon from "../components/ComingSoon";
import DesktopHome from "../components/DesktopHome";
import LocationPill from "../components/LocationPill";
import { inr } from "../components/ui";
import { useAddService } from "../components/optionsSheetContext";
import { dedupeByName } from "../utils/format";

// Search hint that cycles through real services: Search “AC service”.
function RotatingSearch({ services, onOpen }) {
  const names = useMemo(() => dedupeByName([...services].sort((a, b) => b.reviewCount - a.reviewCount)).slice(0, 8).map((s) => s.name), [services]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (names.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % names.length), 2600);
    return () => clearInterval(t);
  }, [names.length]);
  const hint = names[i % Math.max(1, names.length)];
  return (
    <button
      onClick={onOpen}
      className="mt-4 flex h-[52px] w-full items-center gap-2.5 rounded-2xl bg-white px-4 text-left shadow-[0_8px_24px_rgba(17,8,60,0.25)] active:scale-[0.99]"
    >
      <SearchIcon width={20} height={20} className="flex-shrink-0 text-brand" strokeWidth={2.4} />
      <span className="min-w-0 flex-1 truncate text-[15px] text-ink-muted">
        Search{" "}
        {hint ? (
          <span key={hint} className="inline-block animate-fade-up text-ink-soft">
            “{hint}”
          </span>
        ) : (
          "for services"
        )}
      </span>
    </button>
  );
}

// Admin hero banners (CMS); with none configured, the live best discount — real numbers, not marketing copy.
function HomeHero({ heroBanners, bestOffer }) {
  const navigate = useNavigate();
  if (heroBanners.length > 0) {
    return (
      <div className="-mt-[88px]">
        <HeroBanners banners={heroBanners} />
      </div>
    );
  }
  const s = bestOffer?.service;
  return (
    <button
      onClick={() => navigate(s ? `/find-service/${s.id}` : "/categories")}
      className="relative mx-4 -mt-[88px] h-[188px] overflow-hidden rounded-3xl bg-brand-dark text-left shadow-lift active:scale-[0.99]"
    >
      {s && (
        <span className="absolute -right-6 top-0 h-full w-[230px]">
          <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={230} />
        </span>
      )}
      <span className="absolute inset-0 bg-gradient-to-r from-brand-dark from-40% via-brand-dark/80 to-transparent" />
      <span className="relative flex h-full max-w-[230px] flex-col justify-center gap-1.5 px-5">
        <span className="w-fit rounded-full bg-marigold px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink">
          {s ? `${bestOffer.pct}% off today` : "Trusted local pros"}
        </span>
        <span className="font-display text-[24px] font-extrabold leading-[1.05] text-white">{s ? s.name : "Home services you can trust"}</span>
        <span className="text-[13px] text-[#DCD5FF]">
          {s ? (
            <>
              Now <b className="text-white">{inr(s.price)}</b> <s className="opacity-70">{inr(s.originalPrice)}</s>
            </>
          ) : (
            "Verified, rated, near you"
          )}
        </span>
        <span className="mt-1 flex w-fit items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-brand-night">
          {s ? "Book now" : "Browse services"} <ArrowRightIcon width={14} height={14} strokeWidth={2.6} />
        </span>
      </span>
    </button>
  );
}

// Categories as photos, 4 across; the last tile opens all of them.
function CategoryGrid({ categories }) {
  const navigate = useNavigate();
  if (categories.length === 0) return null;
  const shown = categories.length > 8 ? categories.slice(0, 7) : categories.slice(0, 8);
  return (
    <div className="grid grid-cols-4 gap-x-2.5 gap-y-4 px-4 pt-6">
      {shown.map((c, i) => (
        <button key={c.id} onClick={() => navigate(`/category/${c.id}`)} className="flex animate-fade-up flex-col items-center gap-1.5 active:scale-95" style={{ animationDelay: `${i * 30}ms` }}>
          <span className="block h-[72px] w-[72px] overflow-hidden rounded-[22px] bg-brand-light">
            <CategoryPhoto categoryId={c.id} imageUrl={c.imageUrl} size={72} />
          </span>
          <span className="line-clamp-2 text-center text-[12px] font-semibold leading-tight text-ink">{c.name}</span>
        </button>
      ))}
      {categories.length > 8 && (
        <button onClick={() => navigate("/categories")} className="flex flex-col items-center gap-1.5 active:scale-95">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-brand-light text-brand">
            <GridIcon width={26} height={26} />
          </span>
          <span className="text-[12px] font-bold text-brand">All {categories.length}</span>
        </button>
      )}
    </div>
  );
}

// What a customer letting someone into their home worries about.
function TrustStrip() {
  const navigate = useNavigate();
  const items = [
    { Icon: ShieldCheckIcon, text: "ID-checked professionals" },
    { Icon: LockIcon, text: "Work starts with your OTP" },
    { Icon: UmbrellaIcon, text: "Booking protection", to: "/booking-protection" },
  ];
  return (
    <div className="mx-4 mt-6 grid grid-cols-3 gap-2 rounded-[20px] bg-white px-3 py-3.5 shadow-card">
      {items.map(({ Icon, text, to }) =>
        to ? (
          <button key={text} onClick={() => navigate(to)} className="flex flex-col items-center gap-1.5 text-center active:scale-95">
            <Icon width={24} height={24} className="text-trust" />
            <span className="text-[11.5px] font-semibold leading-tight text-ink">{text}</span>
          </button>
        ) : (
          <div key={text} className="flex flex-col items-center gap-1.5 text-center">
            <Icon width={24} height={24} className="text-trust" />
            <span className="text-[11.5px] font-semibold leading-tight text-ink">{text}</span>
          </div>
        )
      )}
    </div>
  );
}

// The customer's last finished job, one tap to book it again.
function BookAgain() {
  const navigate = useNavigate();
  const { bookings, getService, cart } = useApp();
  const addService = useAddService();
  const last = useMemo(
    () =>
      [...bookings]
        .filter((b) => b.status === "Completed" && b.serviceId && getService(b.serviceId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0],
    [bookings, getService]
  );
  if (!last) return null;
  const s = getService(last.serviceId);
  const inCart = cart.some((c) => c.serviceId === s.id);
  const when = new Date(last.date || last.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <div className="mx-4 mt-3 flex animate-fade-up items-center gap-3 rounded-[20px] bg-marigold-light p-3">
      <span className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl">
        <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={56} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-marigold-dark">Book again</span>
        <span className="truncate text-[14.5px] font-bold text-ink">{s.name}</span>
        <span className="truncate text-[12px] text-ink-muted">Last done {when} · same pro</span>
      </span>
      <button
        onClick={() => {
          if (inCart) return navigate("/cart");
          addService(s);
          if (!s.options?.length) navigate("/cart");
        }}
        className="flex-shrink-0 rounded-xl bg-ink px-3.5 py-2.5 text-[13px] font-bold text-white active:scale-95"
      >
        {inCart ? "In cart" : "Repeat"}
      </button>
    </div>
  );
}


const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Tikdum",
  description: "Book trusted home services near you — cleaning, pest control, AC repair, and more.",
  url: SITE_URL,
  image: `${SITE_URL}/pwa-512.png`,
};

export default function HomeScreen() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { categories, services, banners, homeLayout, cart, notifications, location, noCoverage } = useApp();
  const unreadCount = notifications.filter((n) => !n.read).length;
  // Banner placements are set in the Super Admin CMS; banners saved before
  // placements existed have none and stay in the small chip strip.
  const stripBanners = banners.filter((b) => !b.placement || b.placement === "strip");
  const heroBanners = banners.filter((b) => b.placement === "hero");

  // Real promo: feature whichever active service currently has the best discount,
  // computed live from the catalog — not a fabricated marketing claim.
  const bestOffer = useMemo(() => {
    return services
      .map((s) => ({ service: s, pct: discountPct(s.price, s.originalPrice) }))
      .filter((x) => x.pct > 0)
      .sort((a, b) => b.pct - a.pct)[0];
  }, [services]);

  return (
    <>
    <Seo path="/home" jsonLd={HOME_JSON_LD} />
    {/* Desktop gets its own full-width marketing home (components/DesktopHome). */}
    {isDesktop && (
    <div className="hidden lg:block">
      <DesktopHome />
    </div>
    )}
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-4 lg:hidden">
      {/* Night-violet header: where, cart, alerts, search. The hero overlaps its bottom edge. */}
      <div className="bg-brand-night px-4 pb-[104px] pt-3">
        <div className="flex items-start justify-between gap-3">
          <LocationPill variant="dark" />
          <div className="flex flex-shrink-0 items-center gap-2">
            <button onClick={() => navigate("/cart")} aria-label="Cart" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95">
              <CartIcon width={20} height={20} />
              {cart.length > 0 && (
                <span key={cart.length} className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] animate-pop items-center justify-center rounded-full bg-marigold px-1 text-[10.5px] font-extrabold text-ink">
                  {cart.length}
                </span>
              )}
            </button>
            <button onClick={() => navigate("/notifications")} aria-label="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95">
              <BellIcon width={20} height={20} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-marigold px-1 text-[10.5px] font-extrabold text-ink">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
        {!noCoverage && <RotatingSearch services={services} onOpen={() => navigate("/search")} />}
      </div>

      {noCoverage ? (
        <div className="mx-4 -mt-[88px] rounded-3xl bg-white p-2 shadow-lift">
          <ComingSoon />
        </div>
      ) : (
        <>
          <HomeHero heroBanners={heroBanners} bestOffer={bestOffer} />

          {stripBanners.length > 0 && (
            <div className="no-scrollbar mt-4 flex gap-2.5 overflow-x-auto px-4">
              {stripBanners.map((b) => (
                <div key={b.id} className="flex flex-shrink-0 items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 shadow-card">
                  <span className="text-xl">{b.icon}</span>
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-[13px] font-bold text-ink">{b.title}</p>
                    {b.subtitle && <p className="whitespace-nowrap text-[11.5px] text-ink-muted">{b.subtitle}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <CategoryGrid categories={categories} />
          <TrustStrip />
          <BookAgain />

          {/* Configurable sections (Super Admin → Home Layout) */}
          <HomeSections sections={homeLayout.sections} services={services} categories={categories} banners={banners} bookingCounts={homeLayout.bookingCounts} skipCategories />

          <button
            onClick={() => navigate("/categories")}
            className="mx-4 mt-6 flex items-center justify-between rounded-3xl bg-brand-light px-4 py-4 text-left active:scale-[0.99]"
          >
            <div>
              <p className="text-[14px] font-bold text-brand-dark">Can't find the service you need?</p>
              <p className="text-[12px] text-brand-dark/75">Tell us, we'll add it for you.</p>
            </div>
            <ChevronRightIcon width={18} height={18} className="text-brand" />
          </button>
        </>
      )}
      <CartBar />
    </div>
    </>
  );
}
