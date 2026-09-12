import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { BellIcon, SendIcon, StarIcon, CheckIcon } from "../components/icons";

const typeIcon = {
  booking: BellIcon,
  message: SendIcon,
  review: StarIcon,
};

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp();

  const hasUnread = notifications.some((n) => !n.read);

  const handleOpen = (n) => {
    if (!n.read) markNotificationRead(n.id);
    if (n.bookingId) navigate(n.type === "message" ? `/chat/${n.bookingId}` : `/requests/${n.bookingId}`);
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title="Notifications"
        maxWidth="lg:max-w-2xl"
        right={
          hasUnread && (
            <button onClick={markAllNotificationsRead} className="flex-shrink-0 text-xs font-semibold text-brand">
              Mark all read
            </button>
          )
        }
      />

      <div className="flex-1 px-2 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        {notifications.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">🔔</span>
            <p className="text-sm text-gray-500">No notifications yet.</p>
          </div>
        )}
        {notifications.map((n) => {
          const Icon = typeIcon[n.type] || BellIcon;
          return (
            <button
              key={n.id}
              onClick={() => handleOpen(n)}
              className={`flex w-full items-start gap-3 rounded-xl px-2.5 py-3 text-left hover:bg-gray-50 ${
                n.read ? "" : "bg-brand-light/40"
              }`}
            >
              <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
                <Icon width={16} height={16} />
                {!n.read && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] leading-snug ${n.read ? "text-gray-600" : "font-semibold text-gray-900"}`}>
                  {n.message}
                </p>
                <p className="mt-0.5 text-[10.5px] text-gray-400">{timeAgo(n.time)}</p>
              </div>
              {n.read && <CheckIcon width={14} height={14} className="mt-1 flex-shrink-0 text-gray-300" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
