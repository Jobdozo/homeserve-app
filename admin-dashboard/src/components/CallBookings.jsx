import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { inputCls, labelCls, btnCls, ghostCls } from "./CrmKit";

// Provider CRM → Call bookings: book a service for a customer who phoned in, and
// complete, reschedule or cancel open bookings (server/src/callDesk.js). Bookings
// made here go to providers exactly like app bookings.

const SLOTS = ["08:00 AM – 10:00 AM", "10:00 AM – 12:00 PM", "12:00 PM – 02:00 PM", "02:00 PM – 04:00 PM", "04:00 PM – 06:00 PM"];
const OPEN = "Pending,Accepted,In Progress";
const STATUS_PILL = { Pending: "bg-amber-100 text-amber-700", Accepted: "bg-sky-100 text-sky-700", "In Progress": "bg-violet-100 text-violet-700" };
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const dayLabel = (d) => (d ? new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" }) : "");

// Price of one line, the way the server works it out (apps get full-price choices as the difference).
function linePrice(service, picked, qty) {
  const extra = (service.options || []).reduce(
    (sum, g) => sum + (picked[g.id] || []).reduce((s, id) => s + (g.choices.find((c) => c.id === id)?.price || 0), 0),
    0
  );
  return (service.price + extra) * qty;
}
const startPicks = (service) =>
  Object.fromEntries((service.options || []).filter((g) => g.required && g.max === 1 && g.choices[0]).map((g) => [g.id, [g.choices[0].id]]));

export default function CallBookings() {
  const { can } = useApp();
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  if (!can("bookings.view")) return <p className="rounded-xl bg-white p-4 text-[12.5px] text-gray-500 shadow-card">You need "Bookings → View" to use call bookings.</p>;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {can("bookings.edit") ? (
        <NewCallBooking onBooked={refresh} />
      ) : (
        <p className="rounded-xl bg-white p-4 text-[12.5px] text-gray-500 shadow-card">You need "Bookings → Edit" to create bookings on call.</p>
      )}
      <OpenBookings tick={tick} onChanged={refresh} canEdit={can("bookings.edit")} />
    </div>
  );
}

function NewCallBooking({ onBooked }) {
  const { services, providers, showToast } = useApp();
  const [phone, setPhone] = useState("");
  const [caller, setCaller] = useState(null); // lookup result
  const [looking, setLooking] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]); // { service, picked, qty, issue }
  const [date, setDate] = useState(istToday());
  const [time, setTime] = useState(SLOTS[1]);
  const [address, setAddress] = useState({ label: "Home", line: "", pincode: "" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const providerName = useCallback((id) => providers.find((p) => p.id === id)?.name || "", [providers]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return services
      .filter((s) => s.status === "active" && `${s.name} ${s.categoryId || ""} ${providerName(s.providerId)}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, services, providerName]);

  const findCaller = async () => {
    setError("");
    setLooking(true);
    try {
      const r = await api.callDeskLookup(phone);
      setCaller(r);
      if (r.customer) setName(r.customer.name || "");
    } catch (e) {
      setCaller(null);
      setError(e.message);
    } finally {
      setLooking(false);
    }
  };

  const addService = (s) => {
    setItems((list) => (list.some((i) => i.service.id === s.id) ? list : [...list, { service: s, picked: startPicks(s), qty: 1, issue: "" }]));
    setSearch("");
  };
  const updateItem = (idx, patch) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const toggle = (idx, g, choiceId) => {
    const cur = items[idx].picked[g.id] || [];
    let next;
    if (g.max === 1) next = cur[0] === choiceId && !g.required ? [] : [choiceId];
    else if (cur.includes(choiceId)) next = cur.filter((x) => x !== choiceId);
    else if (cur.length < g.max) next = [...cur, choiceId];
    else return;
    updateItem(idx, { picked: { ...items[idx].picked, [g.id]: next } });
  };

  const total = items.reduce((sum, it) => sum + linePrice(it.service, it.picked, it.qty), 0);
  const missingChoice = items.find((it) => (it.service.options || []).some((g) => g.required && !(it.picked[g.id] || []).length));

  const submit = async () => {
    setError("");
    if (missingChoice) return setError(`Choose the options for ${missingChoice.service.name}`);
    setSaving(true);
    try {
      const r = await api.callDeskBook({
        phone,
        name,
        items: items.map((it) => ({ serviceId: it.service.id, options: it.picked, quantity: it.qty, issue: it.issue })),
        date,
        time,
        address,
        note,
      });
      showToast(`Booked for ${r.customer.name}: ${r.bookings.map((b) => `#${b.ref}`).join(", ")}${r.newCustomer ? " (new customer)" : ""}`);
      setItems([]);
      setNote("");
      setCaller(await api.callDeskLookup(phone).catch(() => caller));
      onBooked();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-card">
      <div>
        <h2 className="text-[15px] font-bold text-gray-900">New booking on call</h2>
        <p className="text-[12px] text-gray-500">The customer gets the usual booking notifications; the provider gets the request like any app booking.</p>
      </div>

      <div>
        <label className={labelCls} htmlFor="cd-phone">Caller's mobile number</label>
        <div className="flex gap-2">
          <input
            id="cd-phone"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setCaller(null); }}
            onKeyDown={(e) => e.key === "Enter" && findCaller()}
            inputMode="tel"
            placeholder="98765 43210"
            className={inputCls}
          />
          <button onClick={findCaller} disabled={looking || phone.replace(/\D/g, "").length < 10} className={ghostCls}>
            {looking ? "Finding…" : "Find"}
          </button>
        </div>
        {caller && (
          <div className={`mt-2 rounded-xl p-2.5 text-[12px] ${caller.blocked ? "bg-red-50 text-red-700" : caller.customer ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {caller.blocked
              ? "This number is blocked — it can't be booked for."
              : caller.customer
                ? <>Existing customer: <b>{caller.customer.name}</b>{caller.bookings.length ? ` · ${caller.bookings.length} open booking${caller.bookings.length > 1 ? "s" : ""} (see the list)` : " · no open bookings"}</>
                : "New customer — a Tikdum account is made for this number when you book."}
          </div>
        )}
      </div>

      {caller && !caller.blocked && (
        <>
          {!caller.customer && (
            <div>
              <label className={labelCls} htmlFor="cd-name">Customer's name</label>
              <input id="cd-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={inputCls} />
            </div>
          )}

          <div className="relative">
            <label className={labelCls} htmlFor="cd-search">Services</label>
            <input id="cd-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a service, category or provider" className={inputCls} />
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => addService(s)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-gray-50">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-800">{s.name}</span>
                        <span className="block truncate text-[11px] text-gray-400">{providerName(s.providerId)}{s.options?.length ? " · has options" : ""}</span>
                      </span>
                      <span className="flex-shrink-0 font-semibold tabular-nums text-gray-700">{inr(s.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {items.map((it, idx) => (
            <div key={it.service.id} className="space-y-2 rounded-xl border border-gray-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">{it.service.name}</p>
                  <p className="text-[11px] text-gray-400">{providerName(it.service.providerId)}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-[13px] font-bold tabular-nums text-gray-900">{inr(linePrice(it.service, it.picked, it.qty))}</span>
                  <button onClick={() => setItems((l) => l.filter((_, i) => i !== idx))} className="text-[11.5px] font-semibold text-red-500">Remove</button>
                </div>
              </div>
              {(it.service.options || []).map((g) => (
                <fieldset key={g.id}>
                  <legend className="text-[11px] font-semibold text-gray-500">{g.name}{g.required ? " (required)" : ""}{g.max > 1 ? ` · up to ${g.max}` : ""}</legend>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {g.choices.map((c) => {
                      const on = (it.picked[g.id] || []).includes(c.id);
                      const label = g.fullPrice ? inr(it.service.price + c.price) : c.price ? `+${inr(c.price)}` : "Included";
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggle(idx, g, c.id)}
                          aria-pressed={on}
                          className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold ${on ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600"}`}
                        >
                          {c.name} · {label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11.5px] text-gray-500">
                  Qty
                  <input type="number" min="1" max="20" value={it.qty} onChange={(e) => updateItem(idx, { qty: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className="w-14 rounded-lg border border-gray-200 px-2 py-1 text-center text-[12px]" />
                </label>
                <input value={it.issue} onChange={(e) => updateItem(idx, { issue: e.target.value })} placeholder="What the customer said (optional)" className={`${inputCls} flex-1 py-1.5`} />
              </div>
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="cd-date">Date</label>
              <input id="cd-date" type="date" min={istToday()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="cd-time">Time slot</label>
              <select id="cd-time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls}>
                {SLOTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <label className={labelCls} htmlFor="cd-line">Address</label>
              <input id="cd-line" value={address.line} onChange={(e) => setAddress({ ...address, line: e.target.value })} placeholder="House no., street, area, landmark" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="cd-pin">PIN code</label>
              <input id="cd-pin" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} inputMode="numeric" maxLength={6} placeholder="180001" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="cd-note">Note for the provider (optional)</label>
            <input id="cd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Call before coming, gate code 1234" className={inputCls} />
          </div>

          {error && <p className="rounded-xl bg-red-50 p-2.5 text-[12px] text-red-700">{error}</p>}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
              <p className="text-[18px] font-bold tabular-nums text-gray-900">{inr(total)}</p>
            </div>
            <button onClick={submit} disabled={saving || !items.length || (!caller.customer && !name.trim())} className={btnCls}>
              {saving ? "Booking…" : `Create booking${items.length > 1 ? ` (${items.length} services)` : ""}`}
            </button>
          </div>
        </>
      )}
      {!caller && error && <p className="rounded-xl bg-red-50 p-2.5 text-[12px] text-red-700">{error}</p>}
    </section>
  );
}

function OpenBookings({ tick, onChanged, canEdit }) {
  const { providers } = useApp();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(null); // { id, kind: "reschedule" | "cancel" | "complete" }

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let off = false;
    api
      .listBookingsPage({ status: OPEN, q: query || undefined, limit: 30 })
      .then((p) => !off && (setPage(p), setError("")))
      .catch((e) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [query, tick]);

  const providerName = (id) => providers.find((p) => p.id === id)?.name || "Not assigned yet";

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">Open bookings</h2>
          <p className="text-[12px] text-gray-500">Pending, accepted and in progress{page ? ` · ${page.total}` : ""}</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Phone, name or booking #" className={`${inputCls} w-56`} />
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      {!page && !error && <p className="text-[12px] text-gray-400">Loading…</p>}
      {page?.items.length === 0 && <p className="py-6 text-center text-[12.5px] text-gray-400">No open bookings{query ? ` for "${query}"` : ""}.</p>}
      <ul className="divide-y divide-gray-100">
        {page?.items.map((b) => (
          <li key={b.id} className="space-y-2 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-[12.5px]">
                <p className="font-semibold text-gray-900">
                  #{b.ref} · {b.service?.name || "Service"}
                </p>
                <p className="text-gray-500">
                  {b.customer?.name || "Customer"} · {b.customer?.phone || ""}
                </p>
                <p className="text-gray-500">{providerName(b.providerId)} · {dayLabel(b.date)}, {b.time}</p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[b.status] || "bg-gray-100 text-gray-600"}`}>{b.status}</span>
                <span className="text-[12.5px] font-bold tabular-nums text-gray-800">{inr(b.amount)}</span>
              </div>
            </div>
            {canEdit && acting?.id !== b.id && (
              <div className="flex flex-wrap gap-1.5">
                {b.status !== "Pending" && <button onClick={() => setActing({ id: b.id, kind: "complete" })} className={`${ghostCls} py-1`}>Mark completed</button>}
                {b.status !== "In Progress" && <button onClick={() => setActing({ id: b.id, kind: "reschedule" })} className={`${ghostCls} py-1`}>Reschedule</button>}
                {b.status !== "In Progress" && <button onClick={() => setActing({ id: b.id, kind: "provider" })} className={`${ghostCls} py-1`}>Change provider</button>}
                <button onClick={() => setActing({ id: b.id, kind: "cancel" })} className={`${ghostCls} py-1 text-red-600`}>Cancel</button>
              </div>
            )}
            {acting?.id === b.id &&
              (acting.kind === "provider" ? (
                <ChangeProvider booking={b} currentName={providerName(b.providerId)} onDone={() => { setActing(null); onChanged(); }} onClose={() => setActing(null)} />
              ) : (
                <BookingAction booking={b} kind={acting.kind} onDone={() => { setActing(null); onChanged(); }} onClose={() => setActing(null)} />
              ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Providers who could take the booking instead, ranked like the assignment desk. The chosen one
// gets it as a new request to accept; the customer never pays more than agreed.
function ChangeProvider({ booking, currentName, onDone, onClose }) {
  const { showToast } = useApp();
  const [options, setOptions] = useState(null);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    api
      .callDeskProviders(booking.id)
      .then((list) => !off && setOptions(list))
      .catch((e) => !off && (setOptions([]), setError(e.message)));
    return () => {
      off = true;
    };
  }, [booking.id]);

  const choice = options?.find((o) => o.providerId === picked);
  const move = async () => {
    setBusy(true);
    setError("");
    try {
      await api.callDeskChangeProvider(booking.id, picked);
      showToast(`#${booking.ref} sent to ${choice?.name || "the new provider"} — waiting for them to accept`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-[12px] text-gray-600">
        Now with <b>{currentName}</b>. The provider you pick gets it as a new request to accept{booking.status === "Accepted" ? "; the customer is told a new professional is coming" : ""}.
      </p>
      {!options && <p className="text-[12px] text-gray-400">Finding providers…</p>}
      {options?.length === 0 && !error && <p className="text-[12px] text-gray-500">No other provider offers this kind of service.</p>}
      {options?.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {options.map((o) => (
            <li key={o.providerId}>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-2 text-[12px] ${picked === o.providerId ? "border-brand" : "border-gray-100"}`}>
                <input type="radio" name={`prov-${booking.id}`} checked={picked === o.providerId} onChange={() => setPicked(o.providerId)} className="mt-0.5 accent-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-800">
                    {o.name}
                    {o.rating ? <span className="font-normal text-gray-400"> · ★ {o.rating.toFixed(1)}</span> : null}
                    <span className="font-normal text-gray-400"> · {o.jobsDone} jobs</span>
                  </span>
                  <span className="block text-gray-500">
                    {o.serviceName}{o.sameService ? "" : " (similar service)"} · their price {inr(o.price)} · customer pays {inr(o.customerPays)}
                  </span>
                  {!o.available && <span className="block text-amber-700">⚠ {o.issues.join(", ")}</span>}
                  {o.passed && <span className="block text-gray-400">Already passed on this booking</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={move} disabled={busy || !picked} className={btnCls}>{busy ? "Moving…" : "Move to this provider"}</button>
        <button onClick={onClose} className={ghostCls}>Back</button>
      </div>
    </div>
  );
}

function BookingAction({ booking, kind, onDone, onClose }) {
  const { showToast } = useApp();
  const [date, setDate] = useState(booking.date >= istToday() ? booking.date : istToday());
  const [time, setTime] = useState(SLOTS.includes(booking.time) ? booking.time : SLOTS[1]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      if (kind === "reschedule") await api.callDeskReschedule(booking.id, { date, time, reason });
      else await api.callDeskClose(booking.id, { action: kind, reason });
      showToast(kind === "reschedule" ? `#${booking.ref} moved to ${dayLabel(date)}, ${time}` : kind === "complete" ? `#${booking.ref} marked completed` : `#${booking.ref} cancelled`);
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const tone = kind === "cancel" ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-gray-50";
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${tone}`}>
      {kind === "reschedule" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="date" min={istToday()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="New date" />
          <select value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} aria-label="New time slot">
            {SLOTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}
      {kind === "complete" ? (
        <p className="text-[12px] text-gray-600">Mark #{booking.ref} as completed? The customer is asked to rate the job.</p>
      ) : (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={kind === "cancel" ? "Reason (the customer and provider see this)" : "Reason (optional, for the activity log)"}
          className={inputCls}
        />
      )}
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={busy || (kind === "cancel" && !reason.trim())}
          className={kind === "cancel" ? "rounded-xl bg-red-600 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" : btnCls}
        >
          {busy ? "Saving…" : kind === "reschedule" ? "Reschedule" : kind === "complete" ? "Mark completed" : "Cancel booking"}
        </button>
        <button onClick={onClose} className={ghostCls}>Back</button>
      </div>
    </div>
  );
}
