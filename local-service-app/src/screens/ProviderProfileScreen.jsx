import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { BackIcon, ShareIcon, ShieldCheckIcon, ClockIcon, StarIcon, TagIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryPhoto from "../components/CategoryPhoto";
import CartBar from "../components/CartBar";
import Seo from "../components/Seo";
import { RatingPill, AddButton, ProviderMark, SectionTitle, OfferTag, expLabel, areaLabel, inr } from "../components/ui";

// A provider's page: their photo with the profile as a sheet over it, what
// makes them trustworthy, then every service with ADD right there (like a menu).
export default function ProviderProfileScreen() {
  const { providerId } = useParams();
  const navigate = useNavigate();
  const { providers, services, categories, homeLayout, showToast } = useApp();
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [offers, setOffers] = useState([]);
  const [group, setGroup] = useState("");
  const counts = homeLayout?.bookingCounts || {};

  const provider = providers[providerId];
  const providerServices = useMemo(
    () => services.filter((s) => s.providerId === providerId).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || b.reviewCount - a.reviewCount),
    [services, providerId, counts]
  );
  const topCount = Math.max(1, ...providerServices.map((s) => counts[s.id] || 0));
  // Their services grouped by category, for the filter row.
  const groups = useMemo(() => {
    const ids = [];
    for (const s of providerServices) if (s.categoryId && !ids.includes(s.categoryId)) ids.push(s.categoryId);
    return ids.map((id) => ({ id, name: categories.find((c) => c.id === id)?.name || "Other" }));
  }, [providerServices, categories]);
  const shown = group ? providerServices.filter((s) => s.categoryId === group) : providerServices;
  const cover = providerServices.find((s) => s.imageUrl) || providerServices[0];

  useEffect(() => {
    let cancelled = false;
    setLoadingReviews(true);
    api
      .getProviderReviews(providerId)
      .then((data) => {
        if (!cancelled) setReviews(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingReviews(false);
      });
    api
      .listProviderOffers([providerId])
      .then((list) => !cancelled && setOffers(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  if (!provider) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Seo title="Provider Not Found" path={`/provider/${providerId}`} noindex />
        <p className="text-sm text-ink-muted">Provider not found.</p>
        <button onClick={() => navigate("/home")} className="text-sm font-semibold text-brand">
          Back to Home
        </button>
      </div>
    );
  }

  const share = async () => {
    const url = `${window.location.origin}/provider/${provider.id}`;
    try {
      if (navigator.share) await navigator.share({ title: provider.name, url });
      else {
        await navigator.clipboard.writeText(url);
        showToast("Link copied");
      }
    } catch {
      // cancelled
    }
  };

  const providerJsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: provider.name,
    ...(provider.rating && reviews.length > 0 && {
      aggregateRating: { "@type": "AggregateRating", ratingValue: provider.rating, reviewCount: reviews.length },
    }),
  };

  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:mx-auto lg:w-full lg:max-w-3xl">
      <Seo
        title={provider.name}
        description={`${provider.name} on Tikdum — rated ${provider.rating || "new"} with ${providerServices.length} service${providerServices.length === 1 ? "" : "s"} available. Book trusted home services near you.`}
        path={`/provider/${provider.id}`}
        jsonLd={providerJsonLd}
      />

      {/* Their work, then the profile as a sheet pulled over it */}
      <div className="relative h-[220px] flex-shrink-0 bg-brand-night lg:h-[260px] lg:overflow-hidden lg:rounded-t-3xl">
        {cover && <CategoryPhoto categoryId={cover.categoryId} imageUrl={cover.imageUrl} size={220} />}
        <span className="absolute inset-0 bg-gradient-to-b from-ink/50 to-transparent to-50%" />
        <div className="absolute inset-x-4 top-3 flex justify-between">
          <button onClick={() => navigate(-1)} aria-label="Go back" className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/55 text-white active:scale-95">
            <BackIcon width={19} height={19} />
          </button>
          <button onClick={share} aria-label="Share" className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/55 text-white active:scale-95">
            <ShareIcon width={18} height={18} />
          </button>
        </div>
      </div>

      <div className="relative -mt-7 flex flex-col gap-3 rounded-t-[26px] bg-white px-4 pb-4 pt-3">
        <span className="mx-auto h-1 w-10 rounded-full bg-line" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProviderMark provider={provider} className="h-[54px] w-[54px] rounded-2xl text-[20px]" />
            <div className="min-w-0">
              <h1 className="font-display text-[22px] font-extrabold leading-tight text-ink">{provider.name}</h1>
              <p className="truncate text-[13px] text-ink-muted">{[provider.category, areaLabel(provider.serviceArea)].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <RatingPill rating={provider.rating} count={provider.reviews} showCount />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {provider.verified && (
            <span className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-trust-light px-2.5 py-1.5 text-[12.5px] font-semibold text-trust-dark">
              <ShieldCheckIcon width={14} height={14} /> ID &amp; documents checked
            </span>
          )}
          {provider.jobsDone > 0 && (
            <span className="flex-shrink-0 rounded-xl bg-mist px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-dark">{formatCount(provider.jobsDone)} jobs done</span>
          )}
          {provider.experience && <span className="flex-shrink-0 rounded-xl bg-mist px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-dark">{expLabel(provider.experience)}</span>}
          <span className="flex-shrink-0 rounded-xl bg-mist px-2.5 py-1.5 text-[12.5px] font-semibold text-brand-dark">
            {providerServices.length} service{providerServices.length === 1 ? "" : "s"}
          </span>
        </div>
        {provider.nextSlot?.label && (
          <p className="flex items-center gap-2 border-t border-line pt-2.5 text-[13.5px]">
            <ClockIcon width={16} height={16} className="text-trust" />
            <span className="font-bold text-trust">{provider.nextSlot.label}</span>
          </p>
        )}
      </div>

      {offers.length > 0 && (
        <div className="no-scrollbar mt-2 flex gap-2.5 overflow-x-auto bg-white px-4 py-3">
          {offers.map((o) => (
            <div key={o.code} className="flex min-w-[220px] flex-shrink-0 items-center gap-3 rounded-2xl border border-dashed border-marigold bg-marigold-light px-3.5 py-2.5">
              <TagIcon width={20} height={20} className="flex-shrink-0 text-marigold-dark" />
              <span className="min-w-0">
                <b className="block text-[14px] text-ink">{o.description}</b>
                <span className="block text-[12px] text-ink-muted">Applies in your cart · code {o.code}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {groups.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto bg-white px-4 py-3">
          {[{ id: "", name: "Most booked" }, ...groups].map((g) => (
            <button
              key={g.id || "all"}
              onClick={() => setGroup(g.id)}
              aria-pressed={group === g.id}
              className={`h-9 flex-shrink-0 rounded-xl px-3 text-[13px] font-semibold ${group === g.id ? "bg-ink text-white" : "border border-line text-ink"}`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <div className={`bg-white px-4 ${groups.length > 1 ? "" : "mt-2"}`}>
        <SectionTitle className="pb-1 pt-4">{groups.find((g) => g.id === group)?.name || "Most booked"}</SectionTitle>
        {shown.map((s, i) => {
          const pct = discountPct(s.price, s.originalPrice);
          const c = counts[s.id] || 0;
          return (
            <div key={s.id} className={`flex gap-3.5 py-4 pb-7 ${i < shown.length - 1 ? "border-b border-dashed border-line" : ""}`}>
              <button onClick={() => navigate(`/service/${s.id}`)} className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
                <span className="text-[16px] font-bold leading-snug text-ink">{s.name}</span>
                {c > 0 && (
                  <span className="flex items-center gap-2 text-[12px] text-ink-muted">
                    <span className="flex h-[5px] w-11 overflow-hidden rounded-full bg-line">
                      <span className="rounded-full bg-trust" style={{ width: `${Math.max(15, Math.round((c / topCount) * 100))}%` }} />
                    </span>
                    {i === 0 && !group ? "Most booked here" : `Booked ${formatCount(c)}×`}
                  </span>
                )}
                <span className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-display text-[17px] font-extrabold text-ink">{inr(s.price)}</span>
                  {pct > 0 && <s className="text-[12.5px] text-ink-muted">{inr(s.originalPrice)}</s>}
                  {pct > 0 && <OfferTag className="!text-[10.5px]">{pct}% OFF</OfferTag>}
                </span>
                {(s.tagline || s.includes?.length > 0) && (
                  <span className="line-clamp-2 text-[13px] leading-snug text-ink-muted">{s.tagline || s.includes.join(", ")}</span>
                )}
              </button>
              <div className="relative w-[124px] flex-shrink-0">
                <button onClick={() => navigate(`/service/${s.id}`)} className="block h-[124px] w-[124px] overflow-hidden rounded-[18px]" aria-label={s.name}>
                  <CategoryPhoto categoryId={s.categoryId} imageUrl={s.imageUrl} size={124} />
                </button>
                <AddButton service={s} className="absolute -bottom-4 left-2.5 right-2.5" />
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="py-8 text-center text-[13px] text-ink-muted">No services here right now.</p>}
      </div>

      <div className="mt-2 bg-white px-4 pb-8 pt-4">
        <SectionTitle>What customers say</SectionTitle>
        {loadingReviews ? (
          <div className="mt-3 space-y-2">
            <div className="skeleton h-20 rounded-2xl" />
            <div className="skeleton h-20 rounded-2xl" />
          </div>
        ) : reviews.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-ink-muted">No reviews yet — be the first after your booking.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {reviews.slice(0, 20).map((r) => (
              <div key={r.id} className="rounded-2xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-ink">
                    {r.customer?.name || "Customer"}
                    {r.serviceName && <span className="font-normal text-ink-muted"> · {r.serviceName}</span>}
                  </p>
                  <span className="flex items-center gap-0.5 text-[12.5px] font-bold text-trust">
                    {r.rating} <StarIcon filled width={12} height={12} fill="#12804A" stroke="#12804A" />
                  </span>
                </div>
                {r.text && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{r.text}</p>}
                {r.reply?.text && (
                  <div className="mt-2 rounded-xl bg-mist px-3 py-2">
                    <p className="text-[11.5px] font-bold text-brand-dark">Reply from {provider.name}</p>
                    <p className="text-[12.5px] leading-snug text-ink-soft">{r.reply.text}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <CartBar />
    </div>
  );
}
