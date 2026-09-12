import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StarIcon } from "../components/icons";

export default function RateReviewScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { getBooking, getProvider, submitReview, showToast } = useApp();
  const booking = getBooking(bookingId);
  const provider = booking ? getProvider(booking.providerId) : null;

  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");

  if (!booking) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      showToast("Please select a rating");
      return;
    }
    await submitReview(booking.id, rating, text);
    showToast("Thanks for your feedback!");
    navigate(`/booking/${booking.id}`, { replace: true });
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center justify-between px-4 pb-2 pt-1 lg:mx-auto lg:w-full lg:max-w-md lg:px-0 lg:pt-6">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </button>
        <h1 className="text-[15px] font-bold text-gray-900 lg:text-lg">Rate & Review</h1>
        <button onClick={() => navigate(`/booking/${booking.id}`)} className="text-sm font-medium text-gray-400 hover:text-gray-600">
          Skip
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 pt-6 lg:mx-auto lg:w-full lg:max-w-md lg:px-0">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-light text-4xl">⭐</div>
        <h2 className="mt-4 text-lg font-bold text-gray-900">How was the service?</h2>
        <p className="text-[12.5px] text-gray-400">Your feedback helps us improve</p>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-lg">
            {provider?.avatar}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-900">{provider?.name}</p>
            <p className="text-[11px] text-gray-400">{provider?.rating} ({provider?.reviews}+ reviews)</p>
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
          <label className="mb-1.5 block text-[13px] font-semibold text-gray-900">
            Write a Review <span className="font-normal text-gray-400">(Optional)</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 300))}
            rows={4}
            placeholder="Great service! Technician was professional and fixed the issue."
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 outline-none placeholder:text-gray-400"
          />
          <p className="mt-1 text-right text-[10.5px] text-gray-400">{text.length}/300</p>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-4 lg:mx-auto lg:w-full lg:max-w-md lg:px-0 lg:pb-8">
        <button
          onClick={handleSubmit}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-card active:scale-[0.98]"
        >
          Submit Review
        </button>
      </div>
    </div>
  );
}
