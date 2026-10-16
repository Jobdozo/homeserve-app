import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StarIcon } from "../components/icons";
import Avatar from "../components/Avatar";

export default function RateReviewScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { getBooking, getProvider, submitReview, showToast } = useApp();
  const booking = getBooking(bookingId);
  const provider = booking ? getProvider(booking.providerId) : null;

  // Stars already tapped in the "How was it?" prompt (?rating=4) come pre-selected.
  const [params] = useSearchParams();
  const [rating, setRating] = useState(() => {
    const n = Number(params.get("rating"));
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
  });
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");

  if (!booking) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      showToast("Please select a rating");
      return;
    }
    try {
      await submitReview(booking.id, rating, text);
      showToast("Thanks for your feedback!");
    } catch (e) {
      // e.g. already rated, or the job isn't completed yet
      showToast(e.message || "Couldn't save your rating");
    }
    navigate(`/booking/${booking.id}`, { replace: true });
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center justify-between px-4 pb-2 pt-1 lg:mx-auto lg:w-full lg:max-w-md lg:px-0 lg:pt-6">
        <button onClick={() => navigate(-1)} className="text-sm text-ink-muted hover:text-ink-soft">
          Cancel
        </button>
        <h1 className="text-[15px] font-bold text-ink lg:text-lg">Rate & Review</h1>
        <button onClick={() => navigate(`/booking/${booking.id}`)} className="text-sm font-medium text-ink-muted hover:text-ink-soft">
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pt-6 lg:mx-auto lg:w-full lg:max-w-md lg:px-0">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-light text-4xl">⭐</div>
        <h2 className="mt-4 text-lg font-bold text-ink">How was the service?</h2>
        <p className="text-[12.5px] text-ink-muted">Your feedback helps us improve</p>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-mist px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-brand-light text-lg">
            <Avatar provider={provider} fallback="" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink">{provider?.name}</p>
            <p className="text-[11px] text-ink-muted">{provider?.rating} ({provider?.reviews}+ reviews)</p>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              aria-label={`${n} star`}
            >
              <StarIcon filled={n <= (hover || rating)} width={34} height={34} />
            </button>
          ))}
        </div>

        <div className="mt-6 w-full">
          <label className="mb-1.5 block text-[13px] font-semibold text-ink">
            Write a Review <span className="font-normal text-ink-muted">(Optional)</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            rows={4}
            placeholder="Great service! Technician was professional and fixed the issue."
            className="w-full resize-none rounded-xl border border-line px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-muted"
          />
          <p className="mt-1 text-right text-[10.5px] text-ink-muted">{text.length}/300</p>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-4 lg:mx-auto lg:w-full lg:max-w-md lg:px-0 lg:pb-8">
        <button
          onClick={handleSubmit}
          className="w-full rounded-2xl bg-brand py-3.5 text-[15px] font-bold text-white shadow-cta active:scale-[0.98]"
        >
          Submit Review
        </button>
      </div>
    </div>
  );
}
