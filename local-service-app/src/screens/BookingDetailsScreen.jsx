import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { callProvider } from "../utils/callProvider";
import { STATUS_STEPS } from "../data/mockData";
import { BackIcon, ChatIcon, PhoneIcon, CheckIcon, MapPinIcon, UserPlusIcon } from "../components/icons";
import CategoryPhoto from "../components/CategoryPhoto";
import LiveTracking from "../components/LiveTracking";
import { ProviderMark, RatingPill, VerifiedBadge, SectionLabel, inr } from "../components/ui";

const LOCATION_TRACKED_STATUSES = ["Accepted", "In Progress"];
const STEP_LABEL = { Pending: "Booking sent", Accepted: "Accepted", "In Progress": "Work started", Completed: "Done" };

// The headline for each moment of a booking.
function headline(status, providerName) {
  // long business names read badly in a 28px headline; the card below names them
  const who = providerName && providerName.length <= 22 ? providerName : "Your professional";
  switch (status) {
    case "Pending":
      return { kicker: "Booking sent", title: `Waiting for ${who} to accept`, sub: "Usually takes a few minutes" };
    case "Accepted":
      return { kicker: "Confirmed", title: `${who} is coming`, sub: "Share the start code when they arrive" };
    case "In Progress":
      return { kicker: "In progress", title: "Work has started", sub: "Share the finish code when you're happy with the job" };
    case "Completed":
      return { kicker: "Done", title: "All done!", sub: "How did it go? Your rating helps other customers" };
    case "Rejected":
      return { kicker: "Not accepted", title: `${who} couldn't take this`, sub: "Book another professional for the same service" };
    default:
      return { kicker: "Cancelled", title: "This booking was cancelled", sub: "Nothing to pay" };
  }
}

export default function BookingDetailsScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { getBooking, getService, getProvider, cancelBooking, advanceBookingStatus, showToast, bookings } = useApp();

  const booking = getBooking(bookingId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!booking) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-ink-muted">Booking not found.</p>
        <button onClick={() => navigate("/bookings")} className="text-sm font-semibold text-brand">
          Back to Bookings
        </button>
      </div>
    );
  }

  const service = getService(booking.serviceId) || booking.service;
  const provider = getProvider(booking.providerId);
  const currentIdx = STATUS_STEPS.indexOf(booking.status);
  const isCancelled = booking.status === "Cancelled" || booking.status === "Rejected";
  const isLiveProvider = provider?.live;
  // The other services booked in the same order from this provider: one request, one Request ID, one code.
  const others = booking.orderId ? bookings.filter((o) => o.orderId === booking.orderId && o.providerId === booking.providerId && o.id !== booking.id) : [];
  const all = [booking, ...others];
  const requestTotal = all.reduce((sum, o) => sum + (o.amount || 0), 0);
  const head = headline(booking.status, provider?.name);
  const justBooked = state?.justBooked && booking.status === "Pending";

  const handleCancel = async () => {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    await cancelBooking(booking.id);
    setConfirmCancel(false);
    showToast("Booking cancelled");
  };

  const handleSimulateNext = async () => {
    const next = STATUS_STEPS[currentIdx + 1];
    await advanceBookingStatus(booking.id, next);
    showToast("Status updated");
  };

  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:mx-auto lg:w-full lg:max-w-2xl">
      {/* status hero */}
      <div className={`px-4 pb-[70px] pt-3 ${isCancelled ? "bg-ink" : "bg-brand-night"}`}>
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/bookings")} aria-label="Go back" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-95">
            <BackIcon width={19} height={19} />
          </button>
          <span className="text-[13px] font-semibold text-[#C9C0F2]">Request #{booking.ref || booking.id.slice(0, 8)}</span>
          <button onClick={() => navigate("/profile/help")} className="rounded-full bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white active:scale-95">
            Help
          </button>
        </div>
        {justBooked && (
          <div className="mt-4 flex animate-fade-up items-center gap-3 rounded-2xl bg-white/10 px-3 py-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 animate-pop items-center justify-center rounded-full bg-trust">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="30" className="animate-check-draw" />
              </svg>
            </span>
            <span className="text-[13.5px] font-semibold text-white">Booked! We've sent it to {provider?.name || "the professional"}.</span>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-marigold">{head.kicker}</span>
          <h1 className="font-display text-[28px] font-extrabold leading-[1.06] text-white">{head.title}</h1>
          <span className="text-[13.5px] text-[#DCD5FF]">
            {formatDate(booking.date)}, {booking.time} · {all.length} service{all.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="relative -mt-[50px] flex flex-col gap-3 px-4 pb-6">
        {["Accepted", "In Progress"].includes(booking.status) && <JobOtpCard bookingId={booking.id} status={booking.status} count={all.length} />}

        {/* progress */}
        {!isCancelled && (
          <div className={`rounded-[22px] bg-white p-4 ${["Accepted", "In Progress"].includes(booking.status) ? "" : "shadow-lift"}`}>
            {STATUS_STEPS.map((step, i) => {
              const reached = i <= currentIdx;
              const current = i === currentIdx && booking.status !== "Completed";
              const isLast = i === STATUS_STEPS.length - 1;
              const time = booking.statusHistory?.[step];
              return (
                <div key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {current ? (
                      <span className="h-6 w-6 flex-shrink-0 rounded-full bg-brand shadow-[0_0_0_6px_#EAE5FF]" />
                    ) : reached ? (
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-trust text-white">
                        <CheckIcon width={13} height={13} strokeWidth={3.4} />
                      </span>
                    ) : (
                      <span className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-line" />
                    )}
                    {!isLast && <span className={`w-0.5 flex-1 ${i < currentIdx ? "bg-trust" : "bg-line"}`} style={{ minHeight: 24 }} />}
                  </div>
                  <div className="pb-4 pt-0.5">
                    <p className={`text-[14px] ${current ? "font-extrabold text-brand" : reached ? "font-bold text-ink" : "font-semibold text-ink-muted"}`}>{STEP_LABEL[step] || step}</p>
                    {time && <p className="text-[12px] text-ink-muted">{formatDateTime(time)}</p>}
                  </div>
                </div>
              );
            })}
            {isLiveProvider && currentIdx < STATUS_STEPS.length - 1 && (
              <p className="rounded-xl bg-mist px-3 py-2.5 text-center text-[12.5px] text-ink-muted">
                {booking.status === "Pending" ? "We'll let you know the moment they accept." : "The professional updates this as the job goes."}
              </p>
            )}
            {!isLiveProvider && currentIdx < STATUS_STEPS.length - 1 && (
              <button onClick={handleSimulateNext} className="w-full rounded-xl border border-dashed border-line py-2.5 text-xs font-medium text-ink-muted">
                Simulate: mark as "{STATUS_STEPS[currentIdx + 1]}"
              </button>
            )}
          </div>
        )}

        {/* the professional */}
        {provider && (
          <div className="rounded-[22px] bg-white p-3.5">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(`/provider/${booking.providerId}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <ProviderMark provider={provider} className="h-[52px] w-[52px] rounded-full text-[18px]" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15.5px] font-bold text-ink">{provider.name}</span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                    {provider.verified && <VerifiedBadge className="text-[12.5px]" />}
                    <RatingPill rating={provider.rating} count={provider.reviews} size="sm" />
                  </span>
                </span>
              </button>
              {booking.status !== "Completed" && !isCancelled && (
                <button onClick={() => navigate(`/chat/${booking.id}`)} aria-label="Message the professional" className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light text-brand active:scale-95">
                  <ChatIcon width={19} height={19} />
                </button>
              )}
              {["Accepted", "In Progress"].includes(booking.status) && (
                <button onClick={() => callProvider(booking.id, showToast)} aria-label="Call the professional" className="flex h-11 w-11 items-center justify-center rounded-full bg-trust text-white active:scale-95">
                  <PhoneIcon width={18} height={18} />
                </button>
              )}
            </div>
            {LOCATION_TRACKED_STATUSES.includes(booking.status) && (
              <LiveTracking booking={booking} who={provider?.name && provider.name.length <= 22 ? provider.name : "Your professional"} />
            )}
          </div>
        )}

        {/* what's in this visit */}
        <div className="rounded-[22px] bg-white p-4">
          <SectionLabel>In this visit</SectionLabel>
          <div className="mt-2 divide-y divide-[#F0EEF7]">
            {all.map((o) => {
              const s = getService(o.serviceId) || o.service;
              return (
                <button key={o.id} onClick={() => o.id !== booking.id && navigate(`/booking/${o.id}`)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl">
                    <CategoryPhoto categoryId={s?.categoryId} imageUrl={s?.imageUrl} size={44} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-bold text-ink">{o.service?.name || s?.name}</span>
                    {o.options?.length > 0 && <span className="truncate text-[12px] text-ink-muted">{o.options.map((x) => x.choice).join(" · ")}</span>}
                  </span>
                  <span className="text-[14px] font-bold text-ink tabular">{inr(o.amount)}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between border-t border-dashed border-line pt-3 text-[15px] font-extrabold text-ink tabular">
            <span>{booking.status === "Completed" ? "Paid after service" : "Pay after service"}</span>
            <span>{inr(requestTotal)}</span>
          </div>
          {all.length > 1 && <p className="mt-1.5 text-[12px] text-ink-muted">One code starts and finishes all of these together.</p>}
        </div>

        {/* where + notes */}
        <div className="space-y-2.5 rounded-[22px] bg-white p-4 text-[13.5px]">
          <div className="flex gap-2.5">
            <MapPinIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-brand" />
            <span className="text-ink-soft">
              <b className="text-ink">{booking.address.label}</b> — {booking.address.line}
            </span>
          </div>
          {booking.contact && (
            <div className="flex gap-2.5">
              <UserPlusIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-brand" />
              <span className="text-ink-soft">
                Booked for <b className="text-ink">{booking.contact.name}</b> · {booking.contact.phone}
              </span>
            </div>
          )}
          {booking.issue && <p className="rounded-xl bg-mist px-3 py-2 text-ink-soft">Note: {booking.issue}</p>}
        </div>

        {booking.status === "Completed" && !booking.reviewed && (
          <button onClick={() => navigate(`/review/${booking.id}`)} className="h-[54px] w-full rounded-2xl bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]">
            Rate &amp; review
          </button>
        )}
        {booking.reviewed && (
          <div className="rounded-2xl bg-trust-light px-4 py-3 text-center text-[13px] font-semibold text-trust-dark">You rated this service {booking.review.rating}★ — thank you</div>
        )}
        {booking.status === "Rejected" && service && (
          <button onClick={() => navigate(`/find-service/${service.id}`)} className="h-[54px] w-full rounded-2xl bg-brand text-[15px] font-bold text-white shadow-cta active:scale-[0.98]">
            Choose another professional
          </button>
        )}
        {["Accepted", "In Progress", "Completed"].includes(booking.status) && (
          <button onClick={() => navigate("/booking-protection", { state: { bookingId: booking.id } })} className="text-[13px] font-semibold text-ink-muted underline decoration-dotted">
            Something wrong with this booking? Claim a refund
          </button>
        )}

        {!isCancelled && (booking.status === "Pending" || booking.status === "Accepted") && (
          <div className="flex gap-2.5">
            <button onClick={() => navigate("/profile/help")} className="h-12 flex-1 rounded-2xl bg-white text-[14px] font-bold text-ink active:scale-[0.98]">
              Get help
            </button>
            <button
              onClick={handleCancel}
              onBlur={() => setConfirmCancel(false)}
              className={`h-12 flex-1 rounded-2xl text-[14px] font-bold active:scale-[0.98] ${confirmCancel ? "bg-accent-red text-white" : "bg-white text-accent-red"}`}
            >
              {confirmCancel ? "Tap again to cancel" : "Cancel booking"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const OTP_COPY = {
  start: { title: "Start code", hint: "Share only when the professional is at your door" },
  complete: { title: "Finish code", hint: "Share when you're happy with the work — it marks the job done" },
};

function JobOtpCard({ bookingId, status, count }) {
  const [otp, setOtp] = useState(null);
  const type = status === "Accepted" ? "start" : "complete";

  useEffect(() => {
    let cancelled = false;
    api
      .getBookingOtp(bookingId)
      .then((data) => !cancelled && setOtp(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId, status]);

  const code = otp?.[type]?.code;
  if (!code) return null;
  const copy = OTP_COPY[type];

  return (
    <div className="rounded-[22px] bg-white p-4 shadow-lift">
      <div className="flex items-center justify-between gap-3">
        <span className="whitespace-nowrap text-[15px] font-bold text-ink">{copy.title}</span>
        <span className="text-right text-[12px] text-ink-muted">{copy.hint}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2.5" aria-label={`${copy.title} ${String(code).split("").join(" ")}`}>
        {String(code)
          .split("")
          .map((d, i) => (
            <span key={i} className="flex h-[62px] animate-pop items-center justify-center rounded-2xl bg-mist font-display text-[32px] font-extrabold text-brand-night" style={{ animationDelay: `${i * 60}ms` }}>
              {d}
            </span>
          ))}
      </div>
      {count > 1 && <p className="mt-2.5 text-[12.5px] text-ink-muted">One code for the whole visit — all {count} services.</p>}
    </div>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function formatDateTime(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}
