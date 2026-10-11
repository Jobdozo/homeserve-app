import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { StarIcon, ChevronRightIcon } from "./icons";
import { formatCount, discountPct, dedupeByName } from "../utils/format";
import CategoryPhoto from "./CategoryPhoto";
import { useApp } from "../context/AppContext";
import { chipsFor } from "../utils/subcategories";
import { typeIllustration } from "../utils/illustrations";
import { RatingPill, PhotoPriceTag, OfferTag, inr } from "./ui";

// Gradient per admin-selectable banner colour (literal classes so Tailwind keeps them).
const BANNER_GRADIENTS = {
  brand: "from-brand-dark to-brand-night",
  emerald: "from-emerald-500 to-emerald-700",
  amber: "from-amber-400 to-orange-500",
  violet: "from-violet-500 to-purple-700",
  rose: "from-rose-500 to-pink-700",
  slate: "from-slate-700 to-slate-900",
};

// Used only if the layout endpoint is unreachable, so home is never blank.
const FALLBACK_SECTIONS = [
  { id: "fb-categories", type: "categories", title: "Service Categories", limit: 10 },
  { id: "fb-services", type: "services", title: "Popular Services", limit: 12 },
];

function useBannerTarget() {
  const navigate = useNavigate();
  return (b) => {
    api.trackBannerClick(b.id);
    if (b.linkType === "service" && b.linkId) navigate(`/service/${b.linkId}`);
    else if (b.linkType === "category" && b.linkId) navigate(`/category/${b.linkId}`);
  };
}

export function PromoBanner({ banner, hero = false }) {
  const open = useBannerTarget();
  // A picture link that doesn't load is dropped, so the banner falls back to its colour and icon.
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = imageFailed ? null : banner.imageUrl;
  const clickable = banner.linkType && banner.linkType !== "none" && banner.linkId;
  const gradient = BANNER_GRADIENTS[banner.color] || BANNER_GRADIENTS.brand;
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      onClick={clickable ? () => open(banner) : undefined}
      className={`relative flex w-full items-center justify-between overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} px-5 text-left text-white ${
        hero ? "min-h-[188px] py-5 shadow-lift lg:min-h-[220px] lg:px-10 lg:py-10" : "min-h-[104px] py-4 lg:min-h-[140px] lg:px-8"
      }`}
    >
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent" />
        </>
      )}
      <div className="relative z-10 min-w-0">
        <p className={`font-display font-extrabold leading-[1.08] ${hero ? "max-w-[230px] text-[24px] lg:max-w-lg lg:text-4xl" : "max-w-[230px] text-[18px] lg:max-w-md lg:text-2xl"}`}>
          {banner.title}
        </p>
        {banner.subtitle && (
          <p className={`mt-1 max-w-[240px] text-white/85 lg:max-w-md ${hero ? "text-[11.5px] lg:text-base" : "text-[11px] lg:text-sm"}`}>
            {banner.subtitle}
          </p>
        )}
        {clickable && (
          <span className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-[13px] font-bold text-brand-night lg:text-sm">
            {banner.ctaLabel || "Book now"}
          </span>
        )}
      </div>
      {!imageUrl && (
        <span className={`relative z-10 flex-shrink-0 ${hero ? "text-5xl lg:text-8xl" : "text-4xl lg:text-6xl"}`}>{banner.icon}</span>
      )}
    </Tag>
  );
}

export function HeroBanners({ banners }) {
  if (banners.length === 0) return null;
  return (
    <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 lg:mt-6 lg:px-0">
      {banners.map((b) => (
        <div key={b.id} className={`snap-center ${banners.length > 1 ? "w-[88%] flex-shrink-0 lg:w-[70%]" : "w-full"}`}>
          <PromoBanner banner={b} hero />
        </div>
      ))}
    </div>
  );
}

function ServiceCard({ service, count, carousel }) {
  const navigate = useNavigate();
  const pct = discountPct(service.price, service.originalPrice);
  return (
    <button
      onClick={() => navigate(`/find-service/${service.id}`)}
      className={`relative flex flex-col overflow-hidden rounded-[18px] bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${
        carousel ? "w-[172px] flex-shrink-0 lg:w-56" : ""
      }`}
    >
      <div className="relative h-[112px] lg:h-36">
        <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={112} />
        <PhotoPriceTag className="absolute bottom-2 left-2">{inr(service.price)}</PhotoPriceTag>
        {pct > 0 && <OfferTag className="absolute left-2 top-2">{pct}% OFF</OfferTag>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5 lg:p-4">
        <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-ink lg:text-[15px]">{service.name}</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          {count > 0 ? (
            <span className="text-[11.5px] font-semibold text-brand-dark">Booked {formatCount(count)}×</span>
          ) : (
            <span className="text-[11.5px] text-ink-muted">{pct > 0 ? <s>{inr(service.originalPrice)}</s> : "Starting price"}</span>
          )}
          <RatingPill rating={service.rating} count={service.reviewCount} size="sm" />
        </div>
      </div>
    </button>
  );
}

function SectionHeader({ title, onSeeAll }) {
  return (
    <div className="mt-7 flex items-baseline justify-between gap-3 px-4 lg:mt-10 lg:px-0">
      <h2 className="font-display text-[20px] font-extrabold leading-tight text-ink lg:text-2xl">{title}</h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="flex flex-shrink-0 items-center gap-0.5 text-[13px] font-bold text-brand lg:text-sm">
          See all <ChevronRightIcon width={13} height={13} />
        </button>
      )}
    </div>
  );
}

function Carousel({ children }) {
  return <div className="no-scrollbar mt-3.5 flex gap-3 overflow-x-auto px-4 pb-1 lg:mt-4 lg:gap-5 lg:px-0">{children}</div>;
}

function CategoryCarousel({ section, categories }) {
  const navigate = useNavigate();
  const items = categories.slice(0, section.limit || 10);
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title={section.title} onSeeAll={() => navigate("/categories")} />
      <Carousel>
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/category/${c.id}`)}
            className="flex w-[80px] flex-shrink-0 flex-col items-center gap-1.5 transition-transform hover:-translate-y-0.5 active:scale-95 lg:w-32 lg:gap-2.5"
          >
            <span className="block h-[72px] w-[72px] overflow-hidden rounded-[22px] bg-brand-light lg:h-28 lg:w-28">
              <CategoryPhoto categoryId={c.id} imageUrl={c.imageUrl} size={72} />
            </span>
            <span className="line-clamp-2 px-1 text-center text-[12px] font-semibold leading-tight text-ink lg:text-[13px]">{c.name}</span>
          </button>
        ))}
      </Carousel>
    </>
  );
}

// A category row for a category with types (AC Services -> Window / Split / VRF AC):
// the types as picture tiles, each opening the category on that type.
function TypeCarousel({ section, category, chips }) {
  const navigate = useNavigate();
  return (
    <>
      <SectionHeader title={section.title} onSeeAll={() => navigate(`/category/${category.id}`)} />
      <Carousel>
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/category/${category.id}?type=${c.id}`)}
            className="w-36 flex-shrink-0 overflow-hidden rounded-[18px] bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.98] lg:w-56"
          >
            <div className="h-24 overflow-hidden lg:h-36">
              <CategoryPhoto categoryId={category.id} imageUrl={c.imageUrl} fallbackSrc={typeIllustration(c.name, category.id)} size={96} />
            </div>
            <div className="p-2.5 lg:p-4">
              <p className="text-[13.5px] font-bold text-ink lg:text-[15px]">{c.name}</p>
              <p className="mt-0.5 text-[11px] text-gray-500 lg:text-[13px]">From ₹{c.minPrice}</p>
            </div>
          </button>
        ))}
      </Carousel>
    </>
  );
}

// The cheapest service of each category — one card per category, like the "popular
// in each category" rows on Urban Company. Ties go to the better reviewed service.
function lowestPerCategory(categories, services, limit) {
  const out = [];
  for (const c of categories) {
    const mine = dedupeByName(services.filter((s) => s.categoryId === c.id && Number(s.price) > 0));
    if (mine.length === 0) continue;
    const best = [...mine].sort((a, b) => a.price - b.price || b.reviewCount - a.reviewCount)[0];
    out.push({ category: c, service: best, more: mine.length - 1 });
  }
  return out.slice(0, limit);
}

function LowestCard({ category, service, more }) {
  const navigate = useNavigate();
  const pct = discountPct(service.price, service.originalPrice);
  return (
    <button
      onClick={() => navigate(`/find-service/${service.id}`)}
      className="relative w-[172px] flex-shrink-0 overflow-hidden rounded-[18px] bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.98] lg:w-56"
    >
      {pct > 0 && (
        <OfferTag className="absolute left-2 top-2 z-10">{pct}% OFF</OfferTag>
      )}
      <div className="h-28 overflow-hidden lg:h-40">
        <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={96} />
      </div>
      <div className="p-2.5 lg:p-4">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand lg:text-[11.5px]">{category.name}</p>
        <p className="mt-0.5 text-[13.5px] font-bold leading-snug text-ink lg:text-[15px]">{service.name}</p>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 lg:text-[13px]">
          {service.reviewCount > 0 ? (
            <>
              <StarIcon filled width={12} height={12} /> {service.rating} ({formatCount(service.reviewCount)})
            </>
          ) : (
            <span className="text-gray-400">New</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="font-display text-[16px] font-extrabold text-ink lg:text-[17px]">₹{service.price}</span>
          {pct > 0 && <span className="text-[10.5px] text-gray-400 line-through lg:text-[12px]">₹{service.originalPrice}</span>}
        </div>
        {more > 0 && <p className="mt-1 text-[10.5px] text-gray-400 lg:text-[12px]">+{more} more in {category.name}</p>}
      </div>
    </button>
  );
}

function LowestPerCategory({ section, categories, services }) {
  const navigate = useNavigate();
  const items = lowestPerCategory(categories, services, section.limit || 12);
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title={section.title} onSeeAll={() => navigate("/categories")} />
      <Carousel>
        {items.map((it) => (
          <LowestCard key={it.category.id} {...it} />
        ))}
      </Carousel>
    </>
  );
}

function ServiceCarousel({ section, items, counts, seeAll }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader title={section.title} onSeeAll={seeAll} />
      <Carousel>
        {items.map((s) => (
          <ServiceCard key={s.id} service={s} count={counts[s.id] || 0} carousel />
        ))}
      </Carousel>
    </>
  );
}

// Service-card list. Inline promo banners are dropped in after the Nth card
// (their `afterItems`), so cards render in segments with a full-width banner
// between them — no half-empty grid rows around a banner.
function ServiceCardList({ section, items, counts, inlineBanners }) {
  const navigate = useNavigate();
  if (items.length === 0) return null;
  const cuts = [...new Set(inlineBanners.map((b) => b.afterItems || 3))].filter((n) => n < items.length).sort((a, b) => a - b);
  const bounds = [0, ...cuts, items.length];
  return (
    <>
      <SectionHeader title={section.title} onSeeAll={() => navigate("/services")} />
      {bounds.slice(0, -1).map((start, i) => {
        const end = bounds[i + 1];
        const banners = inlineBanners.filter((b) => (b.afterItems || 3) === end && end < items.length);
        return (
          <Fragment key={start}>
            <div className="mt-3.5 grid grid-cols-2 gap-3 px-4 lg:mt-4 lg:grid-cols-4 lg:gap-5 lg:px-0">
              {items.slice(start, end).map((s) => (
                <ServiceCard key={s.id} service={s} count={counts[s.id] || 0} />
              ))}
            </div>
            {banners.map((b) => (
              <div key={b.id} className="mt-3 px-4 lg:mt-5 lg:px-0">
                <PromoBanner banner={b} />
              </div>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function matchServices(section, services, categories) {
  if (section.categoryId) return services.filter((s) => s.categoryId === section.categoryId);
  const words = (section.match || "")
    .toLowerCase()
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return [];
  const catText = Object.fromEntries(categories.map((c) => [c.id, `${c.name} ${c.id}`.toLowerCase()]));
  return services.filter((s) => {
    const hay = `${s.name} ${catText[s.categoryId] || ""}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });
}

// skipCategories: the phone home already shows every category as a photo grid.
export default function HomeSections({ sections, services, categories, banners, bookingCounts, skipCategories = false }) {
  const navigate = useNavigate();
  const { subcategories } = useApp();
  const list = sections.length > 0 ? sections : FALLBACK_SECTIONS;
  const inlineBanners = banners.filter((b) => b.placement === "inline").sort((a, b) => (a.afterItems || 3) - (b.afterItems || 3));
  const byPopularity = dedupeByName([...services].sort((a, b) => b.reviewCount - a.reviewCount));

  return (
    <>
      {list.map((section) => {
        const limit = section.limit || 8;
        if (section.type === "categories") {
          if (skipCategories) return null;
          return <CategoryCarousel key={section.id} section={section} categories={categories} />;
        }
        if (section.type === "lowest_per_category") {
          return <LowestPerCategory key={section.id} section={section} categories={categories} services={services} />;
        }
        if (section.type === "most_booked") {
          const items = dedupeByName(
            [...services].sort((a, b) => (bookingCounts[b.id] || 0) - (bookingCounts[a.id] || 0) || b.reviewCount - a.reviewCount)
          ).slice(0, limit);
          return <ServiceCarousel key={section.id} section={section} items={items} counts={bookingCounts} seeAll={() => navigate("/services")} />;
        }
        if (section.type === "category") {
          if (section.categoryId) {
            const category = categories.find((c) => c.id === section.categoryId);
            const chips = category ? chipsFor(subcategories, section.categoryId, services.filter((s) => s.categoryId === section.categoryId)) : [];
            if (chips.length > 0) return <TypeCarousel key={section.id} section={section} category={category} chips={chips} />;
          }
          const items = dedupeByName(matchServices(section, services, categories)).slice(0, limit);
          const seeAll = section.categoryId ? () => navigate(`/category/${section.categoryId}`) : () => navigate("/services");
          return <ServiceCarousel key={section.id} section={section} items={items} counts={bookingCounts} seeAll={seeAll} />;
        }
        return (
          <ServiceCardList
            key={section.id}
            section={section}
            items={byPopularity.slice(0, limit)}
            counts={bookingCounts}
            inlineBanners={inlineBanners}
          />
        );
      })}
    </>
  );
}
