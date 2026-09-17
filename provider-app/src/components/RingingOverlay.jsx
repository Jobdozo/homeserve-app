import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { MapPinIcon, ClockIcon, XIcon, CheckIcon } from "./icons";
import { startRingtone } from "../utils/ringtone";

const RING_SECONDS = 90;

export default function RingingOverlay() {
  const { ringingRequest, acceptRequest, rejectRequest, dismissRinging, notificationPrefs } = useApp();
  const [secondsLeft, setSecondsLeft] = useState(RING_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ringingRequest) return;
    setSecondsLeft(RING_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          // Server handles the actual reassignment; just stop showing it here.
          dismissRinging();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [ringingRequest, dismissRinging]);

  useEffect(() => {
    if (!ringingRequest) return;
    const stopRingtone = startRingtone(notificationPrefs.ringVolume);
    return stopRingtone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringingRequest]);

  // navigator.vibrate() patterns don't repeat on their own — re-trigger it on
  // the same cadence as the ringtone so the phone keeps buzzing for as long
  // as the request is ringing, not just once.
  useEffect(() => {
    if (!ringingRequest || !notificationPrefs.vibrate || !navigator.vibrate) return;
    navigator.vibrate([400, 200, 400]);
    const interval = setInterval(() => navigator.vibrate([400, 200, 400]), 2200);
    return () => {
      clearInterval(interval);
      navigator.vibrate(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringingRequest]);

  if (!ringingRequest) return null;

  const handleAccept = async () => {
    setBusy(true);
    try {
      await acceptRequest(ringingRequest.id);
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      await rejectRequest(ringingRequest.id);
    } finally {
      setBusy(false);
    }
  };

  const progress = (secondsLeft / RING_SECONDS) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand/30" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand text-3xl text-white">
            🔔
          </span>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">New Booking Request</p>
        <h2 className="mt-1 text-lg font-bold text-gray-900">{ringingRequest.service?.name || "Service Request"}</h2>
        <p className="text-[13px] text-gray-500">{ringingRequest.customer?.name}</p>

        <div className="mt-4 space-y-2 rounded-2xl bg-gray-50 p-3 text-left">
          <div className="flex items-center gap-2 text-[12px] text-gray-600">
            <ClockIcon width={14} height={14} className="flex-shrink-0 text-gray-400" />
            {ringingRequest.date} · {ringingRequest.time}
          </div>
          {ringingRequest.address?.line && (
            <div className="flex items-start gap-2 text-[12px] text-gray-600">
              <MapPinIcon width={14} height={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span className="line-clamp-2">{ringingRequest.address.line}</span>
            </div>
          )}
          <div className="text-[13px] font-bold text-gray-900">₹{ringingRequest.amount}</div>
        </div>

        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            Auto-forwards to another provider in {secondsLeft}s if you don't respond
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleDecline}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-red-200 py-3 text-sm font-semibold text-red-600 disabled:opacity-50"
          >
            <XIcon width={16} height={16} /> Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand py-3 text-sm font-semibold text-white shadow-card disabled:opacity-50"
          >
            <CheckIcon width={16} height={16} /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}
