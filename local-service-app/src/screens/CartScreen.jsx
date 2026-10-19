import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { timeSlots } from "../data/mockData";
import ScreenHeader from "../components/ScreenHeader";
import { MapPinIcon, PlusIcon, NoteIcon, TagIcon, CheckIcon, ShieldCheckIcon, CashIcon, UserPlusIcon, CalendarIcon, CrosshairIcon } from "../components/icons";
import CategoryPhoto from "../components/CategoryPhoto";
import AddOns from "../components/AddOns";
import { QtyStepper, SectionLabel, inr } from "../components/ui";
import { useOptionsSheet } from "../components/optionsSheetContext";
import { unitPrice, offerSaving, offerBase } from "../utils/cartMath";
import { trackMeta } from "../utils/metaPixel";

// The map (Leaflet) is only needed when a customer opens it, so it loads on demand.
const LocationPicker = lazy(() => import("../components/LocationPicker"));

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// "08:00 AM – 10:00 AM" -> "8–10 AM"; "10:00 AM – 12:00 PM" -> "10 AM–12 PM"
function shortSlot(slot) {
  const m = String(slot).match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return slot;
  const t = (h, mm) => `${Number(h)}${mm === "00" ? "" : `:${mm}`}`;
  return m[3].toUpperCase() === m[6].toUpperCase() ? `${t(m[1], m[2])}–${t(m[4], m[5])} ${m[6].toUpperCase()}` : `${t(m[1], m[2])} ${m[3].toUpperCase()}–${t(m[4], m[5])} ${m[6].toUpperCase()}`;
}
function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Hour a slot ends at (24h), for greying out today's slots that have passed.
function slotEndHour(slot) {
  const m = String(slot).match(/[–-]\s*(\d{1,2}):\d{2}\s*(AM|PM)/i);
  if (!m) return 24;
  const h = Number(m[1]) % 12;
  return m[2].toUpperCase() === "PM" ? h + 12 : h;
}
const card = "rounded-[20px] bg-white p-4 shadow-card";
const h2 = "font-display text-[18px] font-extrabold text-ink";

export default function CartScreen() {
  const navigate = useNavigate();
  const {
    cart,
    services,
    bookings,
    getService,
    getProvider,
    updateCartItem,
    setCartSchedule,
    removeFromCart,
    checkout,
    appliedOffer,
    offerError,
    applyOfferCode,
    clearOffer,
    referral,
    refreshReferral,
    showToast,
    location,
    locationStatus,
    detectLocation,
    customer,
    activePincode,
  } = useApp();
  const { open: openOptions } = useOptionsSheet();
  const [submitting, setSubmitting] = useState(false);
  const [placeKey, setPlaceKey] = useState(null);
  const [landmark, setLandmark] = useState("");
  const [pinned, setPinned] = useState(null); // an exact spot chosen on the map
  const [picking, setPicking] = useState(false);
  const [availability, setAvailability] = useState(null); // { pin, ids: Set } for the chosen PIN
  const [couponInput, setCouponInput] = useState("");
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [applyingCoupon, setApplyingCoupon] = useState("");
  const [globalOffers, setOffers] = useState([]);
  const [providerOffers, setProviderOffers] = useState([]);
  const [referralInput, setReferralInput] = useState("");
  const [appliedReferral, setAppliedReferral] = useState(null);
  const [referralError, setReferralError] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [useCredits, setUseCredits] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [forSomeone, setForSomeone] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "" });
  const [otherDate, setOtherDate] = useState(false);
  const [repeatAsk, setRepeatAsk] = useState(null); // { question, repeats } from the server

  const isFirstOrder = bookings.length === 0;

  useEffect(() => {
    if (referral === null) refreshReferral();
    api.listOffers().then(setOffers).catch(() => setOffers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = useMemo(
    () => cart.map((item) => ({ item, service: getService(item.serviceId) })).filter((l) => l.service),
    [cart, services, getService]
  );
  const schedule = { date: lines[0]?.item.date || "", time: lines[0]?.item.time || timeSlots[1] };
  // Meta Pixel: the cart was opened with something in it (website only), once per visit.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || !lines.length) return;
    checkoutTracked.current = true;
    trackMeta("InitiateCheckout", { num_items: lines.length, value: lines.reduce((s, l) => s + (Number(l.service.price) || 0) * (l.item.quantity || 1), 0), currency: "INR" });
  }, [lines]);
  useEffect(() => {
    if (lines.length > 1 && lines.some((l) => l.item.date !== lines[0].item.date || l.item.time !== lines[0].item.time)) {
      setCartSchedule({ date: lines[0].item.date, time: lines[0].item.time });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.map((l) => l.item.date + l.item.time).join("|")]);
  const qtyOf = (l) => l.item.quantity || 1;
  const total = lines.reduce((sum, l) => sum + unitPrice(l.service, l.item) * qtyOf(l), 0);
  const savings = lines.reduce((sum, l) => sum + (l.service.originalPrice > l.service.price ? (l.service.originalPrice - l.service.price) * qtyOf(l) : 0), 0);
  const offerLines = lines.map((l) => ({ providerId: l.service.providerId, total: unitPrice(l.service, l.item) * qtyOf(l) }));
  const offerDiscount = offerSaving(appliedOffer, offerLines);
  const referralDiscount = appliedReferral ? appliedReferral.discount : 0;
  const creditDiscount = useCredits && referral ? Math.min(referral.balance, total - offerDiscount - referralDiscount) : 0;
  const discountAmount = offerDiscount + referralDiscount + creditDiscount;
  const payable = Math.max(0, total - discountAmount);
  const providerNames = [...new Set(lines.map((l) => getProvider(l.service.providerId)?.name).filter(Boolean))];
  // The cart's providers' own offers come first: they're only for these services.
  const cartProviderIds = [...new Set(lines.map((l) => l.service.providerId).filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!cartProviderIds) return setProviderOffers([]);
    api
      .listProviderOffers(cartProviderIds.split(","))
      .then((list) => setProviderOffers(list.map((o) => ({ ...o, providerName: getProvider(o.providerId)?.name }))))
      .catch(() => setProviderOffers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProviderIds]);
  const offers = [...providerOffers, ...globalOffers];

  // An offer that needs a bigger booking drops off by itself if the cart shrinks below it.
  useEffect(() => {
    if (appliedOffer?.minOrder > 0 && offerBase(appliedOffer, offerLines) < appliedOffer.minOrder) {
      clearOffer();
      showToast(`${appliedOffer.code} removed — it needs ${inr(appliedOffer.minOrder)} or more`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const applyCode = async (code) => {
    if (!code || applyingCoupon) return;
    setApplyingCoupon(code);
    try {
      await applyOfferCode(code, total);
      setShowCodeBox(false);
      setCouponInput("");
    } catch (e) {
      // offerError is set by the context
    } finally {
      setApplyingCoupon("");
    }
  };

  const handleApplyReferral = async () => {
    if (!referralInput.trim() || applyingReferral) return;
    setReferralError("");
    setApplyingReferral(true);
    try {
      const result = await api.validateReferralCode(referralInput.trim());
      setAppliedReferral(result);
    } catch (e) {
      setAppliedReferral(null);
      setReferralError(e.message || "Invalid referral code");
    } finally {
      setApplyingReferral(false);
    }
  };

  const places = [
    { key: "home", title: "Home", data: customer?.address || null },
    { key: "office", title: "Office", data: customer?.address?.office || null },
    ...(pinned ? [{ key: "pinned", title: "Pinned on map", data: pinned }] : []),
    { key: "current", title: "Current location", data: location || null },
  ];
  const chosenKey = placeKey || (location ? "current" : customer?.address ? "home" : "current");
  const chosen = places.find((p) => p.key === chosenKey);
  const bookingAddress = chosen?.data
    ? {
        label: chosen.key === "current" ? chosen.data.label || "Current location" : chosen.title,
        // The booking has one address line, so the house/flat/landmark goes
        // in front of it — the provider and admin see it wherever the address shows.
        line: landmark.trim() ? `${landmark.trim()}, ${chosen.data.line}` : chosen.data.line,
        lat: chosen.data.lat,
        lng: chosen.data.lng,
        pincode: chosen.data.pincode || "",
      }
    : null;
  const bookingPin = bookingAddress?.pincode || "";
  const farKm = chosen && chosen.key !== "current" && location ? distanceKm(location, chosen.data) : 0;

  // Which cart items can actually be booked at the chosen PIN. The catalog on
  // screen follows the live location; a Home/Office pick in another PIN needs
  // its own check (the server re-checks on order either way).
  useEffect(() => {
    if (!bookingPin || bookingPin === activePincode) {
      setAvailability(null);
      return undefined;
    }
    let cancelled = false;
    api
      .bootstrap(bookingPin)
      .then((boot) => {
        if (!cancelled) setAvailability({ pin: bookingPin, ids: new Set(boot.services.map((s) => s.id)) });
      })
      .catch(() => {
        if (!cancelled) setAvailability(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingPin, activePincode]);

  const checkingAvailability = !!bookingPin && bookingPin !== activePincode && availability?.pin !== bookingPin;
  const unavailable =
    availability && availability.pin === bookingPin ? lines.filter((l) => !availability.ids.has(l.service.id)) : [];
  const unavailableIds = new Set(unavailable.map((l) => l.service.id));
  const contactOk = !forSomeone || (contact.name.trim() && /^[6-9]\d{9}$/.test(contact.phone.replace(/\D/g, "").slice(-10)));

  // confirmRepeat: the customer answered "Book again" to the repeat-booking question below.
  const placeOrder = async (confirmRepeat = false) => {
    if (submitting || lines.length === 0 || !bookingAddress || unavailable.length > 0 || checkingAvailability || !contactOk || !timeOk) return;
    setSubmitting(true);
    setRepeatAsk(null);
    try {
      const created = await checkout(bookingAddress, {
        referralCode: appliedReferral?.code,
        useCredits: creditDiscount > 0,
        serviceIds: lines.map((l) => l.service.id),
        note: note.trim(),
        contact: forSomeone ? { name: contact.name.trim(), phone: contact.phone } : undefined,
        confirmRepeat,
      });
      navigate(created[0] ? `/booking/${created[0].id}` : "/bookings", { replace: true, state: { orderId: created[0]?.orderId, justBooked: true } });
    } catch (e) {
      // The same service was booked within the hour: ask before booking it again.
      if (e.code === "repeat_booking" && e.data?.question) setRepeatAsk(e.data);
      else showToast(e.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };
  const handleCheckout = () => placeOrder(false);

  // next 7 days as chips; anything later through "Another date"
  const days = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      out.push({ iso: iso(d), top: i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-IN", { weekday: "short" }), day: d.getDate() });
    }
    return out;
  }, []);
  const dateInChips = days.some((d) => d.iso === schedule.date);
  const whenLabel = (() => {
    const d = days.find((x) => x.iso === schedule.date);
    const dayText = d ? (d.top === "Today" ? "Today" : d.top === "Tmrw" ? "Tomorrow" : `${d.top} ${d.day}`) : new Date(schedule.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return `${dayText} ${shortSlot(schedule.time)}`;
  })();
  // today: a slot needs to end at least an hour from now to be bookable
  const isToday = schedule.date === days[0].iso;
  const slotPast = (slot) => isToday && slotEndHour(slot) <= new Date().getHours() + 1;
  const timeOk = !slotPast(schedule.time);
  // A slot that has passed moves to the next free one; late in the day that's tomorrow morning.
  useEffect(() => {
    if (!schedule.date || timeOk || lines.length === 0) return;
    const next = timeSlots.find((s) => !slotPast(s));
    if (next) setCartSchedule({ time: next });
    else setCartSchedule({ date: days[1].iso, time: timeSlots[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule.date, schedule.time, timeOk]);
  const nudge = offers
    .filter((o) => !o.providerId && o.minOrder > total && (!appliedOffer || o.code !== appliedOffer.code))
    .sort((a, b) => a.minOrder - b.minOrder)[0];

  if (lines.length === 0) {
    return (
      <div className="flex min-h-full flex-shrink-0 flex-col bg-mist">
        <ScreenHeader title="Your booking" maxWidth="lg:max-w-6xl" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-light text-brand">
            <CalendarIcon width={28} height={28} />
          </span>
          <p className="font-display text-[19px] font-extrabold text-ink">Nothing booked yet</p>
          <p className="text-[13px] text-ink-muted">Add a service and choose a time — it takes a minute.</p>
          <button onClick={() => navigate("/categories")} className="mt-2 rounded-2xl bg-brand px-6 py-3 text-[14px] font-bold text-white shadow-cta active:scale-[0.98]">
            Browse services
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-shrink-0 flex-col bg-mist lg:pt-4">
      <ScreenHeader
        title="Your booking"
        subtitle={providerNames.length > 1 ? `${providerNames.length} visits · ${providerNames.join(", ")}` : `One visit${providerNames[0] ? ` · ${providerNames[0]}` : ""}`}
        maxWidth="lg:max-w-6xl"
      />

      <div className="flex flex-1 flex-col lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8 lg:px-8 lg:pb-16">
        <div className="flex flex-col gap-3 px-4 pb-4 lg:px-0">
          {/* items */}
          <div className="rounded-[20px] bg-white px-4 pt-1.5 shadow-card">
            {lines.map(({ item, service }) => {
              const unit = unitPrice(service, item);
              const chosenText = (item.optionLines || []).map((o) => o.choice).join(" · ");
              return (
                <div key={item.serviceId} className={`flex items-center gap-3 border-b border-[#F0EEF7] py-3 ${unavailableIds.has(service.id) ? "opacity-60" : ""}`}>
                  <span className="h-[52px] w-[52px] flex-shrink-0 overflow-hidden rounded-xl">
                    <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={52} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-[14.5px] font-bold leading-snug text-ink">{service.name}</span>
                    {chosenText ? (
                      <span className="truncate text-[12px] text-ink-muted">{chosenText}</span>
                    ) : (
                      <span className="text-[12px] text-ink-muted">{inr(unit)} each</span>
                    )}
                    {service.options?.length > 0 && (
                      <button onClick={() => openOptions(service)} className="w-fit text-[12px] font-bold text-brand">
                        Change
                      </button>
                    )}
                    {unavailableIds.has(service.id) && <span className="text-[11.5px] font-semibold text-marigold-dark">Not available at this address</span>}
                  </span>
                  <div className="w-[100px] flex-shrink-0">
                    <QtyStepper
                      value={qtyOf({ item })}
                      variant="outline"
                      size="sm"
                      label={service.name}
                      onChange={(n) => (n <= 0 ? removeFromCart(item.serviceId) : updateCartItem(item.serviceId, { quantity: n }))}
                    />
                  </div>
                  <span className="w-[58px] text-right text-[14px] font-bold text-ink tabular">{inr(unit * qtyOf({ item }))}</span>
                </div>
              );
            })}
            <div className="flex gap-2 py-3">
              <button
                onClick={() => navigate(lines[0] ? `/provider/${lines[0].service.providerId}` : "/categories")}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-[13px] font-bold text-brand active:scale-[0.98]"
              >
                <PlusIcon width={14} height={14} strokeWidth={2.8} /> Add more
              </button>
              <button
                onClick={() => setNoteOpen((v) => !v)}
                aria-expanded={noteOpen}
                className={`flex h-10 flex-[1.3] items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold active:scale-[0.98] ${note.trim() ? "border-brand bg-brand-light text-brand-dark" : "border-line text-ink"}`}
              >
                <NoteIcon width={15} height={15} /> {note.trim() ? "Note added" : "Note for the pro"}
              </button>
            </div>
            {noteOpen && (
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                rows={2}
                placeholder="e.g. Ring the bell twice, the dog is friendly"
                className="mb-3 w-full animate-fade-up resize-none rounded-2xl border border-line px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
              />
            )}
          </div>

          <div className="py-1">
            <AddOns anchorIds={lines.map((l) => l.service.id)} title="Add in the same visit" subtitle="Same professional, no extra visit" />
          </div>

          {/* ONE schedule for the whole visit */}
          <div className={card}>
            <p className={h2}>When should they come?</p>
            <p className="text-[12.5px] text-ink-muted">One time for everything in this booking</p>
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {days.map((d) => {
                const on = d.iso === schedule.date;
                return (
                  <button
                    key={d.iso}
                    onClick={() => {
                      setOtherDate(false);
                      setCartSchedule({ date: d.iso });
                    }}
                    aria-pressed={on}
                    className={`flex w-[54px] flex-shrink-0 flex-col items-center rounded-2xl py-2 transition-colors ${on ? "bg-ink text-white" : "border border-line text-ink"}`}
                  >
                    <span className={`text-[11px] font-semibold ${on ? "text-[#C9C0F2]" : "text-ink-muted"}`}>{d.top}</span>
                    <span className="font-display text-[18px] font-extrabold">{d.day}</span>
                  </button>
                );
              })}
              <button
                onClick={() => setOtherDate(true)}
                className={`flex w-[64px] flex-shrink-0 flex-col items-center justify-center rounded-2xl px-1 text-center text-[11.5px] font-bold leading-tight ${!dateInChips || otherDate ? "bg-ink text-white" : "border border-line text-brand"}`}
              >
                {!dateInChips && schedule.date ? new Date(schedule.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Another date"}
              </button>
            </div>
            {otherDate && (
              <input
                type="date"
                value={schedule.date}
                min={days[0].iso}
                onChange={(e) => e.target.value && setCartSchedule({ date: e.target.value })}
                className="mt-2 w-full rounded-xl border border-line px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
                aria-label="Service date"
              />
            )}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {timeSlots.map((slot) => {
                const past = slotPast(slot);
                const on = slot === schedule.time && !past;
                return (
                  <button
                    key={slot}
                    onClick={() => setCartSchedule({ time: slot })}
                    disabled={past}
                    aria-pressed={on}
                    className={`rounded-xl py-2.5 text-[13px] font-semibold transition-colors ${
                      on ? "bg-brand font-bold text-white" : past ? "bg-mist text-ink-muted/50 line-through" : "border border-line text-ink"
                    }`}
                  >
                    {shortSlot(slot)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* where */}
          <div className={card}>
            <p className={h2}>Where should they come?</p>
            <div className="mt-3 space-y-2">
              {places.map((p) => {
                const selected = chosenKey === p.key && !!p.data;
                const isCurrent = p.key === "current";
                return (
                  <div key={p.key} className={`flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 ${selected ? "border-brand bg-brand-light/40" : "border-line"}`}>
                    <button
                      type="button"
                      onClick={() => (p.data ? setPlaceKey(p.key) : isCurrent ? detectLocation() : navigate(`/address?slot=${p.key}`))}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      aria-pressed={selected}
                    >
                      <span className={`mt-0.5 flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand" : "border-[#C9C4D9]"}`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                          {p.title}
                          {p.data?.pincode && <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-muted">PIN {p.data.pincode}</span>}
                        </span>
                        {p.data ? (
                          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-muted">{p.data.line}</span>
                        ) : isCurrent ? (
                          <span className="mt-0.5 block text-[12.5px] font-semibold text-marigold-dark">
                            {locationStatus === "detecting"
                              ? "Detecting…"
                              : locationStatus === "denied"
                                ? "Location access is off — turn it on in your phone settings, then tap here."
                                : "Tap to use where you are now"}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-[12.5px] font-semibold text-brand">+ Add {p.title.toLowerCase()} address</span>
                        )}
                      </span>
                    </button>
                    {isCurrent && p.data && (
                      <button type="button" onClick={detectLocation} className="flex-shrink-0 text-[12px] font-bold text-brand">
                        {locationStatus === "detecting" ? "Detecting…" : "Refresh"}
                      </button>
                    )}
                    {!isCurrent && p.data && (
                      <button type="button" onClick={() => (p.key === "pinned" ? setPicking(true) : navigate(`/address?slot=${p.key}`))} className="flex-shrink-0 text-[12px] font-bold text-ink-muted">
                        {p.key === "pinned" ? "Adjust" : "Edit"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {farKm >= 2 && (
              <div className="mt-2.5 rounded-2xl bg-marigold-light px-3 py-2.5 text-[12.5px] text-[#6B4600]">
                This address is {farKm.toFixed(1)} km from where you are now.{" "}
                {location && (
                  <button onClick={() => setPlaceKey("current")} className="font-bold text-brand">
                    Use current location
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand/50 bg-brand-light/40 py-2.5 text-[13px] font-bold text-brand"
            >
              <CrosshairIcon width={15} height={15} /> Pin the exact spot on the map
            </button>
            <label className="mt-3 block">
              <span className="text-[13px] font-bold text-ink">House / flat / landmark</span>
              <input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value.slice(0, 120))}
                placeholder="e.g. H.No 14, 2nd floor, near the park"
                maxLength={120}
                className="mt-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-brand"
              />
            </label>
            {unavailable.length > 0 && (
              <p className="mt-2 rounded-xl bg-marigold-light px-3 py-2 text-[12.5px] font-medium text-[#6B4600]">
                {unavailable.map((l) => l.service.name).join(", ")} {unavailable.length > 1 ? "aren't" : "isn't"} available at PIN {bookingPin}. Choose another address or remove{" "}
                {unavailable.length > 1 ? "them" : "it"}.
              </p>
            )}
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-mist px-3 py-3">
              <span className="flex items-center gap-2.5">
                <UserPlusIcon width={20} height={20} className="flex-shrink-0 text-brand" />
                <span className="flex flex-col">
                  <span className="text-[14px] font-bold text-ink">Booking for someone else?</span>
                  <span className="text-[12px] text-ink-muted">The pro will call them, not you</span>
                </span>
              </span>
              <input type="checkbox" checked={forSomeone} onChange={(e) => setForSomeone(e.target.checked)} className="peer sr-only" />
              <span className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${forSomeone ? "bg-brand" : "bg-[#C9C4D9]"}`}>
                <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all ${forSomeone ? "left-[23px]" : "left-[3px]"}`} />
              </span>
            </label>
            {forSomeone && (
              <div className="mt-2 grid animate-fade-up grid-cols-2 gap-2">
                <input
                  value={contact.name}
                  onChange={(e) => setContact((c) => ({ ...c, name: e.target.value.slice(0, 60) }))}
                  placeholder="Their name"
                  className="rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
                />
                <input
                  value={contact.phone}
                  onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value.replace(/[^\d+ ]/g, "").slice(0, 15) }))}
                  inputMode="tel"
                  placeholder="Mobile number"
                  className="rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
                />
              </div>
            )}
          </div>

          {/* savings: tap to apply */}
          <div className="overflow-hidden rounded-[20px] bg-white shadow-card">
            <div className="flex items-center justify-between bg-brand-light px-4 py-3">
              <span className="font-display text-[16px] font-extrabold text-brand-night">Savings for this booking</span>
              <TagIcon width={20} height={20} className="text-brand" />
            </div>
            {appliedOffer && (
              <div className="flex items-center gap-2.5 border-b border-dashed border-line px-4 py-3">
                <span className="flex h-6 w-6 flex-shrink-0 animate-pop items-center justify-center rounded-full bg-trust">
                  <CheckIcon width={13} height={13} stroke="#fff" strokeWidth={3.4} />
                </span>
                <span className="flex flex-1 flex-col">
                  <b className="text-[14px] text-trust-dark">
                    {inr(offerDiscount)} saved with {appliedOffer.code}
                  </b>
                  {appliedOffer.description && <span className="text-[12px] text-ink-muted">{appliedOffer.description}</span>}
                </span>
                <button onClick={clearOffer} className="text-[12.5px] font-bold text-ink-muted">
                  Remove
                </button>
              </div>
            )}
            {offers
              .filter((o) => o.code !== appliedOffer?.code)
              .slice(0, 4)
              .map((o) => {
                const base = offerBase(o, offerLines);
                const short = o.minOrder > base ? o.minOrder - base : 0;
                return (
                  <div key={o.code} className="flex items-center gap-3 border-b border-dashed border-line px-4 py-3 last:border-0">
                    <span className="flex flex-1 flex-col">
                      <b className="text-[14px] text-ink">
                        Save {inr(short > 0 ? 0 : offerSaving(o, offerLines))} with {o.code}
                      </b>
                      <span className="text-[12px] text-ink-muted">
                        {o.providerName ? `${o.providerName} · ` : ""}
                        {short > 0 ? `Add ${inr(short)} more to use it` : o.description || `${o.discountPercent}% off this booking`}
                      </span>
                    </span>
                    <button
                      onClick={() => applyCode(o.code)}
                      disabled={short > 0 || !!applyingCoupon}
                      className="rounded-xl border-[1.5px] border-brand px-3 py-1.5 text-[12.5px] font-extrabold text-brand disabled:border-line disabled:text-ink-muted"
                    >
                      {applyingCoupon === o.code ? "…" : appliedOffer ? "SWITCH" : "APPLY"}
                    </button>
                  </div>
                );
              })}
            <div className="px-4 py-3">
              {showCodeBox ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter a code"
                    className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 text-[14px] uppercase text-ink outline-none focus:border-brand"
                  />
                  <button onClick={() => applyCode(couponInput.trim())} disabled={!couponInput.trim() || !!applyingCoupon} className="rounded-xl bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">
                    {applyingCoupon ? "Checking…" : "Apply"}
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowCodeBox(true)} className="text-[13px] font-bold text-brand">
                  Have a code? Enter it
                </button>
              )}
              {offerError && <p className="mt-1.5 text-[12px] font-semibold text-accent-red">{offerError}</p>}
            </div>
          </div>

          {isFirstOrder && (
            <div className={card}>
              <p className="text-[14px] font-bold text-ink">Got a friend's referral code?</p>
              {appliedReferral ? (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-trust-light px-3 py-2.5">
                  <p className="text-[13px] font-bold text-trust-dark">
                    {appliedReferral.code} applied — {inr(appliedReferral.discount)} off
                  </p>
                  <button
                    onClick={() => {
                      setAppliedReferral(null);
                      setReferralInput("");
                    }}
                    className="text-[12.5px] font-bold text-trust-dark"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={referralInput}
                      onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                      placeholder="Referral code"
                      className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5 text-[14px] uppercase text-ink outline-none focus:border-brand"
                    />
                    <button onClick={handleApplyReferral} disabled={!referralInput.trim() || applyingReferral} className="rounded-xl bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">
                      {applyingReferral ? "Checking…" : "Apply"}
                    </button>
                  </div>
                  {referralError && <p className="mt-1.5 text-[12px] font-semibold text-accent-red">{referralError}</p>}
                </>
              )}
            </div>
          )}
        </div>

        {/* bill, payment, policy + confirm (a sticky summary on desktop) */}
        <div className="flex flex-col gap-3 px-4 pb-4 lg:sticky lg:top-6 lg:px-0">
          <div className={`${card} space-y-2.5 text-[14px] tabular`}>
            <p className={h2}>Bill</p>
            <Row label={`Services (${lines.reduce((n, l) => n + qtyOf(l), 0)})`} value={inr(total)} />
            {savings > 0 && <Row label="You already save" value={inr(savings)} tone="good" muted />}
            {offerDiscount > 0 && <Row label={`Offer ${appliedOffer.code}`} value={`−${inr(offerDiscount)}`} tone="good" />}
            {referralDiscount > 0 && <Row label="Referral" value={`−${inr(referralDiscount)}`} tone="good" />}
            {creditDiscount > 0 && <Row label="Tikdum credits" value={`−${inr(creditDiscount)}`} tone="good" />}
            <div className="flex justify-between border-t border-dashed border-line pt-2.5 text-[16px] font-extrabold text-ink">
              <span>To pay</span>
              <span key={payable} className="animate-bump">
                {inr(payable)}
              </span>
            </div>
          </div>

          <div className={card}>
            <p className={h2}>How you'll pay</p>
            {referral && referral.balance > 0 && (
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-marigold-light px-3 py-3">
                <span className="flex flex-col">
                  <span className="text-[14px] font-bold text-ink">Use Tikdum credits</span>
                  <span className="text-[12px] text-ink-muted">{inr(referral.balance)} from referrals</span>
                </span>
                <input type="checkbox" checked={useCredits} onChange={(e) => setUseCredits(e.target.checked)} className="sr-only" />
                <span className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${useCredits ? "bg-brand" : "bg-[#C9C4D9]"}`}>
                  <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white transition-all ${useCredits ? "left-[23px]" : "left-[3px]"}`} />
                </span>
              </label>
            )}
            <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-brand px-3 py-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-trust-light text-trust">
                <CashIcon width={20} height={20} />
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-[14px] font-bold text-ink">Pay after service</span>
                <span className="text-[12px] text-ink-muted">Cash or UPI to the professional when the job is done</span>
              </span>
              <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 border-brand">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" />
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 px-1">
            <SectionLabel>Cancellation</SectionLabel>
            <p className="flex gap-2 text-[12.5px] leading-relaxed text-ink-muted">
              <ShieldCheckIcon width={16} height={16} className="mt-0.5 flex-shrink-0 text-trust" />
              Free cancellation until the professional starts the work. They start only after you share your OTP.
            </p>
          </div>
          <div className="h-20 lg:hidden" />
        </div>
      </div>

      {/* confirm bar */}
      <div className="sticky bottom-0 z-20 mt-auto bg-white px-4 pb-4 pt-2.5 shadow-[0_-8px_24px_rgba(27,21,48,0.08)] lg:static lg:mx-auto lg:mb-10 lg:w-full lg:max-w-6xl lg:rounded-2xl lg:px-8">
        {nudge && (
          <p className="mb-2 flex items-center gap-2 rounded-xl bg-marigold-light px-3 py-2 text-[12.5px] font-semibold text-[#6B4600]">
            <TagIcon width={15} height={15} className="flex-shrink-0" />
            Add {inr(nudge.minOrder - total)} more to use {nudge.code} ({nudge.discountPercent}% off)
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[11.5px] text-ink-muted">Pay after service</span>
            <span className="font-display text-[21px] font-extrabold text-ink tabular">{inr(payable)}</span>
          </div>
          <button
            onClick={handleCheckout}
            disabled={submitting || !bookingAddress || unavailable.length > 0 || checkingAvailability || !contactOk || !timeOk}
            className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-brand px-3 text-[15px] font-bold text-white shadow-cta active:scale-[0.98] disabled:bg-ink-muted disabled:shadow-none"
          >
            {submitting
              ? "Booking…"
              : !bookingAddress
                ? "Choose where they should come"
                : checkingAvailability
                  ? "Checking availability…"
                  : unavailable.length > 0
                    ? "Not available at this address"
                    : !contactOk
                      ? "Add their name and number"
                      : !timeOk
                        ? "Choose a time"
                      : `Confirm · ${whenLabel}`}
          </button>
        </div>
      </div>

      {picking && (
        <Suspense fallback={null}>
          <LocationPicker
            initial={pinned}
            onClose={() => setPicking(false)}
            onConfirm={(loc) => {
              setPinned(loc);
              setPlaceKey("pinned");
              setPicking(false);
            }}
          />
        </Suspense>
      )}

      {repeatAsk && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => e.target === e.currentTarget && setRepeatAsk(null)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="repeat-title">
            <h2 id="repeat-title" className="text-[16px] font-bold text-ink">Already booked</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{repeatAsk.question}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">Book again only if you need a second visit — for example, at another address.</p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => navigate(repeatAsk.repeats?.[0]?.id ? `/booking/${repeatAsk.repeats[0].id}` : "/bookings")}
                className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white"
              >
                View my booking
              </button>
              <button onClick={() => placeOrder(true)} disabled={submitting} className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-ink-soft disabled:opacity-50">
                Yes, book again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone, muted }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-ink-muted" : "text-ink-soft"}>{label}</span>
      <span className={tone === "good" ? "font-semibold text-trust" : "font-semibold text-ink"}>{value}</span>
    </div>
  );
}
