import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { MapPinIcon, ClockIcon, BellIcon } from "./icons";
import { whenLabel, inr } from "./biz";
import { startRingtone } from "../utils/ringtone";

const RING_SECONDS = 60;

// A job the owner (or a manager) just gave to this staff member. Unlike a new
// request there's nothing to accept or decline — the job is already taken — so
// it rings and vibrates until they look at it, then opens the job.
export default function AssignedJobOverlay() {
  const { assignedJob, dismissAssignedJob, notificationPrefs } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!assignedJob) return undefined;
    const stopRingtone = startRingtone(notificationPrefs.ringVolume, notificationPrefs.ringSound);
    const stopAfter = setTimeout(stopRingtone, RING_SECONDS * 1000);
    let buzz;
    if (notificationPrefs.vibrate && navigator.vibrate) {
      navigator.vibrate([400, 200, 400]);
      buzz = setInterval(() => navigator.vibrate([400, 200, 400]), 2200);
      setTimeout(() => clearInterval(buzz), RING_SECONDS * 1000);
    }
    return () => {
      stopRingtone();
      clearTimeout(stopAfter);
      clearInterval(buzz);
      if (navigator.vibrate) navigator.vibrate(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedJob?.id]);

  if (!assignedJob) return null;
  const job = assignedJob;

  const open = () => {
    dismissAssignedJob();
    navigate(`/requests/${job.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6" role="dialog" aria-modal="true" aria-label="New job assigned to you">
      <div className="w-full max-w-sm rounded-[26px] border-[1.5px] border-go bg-card p-6 text-center shadow-float">
        <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-go/30" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-go text-white">
            <BellIcon width={30} height={30} strokeWidth={2.2} />
          </span>
        </div>

        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-go">New job assigned to you</p>
        <h2 className="mt-1 font-display text-[22px] font-extrabold leading-tight text-ink">{job.service?.name || "Service"}</h2>
        <p className="text-[13.5px] text-ink-muted">
          {job.customer?.name}
          {job.assignedBy ? ` · assigned by ${job.assignedBy}` : ""}
        </p>

        <div className="mt-4 space-y-2 rounded-2xl bg-gray-50 p-3 text-left">
          <div className="flex items-center gap-2 text-[12px] text-gray-600">
            <ClockIcon width={14} height={14} className="flex-shrink-0 text-gray-400" />
            {whenLabel(job.date, job.time)}
          </div>
          {job.address?.line && (
            <div className="flex items-start gap-2 text-[12px] text-gray-600">
              <MapPinIcon width={14} height={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span className="line-clamp-2">{job.address.line}</span>
            </div>
          )}
          {job.amount > 0 && (
            <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
              <span className="text-[12.5px] text-ink-muted">Job amount</span>
              <span className="font-display text-[20px] font-extrabold text-ink tabular">{inr(job.amount)}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={dismissAssignedJob} className="flex-1 rounded-2xl border border-gray-200 py-3 text-[14px] font-bold text-gray-600">
            Later
          </button>
          <button onClick={open} className="flex-1 rounded-2xl bg-go py-3 text-[14px] font-extrabold text-white">
            View job
          </button>
        </div>
      </div>
    </div>
  );
}
