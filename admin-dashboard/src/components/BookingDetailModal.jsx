import { useEffect, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";
import { XIcon, CalendarIcon, MapPinIcon, CameraIcon, CheckIcon } from "./icons";

const statusStyles = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Cancelled: "bg-red-100 text-red-600",
  Rejected: "bg-red-100 text-red-600",
};

const STATUS_LABELS = {
  Pending: "Booking placed",
  Accepted: "Accepted the request",
  "In Progress": "Job in progress",
  Completed: "Job completed",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};

const CHECKPOINT_LABELS = {
  reached_location: "Reached the location",
  started_job: "Started the job",
  left_location: "Left the location",
};

const PHOTO_LABELS = { before: "Before", after: "After" };

export default function BookingDetailModal({ bookingId, onClose }) {
  const { bookings, providers } = useApp();
  const booking = bookings.find((b) => b.id === bookingId);
  const [photos, setPhotos] = useState(null);
  const [checkpoints, setCheckpoints] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPhotos(null);
    setCheckpoints(null);
    Promise.all([
      api.getBookingPhotos(bookingId).catch(() => []),
      api.getBookingCheckpoints(bookingId).catch(() => []),
    ]).then(([p, c]) => {
      if (cancelled) return;
      setPhotos(p);
      setCheckpoints(c);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (!booking) return null;

  const providerName = providers.find((p) => p.id === booking.providerId)?.name || "—";

  const timeline = [
    ...Object.entries(booking.statusHistory || {}).map(([status, at]) => ({
      label: STATUS_LABELS[status] || status,
      at,
    })),
    ...(checkpoints || []).map((c) => ({ label: CHECKPOINT_LABELS[c.type] || c.type, at: c.at })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Booking #{booking.id.slice(0, 10)}</h2>
            <p className="text-[11px] text-gray-400">Full booking ID: {booking.id}</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] font-bold text-gray-900">{booking.service?.name}</p>
              <p className="text-[12px] text-gray-500">₹{booking.amount}</p>
            </div>
            <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[booking.status]}`}>
              {booking.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <Field label="Customer" value={booking.customer?.name} />
            <Field label="Provider" value={providerName} />
            <Field
              label="Date"
              value={new Date(booking.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            />
            <Field label="Time" value={booking.time} />
          </div>

          {booking.address?.line && (
            <div className="flex items-start gap-2 rounded-xl border border-gray-100 p-3">
              <MapPinIcon width={15} height={15} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <p className="text-[12.5px] leading-snug text-gray-600">
                {booking.address.label} — {booking.address.line}
              </p>
            </div>
          )}

          {booking.issue && (
            <div>
              <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-gray-400">Issue Description</p>
              <p className="text-[12.5px] leading-relaxed text-gray-600">{booking.issue}</p>
            </div>
          )}

          <Section title="Job Timeline" icon={CalendarIcon}>
            {checkpoints === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {timeline.length === 0 && checkpoints !== null && (
              <p className="text-[12px] text-gray-400">No status events yet.</p>
            )}
            {timeline.length > 0 && (
              <div className="space-y-0">
                {timeline.map((t, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckIcon width={11} height={11} />
                      </span>
                      {i < timeline.length - 1 && <span className="w-px flex-1 bg-gray-100" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-[12.5px] font-semibold text-gray-800">{t.label}</p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(t.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Before & After Photos" icon={CameraIcon}>
            {photos === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {photos && (
              <div className="grid grid-cols-2 gap-3">
                {["before", "after"].map((photoType) => {
                  const slotPhotos = photos.filter((p) => p.photoType === photoType);
                  return (
                    <div key={photoType} className="rounded-xl border border-gray-100 p-2.5">
                      <p className="mb-2 text-[11px] font-semibold text-gray-500">{PHOTO_LABELS[photoType]}</p>
                      {slotPhotos.length > 0 ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {slotPhotos.map((p) => (
                            <a key={p.id} href={`${SERVER_URL}${p.url}`} target="_blank" rel="noreferrer">
                              <img
                                src={`${SERVER_URL}${p.url}`}
                                alt={`${PHOTO_LABELS[photoType]} photo`}
                                className="aspect-square w-full rounded-lg object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gray-50 text-gray-300">
                          <CameraIcon width={18} height={18} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="truncate text-gray-800">{value || "—"}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-gray-400">
        {Icon && <Icon width={13} height={13} />} {title}
      </p>
      {children}
    </div>
  );
}
