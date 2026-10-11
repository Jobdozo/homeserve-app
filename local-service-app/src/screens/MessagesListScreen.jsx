import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { ChatIcon } from "../components/icons";
import { ProviderMark, TabTitle, EmptyState } from "../components/ui";

// Chats with professionals, newest first. A chat exists once a booking has messages.
export default function MessagesListScreen() {
  const navigate = useNavigate();
  const { bookings, getService, getProvider } = useApp();

  const threads = useMemo(() => {
    return bookings
      .filter((b) => b.lastMessage && b.status !== "Completed")
      .map((b) => ({ booking: b, last: b.lastMessage, service: getService(b.serviceId) || b.service, provider: getProvider(b.providerId) }))
      .sort((a, b) => new Date(b.last.time) - new Date(a.last.time));
  }, [bookings, getService, getProvider]);

  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist pb-4 lg:mx-auto lg:w-full lg:max-w-3xl lg:pt-6">
      <TabTitle title="Messages" subtitle={threads.length ? `${threads.length} conversation${threads.length === 1 ? "" : "s"}` : "Talk to your professionals here"} />

      {threads.length === 0 ? (
        <EmptyState
          icon={<ChatIcon width={28} height={28} />}
          title="No chats yet"
          text="Once you book, you can message your professional here — share directions, photos of the issue, anything."
          action="Book a service"
          onAction={() => navigate("/categories")}
        />
      ) : (
        <div className="mx-4 mt-3 overflow-hidden rounded-[22px] bg-white shadow-card">
          {threads.map(({ booking, last, service, provider }) => (
            <button
              key={booking.id}
              onClick={() => navigate(`/chat/${booking.id}`)}
              className="flex w-full items-center gap-3 border-b border-[#F0EEF7] px-4 py-3.5 text-left last:border-0 active:bg-mist"
            >
              <ProviderMark provider={provider} className="h-12 w-12 rounded-full text-[16px]" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-bold text-ink">{provider?.name || "Professional"}</span>
                  <span className="flex-shrink-0 text-[11.5px] text-ink-muted">{formatTime(last.time)}</span>
                </span>
                <span className="truncate text-[12px] font-semibold text-brand-dark">{service?.name}</span>
                <span className="truncate text-[13px] text-ink-muted">
                  {last.from === "user" ? "You: " : ""}
                  {last.text}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}
