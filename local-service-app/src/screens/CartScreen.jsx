import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import { timeSlots } from "../data/mockData";
import ScreenHeader from "../components/ScreenHeader";
import { CalendarIcon, ClockIcon, MapPinIcon, XIcon } from "../components/icons";
import { discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";
import AddOns from "../components/AddOns";

// The map (Leaflet) is only needed when a customer opens it, so it loads on demand.
const LocationPicker = lazy(() => import("../components/LocationPicker"));

export default function CartScreen() {
  const navigate = useNavigate();
  const {
    cart,
    services,
    bookings,
    getService,
    updateCartItem,
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
  const [submitting, setSubmitting] = useState(false);
  const [placeKey, setPlaceKey] = useState(null);
  const [landmark, setLandmark] = useState("");
  const [pinned, setPinned] = useState(null); // an exact spot chosen on the map
  const [picking, setPicking] = useState(false);
  const [availability, setAvailability] = useState(null); // { pin, ids: Set } for the chosen PIN
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [referralInput, setReferralInput] = useState("");
  const [appliedReferral, setAppliedReferral] = useState(null);
  const [referralError, setReferralError] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [useCredits, setUseCredits] = useState(false);

  const isFirstOrder = bookings.length === 0;

  useEffect(() => {
    if (referral === null) refreshReferral();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = useMemo(
    () => cart.map((item) => ({ item, service: getService(item.serviceId) })).filter((l) => l.service),
    [cart, services, getService]
  );
  const total = lines.reduce((sum, l) => sum + l.service.price, 0);
  const savings = lines.reduce((sum, l) => sum + (l.service.originalPrice ? l.service.originalPrice - l.service.price : 0), 0);
  const offerDiscount = appliedOffer ? Math.round(total * (appliedOffer.discountPercent / 100)) : 0;
  const referralDiscount = appliedReferral ? appliedReferral.discount : 0;
  const creditDiscount = useCredits && referral ? Math.min(referral.balance, total - offerDiscount - referralDiscount) : 0;
  const discountAmount = offerDiscount + referralDiscount + creditDiscount;
  const payable = Math.max(0, total - discountAmount);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || applyingCoupon) return;
    setApplyingCoupon(true);
    try {
      await applyOfferCode(couponInput.trim());
    } catch (e) {
      // offerError is already set by the context; nothing else to do here.
    } finally {
      setApplyingCoupon(false);
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

  const handleCheckout = async () => {
    if (submitting || lines.length === 0 || !bookingAddress || unavailable.length > 0 || checkingAvailability) return;
    setSubmitting(true);
    try {
      const created = await checkout(bookingAddress, {
        referralCode: appliedReferral?.code,
        useCredits: creditDiscount > 0,
        serviceIds: lines.map((l) => l.service.id),
      });
      navigate("/bookings", { replace: true, state: { orderId: created[0]?.orderId } });
    } catch (e) {
      showToast(e.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader title="Your Cart" maxWidth="lg:max-w-6xl" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="text-4xl">🛒</span>
          <p className="text-sm font-medium text-gray-700">Your cart is empty</p>
          <p className="text-xs text-gray-400">Add a service to get started.</p>
          <button
            onClick={() => navigate("/categories")}
            className="mt-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-card"
          >
            Browse Services
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col lg:pt-4">
      <ScreenHeader title="Your Cart" subtitle={`${lines.length} service${lines.length > 1 ? "s" : ""}`} maxWidth="lg:max-w-6xl" />

      {/* Desktop: items and checkout details on the left, a sticky order summary on the right. */}
      <div className="flex flex-1 flex-col lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10 lg:px-8 lg:pb-16">
      <div className="flex-1 space-y-3 px-4 pb-6 lg:space-y-5 lg:px-0 lg:pb-0">
        {lines.map(({ item, service }) => (
          <div
            key={item.serviceId}
            className={`rounded-2xl border p-3 shadow-card lg:bg-white lg:p-5 ${unavailableIds.has(service.id) ? "border-amber-300" : "border-gray-100"}`}
          >
            <div className="flex items-start gap-3">
              <CategoryIcon categoryId={service.categoryId} imageUrl={service.imageUrl} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-gray-900">{service.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-brand">₹{service.price}</span>
                  {discountPct(service.price, service.originalPrice) > 0 && (
                    <span className="text-[11px] text-gray-400 line-through">₹{service.originalPrice}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeFromCart(item.serviceId)}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-500"
                aria-label={`Remove ${service.name}`}
              >
                <XIcon width={14} height={14} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2">
                <CalendarIcon width={14} height={14} className="flex-shrink-0 text-gray-400" />
                <input
                  type="date"
                  value={item.date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => updateCartItem(item.serviceId, { date: e.target.value })}
                  className="w-full bg-transparent text-[12px] text-gray-800 outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-2">
                <ClockIcon width={14} height={14} className="flex-shrink-0 text-gray-400" />
                <select
                  value={item.time}
                  onChange={(e) => updateCartItem(item.serviceId, { time: e.target.value })}
                  className="w-full bg-transparent text-[12px] text-gray-800 outline-none"
                >
                  {timeSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <textarea
              value={item.issue}
              onChange={(e) => updateCartItem(item.serviceId, { issue: e.target.value })}
              placeholder="Describe your issue (optional)..."
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-gray-200 px-2.5 py-2 text-[12px] text-gray-800 outline-none placeholder:text-gray-400"
            />
          </div>
        ))}

        <AddOns anchorIds={lines.map((l) => l.service.id)} title="Add more services" subtitle="From the same provider — done in the same visit" />

        <div className="lg:rounded-2xl lg:bg-white lg:p-5 lg:shadow-card">
          <h2 className="mb-1.5 text-[13px] font-semibold text-gray-900 lg:mb-3 lg:text-[16px] lg:font-bold">Where do you need the service?</h2>
          <div className="space-y-2">
            {places.map((p) => {
              const selected = chosenKey === p.key && !!p.data;
              const isCurrent = p.key === "current";
              return (
                <div
                  key={p.key}
                  className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                    selected ? "border-brand bg-brand-light/30" : "border-gray-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => (p.data ? setPlaceKey(p.key) : isCurrent ? detectLocation() : navigate(`/address?slot=${p.key}`))}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    aria-pressed={selected}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-brand" : "border-gray-300"
                      }`}
                    >
                      {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                        <MapPinIcon width={13} height={13} className="flex-shrink-0 text-gray-400" />
                        {p.title}
                        {p.data?.pincode && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                            PIN {p.data.pincode}
                          </span>
                        )}
                      </span>
                      {p.data ? (
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-gray-500">{p.data.line}</span>
                      ) : isCurrent ? (
                        <span className="mt-0.5 block text-[11.5px] font-medium text-amber-600">
                          {locationStatus === "detecting"
                            ? "Detecting…"
                            : locationStatus === "denied"
                              ? "Location access denied — enable it in your device settings, then tap here."
                              : "Tap to detect where you are now"}
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[11.5px] font-medium text-brand">+ Add {p.title} address</span>
                      )}
                    </span>
                  </button>
                  {isCurrent && p.data && (
                    <button type="button" onClick={detectLocation} className="flex-shrink-0 text-[11.5px] font-semibold text-brand">
                      {locationStatus === "detecting" ? "Detecting…" : "Refresh"}
                    </button>
                  )}
                  {!isCurrent && p.data && (
                    <button
                      type="button"
                      onClick={() => (p.key === "pinned" ? setPicking(true) : navigate(`/address?slot=${p.key}`))}
                      className="flex-shrink-0 text-[11.5px] font-semibold text-gray-400"
                    >
                      {p.key === "pinned" ? "Adjust" : "Edit"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand-light/30 py-2.5 text-[12.5px] font-semibold text-brand hover:bg-brand-light/60"
          >
            <MapPinIcon width={14} height={14} /> Pin exact location on map
          </button>
          <div className="mt-2.5">
            <label className="mb-1 block text-[12px] font-semibold text-gray-700">
              House / flat / landmark <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value.slice(0, 120))}
              placeholder="e.g. House 14, near Jama Masjid, 2nd floor"
              maxLength={120}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-brand"
            />
            <p className="mt-1 text-[11px] text-gray-400">Helps the provider find you. They'll see it with your address.</p>
          </div>
          {unavailable.length > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] font-medium text-amber-700">
              {unavailable.map((l) => l.service.name).join(", ")} {unavailable.length > 1 ? "aren't" : "isn't"} available at PIN{" "}
              {bookingPin}. Choose another location or remove {unavailable.length > 1 ? "them" : "it"} from your cart.
            </p>
          )}
        </div>

        <div className="lg:rounded-2xl lg:bg-white lg:p-5 lg:shadow-card">
          <h2 className="mb-1.5 text-[13px] font-semibold text-gray-900 lg:mb-3 lg:text-[16px] lg:font-bold">Offer Code</h2>
          {appliedOffer ? (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
              <div>
                <p className="text-[12.5px] font-semibold text-emerald-700">
                  {appliedOffer.code} applied — {appliedOffer.discountPercent}% off
                </p>
                {appliedOffer.description && <p className="text-[11px] text-emerald-600">{appliedOffer.description}</p>}
              </div>
              <button onClick={clearOffer} className="text-[11.5px] font-semibold text-emerald-700 underline">
                Remove
              </button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter offer code"
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] uppercase text-gray-800 outline-none focus:border-brand"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={!couponInput.trim() || applyingCoupon}
                  className="flex-shrink-0 rounded-xl bg-gray-900 px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {applyingCoupon ? "Checking…" : "Apply"}
                </button>
              </div>
              {offerError && <p className="mt-1.5 text-[11.5px] font-medium text-red-500">{offerError}</p>}
            </div>
          )}
        </div>

        {isFirstOrder && (
          <div className="lg:rounded-2xl lg:bg-white lg:p-5 lg:shadow-card">
            <h2 className="mb-1.5 text-[13px] font-semibold text-gray-900 lg:mb-3 lg:text-[16px] lg:font-bold">Referral Code</h2>
            {appliedReferral ? (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
                <p className="text-[12.5px] font-semibold text-emerald-700">
                  {appliedReferral.code} applied — ₹{appliedReferral.discount} off
                </p>
                <button
                  onClick={() => {
                    setAppliedReferral(null);
                    setReferralInput("");
                  }}
                  className="text-[11.5px] font-semibold text-emerald-700 underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    value={referralInput}
                    onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                    placeholder="Have a friend's referral code?"
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] uppercase text-gray-800 outline-none focus:border-brand"
                  />
                  <button
                    onClick={handleApplyReferral}
                    disabled={!referralInput.trim() || applyingReferral}
                    className="flex-shrink-0 rounded-xl bg-gray-900 px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                  >
                    {applyingReferral ? "Checking…" : "Apply"}
                  </button>
                </div>
                {referralError && <p className="mt-1.5 text-[11.5px] font-medium text-red-500">{referralError}</p>}
              </div>
            )}
          </div>
        )}

        {referral && referral.balance > 0 && (
          <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3.5 py-3 lg:bg-white lg:px-5 lg:py-4">
            <span className="text-[12.5px] font-medium text-gray-700">
              Use your ₹{referral.balance} referral credit
            </span>
            <input
              type="checkbox"
              checked={useCredits}
              onChange={(e) => setUseCredits(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
          </label>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3 lg:sticky lg:top-6 lg:rounded-2xl lg:border lg:p-6 lg:shadow-card">
        <h2 className="mb-4 hidden text-[18px] font-extrabold text-gray-900 lg:block">Order summary</h2>
        <div className="mb-2.5 flex items-center justify-between text-[12.5px]">
          <span className="text-gray-500">Subtotal ({lines.length} item{lines.length > 1 ? "s" : ""})</span>
          <span className="font-semibold text-gray-800">₹{total}</span>
        </div>
        {savings > 0 && (
          <div className="mb-2.5 flex items-center justify-between text-[12.5px]">
            <span className="text-emerald-600">You save</span>
            <span className="font-semibold text-emerald-600">₹{savings}</span>
          </div>
        )}
        {offerDiscount > 0 && (
          <div className="mb-2.5 flex items-center justify-between text-[12.5px]">
            <span className="text-emerald-600">{appliedOffer.code} discount</span>
            <span className="font-semibold text-emerald-600">-₹{offerDiscount}</span>
          </div>
        )}
        {referralDiscount > 0 && (
          <div className="mb-2.5 flex items-center justify-between text-[12.5px]">
            <span className="text-emerald-600">Referral discount</span>
            <span className="font-semibold text-emerald-600">-₹{referralDiscount}</span>
          </div>
        )}
        {creditDiscount > 0 && (
          <div className="mb-2.5 flex items-center justify-between text-[12.5px]">
            <span className="text-emerald-600">Referral credit used</span>
            <span className="font-semibold text-emerald-600">-₹{creditDiscount}</span>
          </div>
        )}
        <button
          onClick={handleCheckout}
          disabled={submitting || !bookingAddress || unavailable.length > 0 || checkingAvailability}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
        >
          {submitting
            ? "Placing order..."
            : !bookingAddress
              ? "Choose a location to continue"
              : checkingAvailability
                ? "Checking availability…"
                : unavailable.length > 0
                  ? "Not available at this location"
                  : `Checkout · ₹${payable}`}
        </button>
        <p className="mt-2 text-center text-[10.5px] text-gray-400">
          You won't be charged now. Payment after service completion.
        </p>
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
    </div>
  );
}
