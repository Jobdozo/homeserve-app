import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { BackIcon, PhoneIcon, SendIcon } from "../components/icons";

export default function ChatScreen() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { getRequest, messages, sendMessage, loadMessages } = useApp();
  const [text, setText] = useState("");
  const endRef = useRef(null);

  const request = getRequest(requestId);
  const customer = request ? request.customer : null;
  const thread = messages[requestId] || [];

  const completed = request?.status === "Completed";

  useEffect(() => {
    // A completed order's conversation is closed — never even fetch it.
    if (requestId && !completed) loadMessages(requestId);
  }, [requestId, loadMessages, completed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  if (!request) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Conversation not found.</p>
        <button onClick={() => navigate("/requests")} className="text-sm font-semibold text-brand">
          Back to Requests
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-3xl">🔒</span>
        <p className="text-sm font-semibold text-gray-700">This conversation is no longer available</p>
        <p className="max-w-xs text-xs text-gray-400">Chats are closed once an order is completed.</p>
        <button onClick={() => navigate("/requests")} className="text-sm font-semibold text-brand">
          Back to Requests
        </button>
      </div>
    );
  }

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(request.id, trimmed);
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
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-lg">
          {customer?.avatar}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-gray-900 lg:text-[15px]">{customer?.name}</p>
          <p className="text-[11px] text-emerald-500">Online</p>
        </div>
        {customer?.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light text-brand lg:h-10 lg:w-10"
          >
            <PhoneIcon width={16} height={16} />
          </a>
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
  const isProvider = message.from === "provider";
  return (
    <div className={`flex ${isProvider ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
          isProvider ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-gray-100 text-gray-800"
        }`}
      >
        <p>{message.text}</p>
        <p className={`mt-1 text-right text-[10px] ${isProvider ? "text-white/70" : "text-gray-400"}`}>
          {new Date(message.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
