import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../context/AppContext";
import { usePhoneReadiness } from "../utils/readiness";
import { requestBatteryExemption, openAutostartSettings } from "../utils/batteryOptimization";
import { ensurePushSubscribed } from "../utils/pushNotifications";
import { startRingtone } from "../utils/ringtone";
import { SubHeader, Card, Switch, inr } from "../components/biz";
import { CheckIcon, XIcon, StoreIcon } from "../components/icons";

// "Ready to get jobs?" — every reason a new job might not reach this phone, each
// with its fix: notifications, battery saver, ring volume, wallet, working hours.
export default function ReadyScreen() {
  const navigate = useNavigate();
  const { provider, wallet, notificationPrefs, setAcceptingRequests, can, showToast } = useApp();
  const r = usePhoneReadiness();
  const accepting = provider.coverage?.acceptingRequests !== false;
  const workingNow = provider.coverage?.workingNow !== false;
  const [ringing, setRinging] = useState(false);
  const stopRef = useRef(null);
  const native = Capacitor.isNativePlatform();
  const volume = typeof notificationPrefs?.ringVolume === "number" ? notificationPrefs.ringVolume : 0.8;

  useEffect(() => () => stopRef.current?.(), []);

  const testRing = () => {
    if (ringing) {
      stopRef.current?.();
      setRinging(false);
      return;
    }
    stopRef.current = startRingtone(volume);
    setRinging(true);
    setTimeout(() => {
      stopRef.current?.();
      setRinging(false);
    }, 4500);
  };

  const fixNotifications = async () => {
    await ensurePushSubscribed().catch(() => {});
    r.recheck();
  };

  const checks = [
    {
      ok: r.notifications === "granted" || (!native && r.notifications === "unknown"),
      title: r.notifications === "granted" ? "Notifications allowed" : "Notifications are off",
      sub: r.notifications === "granted" ? "New-job alerts can ring" : "Allow them so new jobs can reach you",
      action: r.notifications !== "granted" && { label: "Allow", onClick: fixNotifications },
    },
    native && {
      ok: r.battery,
      title: r.battery ? "Battery saver won't stop alerts" : "Battery saver is on for Tikdum",
      sub: r.battery ? "Tikdum can wake up when a job comes in" : "Your phone may silence alerts when it's locked",
      action: !r.battery && {
        label: "Fix",
        onClick: async () => {
          await requestBatteryExemption();
          const { opened } = await openAutostartSettings();
          if (opened) showToast(`Turn on autostart for Tikdum${r.manufacturer ? ` on your ${r.manufacturer}` : ""}`);
        },
      },
    },
    {
      ok: volume > 0.3,
      title: volume > 0.3 ? "Ring is loud enough" : "Ring volume is low",
      sub: native ? "Rings even when the phone is on silent" : "Keep this tab open to hear new jobs",
      action: { label: ringing ? "Stop" : "Test ring", onClick: testRing, quiet: true },
    },
    {
      ok: !wallet.suspended,
      title: `Wallet ${inr(wallet.balance)}`,
      sub: wallet.suspended ? "At ₹0 new jobs pause — add money" : "Tikdum fees come out of this",
      action: wallet.suspended && { label: "Add", onClick: () => navigate("/earnings?tab=wallet") },
    },
    {
      ok: workingNow,
      title: workingNow ? "Inside working hours" : "Outside your working hours",
      sub: workingNow ? "Customers can book you now" : "You'll get jobs again when your hours start",
      action: can("profile.edit") && { label: "Change", onClick: () => navigate("/profile/availability"), quiet: true },
    },
  ].filter(Boolean);
  const problems = checks.filter((c) => !c.ok).length + (accepting ? 0 : 1);

  return (
    <div className="flex flex-col pb-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <SubHeader title="Ready to get jobs?" subtitle="We check this phone so no request is missed" />
      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        <Card className="flex flex-col items-center gap-3 px-5 pb-5 pt-6 text-center">
          <span className={`flex h-24 w-24 items-center justify-center rounded-full ${accepting && !problems ? "bg-go-wash text-go" : "bg-raised text-ink-muted"}`}>
            {accepting && !problems ? <CheckIcon width={44} height={44} strokeWidth={2.4} /> : <StoreIcon width={44} height={44} strokeWidth={1.6} />}
          </span>
          <p className="font-display text-[24px] font-extrabold text-ink">{!accepting ? "You're offline" : problems ? `${problems} thing${problems === 1 ? "" : "s"} to fix` : "All set for new jobs"}</p>
          <p className="max-w-[300px] text-[13.5px] leading-relaxed text-ink-muted">
            {!accepting ? "Customers can't see or book you. Jobs you've already accepted carry on as normal." : problems ? "Fix these so a new job always rings on this phone." : "New jobs will ring here, even with the screen locked."}
          </p>
          {can("profile.edit") && (
            <div className="mt-1 flex w-full items-center justify-between rounded-2xl bg-raised px-4 py-3">
              <span className="text-[15px] font-bold text-ink">{accepting ? "Online" : "Go online"}</span>
              <Switch on={accepting} onChange={() => setAcceptingRequests(!accepting).catch((e) => showToast(e.message || "Couldn't update"))} label="Taking new jobs" />
            </div>
          )}
        </Card>

        <Card className="px-4 py-1">
          {checks.map((c) => (
            <div key={c.title} className="flex items-center gap-3 border-b border-dashed border-gray-100 py-3 last:border-0">
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-go-wash text-go" : "bg-red-50 text-red-500"}`}>
                {c.ok ? <CheckIcon width={15} height={15} strokeWidth={3} /> : <XIcon width={15} height={15} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-ink">{c.title}</span>
                <span className="block text-[12px] text-ink-muted">{c.sub}</span>
              </span>
              {c.action && (
                <button onClick={c.action.onClick} className={`h-10 flex-shrink-0 rounded-xl px-3.5 text-[13.5px] font-extrabold ${c.action.quiet ? "border-[1.5px] border-gray-300 text-ink" : "bg-ink text-ground"}`}>
                  {c.action.label}
                </button>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
