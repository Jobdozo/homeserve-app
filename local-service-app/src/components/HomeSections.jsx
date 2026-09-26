import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { StarIcon, ChevronRightIcon } from "./icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "./CategoryIcon";
import CategoryPhoto from "./CategoryPhoto";

// Gradient per admin-selectable banner colour (literal classes so Tailwind keeps them).
const BANNER_GRADIENTS = {
  brand: "from-brand to-brand-dark",
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
  const clickable = banner.linkType && banner.linkType !== "none" && banner.linkId;
  const gradient = BANNER_GRADIENTS[banner.color] || BANNER_GRADIENTS.brand;
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      onClick={clickable ? () => open(banner) : undefined}
      className={`relative flex w-full items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} px-4 text-left text-white ${
        hero ? "min-h-[120px] py-4 lg:min-h-[220px] lg:px-10 lg:py-10" : "min-h-[96px] py-3.5 lg:min-h-[140px] lg:px-8"
      }`}
    >
      {banner.imageUrl && (
        <>
          <img src={banner.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/25 to-transparent" />
        </>
      )}
      <div className="relative z-10 min-w-0">
        <p className={`font-extrabold leading-snug ${hero ? "max-w-[220px] text-[17px] lg:max-w-lg lg:text-4xl" : "max-w-[220px] text-[15px] lg:max-w-md lg:text-2xl"}`}>
          {banner.title}
        </p>
        {banner.subtitle && (
          <p className={`mt-1 max-w-[240px] text-white/85 lg:max-w-md ${hero ? "text-[11.5px] lg:text-base" : "text-[11px] lg:text-sm"}`}>
            {banner.subtitle}
          </p>
        )}
        {clickable && (
          <span className="mt-2.5 inline-block rounded-lg bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-gray-900 lg:text-sm">
            {banner.ctaLabel || "Book now"}
          </span>
        )}
      </div>
      {!banner.imageUrl && (
        <span className={`relative z-10 flex-shrink-0 ${hero ? "text-5xl lg:text-8xl" : "text-4xl lg:text-6xl"}`}>{banner.icon}</span>
      )}
    </Tag>
  );
}

export function HeroBanners({ banners }) {
  if (banners.length === 0) return null;
  return (
    <div className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 lg:mt-6 lg:px-0">
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
      onClick={() => navigate(`/service/${service.id}`)}
      className={`relative overflow-hidden rounded-2xl bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 active:scale-[0.98] ${
        carousel ? "w-40 flex-shrink-0 lg:w-56" : ""
      }`}
    >
      {pct > 0 && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-emerald-500 px-2 py-0.5 text-[9.5px] font-bold text-white">
          {pct}% OFF
        </span>
      )}
      <div className="flex h-24 items-center justify-center lg:h-36">
        <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={96} />
      </div>
      <div className="p-2.5 lg:p-4">
        <p className="text-[12.5px] font-semibold text-gray-900 lg:text-[15px]">{service.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 lg:text-[13px]">Starting ₹{service.price}</span>
          {pct > 0 && <span className="text-[10px] text-gray-400 line-through">₹{service.originalPrice}</span>}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 lg:text-[13px]">
          <StarIcon filled width={12} height={12} /> {service.rating} ({formatCount(service.reviewCount)})
        </div>
        {count > 0 && (
          <p className="mt-1 text-[10.5px] font-semibold text-brand-dark">
            Booked {formatCount(count)} time{count === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </button>
  );
}

function SectionHeader({ title, onSeeAll }) {
  return (
    <div className="mt-6 flex items-center justify-between px-4 lg:mt-10 lg:px-0">
      <h2 className="text-[15px] font-bold text-gray-900 lg:text-xl">{title}</h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="flex items-center gap-0.5 text-xs font-semibold text-brand lg:text-sm">
          See All <ChevronRightIcon width={13} height={13} />
        </button>
      )}
    </div>
  );
}

function Carousel({ children }) {
  return <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4 pb-1 lg:mt-4 lg:gap-5 lg:px-0">{children}</div>;
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
            className="flex w-[76px] flex-shrink-0 flex-col items-center gap-1.5 rounded-xl bg-white py-3 shadow-card transition-transform hover:-translate-y-0.5 active:scale-95 lg:w-32 lg:gap-2.5 lg:py-6"
          >
            <CategoryIcon categoryId={c.id} size={40} className="lg:scale-125" />
            <span className="px-1 text-center text-[10px] font-medium leading-tight text-gray-600 lg:text-[13px]">{c.name}</span>
          </button>
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
            <div className="mt-3 grid grid-cols-2 gap-3 px-4 lg:mt-4 lg:grid-cols-4 lg:gap-5 lg:px-0">
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

export default function HomeSections({ sections, services, categories, banners, bookingCounts }) {
  const navigate = useNavigate();
  const list = sections.length > 0 ? sections : FALLBACK_SECTIONS;
  const inlineBanners = banners.filter((b) => b.placement === "inline").sort((a, b) => (a.afterItems || 3) - (b.afterItems || 3));
  const byPopularity = [...services].sort((a, b) => b.reviewCount - a.reviewCount);

  return (
    <>
      {list.map((section) => {
        const limit = section.limit || 8;
        if (section.type === "categories") {
          return <CategoryCarousel key={section.id} section={section} categories={categories} />;
        }
        if (section.type === "most_booked") {
          const items = [...services]
            .sort((a, b) => (bookingCounts[b.id] || 0) - (bookingCounts[a.id] || 0) || b.reviewCount - a.reviewCount)
            .slice(0, limit);
          return <ServiceCarousel key={section.id} section={section} items={items} counts={bookingCounts} seeAll={() => navigate("/services")} />;
        }
        if (section.type === "category") {
          const items = matchServices(section, services, categories).slice(0, limit);
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
