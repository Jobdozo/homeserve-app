import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api, SERVER_URL } from "../api";
import ScreenHeader from "../components/ScreenHeader";
import { MapPinIcon, CalendarIcon, ClockIcon, PhoneIcon, CameraIcon, CheckIcon } from "../components/icons";
import CategoryIcon from "../components/CategoryIcon";
import { compressImage } from "../utils/imageCompress";

const LOCATION_TRACKED_STATUSES = ["Pending", "Accepted", "In Progress"];

export default function RequestDetailsScreen() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { getRequest, acceptRequest, rejectRequest, showToast } = useApp();
  const [liveLocation, setLiveLocation] = useState(null);

  const request = getRequest(requestId);

  // Poll the customer's real-time position every 30s (matching how often
  // they report it) so directions target where they actually are.
  useEffect(() => {
    setLiveLocation(null);
    if (!request || !LOCATION_TRACKED_STATUSES.includes(request.status)) return;
    let cancelled = false;
    const poll = () => {
      api
        .getBookingLiveLocation(request.id)
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
  }, [request?.id, request?.status]);

  if (!request) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Request not found.</p>
        <button onClick={() => navigate("/requests")} className="text-sm font-semibold text-brand">
          Back to Requests
        </button>
      </div>
    );
  }

  const customer = request.customer;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Request Details" subtitle={`Request ID: #${request.id}`} />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        {request.status === "Pending" && (
          <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700">
            NEW REQUEST
          </span>
        )}

        <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-3">
          <CategoryIcon categoryId={request.service?.categoryId} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-gray-900">{request.service?.name}</p>
            <p className="text-[11px] text-gray-400">Starting Price</p>
          </div>
          <p className="text-lg font-extrabold text-brand">₹{request.amount}</p>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Customer Details</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-xl">
              {customer?.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-gray-900">{customer?.name}</p>
              {request.status !== "Completed" && <p className="text-[11px] text-gray-500">{customer?.phone}</p>}
            </div>
            {request.status !== "Completed" && customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand"
                aria-label="Call customer"
              >
                <PhoneIcon width={16} height={16} />
              </a>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Service Location</h2>
          <div className="flex items-start gap-2 rounded-2xl border border-gray-100 p-3">
            <MapPinIcon width={16} height={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <div className="flex-1">
              <p className="text-[12.5px] leading-snug text-gray-700">
                {request.address?.label} — {request.address?.line}
              </p>
              {(() => {
                const lat = liveLocation?.lat ?? request.address?.lat;
                const lng = liveLocation?.lng ?? request.address?.lng;
                if (!lat || !lng) return null;
                return (
                  <>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block text-[12px] font-semibold text-brand"
                    >
                      Get Directions →
                    </a>
                    {liveLocation && (
                      <p className="mt-0.5 text-[10.5px] font-medium text-emerald-600">
                        Using customer's live location
                        {typeof liveLocation.accuracy === "number" && ` (±${Math.round(liveLocation.accuracy)}m)`}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Preferred Date & Time</h2>
          <div className="space-y-1.5 rounded-2xl border border-gray-100 p-3">
            <div className="flex items-center gap-2 text-[12.5px] text-gray-700">
              <CalendarIcon width={15} height={15} className="text-gray-400" /> {formatDate(request.date)}
            </div>
            <div className="flex items-center gap-2 text-[12.5px] text-gray-700">
              <ClockIcon width={15} height={15} className="text-gray-400" /> {request.time}
            </div>
          </div>
        </div>

        {request.issue && (
          <div>
            <h2 className="mb-1.5 text-[13px] font-bold text-gray-900">Issue Description</h2>
            <p className="text-[12.5px] leading-relaxed text-gray-600">{request.issue}</p>
          </div>
        )}

        {["Accepted", "In Progress", "Completed"].includes(request.status) && (
          <JobCheckpoints bookingId={request.id} locked={request.status === "Completed"} />
        )}

        {["Accepted", "In Progress", "Completed"].includes(request.status) && <JobPhotos bookingId={request.id} />}

        {!["Pending", "Rejected", "Cancelled"].includes(request.status) && (
          <div>
            <StatusPill status={request.status} />
            {request.status !== "Completed" && (
              <OtpVerifyCard bookingId={request.id} type={request.status === "Accepted" ? "start" : "complete"} />
            )}
          </div>
        )}

        {request.status === "Completed" && (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-center text-[12px] text-gray-500">
            This order is completed — contacting the customer is no longer available.
          </p>
        )}

        {["Accepted", "In Progress"].includes(request.status) && (
          <button
            onClick={() => navigate(`/chat/${request.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-light py-3 text-sm font-semibold text-brand-dark"
          >
            Message {customer?.name}
          </button>
        )}
      </div>

      {request.status === "Pending" && (
        <div className="flex flex-shrink-0 gap-3 border-t border-gray-100 bg-white px-4 py-3 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:py-4">
          <button
            onClick={() => {
              rejectRequest(request.id);
              navigate(-1);
            }}
            className="flex-1 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-600 active:scale-[0.98]"
          >
            Reject
          </button>
          <button
            onClick={() => acceptRequest(request.id)}
            className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Accept Request
          </button>
        </div>
      )}
    </div>
  );
}

const OTP_COPY = {
  start: {
    title: "Ask the customer to start the job",
    hint: "Once you've reached them, they'll see a 4-digit Start OTP in their app.",
  },
  complete: {
    title: "Ask the customer to confirm completion",
    hint: "Once they're happy with the job, they'll see a 4-digit Completion OTP in their app.",
  },
};

function OtpVerifyCard({ bookingId, type }) {
  const { verifyJobOtp, showToast } = useApp();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const copy = OTP_COPY[type];

  const submit = async (e) => {
    e.preventDefault();
    if (code.length !== 4) return;
    setSubmitting(true);
    try {
      await verifyJobOtp(bookingId, type, code);
      setCode("");
      showToast(type === "start" ? "Job started" : "Job marked complete");
    } catch (err) {
      showToast(err.message || "Incorrect OTP");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl border border-dashed border-brand/40 bg-brand-light/40 p-3.5">
      <p className="text-[12.5px] font-semibold text-gray-800">{copy.title}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{copy.hint}</p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Enter 4-digit OTP"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-center text-[15px] font-bold tracking-widest text-gray-800 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={submitting || code.length !== 4}
          className="flex-shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Verify"}
        </button>
      </div>
    </form>
  );
}

const CHECKPOINT_STEPS = [
  { type: "reached_location", label: "Reached the Location" },
  { type: "started_job", label: "Started the Job" },
  { type: "left_location", label: "Left the Location" },
];

function JobCheckpoints({ bookingId, locked }) {
  const { showToast } = useApp();
  const [checkpoints, setCheckpoints] = useState([]);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listJobCheckpoints(bookingId)
      .then((data) => !cancelled && setCheckpoints(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const markDone = (type) => async () => {
    setSaving(type);
    try {
      const checkpoint = await api.addJobCheckpoint(bookingId, type);
      setCheckpoints((prev) => (prev.some((c) => c.type === type) ? prev : [...prev, checkpoint]));
    } catch (err) {
      showToast(err.message || "Couldn't save — please try again");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-[13px] font-bold text-gray-900">Job Checkpoints</h2>
      <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
        {CHECKPOINT_STEPS.map(({ type, label }) => {
          const done = checkpoints.find((c) => c.type === type);
          return (
            <div key={type} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <p className={`text-[12.5px] font-medium ${done ? "text-gray-900" : "text-gray-600"}`}>{label}</p>
                {done && (
                  <p className="text-[10.5px] text-gray-400">
                    {new Date(done.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              {done ? (
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckIcon width={13} height={13} />
                </span>
              ) : (
                <button
                  onClick={markDone(type)}
                  disabled={locked || saving === type}
                  className="flex-shrink-0 rounded-lg bg-brand-light px-3 py-1.5 text-[11px] font-semibold text-brand-dark disabled:opacity-50"
                >
                  {saving === type ? "Saving…" : "Mark Done"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PHOTO_SLOTS = [
  { photoType: "before", label: "Before" },
  { photoType: "after", label: "After" },
];

function JobPhotos({ bookingId }) {
  const { showToast } = useApp();
  const [photos, setPhotos] = useState([]);
  const [uploadingType, setUploadingType] = useState(null);
  const fileInputs = useRef({});

  useEffect(() => {
    let cancelled = false;
    api
      .listJobPhotos(bookingId)
      .then((data) => !cancelled && setPhotos(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const handlePick = (photoType) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingType(photoType);
    try {
      const compressed = await compressImage(file);
      const photo = await api.uploadJobPhoto(bookingId, compressed, photoType);
      setPhotos((prev) => [...prev, photo]);
    } catch (err) {
      showToast(err.message || "Upload failed — please try again");
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-[13px] font-bold text-gray-900">Job Photos</h2>
      <div className="grid grid-cols-2 gap-3">
        {PHOTO_SLOTS.map(({ photoType, label }) => {
          const slotPhotos = photos.filter((p) => p.photoType === photoType);
          const isUploading = uploadingType === photoType;
          return (
            <div key={photoType} className="rounded-2xl border border-gray-100 p-3">
              <p className="mb-2 text-[11.5px] font-semibold text-gray-600">{label}</p>
              {slotPhotos.length > 0 ? (
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  {slotPhotos.map((p) => (
                    <img
                      key={p.id}
                      src={`${SERVER_URL}${p.url}`}
                      alt={`${label} photo`}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : (
                <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-lg bg-gray-50 text-gray-300">
                  <CameraIcon width={20} height={20} />
                </div>
              )}
              <button
                onClick={() => fileInputs.current[photoType]?.click()}
                disabled={isUploading}
                className="w-full rounded-lg bg-brand-light py-2 text-[11.5px] font-semibold text-brand-dark disabled:opacity-50"
              >
                {isUploading ? "Uploading…" : `Add ${label} Photo`}
              </button>
              <input
                ref={(el) => (fileInputs.current[photoType] = el)}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePick(photoType)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    Accepted: "bg-emerald-100 text-emerald-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Completed: "bg-gray-200 text-gray-600",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}>{status}</span>;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
