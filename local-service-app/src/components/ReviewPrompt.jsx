import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { StarIcon } from "./icons";
import { ProviderMark } from "./ui";

const DAY = 24 * 60 * 60 * 1000;
const SHOW_ON = ["/home", "/bookings", "/categories", "/profile", "/messages"];
const KEY = "tikdum-review-snooze";

// Which unrated jobs the customer said "Not now" to: { [bookingId]: { until, times } }.
function readSnoozes() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
function snooze(id) {
  const all = readSnoozes();
  const times = (all[id]?.times || 0) + 1;
  all[id] = { until: Date.now() + 2 * DAY, times };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // only a convenience: without storage it simply asks again next time
  }
}

// "How was AC Service with Ravi?" — after a job is completed and not yet rated (last 14 days),
// a small sheet on the main screens asks for stars; a tap opens the rating screen with that
// many stars chosen. "Not now" waits two days, and after three times it stops asking.
export default function ReviewPrompt() {
  const { customer, bookings, getProvider } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [closed, setClosed] = useState(() => new Set());

  const booking = useMemo(() => {
    if (!customer) return null;
    const snoozes = readSnoozes();
    const now = Date.now();
    return (
      (bookings || [])
        .filter((b) => b.status === "Completed" && !b.reviewed && !closed.has(b.id))
        .map((b) => ({ b, at: Date.parse(b.statusHistory?.Completed || b.date || "") || 0 }))
        .filter(({ b, at }) => at && now - at < 14 * DAY && !(snoozes[b.id] && (snoozes[b.id].times >= 3 || snoozes[b.id].until > now)))
        .sort((x, y) => y.at - x.at)[0]?.b || null
    );
  }, [customer, bookings, closed]);

  if (!booking || !SHOW_ON.includes(pathname)) return null;
  const provider = getProvider(booking.providerId);
  const close = () => {
    snooze(booking.id);
    setClosed((s) => new Set(s).add(booking.id));
  };
  const rate = (n) => {
    setClosed((s) => new Set(s).add(booking.id));
    navigate(`/review/${booking.id}?rating=${n}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 lg:items-center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-md animate-fade-up rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-center shadow-2xl lg:rounded-[28px]" role="dialog" aria-label="Rate your service">
        <span className="mx-auto mb-4 block h-1 w-10 rounded-full bg-line lg:hidden" />
        {provider && <ProviderMark provider={provider} className="mx-auto h-14 w-14 rounded-2xl text-[20px]" />}
        <p className="mt-3 font-display text-[21px] font-extrabold leading-tight text-ink">
          How was {booking.service?.name || "your service"}
          {provider ? ` with ${provider.name}` : ""}?
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">Tap the stars — it helps other families choose.</p>
        <div className="mt-4 flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => rate(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`} className="rounded-xl p-1 active:scale-90">
              <StarIcon filled={false} width={38} height={38} />
            </button>
          ))}
        </div>
        <button onClick={close} className="mt-4 text-[13.5px] font-semibold text-ink-muted">
          Not now
        </button>
      </div>
    </div>
  );
}
