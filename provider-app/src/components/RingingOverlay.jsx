import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { MapPinIcon, ClockIcon, XIcon, CheckIcon, BellIcon } from "./icons";
import { whenLabel, inr } from "./biz";
import { startRingtone } from "../utils/ringtone";

const RING_SECONDS = 90;

export default function RingingOverlay() {
  const { ringingRequest, requests, acceptRequest, rejectRequest, respondToOrder, dismissRinging, notificationPrefs, showToast } = useApp();
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
    const stopRingtone = startRingtone(notificationPrefs.ringVolume, notificationPrefs.ringSound);
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

  // A cart with several services is one request: every pending service of this order, accepted or declined together.
  const siblings = ringingRequest.orderId
    ? requests.filter((r) => r.orderId === ringingRequest.orderId && r.status === "Pending" && r.id !== ringingRequest.id)
    : [];
  const lines = siblings.length ? [ringingRequest, ...siblings] : [ringingRequest];
  const isOrder = lines.length > 1;
  const orderTotal = lines.reduce((sum, r) => sum + (r.amount || 0), 0);

  const handleAccept = async () => {
    setBusy(true);
    try {
      if (isOrder) await respondToOrder(ringingRequest.orderId, "accept");
      else await acceptRequest(ringingRequest.id);
    } catch (e) {
      showToast(e.message || "Couldn't update the request");
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    setBusy(true);
    try {
      if (isOrder) await respondToOrder(ringingRequest.orderId, "reject");
      else await rejectRequest(ringingRequest.id);
    } catch (e) {
      showToast(e.message || "Couldn't update the request");
    } finally {
      setBusy(false);
    }
  };

  const progress = (secondsLeft / RING_SECONDS) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm rounded-[26px] border-[1.5px] border-marigold bg-card p-6 text-center shadow-float">
        <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-marigold/30" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-marigold text-marigold-ink">
            <BellIcon width={30} height={30} strokeWidth={2.2} />
          </span>
        </div>

        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-marigold">New request</p>
        <h2 className="mt-1 font-display text-[22px] font-extrabold leading-tight text-ink">{isOrder ? `${lines.length} services` : ringingRequest.service?.name || "Service request"}</h2>
        <p className="text-[13.5px] text-ink-muted">{ringingRequest.customer?.name}</p>

        <div className="mt-4 space-y-2 rounded-2xl bg-gray-50 p-3 text-left">
          <div className="flex items-center gap-2 text-[12px] text-gray-600">
            <ClockIcon width={14} height={14} className="flex-shrink-0 text-gray-400" />
            {whenLabel(ringingRequest.date, ringingRequest.time)}
          </div>
          {ringingRequest.address?.line && (
            <div className="flex items-start gap-2 text-[12px] text-gray-600">
              <MapPinIcon width={14} height={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span className="line-clamp-2">{ringingRequest.address.line}</span>
            </div>
          )}
          {isOrder && (
            <ul className="max-h-32 space-y-1 overflow-y-auto border-t border-gray-200 pt-2">
              {lines.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 text-[12px] text-gray-700">
                  <span className="truncate">{r.service?.name}</span>
                  <span className="flex-shrink-0 font-semibold">₹{r.amount}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
            <span className="text-[12.5px] text-ink-muted">You collect after the job</span>
            <span className="font-display text-[20px] font-extrabold text-ink tabular">{inr(isOrder ? orderTotal : ringingRequest.amount)}</span>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-marigold transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            Goes to another pro in {secondsLeft}s if you don't answer
          </p>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_1.6fr] gap-2.5">
          <button
            onClick={handleDecline}
            disabled={busy}
            className="flex h-[52px] items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-gray-300 text-[15px] font-extrabold text-ink disabled:opacity-50"
          >
            <XIcon width={16} height={16} /> Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex h-[52px] items-center justify-center gap-1.5 rounded-2xl bg-go text-[16px] font-extrabold text-go-ink disabled:opacity-50"
          >
            <CheckIcon width={18} height={18} strokeWidth={2.8} /> Accept
          </button>
        </div>
      </div>
    </div>
  );
}
