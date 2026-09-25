import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon, SearchIcon, ChevronRightIcon, CartIcon } from "../components/icons";
import { useApp } from "../context/AppContext";
import { discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import CartBar from "../components/CartBar";
import HomeSections, { HeroBanners } from "../components/HomeSections";

export default function HomeScreen() {
  const navigate = useNavigate();
  const { categories, services, banners, homeLayout, cart, notifications, location, locationStatus, detectLocation } = useApp();
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
    <div className="flex flex-col pb-4 lg:px-8 lg:py-8">
      {/* Location + notification */}
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <button
          onClick={detectLocation}
          className="flex items-center gap-1 text-sm font-semibold text-gray-900 lg:text-base"
        >
          <span>📍</span>{" "}
          {locationStatus === "detecting"
            ? "Detecting…"
            : locationStatus === "denied"
              ? "Location off — tap to enable"
              : location?.label || "Tap to set your location"}
          <span className="text-gray-400">▾</span>
        </button>
        <div className="flex items-center gap-2 lg:hidden">
          <button
            onClick={() => navigate("/cart")}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700"
          >
            <CartIcon width={18} height={18} />
            {cart.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {cart.length}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate("/notifications")}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700"
          >
            <BellIcon width={18} height={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
      {location?.pincode && <p className="px-4 pb-3 text-xs text-gray-400 lg:hidden">{location.pincode}</p>}

      {/* Search */}
      <div className="px-4 lg:hidden">
        <button
          onClick={() => navigate("/search")}
          className="flex w-full items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-left text-sm text-gray-400 shadow-card"
        >
          <SearchIcon width={17} height={17} className="text-gray-400" />
          Search for services...
        </button>
      </div>

      {/* Admin-managed promo carousel — supplements (doesn't replace) the real
          computed-discount hero banner below. */}
      {stripBanners.length > 0 && (
        <div className="no-scrollbar mt-4 flex gap-2.5 overflow-x-auto px-4 lg:mt-6 lg:px-0">
          {stripBanners.map((b) => (
            <div
              key={b.id}
              className="flex flex-shrink-0 items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-card"
            >
              <span className="text-xl">{b.icon}</span>
              <div className="min-w-0">
                <p className="whitespace-nowrap text-[12.5px] font-semibold text-gray-900">{b.title}</p>
                {b.subtitle && <p className="whitespace-nowrap text-[11px] text-gray-400">{b.subtitle}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin hero banners (CMS). With none configured, fall back to the live
          best-discount hero — real numbers instead of generic marketing copy. */}
      <HeroBanners banners={heroBanners} />
      {heroBanners.length > 0 ? null : bestOffer ? (
        <button
          onClick={() => navigate(`/service/${bestOffer.service.id}`)}
          className="mx-4 mt-4 flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark px-4 py-4 text-left text-white lg:mx-0 lg:mt-6 lg:px-10 lg:py-10"
        >
          <div>
            <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold tracking-wide lg:text-xs">
              LIMITED TIME
            </span>
            <p className="mt-2 max-w-[190px] text-[16px] font-extrabold leading-snug lg:max-w-md lg:text-4xl">
              {bestOffer.pct}% OFF {bestOffer.service.name}
            </p>
            <p className="mt-1 text-[11px] text-white/80 lg:mt-3 lg:text-sm">
              Now ₹{bestOffer.service.price}{" "}
              <span className="line-through opacity-70">₹{bestOffer.service.originalPrice}</span> — book today
            </p>
            <span className="mt-5 hidden rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-dark lg:inline-block">
              Book Now
            </span>
          </div>
          <CategoryIcon
            categoryId={bestOffer.service.categoryId}
            size={64}
            transparent
            className="lg:scale-150"
          />
        </button>
      ) : (
        <div className="mx-4 mt-4 flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark px-4 py-4 text-white lg:mx-0 lg:mt-6 lg:px-10 lg:py-10">
          <div>
            <p className="max-w-[170px] text-[15px] font-bold leading-snug lg:max-w-sm lg:text-3xl">
              Trusted Local Services At Your Fingertips
            </p>
            <p className="mt-1 text-[11px] text-white/80 lg:mt-3 lg:text-sm">Fast, Reliable &amp; Affordable</p>
            <button
              onClick={() => navigate("/categories")}
              className="mt-5 hidden rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-brand-dark lg:inline-block"
            >
              Browse Services
            </button>
          </div>
          <div className="text-4xl lg:text-8xl">🧑‍🔧</div>
        </div>
      )}

      {/* Configurable sections (Super Admin → Home Layout) */}
      <HomeSections
        sections={homeLayout.sections}
        services={services}
        categories={categories}
        banners={banners}
        bookingCounts={homeLayout.bookingCounts}
      />

      {/* Can't find */}
      <button
        onClick={() => navigate("/categories")}
        className="mx-4 mt-5 flex items-center justify-between rounded-2xl bg-brand-light px-4 py-3.5 text-left lg:mx-0 lg:mt-10 lg:px-8 lg:py-6"
      >
        <div>
          <p className="text-[13px] font-semibold text-brand-dark lg:text-base">Can't find the service you need?</p>
          <p className="text-[11px] text-brand-dark/70 lg:mt-1 lg:text-sm">Tell us, we'll add it for you.</p>
        </div>
        <ChevronRightIcon width={18} height={18} className="text-brand" />
      </button>
      <CartBar />
    </div>
  );
}
