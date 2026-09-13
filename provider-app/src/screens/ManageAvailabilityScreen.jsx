import ScreenHeader from "../components/ScreenHeader";
import { CalendarIcon } from "../components/icons";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ManageAvailabilityScreen() {
  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Manage Availability" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="flex items-start gap-3 rounded-2xl border border-gray-100 p-4">
          <CalendarIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <div>
            <p className="text-[13px] font-semibold text-gray-800">Scheduling isn't available yet</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-gray-500">
              Setting specific working hours per day isn't wired up yet — that's coming in a future update. Until
              then, we treat your account as available for new booking requests at all times.
            </p>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Weekly Schedule (Preview)</h2>
          <p className="mb-2 text-[11px] text-gray-400">This is a preview of what you'll be able to set — not editable yet.</p>
          <div className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
            {days.map((day) => (
              <div key={day} className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
                <span className="font-medium text-gray-700">{day}</span>
                <span className="text-gray-400">Available all day</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
