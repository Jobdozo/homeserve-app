import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { SearchIcon } from "../components/icons";

export default function MessagesListScreen() {
  const navigate = useNavigate();
  const { bookings, getService, getProvider } = useApp();

  const threads = useMemo(() => {
    return bookings
      .filter((b) => b.lastMessage && b.status !== "Completed")
      .map((b) => ({ booking: b, last: b.lastMessage, service: getService(b.serviceId), provider: getProvider(b.providerId) }))
      .sort((a, b) => new Date(b.last.time) - new Date(a.last.time));
  }, [bookings, getService, getProvider]);

  return (
    <div className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8 lg:pb-16 lg:pt-8">
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <h1 className="text-lg font-bold text-gray-900 lg:text-2xl">Messages</h1>
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 lg:hidden">
          <SearchIcon width={17} height={17} />
        </button>
      </div>

      <div className="mt-3 flex-1 px-2 pb-4 lg:mt-6 lg:rounded-2xl lg:border lg:border-gray-100 lg:bg-white lg:px-3 lg:py-1 lg:shadow-card">
        {threads.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <span className="text-3xl">💬</span>
            <p className="text-sm text-gray-500">No conversations yet.</p>
          </div>
        )}
        {threads.map(({ booking, last, service, provider }) => (
          <button
            key={booking.id}
            onClick={() => navigate(`/chat/${booking.id}`)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-gray-50 active:bg-gray-50"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-xl">
              {provider?.avatar}
            </div>
            <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13.5px] font-semibold text-gray-900">{provider?.name}</p>
                <span className="flex-shrink-0 text-[10.5px] text-gray-400">{formatTime(last.time)}</span>
              </div>
              <p className="truncate text-[11.5px] text-gray-400">{service?.name}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-gray-500">
                {last.from === "user" ? "You: " : ""}
                {last.text}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
