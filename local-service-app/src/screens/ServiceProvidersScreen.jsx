import { useEffect, useMemo } from "react";
import { useCatalogService, CatalogLoading } from "../utils/useCatalogItem";
import { useNavigate, useParams } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { useApp } from "../context/AppContext";
import { BackIcon } from "../components/icons";
import { discountPct } from "../utils/format";
import { RatingPill, VerifiedBadge, OfferTag, AddButton, ProviderMark, expLabel, areaLabel, inr } from "../components/ui";
import CategoryPhoto from "../components/CategoryPhoto";
import CartBar from "../components/CartBar";
import Seo from "../components/Seo";
import DesktopServiceProviders from "../components/DesktopServiceProviders";

// Same service, every vendor offering it: tapping a service card anywhere in
// the app lands here first instead of jumping straight into one provider's
// listing, so a customer can compare who's available before picking one.
// `services` (from AppContext) is already scoped to the customer's own PIN
// code server-side (see store.listServices' pincode filter), so every row
// here is already a real, bookable option in their area — nothing further
// to filter for that.
//
// Vendors are grouped by exact service name within the same category, since
// that's the only cross-provider signal the catalog has today: a Service
// Catalog item (Super Admin → Services → Catalog) applied to several
// providers keeps the same name on all of them, which is what makes them
// group here. A one-off, differently-worded listing groups with itself only.
const norm = (s) => String(s || "").trim().toLowerCase();

export default function ServiceProvidersScreen() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { services, categories, getProvider, loadCatalogScope } = useApp();

  const { service: anchor, looking } = useCatalogService(serviceId);
  useEffect(() => {
    if (anchor?.categoryId) loadCatalogScope({ category: anchor.categoryId });
  }, [anchor?.categoryId, loadCatalogScope]);
  const category = categories.find((c) => c.id === anchor?.categoryId);

  const vendors = useMemo(() => {
    if (!anchor) return [];
    return services
      .filter((s) => s.categoryId === anchor.categoryId && norm(s.name) === norm(anchor.name))
      .map((s) => ({ service: s, provider: getProvider(s.providerId) }))
      .sort((a, b) => b.service.rating - a.service.rating || a.service.price - b.service.price);
  }, [services, anchor, getProvider]);

  if (!anchor && looking) return <CatalogLoading />;
  if (!anchor) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Seo title="Service Not Found" path={`/find-service/${serviceId}`} noindex />
        <p className="text-sm text-gray-500">Service not found.</p>
        <button onClick={() => navigate("/home")} className="text-sm font-semibold text-brand">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <>
    <Seo
      title={`${anchor.name} Providers`}
      description={`Compare ${vendors.length} trusted provider${vendors.length === 1 ? "" : "s"} for ${anchor.name}${category ? ` in ${category.name}` : ""} on Tikdum. Book instantly over WhatsApp.`}
      path={`/find-service/${anchor.id}`}
    />
    {/* Desktop gets its own full-width page (components/DesktopServiceProviders). */}
    {isDesktop && (
    <div className="hidden lg:block">
      <DesktopServiceProviders anchor={anchor} category={category} vendors={vendors} />
    </div>
    )}
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:hidden">
      {/* The service itself, photo first */}
      <div className="relative h-[210px] flex-shrink-0">
        <CategoryPhoto categoryId={anchor.categoryId} imageUrl={anchor.imageUrl} size={210} />
        <span className="absolute inset-0 bg-gradient-to-b from-ink/50 via-transparent to-ink/70" />
        <button onClick={() => navigate(-1)} aria-label="Go back" className="absolute left-4 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/55 text-white active:scale-95">
          <BackIcon width={19} height={19} />
        </button>
        <div className="absolute inset-x-4 bottom-4">
          {category && <p className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-marigold">{category.name}</p>}
          <h1 className="font-display text-[26px] font-extrabold leading-[1.05] text-white">{anchor.name}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-6 pt-4">
        <p className="text-[13px] text-ink-muted">
          {vendors.length} professional{vendors.length === 1 ? "" : "s"} near you · compare and add
        </p>
        {vendors.map(({ service: s, provider: p }, i) => {
          const pct = discountPct(s.price, s.originalPrice);
          return (
            <div key={s.id} className="animate-fade-up rounded-[22px] bg-white p-3.5 shadow-card" style={{ animationDelay: `${i * 40}ms` }}>
              <button onClick={() => p && navigate(`/provider/${p.id}`)} className="flex w-full items-center gap-3 text-left">
                <ProviderMark provider={p} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15.5px] font-bold text-ink">{p?.name || "Service provider"}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-muted">
                    {p?.verified && <VerifiedBadge className="text-[12.5px]" />}
                    {p?.verified && (p?.experience || p?.serviceArea) && <span>·</span>}
                    {p?.experience ? <span>{expLabel(p.experience)}</span> : p?.serviceArea ? <span className="truncate">{areaLabel(p.serviceArea)}</span> : null}
                  </span>
                </span>
                <RatingPill rating={s.rating} count={s.reviewCount} size="sm" />
              </button>
              {(s.tagline || s.includes?.length > 0) && (
                <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-ink-muted">{s.tagline || s.includes.slice(0, 3).join(" · ")}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-line pt-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-[20px] font-extrabold text-ink">{inr(s.price)}</span>
                  {pct > 0 && (
                    <>
                      <OfferTag className="!text-[10.5px]">{pct}% OFF</OfferTag>
                    </>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <button onClick={() => navigate(`/service/${s.id}`)} className="px-1 text-[13px] font-bold text-brand">
                    Details
                  </button>
                  <AddButton service={s} className="w-[104px]" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <CartBar />
    </div>
    </>
  );
}
