import { useMemo } from "react";
import { useApp } from "../context/AppContext";
import { StarIcon } from "../components/icons";

export default function ReviewsPage() {
  const { bookings, providers } = useApp();

  const providerName = (id) => providers.find((p) => p.id === id)?.name || "—";

  const reviews = useMemo(
    () =>
      bookings
        .filter((b) => b.reviewed && b.review)
        .sort((a, b) => new Date(b.statusHistory.Completed || b.createdAt) - new Date(a.statusHistory.Completed || a.createdAt)),
    [bookings]
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[12.5px] text-gray-500">
          {reviews.length} review{reviews.length === 1 ? "" : "s"} across the platform
        </p>
      </div>

      {reviews.map((b) => (
        <div key={b.id} className="rounded-2xl bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-xl">
                {b.customer?.avatar}
              </span>
              <div>
                <p className="text-[13.5px] font-semibold text-gray-900">{b.customer?.name}</p>
                <p className="text-[11.5px] text-gray-400">
                  {b.service?.name} · {providerName(b.providerId)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <StarIcon key={n} filled={n <= b.review.rating} width={14} height={14} />
              ))}
            </div>
          </div>
          {b.review.text && <p className="mt-3 text-[13px] leading-relaxed text-gray-600">{b.review.text}</p>}
          <p className="mt-2 text-[11px] text-gray-400">
            Request #{b.ref || b.id} ·{" "}
            {new Date(b.statusHistory.Completed || b.createdAt).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
      ))}

      {reviews.length === 0 && <p className="py-16 text-center text-sm text-gray-400">No reviews yet.</p>}
    </div>
  );
}
