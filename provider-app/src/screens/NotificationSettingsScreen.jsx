import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { NOTIFICATION_TYPES } from "../utils/notificationPrefs";
import { startRingtone } from "../utils/ringtone";
import { api } from "../api";

function SectionLabel({ children }) {
  return <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{children}</p>;
}

function ToggleRow({ label, description, on, onToggle, disabled }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-gray-800">{label}</p>
        {description && <p className="mt-0.5 text-[11px] text-gray-400">{description}</p>}
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className="switch flex-shrink-0 disabled:opacity-50"
        data-on={on}
        aria-label={`Toggle ${label}`}
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

export default function NotificationSettingsScreen() {
  const { notificationPrefs, updateNotificationPref, provider, showToast } = useApp();
  const [whatsappOn, setWhatsappOn] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [testingRing, setTestingRing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getProviderNotificationPrefs()
      .then((prefs) => {
        if (!cancelled) setWhatsappOn(Boolean(prefs.whatsappNotifications));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWhatsappLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleWhatsapp = async () => {
    const next = !whatsappOn;
    setWhatsappOn(next);
    try {
      await api.updateProviderNotificationPrefs({ whatsappNotifications: next });
    } catch (e) {
      setWhatsappOn(!next);
      showToast("Couldn't update WhatsApp notifications");
    }
  };

  const testRing = () => {
    if (testingRing) return;
    setTestingRing(true);
    const stop = startRingtone(notificationPrefs.ringVolume);
    if (notificationPrefs.vibrate && navigator.vibrate) navigator.vibrate([400, 200, 400]);
    setTimeout(() => {
      stop();
      setTestingRing(false);
    }, 2500);
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Notification Settings" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="space-y-2">
          <SectionLabel>WhatsApp</SectionLabel>
          <div className="rounded-2xl border border-gray-100">
            <ToggleRow
              label="WhatsApp notifications"
              description={
                provider?.phone
                  ? `Receive new booking alerts on WhatsApp (${provider.phone})`
                  : "Receive new booking alerts on WhatsApp"
              }
              on={whatsappOn}
              onToggle={toggleWhatsapp}
              disabled={whatsappLoading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Ring settings</SectionLabel>
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-gray-800">Ring volume</p>
                <p className="text-[11px] font-semibold text-gray-400">
                  {Math.round(notificationPrefs.ringVolume * 100)}%
                </p>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={notificationPrefs.ringVolume}
                onChange={(e) => updateNotificationPref("ringVolume", Number(e.target.value))}
                className="mt-2 w-full accent-brand"
                aria-label="Ring volume"
              />
              <p className="mt-1 text-[11px] text-gray-400">How loud a new booking request rings while the app is open</p>
            </div>
            <ToggleRow
              label="Vibrate"
              description="Vibrate the phone while a booking request is ringing"
              on={notificationPrefs.vibrate}
              onToggle={() => updateNotificationPref("vibrate", !notificationPrefs.vibrate)}
            />
            <div className="px-4 py-3.5">
              <button
                onClick={testRing}
                disabled={testingRing}
                className="w-full rounded-xl border border-brand/30 bg-brand/5 py-2.5 text-[13px] font-semibold text-brand disabled:opacity-50"
              >
                {testingRing ? "Ringing…" : "Test ring"}
              </button>
            </div>
          </div>
          <p className="px-1 text-[11px] text-gray-400">
            {Capacitor.isNativePlatform()
              ? "New requests ring like an incoming call — full-screen with sound and vibration — even when Tikdum Pro is fully closed."
              : "Ringing only works while Tikdum Pro is open or was recently in the background. When the app is fully closed, new requests still arrive as a phone notification with sound and vibration."}
          </p>
        </div>

        <div className="space-y-2">
          <SectionLabel>Notification feed</SectionLabel>
          <p className="px-1 text-[11px] text-gray-400">Choose which notifications appear in your feed on this device.</p>
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {NOTIFICATION_TYPES.map(({ type, label, description }) => (
              <ToggleRow
                key={type}
                label={label}
                description={description}
                on={notificationPrefs[type]}
                onToggle={() => updateNotificationPref(type, !notificationPrefs[type])}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
