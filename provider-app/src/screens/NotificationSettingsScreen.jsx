import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { NOTIFICATION_TYPES } from "../utils/notificationPrefs";

export default function NotificationSettingsScreen() {
  const { notificationPrefs, updateNotificationPref } = useApp();

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Notification Settings" />

      <div className="flex-1 space-y-4 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <p className="text-[11.5px] text-gray-400">
          Choose which notifications appear in your notification feed on this device.
        </p>

        <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
          {NOTIFICATION_TYPES.map(({ type, label, description }) => (
            <div key={type} className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">{label}</p>
                <p className="mt-0.5 text-[11px] text-gray-400">{description}</p>
              </div>
              <button
                onClick={() => updateNotificationPref(type, !notificationPrefs[type])}
                className="switch flex-shrink-0"
                data-on={notificationPrefs[type]}
                aria-label={`Toggle ${label}`}
              >
                <span className="switch-knob" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
