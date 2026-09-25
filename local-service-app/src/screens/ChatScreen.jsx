import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { BackIcon, PhoneIcon, SendIcon } from "../components/icons";
import { callProvider } from "../utils/callProvider";

export default function ChatScreen() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { getBooking, getProvider, messages, sendMessage, loadMessages, showToast } = useApp();
  const [text, setText] = useState("");
  const endRef = useRef(null);

  const booking = getBooking(bookingId);
  const provider = booking ? getProvider(booking.providerId) : null;
  const thread = messages[bookingId] || [];

  const completed = booking?.status === "Completed";

  useEffect(() => {
    // A completed order's conversation is closed — never even fetch it.
    if (bookingId && !completed) loadMessages(bookingId);
  }, [bookingId, loadMessages, completed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  if (!booking) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Conversation not found.</p>
        <button onClick={() => navigate("/messages")} className="text-sm font-semibold text-brand">
          Back to Messages
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-3xl">🔒</span>
        <p className="text-sm font-semibold text-gray-700">This conversation is no longer available</p>
        <p className="max-w-xs text-xs text-gray-400">
          Chats are closed once an order is completed. For any issue with this order, use Claim a refund on the booking.
        </p>
        <button onClick={() => navigate("/bookings")} className="text-sm font-semibold text-brand">
          Back to Bookings
        </button>
      </div>
    );
  }

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(booking.id, trimmed);
    setText("");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-100 px-4 pb-3 pt-1 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-5 lg:pt-6">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 lg:h-10 lg:w-10"
        >
          <BackIcon width={18} height={18} />
        </button>
        <button
          onClick={() => navigate(`/provider/${booking.providerId}`)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-lg">
            {provider?.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-gray-900 lg:text-[15px]">{provider?.name}</p>
            <p className="text-[11px] text-emerald-500">Active</p>
          </div>
        </button>
        {["Accepted", "In Progress"].includes(booking.status) && (
          <button
            onClick={() => callProvider(booking.id, showToast)}
            aria-label="Call provider"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand lg:h-10 lg:w-10"
          >
            <PhoneIcon width={16} height={16} />
          </button>
        )}
      </div>

      <div className="mx-4 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        Keep all conversations within the app for your safety and security.
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        {thread.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-t border-gray-100 bg-white px-3 py-2.5 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:py-4">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded-full bg-gray-100 px-4 py-2.5 text-[13px] text-gray-800 outline-none placeholder:text-gray-400"
        />
        <button
          onClick={handleSend}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-dark active:scale-95"
          aria-label="Send message"
        >
          <SendIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}

function Bubble({ message }) {
  const isUser = message.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
          isUser ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-gray-100 text-gray-800"
        }`}
      >
        <p>{message.text}</p>
        <p className={`mt-1 text-right text-[10px] ${isUser ? "text-white/70" : "text-gray-400"}`}>
          {new Date(message.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
