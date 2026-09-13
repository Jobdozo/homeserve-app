import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { STATUS_STEPS } from "../data/mockData";
import ScreenHeader from "../components/ScreenHeader";
import { ChatIcon, PhoneIcon, StarIcon, CheckIcon, MapPinIcon } from "../components/icons";
import CategoryIcon from "../components/CategoryIcon";

const LOCATION_TRACKED_STATUSES = ["Accepted", "In Progress"];

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

export default function BookingDetailsScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { getBooking, getService, getProvider, cancelBooking, advanceBookingStatus, showToast } = useApp();

  const booking = getBooking(bookingId);
  const [liveLocation, setLiveLocation] = useState(null);

  // Poll the provider's real-time position every 30s (matching how often
  // they report it) so directions target where they actually are.
  useEffect(() => {
    setLiveLocation(null);
    if (!booking || !LOCATION_TRACKED_STATUSES.includes(booking.status)) return;
    let cancelled = false;
    const poll = () => {
      api
        .getBookingLiveLocation(booking.id)
        .then((loc) => {
          if (!cancelled) setLiveLocation(loc);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [booking?.id, booking?.status]);

  if (!booking) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Booking not found.</p>
        <button onClick={() => navigate("/bookings")} className="text-sm font-semibold text-brand">
          Back to Bookings
        </button>
      </div>
    );
  }

  const service = getService(booking.serviceId);
  const provider = getProvider(booking.providerId);
  const currentIdx = STATUS_STEPS.indexOf(booking.status);
  const isCancelled = booking.status === "Cancelled" || booking.status === "Rejected";
  const isLiveProvider = provider?.live;

  const handleCancel = async () => {
    await cancelBooking(booking.id);
    showToast("Booking cancelled");
  };

  const handleSimulateNext = async () => {
    const next = STATUS_STEPS[currentIdx + 1];
    await advanceBookingStatus(booking.id, next);
    showToast("Status updated");
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title="Booking Details"
        subtitle={booking.orderId ? `#${booking.id} · Order #${booking.orderId}` : `#${booking.id}`}
        right={
          <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusStyles[booking.status]}`}>
            {booking.status}
          </span>
        }
      />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        {/* Service summary */}
        <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <CategoryIcon categoryId={service?.categoryId} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-gray-900">{service?.name}</p>
            <p className="text-[11px] text-gray-500">₹{booking.amount}</p>
          </div>
        </div>

        {/* Provider */}
        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Provider Details</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3">
            <button
              onClick={() => navigate(`/provider/${booking.providerId}`)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-xl">
                {provider?.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-gray-900">{provider?.name}</p>
                <div className="flex items-center gap-1 text-[11px] text-gray-500">
                  <StarIcon filled width={12} height={12} /> {provider?.rating} ({provider?.reviews}+)
                </div>
              </div>
            </button>
            <button
              onClick={() => navigate(`/chat/${booking.id}`)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand"
              aria-label="Message provider"
            >
              <ChatIcon width={16} height={16} />
            </button>
            <a
              href={`tel:${provider?.phone}`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand"
              aria-label="Call provider"
            >
              <PhoneIcon width={16} height={16} />
            </a>
          </div>
          {liveLocation && (
            <div className="mt-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${liveLocation.lat},${liveLocation.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand"
              >
                <MapPinIcon width={14} height={14} /> Get Directions to provider →
              </a>
              {typeof liveLocation.accuracy === "number" && (
                <p className="mt-0.5 text-[10.5px] font-medium text-gray-400">
                  Accurate to within ~{Math.round(liveLocation.accuracy)}m
                </p>
              )}
            </div>
          )}
        </div>

        {/* Booking info */}
        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Booking Information</h2>
          <div className="space-y-2 rounded-2xl border border-gray-100 p-3 text-[12.5px]">
            <Row label="Date & Time" value={`${formatDate(booking.date)}, ${booking.time}`} />
            <Row label="Address" value={`${booking.address.label} — ${booking.address.line}`} />
            <Row label="Amount" value={`₹${booking.amount}`} />
            {booking.issue && <Row label="Notes" value={booking.issue} />}
          </div>
        </div>

        {/* Status timeline */}
        {!isCancelled && (
          <div>
            <h2 className="mb-3 text-[13px] font-bold text-gray-900">Booking Status</h2>
            <div className="space-y-0">
              {STATUS_STEPS.map((step, i) => {
                const reached = i <= currentIdx;
                const isLast = i === STATUS_STEPS.length - 1;
                const time = booking.statusHistory[step];
                return (
                  <div key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                          reached ? "bg-brand text-white" : "border-2 border-gray-200 bg-white"
                        }`}
                      >
                        {reached && <CheckIcon width={11} height={11} strokeWidth={3} />}
                      </span>
                      {!isLast && <span className={`w-0.5 flex-1 ${reached ? "bg-brand" : "bg-gray-200"}`} style={{ minHeight: 28 }} />}
                    </div>
                    <div className="pb-6">
                      <p className={`text-[13px] font-semibold ${reached ? "text-gray-900" : "text-gray-400"}`}>{step}</p>
                      <p className="text-[11px] text-gray-400">{time ? formatDateTime(time) : "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live providers drive their own status from the Provider App in real time. */}
        {!isCancelled && isLiveProvider && currentIdx < STATUS_STEPS.length - 1 && (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-center text-[12px] text-gray-500">
            {booking.status === "Pending"
              ? "Waiting for the provider to accept your request…"
              : "The provider will update this status as the job progresses."}
          </p>
        )}
        {!isCancelled && !isLiveProvider && currentIdx < STATUS_STEPS.length - 1 && (
          <button
            onClick={handleSimulateNext}
            className="w-full rounded-xl border border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-500"
          >
            Simulate: mark as "{STATUS_STEPS[currentIdx + 1]}"
          </button>
        )}

        {booking.status === "Completed" && !booking.reviewed && (
          <button
            onClick={() => navigate(`/review/${booking.id}`)}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white shadow-card"
          >
            Rate & Review
          </button>
        )}
        {booking.reviewed && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-[12.5px] font-medium text-emerald-700">
            You rated this service {booking.review.rating}★
          </div>
        )}
      </div>

      {!isCancelled && (booking.status === "Pending" || booking.status === "Accepted") && (
        <div className="flex flex-shrink-0 gap-3 border-t border-gray-100 bg-white px-4 py-3 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:py-4">
          <button
            onClick={handleCancel}
            className="flex-1 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-600 active:scale-[0.98]"
          >
            Cancel Booking
          </button>
          <button
            onClick={() => showToast("Support will reach out shortly")}
            className="flex-1 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Need Help?
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="flex-shrink-0 text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-700">{value}</span>
    </div>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}
