import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { socket } from "../socket";
import { useApp } from "../context/AppContext";
import { onNativeRing } from "../utils/adminRinging";

// Bookings no provider accepted (they rejected it, missed the ring, or handed it
// back, and nobody else was left). Instead of the customer being turned away, the
// booking pops up here on every open Admin screen, ringing like the Business app,
// until someone assigns it to a provider or gives up. The server WhatsApps the
// owner after 10 minutes and tells the customer sorry at the deadline.
const minsSince = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
const clock = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// A two-tone chime every few seconds while something is waiting (and not muted).
function useChime(active) {
  const ctx = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const ring = () => {
      try {
        ctx.current = ctx.current || new (window.AudioContext || window.webkitAudioContext)();
        const ac = ctx.current;
        [880, 660].forEach((hz, i) => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.frequency.value = hz;
          g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.25);
          g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + i * 0.25 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.25 + 0.22);
          o.connect(g).connect(ac.destination);
          o.start(ac.currentTime + i * 0.25);
          o.stop(ac.currentTime + i * 0.25 + 0.24);
        });
      } catch {
        // no sound available (browser blocked it until the page is clicked)
      }
    };
    ring();
    const t = setInterval(ring, 3000);
    return () => clearInterval(t);
  }, [active]);
}

function Option({ o, responsible, onAssign, busy, canEdit, best }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2.5 ${
        best ? "border-emerald-300 bg-emerald-50/50" : o.available ? "border-gray-100" : "border-dashed border-gray-200 bg-gray-50/60"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-900">
          {best && <span className="mr-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Best match</span>}
          {o.name}
          {o.rating > 0 && <span className="ml-1.5 text-[11.5px] font-medium text-gray-500">★ {o.rating}</span>}
          <span className="ml-1.5 text-[11.5px] font-medium text-gray-400">{o.jobsDone} jobs</span>
        </p>
        <p className="text-[11.5px] text-gray-500">
          {o.sameService ? o.serviceName : <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">Different service: {o.serviceName}</span>}
          {o.passed && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Passed on it</span>}
          {o.issues.slice(0, 2).map((i) => (
            <span key={i} className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              {i}
            </span>
          ))}
        </p>
        {o.available && o.match?.reasons?.length > 0 && <p className="text-[11px] text-gray-400">{o.match.reasons.join(" · ")}</p>}
      </div>
      <div className="text-right text-[11.5px] leading-tight">
        <p className="font-semibold text-gray-900">Their price ₹{o.price}</p>
        <p className="text-gray-500">Customer pays ₹{o.customerPays}</p>
        {o.cover > 0 && (
          <p className="text-red-600">
            +₹{o.cover} from {responsible.acceptedRule ? responsible.name : "Tikdum"}
          </p>
        )}
      </div>
      <div className="flex gap-1.5">
        {o.phone && (
          <a href={`tel:${o.phone}`} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">
            Call
          </a>
        )}
        {canEdit && (
          <button onClick={() => onAssign(o)} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
            {busy ? "Assigning…" : "Assign"}
          </button>
        )}
      </div>
    </div>
  );
}

function WaitingBooking({ item, canEdit, onDone }) {
  const { showToast } = useApp();
  const [busy, setBusy] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const b = item.booking;
  const [showOther, setShowOther] = useState(false);
  const booked = b.service?.name || "the booked service";
  // Providers who offer the booked service; the others only on request, and only after a confirm —
  // assigning one changes the customer's booking to that provider's service.
  const same = item.options.filter((o) => o.sameService);
  const other = item.options.filter((o) => !o.sameService);
  const shown = showAll ? same : same.slice(0, 6);

  const assign = async (o) => {
    if (!o.sameService && !window.confirm(`${o.name} doesn't offer ${booked}.

Assigning them changes the customer's booking to "${o.serviceName}". The customer will be told.

Go ahead?`)) return;
    setBusy(o.providerId);
    try {
      await api.assignBooking(b.id, o.providerId, !o.sameService);
      showToast(`Sent to ${o.name} — their phone is ringing`);
      onDone();
    } catch (e) {
      showToast(e.message || "Couldn't assign");
    }
    setBusy(null);
  };
  const giveUp = async () => {
    if (!confirmGiveUp) return setConfirmGiveUp(true);
    setBusy("give-up");
    try {
      await api.giveUpBooking(b.id);
      showToast("The customer has been told, with an apology");
      onDone();
    } catch (e) {
      showToast(e.message || "Couldn't update the booking");
    }
    setBusy(null);
  };

  return (
    <div className="rounded-2xl border border-gray-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[15px] font-bold text-gray-900">
            #{b.ref || b.id} · {b.service?.name || "Service"}
          </p>
          <p className="text-[12.5px] text-gray-600">
            {b.customer?.name || "Customer"}
            {b.customer?.phone && (
              <a href={`tel:${b.customer.phone}`} className="ml-1.5 font-semibold text-brand">
                {b.customer.phone}
              </a>
            )}
          </p>
          <p className="text-[12px] text-gray-500">{b.address?.line}</p>
          <p className="text-[12px] text-gray-500">
            {b.date} · {b.time || "as soon as possible"} · booked at ₹{item.quoted}
          </p>
        </div>
        <div className="text-right text-[11.5px]">
          <p className="font-semibold text-red-600">Waiting {minsSince(item.since)} min</p>
          <p className="text-gray-400">Customer is told sorry at {clock(item.deadline)}</p>
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-gray-500">
        The customer never pays more than ₹{item.quoted}. A higher price's difference is taken from {item.responsible.name}'s wallet when the job is done
        {item.responsible.acceptedRule ? "." : " — they haven't accepted the new agreement yet, so Tikdum pays it."}
      </p>

      <div className="mt-2 space-y-2">
        {shown.map((o) => (
          <Option key={o.providerId} o={o} responsible={item.responsible} onAssign={assign} busy={busy === o.providerId} canEdit={canEdit} best={o.providerId === item.suggestedProviderId} />
        ))}
        {same.length === 0 && (
          <p className="py-3 text-center text-[12.5px] text-gray-500">
            No provider offers <b>{booked}</b>{other.length ? " — call the customer before giving them a different service." : "."}
          </p>
        )}
        {other.length > 0 && (
          <button onClick={() => setShowOther((v) => !v)} className="text-[12px] font-semibold text-amber-700">
            {showOther ? "Hide" : "Show"} {other.length} provider{other.length === 1 ? "" : "s"} who don't offer {booked}
          </button>
        )}
        {showOther && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/40 p-2">
            <p className="text-[11.5px] text-amber-800">These providers don't offer {booked}. Assigning one changes the customer's booking to their service, and the customer is told.</p>
            {other.map((o) => (
              <Option key={o.providerId} o={o} responsible={item.responsible} onAssign={assign} busy={busy === o.providerId} canEdit={canEdit} best={false} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {same.length > 6 ? (
          <button onClick={() => setShowAll((v) => !v)} className="text-[12px] font-semibold text-brand">
            {showAll ? "Show fewer" : `Show all ${same.length} providers`}
          </button>
        ) : (
          <span />
        )}
        {canEdit && (
          <button onClick={giveUp} disabled={busy === "give-up"} className="text-[12px] font-semibold text-red-500 disabled:opacity-50">
            {confirmGiveUp ? "Yes — tell the customer sorry" : "Can't find anyone"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AssignmentDesk() {
  const { can } = useApp();
  const canView = can("bookings.view");
  const canEdit = can("bookings.edit");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const seen = useRef(new Set());

  const load = useCallback(() => {
    api
      .listAssignments()
      .then(({ items: list }) => {
        setItems(list);
        // Something new is waiting: pop up and ring again.
        const fresh = list.some((x) => !seen.current.has(x.booking.id));
        list.forEach((x) => seen.current.add(x.booking.id));
        if (fresh) {
          setOpen(true);
          setMuted(false);
        }
        if (!list.length) setOpen(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canView) return undefined;
    load();
    let t;
    const onEvent = () => {
      clearTimeout(t);
      t = setTimeout(load, 600);
    };
    socket.on("assignment:needed", onEvent);
    socket.on("connect", onEvent);
    const poll = setInterval(load, 60000); // waiting times and the deadline stay current
    // Opened from the phone's ringing notification: show the desk straight away.
    const stopRing = onNativeRing(() => {
      setOpen(true);
      setMuted(false);
      load();
    });
    return () => {
      stopRing();
      socket.off("assignment:needed", onEvent);
      socket.off("connect", onEvent);
      clearInterval(poll);
      clearTimeout(t);
    };
  }, [canView, load]);

  useChime(canEdit && items.length > 0 && !muted);
  if (!canView || items.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg"
      >
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        {items.length} booking{items.length === 1 ? "" : "s"} need{items.length === 1 ? "s" : ""} a provider
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Bookings that need a provider">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-[16px] font-extrabold text-gray-900">
              {items.length} booking{items.length === 1 ? "" : "s"} need{items.length === 1 ? "s" : ""} a provider
            </p>
            <p className="text-[12px] text-gray-500">No provider accepted these. Assign one so the customer isn't turned away.</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <button onClick={() => setMuted((m) => !m)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600">
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
            <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600">
              Later
            </button>
          </div>
        </div>
        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {items.map((item) => (
            <WaitingBooking key={item.booking.id} item={item} canEdit={canEdit} onDone={load} />
          ))}
        </div>
      </div>
    </div>
  );
}
