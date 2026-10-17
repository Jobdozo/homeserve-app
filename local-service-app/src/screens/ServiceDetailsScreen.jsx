import { useEffect, useRef } from "react";
import { useCatalogService, CatalogLoading } from "../utils/useCatalogItem";
import { useNavigate, useParams } from "react-router-dom";
import useIsDesktop from "../utils/useIsDesktop";
import { BackIcon, CheckIcon } from "../components/icons";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { discountPct } from "../utils/format";
import { RatingPill, VerifiedBadge, OfferTag, AddButton, ProviderMark, SectionTitle, inr } from "../components/ui";
import CategoryPhoto from "../components/CategoryPhoto";
import Seo, { SITE_URL, serviceDescription } from "../components/Seo";
import DesktopServiceDetails from "../components/DesktopServiceDetails";
import AddOns from "../components/AddOns";
import { useAddService } from "../components/optionsSheetContext";
import { trackMeta } from "../utils/metaPixel";

export default function ServiceDetailsScreen() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { getProvider, cart, categories } = useApp();
  const addService = useAddService();
  const { service, looking } = useCatalogService(serviceId, { full: true });
  const provider = service ? getProvider(service.providerId) : null;
  const pct = service ? discountPct(service.price, service.originalPrice) : 0;
  const inCart = service ? cart.some((item) => item.serviceId === service.id) : false;

  // A sponsored service's provider is billed the CPC rate for this view —
  // fire once per visit, not on every re-render.
  const clickedFor = useRef(null);
  useEffect(() => {
    if (!service?.isAd || clickedFor.current === service.id) return;
    clickedFor.current = service.id;
    api.registerAdClick(service.id).catch(() => {});
  }, [service?.id, service?.isAd]);

  // Meta Pixel: a service page was viewed (website only).
  useEffect(() => {
    if (service?.id) trackMeta("ViewContent", { content_ids: [service.id], content_name: service.name, content_type: "product", value: Number(service.price) || 0, currency: "INR" });
  }, [service?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!service && looking) return <CatalogLoading />;
  if (!service) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Seo title="Service Not Found" path={`/service/${serviceId}`} noindex />
        <p className="text-sm text-gray-500">Service not found.</p>
        <button onClick={() => navigate("/home")} className="text-sm font-semibold text-brand">
          Back to Home
        </button>
      </div>
    );
  }

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: service.tagline || `${service.name} — book trusted local providers on Tikdum.`,
    ...(service.imageUrl && {
      image: /^https?:\/\//.test(service.imageUrl) ? service.imageUrl : `${SITE_URL}${service.imageUrl}`,
    }),
    offers: {
      "@type": "Offer",
      price: service.price,
      priceCurrency: "INR",
      url: `${SITE_URL}/service/${service.id}`,
    },
    ...(provider && { provider: { "@type": "LocalBusiness", name: provider.name } }),
    ...(service.reviewCount > 0 && {
      aggregateRating: { "@type": "AggregateRating", ratingValue: service.rating, reviewCount: service.reviewCount },
    }),
  };

  return (
    <>
    <Seo
      title={service.name}
      description={serviceDescription(service, provider?.businessName || provider?.name)}
      path={`/service/${service.id}`}
      image={service.imageUrl}
      jsonLd={serviceJsonLd}
    />
    {/* Desktop gets its own full-width page (components/DesktopServiceDetails). */}
    {isDesktop && (
    <div className="hidden lg:block">
      <DesktopServiceDetails
        service={service}
        provider={provider}
        category={categories.find((c) => c.id === service.categoryId)}
        pct={pct}
        inCart={inCart}
        onCart={() => (inCart ? navigate("/cart") : addService(service))}
      />
    </div>
    )}
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:hidden">
      <div className="relative h-[260px] flex-shrink-0 bg-brand-night">
        <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={260} />
        <span className="absolute inset-0 bg-gradient-to-b from-ink/50 to-transparent to-50%" />
        <button onClick={() => navigate(-1)} aria-label="Go back" className="absolute left-4 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/55 text-white active:scale-95">
          <BackIcon width={19} height={19} />
        </button>
        {pct > 0 && <OfferTag className="absolute bottom-10 left-4">{pct}% OFF</OfferTag>}
      </div>

      <div className="relative -mt-7 flex flex-col gap-3 rounded-t-[26px] bg-white px-4 pb-5 pt-3">
        <span className="mx-auto h-1 w-10 rounded-full bg-line" />
        {service.isAd && <span className="w-fit rounded-full bg-marigold-light px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-marigold-dark">Sponsored</span>}
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-[24px] font-extrabold leading-tight text-ink">{service.name}</h1>
          <RatingPill rating={service.rating} count={service.reviewCount} showCount />
        </div>
        {provider && (
          <button onClick={() => navigate(`/provider/${provider.id}`)} className="flex items-center gap-2.5 rounded-2xl bg-mist p-2.5 text-left active:scale-[0.99]">
            <ProviderMark provider={provider} className="h-10 w-10 rounded-xl text-[15px]" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[14px] font-bold text-ink">{provider.name}</span>
              <span className="text-[12px] text-ink-muted">{provider.verified ? <VerifiedBadge className="text-[12px]" /> : "Service provider"}</span>
            </span>
            <span className="text-[12.5px] font-bold text-brand">Profile</span>
          </button>
        )}
        {(service.tagline || service.description) && <p className="text-[14px] leading-relaxed text-ink-soft">{service.tagline || service.description}</p>}
        {service.highlights?.length > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {service.highlights.map((h) => (
              <span key={h.label} className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-mist px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-dark">
                <span aria-hidden="true">{h.icon}</span> {h.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {service.includes?.length > 0 && (
        <div className="mt-2 bg-white px-4 py-4">
          <SectionTitle>What's included</SectionTitle>
          <ul className="mt-3 space-y-2.5">
            {service.includes.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-trust-light text-trust">
                  <CheckIcon width={12} height={12} strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 bg-white px-4 py-4">
        <AddOns anchorIds={[service.id]} title="Often booked in the same visit" subtitle={provider ? `More from ${provider.name}` : undefined} />
      </div>

      <div className="h-24" />
      <div className="sticky bottom-0 z-20 mt-auto flex items-center gap-3 bg-white px-4 pb-4 pt-3 shadow-[0_-8px_24px_rgba(27,21,48,0.08)]">
        <div className="flex flex-col">
          <span className="text-[11.5px] text-ink-muted">{pct > 0 ? <s>{inr(service.originalPrice)}</s> : "Price"}</span>
          <span className="font-display text-[22px] font-extrabold text-ink">{inr(service.price)}</span>
        </div>
        {inCart ? (
          <div className="flex flex-1 items-center gap-2">
            <AddButton service={service} size="lg" className="w-[132px]" />
            <button onClick={() => navigate("/cart")} className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]">
              Cart
            </button>
          </div>
        ) : (
          <button onClick={() => addService(service)} className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-brand text-[16px] font-bold text-white shadow-cta active:scale-[0.98]">
            {service.options?.length ? "Choose options" : "Add to booking"}
          </button>
        )}
      </div>
    </div>
    </>
  );
}
