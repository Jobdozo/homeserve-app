import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import ScreenHeader from "../components/ScreenHeader";
import { StarIcon, ShieldCheckIcon } from "../components/icons";
import { formatCount, discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";

export default function ProviderProfileScreen() {
  const { providerId } = useParams();
  const navigate = useNavigate();
  const { providers, services } = useApp();
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const provider = providers[providerId];
  const providerServices = useMemo(
    () => services.filter((s) => s.providerId === providerId),
    [services, providerId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingReviews(true);
    api
      .getProviderReviews(providerId)
      .then((data) => {
        if (!cancelled) setReviews(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingReviews(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const breakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      const idx = Math.round(r.rating) - 1;
      if (idx >= 0 && idx < 5) counts[idx]++;
    });
    const max = Math.max(1, ...counts);
    return counts.map((count, i) => ({ star: i + 1, count, pct: (count / max) * 100 })).reverse();
  }, [reviews]);

  if (!provider) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Provider not found.</p>
        <button onClick={() => navigate("/home")} className="text-sm font-semibold text-brand">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Provider Profile" maxWidth="lg:max-w-3xl" />

      <div className="flex-1 px-4 pb-8 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8 lg:pb-16">
        <div className="flex items-center gap-3">
          <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-3xl">
            {provider.avatar}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[16px] font-bold text-gray-900">{provider.name}</p>
              {provider.verified && <ShieldCheckIcon width={15} height={15} className="text-brand" />}
            </div>
            <p className="text-[12.5px] text-gray-500">{provider.category}</p>
            {provider.reviews > 0 ? (
              <div className="mt-1 flex items-center gap-1 text-[12.5px] text-gray-600">
                <StarIcon filled width={13} height={13} />
                <span className="font-semibold">{provider.rating}</span>
                <span className="text-gray-400">({formatCount(provider.reviews)} reviews)</span>
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-gray-400">New provider — no reviews yet</p>
            )}
          </div>
        </div>

        {(provider.experience || provider.serviceArea) && (
          <div className="mt-4 flex gap-2">
            {provider.experience && (
              <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-[13px] font-bold text-gray-900">{provider.experience}</p>
                <p className="text-[10.5px] text-gray-400">Experience</p>
              </div>
            )}
            {provider.serviceArea && (
              <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2.5 text-center">
                <p className="text-[13px] font-bold text-gray-900">{provider.serviceArea.split(" ").slice(0, 2).join(" ")}</p>
                <p className="text-[10.5px] text-gray-400">Service Area</p>
              </div>
            )}
            <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-[13px] font-bold text-gray-900">{providerServices.length}</p>
              <p className="text-[10.5px] text-gray-400">Services</p>
            </div>
          </div>
        )}

        {providerServices.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-[14px] font-bold text-gray-900">Services by {provider.name.split(" ")[0]}</h2>
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {providerServices.map((s) => {
                const pct = discountPct(s.price, s.originalPrice);
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/service/${s.id}`)}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-2.5 text-left hover:bg-gray-50"
                  >
                    <CategoryIcon categoryId={s.categoryId} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-gray-900">{s.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-brand">₹{s.price}</span>
                        {pct > 0 && <span className="text-[10.5px] text-gray-400 line-through">₹{s.originalPrice}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {reviews.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-[14px] font-bold text-gray-900">Rating Breakdown</h2>
            <div className="space-y-1.5">
              {breakdown.map((b) => (
                <div key={b.star} className="flex items-center gap-2 text-[11.5px] text-gray-500">
                  <span className="w-8 flex-shrink-0">{b.star}★</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${b.pct}%` }} />
                  </div>
                  <span className="w-5 flex-shrink-0 text-right">{b.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h2 className="mb-2 text-[14px] font-bold text-gray-900">
            Reviews {reviews.length > 0 && `(${reviews.length})`}
          </h2>
          {loadingReviews ? (
            <p className="py-6 text-center text-xs text-gray-400">Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">No reviews yet.</p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-light text-base">
                        {r.customer?.avatar}
                      </span>
                      <div>
                        <p className="text-[12.5px] font-semibold text-gray-900">{r.customer?.name}</p>
                        <p className="text-[10.5px] text-gray-400">{r.serviceName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <StarIcon key={n} filled={n <= r.rating} width={12} height={12} />
                      ))}
                    </div>
                  </div>
                  {r.text && <p className="mt-2 text-[12.5px] leading-relaxed text-gray-600">{r.text}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
