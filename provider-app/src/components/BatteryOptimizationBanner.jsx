import { useEffect, useState } from "react";
import { AlertIcon } from "./icons";
import { getBatteryOptimizationStatus, requestBatteryExemption, openAutostartSettings } from "../utils/batteryOptimization";

const DISMISS_KEY = "tikdum-battery-banner-dismissed-until";
const DISMISS_DAYS = 7;

// Several phone makers (Vivo, Xiaomi, Oppo, Huawei and a few others) kill a
// "closed" app and block its push notifications unless the user explicitly
// exempts it — confirmed via live device testing: a new-job alert never
// arrived while this app was closed on a Vivo phone, even after Android's own
// Doze whitelist. This surfaces on the dashboard (for the owner and any staff
// member — anyone whose phone might be the one missing a job) until it's
// either fixed or dismissed for a week.
export default function BatteryOptimizationBanner() {
  const [status, setStatus] = useState(null); // { ignoring, manufacturer } | null while checking
  const [dismissed, setDismissed] = useState(() => {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() < until;
  });

  const check = () => getBatteryOptimizationStatus().then(setStatus).catch(() => setStatus({ ignoring: true }));

  useEffect(() => {
    check();
    // Re-check when coming back from the system settings screen this banner
    // sends the person to — there's no event for "the OS dialog closed", but
    // the app resuming from background is the same moment in practice.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!status || status.ignoring || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    setDismissed(true);
  };

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-card lg:mx-8 lg:p-6">
      <AlertIcon width={20} height={20} className="mt-0.5 flex-shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-amber-700">Job alerts may not reach you reliably</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-amber-700">
          Your phone can stop this app in the background and block new-job alerts unless you allow it to keep running. Fix
          this once so requests always reach you.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={requestBatteryExemption}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11.5px] font-semibold text-white"
          >
            Fix now
          </button>
          <button onClick={openAutostartSettings} className="text-[11.5px] font-semibold text-amber-700 underline">
            Also allow autostart
          </button>
          <button onClick={dismiss} className="text-[11.5px] font-semibold text-amber-600">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
