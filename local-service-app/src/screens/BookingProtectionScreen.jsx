import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";

const BADGES = [
  { icon: "🛡️", label: "Genuine service guarantee" },
  { icon: "👍", label: "Damage protection up to ₹10,000" },
  { icon: "🏷️", label: "Fair price guarantee" },
  { icon: "🚨", label: "SOS & emergency help" },
  { icon: "🔒", label: "Confidentiality of all private details" },
];

const CLAIMABLE_STATUSES = ["Accepted", "In Progress", "Completed"];

export default function BookingProtectionScreen() {
  const routerLocation = useLocation();
  const { bookings, submitRefundClaim, showToast } = useApp();
  const eligibleBookings = bookings.filter((b) => CLAIMABLE_STATUSES.includes(b.status));
  const preselectedId = routerLocation.state?.bookingId;

  const [bookingId, setBookingId] = useState(preselectedId || eligibleBookings[0]?.id || "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bookingId || !reason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitRefundClaim(bookingId, reason.trim());
      setSubmitted(true);
    } catch (err) {
      showToast(err.message || "Couldn't submit your claim — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Booking Protection" maxWidth="lg:max-w-2xl" />

      <div className="flex-1 space-y-5 px-4 pb-8 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="rounded-2xl bg-gray-50 p-4">
          <p className="text-[14px] font-bold text-gray-900">
            Booking outside the Tikdum app means we can't guarantee your safety or quality
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-gray-500">
            We discourage providers from offering service outside the app. If something goes wrong on a
            Tikdum booking, you're covered — file a claim below and our team will review it.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-bold text-gray-900">Booking through Tikdum ensures</p>
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
            {BADGES.map((b) => (
              <div key={b.label} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg">{b.icon}</span>
                <span className="text-[12.5px] text-gray-700">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {submitted ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center">
            <p className="text-[13px] font-semibold text-emerald-700">Claim submitted</p>
            <p className="mt-1 text-[12px] text-emerald-600">Our team will review it and get back to you.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-[13px] font-bold text-gray-900">Claim a refund</p>
            {eligibleBookings.length === 0 ? (
              <p className="text-[12.5px] text-gray-400">You don't have any bookings to claim a refund for yet.</p>
            ) : (
              <>
                <select
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand"
                >
                  {eligibleBookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      #{b.id} — {b.service?.name} ({new Date(b.date).toLocaleDateString("en-IN")})
                    </option>
                  ))}
                </select>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder="What went wrong?"
                  className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={!bookingId || !reason.trim() || submitting}
                  className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Claim Refund"}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
