import { useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import { CalendarIcon } from "../components/icons";
import { useApp } from "../context/AppContext";

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

function starting(schedule) {
  if (schedule?.days) return JSON.parse(JSON.stringify(schedule));
  const days = {};
  for (const [d] of DAYS) days[d] = { open: d !== "sun", from: "09:00", to: "18:00" };
  return { enabled: false, days };
}

export default function ManageAvailabilityScreen() {
  const { provider, saveSchedule, showToast } = useApp();
  const saved = provider?.coverage?.schedule;
  const [draft, setDraft] = useState(() => starting(saved));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(starting(saved));

  const setDay = (d, patch) => setDraft((p) => ({ ...p, days: { ...p.days, [d]: { ...p.days[d], ...patch } } }));
  const badDay = DAYS.find(([d]) => draft.days[d].open && draft.days[d].from >= draft.days[d].to);

  async function save() {
    if (badDay) return showToast(`${badDay[1]}: closing time must be after opening time`);
    setSaving(true);
    try {
      await saveSchedule(draft);
    } catch (e) {
      showToast(e.message || "Couldn't save your working hours");
    } finally {
      setSaving(false);
    }
  }

  const outsideNow = saved?.enabled && provider?.coverage?.workingNow === false;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Manage Availability" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 p-4">
          <div className="flex items-start gap-3">
            <CalendarIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <div>
              <p className="text-[13px] font-semibold text-gray-800">Use working hours</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-gray-500">
                {draft.enabled
                  ? "New requests are only open during the hours below (Indian time). Outside them your services are hidden from customers. Jobs already booked carry on."
                  : "Off — your services are open for new requests at all times, as long as the Receive Requests switch on your dashboard is on."}
              </p>
            </div>
          </div>
          <button
            onClick={() => setDraft((p) => ({ ...p, enabled: !p.enabled }))}
            className="switch flex-shrink-0"
            data-on={draft.enabled}
            aria-label="Use working hours"
          >
            <span className="switch-knob" />
          </button>
        </div>

        {outsideNow && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            It's outside your working hours right now, so customers can't see your services. They open again at your next opening time.
          </p>
        )}

        <div className={draft.enabled ? "" : "pointer-events-none opacity-50"}>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Weekly Schedule</h2>
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {DAYS.map(([d, label]) => {
              const row = draft.days[d];
              return (
                <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-[12.5px]">
                  <span className="w-24 font-medium text-gray-700">{label}</span>
                  <button
                    onClick={() => setDay(d, { open: !row.open })}
                    className="switch flex-shrink-0"
                    data-on={row.open}
                    aria-label={`${label} open`}
                  >
                    <span className="switch-knob" />
                  </button>
                  {row.open ? (
                    <span className="ml-auto flex items-center gap-2 text-gray-500">
                      <input
                        type="time"
                        value={row.from}
                        onChange={(e) => setDay(d, { from: e.target.value })}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800"
                        aria-label={`${label} opens`}
                      />
                      to
                      <input
                        type="time"
                        value={row.to}
                        onChange={(e) => setDay(d, { to: e.target.value })}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-gray-800"
                        aria-label={`${label} closes`}
                      />
                    </span>
                  ) : (
                    <span className="ml-auto text-gray-400">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={save}
          disabled={!dirty || saving}
          className="w-full rounded-2xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-40 lg:w-auto lg:px-10"
        >
          {saving ? "Saving…" : "Save working hours"}
        </button>
      </div>
    </div>
  );
}
