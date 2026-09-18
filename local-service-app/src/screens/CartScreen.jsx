import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { timeSlots } from "../data/mockData";
import ScreenHeader from "../components/ScreenHeader";
import { CalendarIcon, ClockIcon, MapPinIcon, XIcon } from "../components/icons";
import { discountPct } from "../utils/format";
import CategoryIcon from "../components/CategoryIcon";

export default function CartScreen() {
  const navigate = useNavigate();
  const {
    cart,
    services,
    getService,
    updateCartItem,
    removeFromCart,
    checkout,
    appliedOffer,
    offerError,
    applyOfferCode,
    clearOffer,
    showToast,
    location,
    locationStatus,
    detectLocation,
  } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const lines = useMemo(
    () => cart.map((item) => ({ item, service: getService(item.serviceId) })).filter((l) => l.service),
    [cart, services, getService]
  );
  const total = lines.reduce((sum, l) => sum + l.service.price, 0);
  const savings = lines.reduce((sum, l) => sum + (l.service.originalPrice ? l.service.originalPrice - l.service.price : 0), 0);
  const discountAmount = appliedOffer ? Math.round(total * (appliedOffer.discountPercent / 100)) : 0;
  const payable = total - discountAmount;

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
  const bookingAddress = location
    ? { label: location.label, line: location.line, lat: location.lat, lng: location.lng }
    : null;

  const handleCheckout = async () => {
    if (submitting || lines.length === 0 || !bookingAddress) return;
    setSubmitting(true);
    try {
      const created = await checkout(bookingAddress);
      navigate("/bookings", { replace: true, state: { orderId: created[0]?.orderId } });
    } catch (e) {
      showToast("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader title="Your Cart" maxWidth="lg:max-w-2xl" />
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
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Your Cart" subtitle={`${lines.length} service${lines.length > 1 ? "s" : ""}`} maxWidth="lg:max-w-2xl" />

      <div className="flex-1 space-y-3 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        {lines.map(({ item, service }) => (
          <div key={item.serviceId} className="rounded-2xl border border-gray-100 p-3 shadow-card">
            <div className="flex items-start gap-3">
              <CategoryIcon categoryId={service.categoryId} size={48} />
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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-gray-900">Delivery Address</h2>
            <button onClick={detectLocation} className="text-xs font-semibold text-brand">
              {locationStatus === "detecting" ? "Detecting…" : "Use current location"}
            </button>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-gray-200 px-3 py-2.5">
            <MapPinIcon width={16} height={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            {bookingAddress ? (
              <div>
                <p className="text-[13px] font-semibold text-gray-800">{bookingAddress.label}</p>
                <p className="text-[11.5px] leading-snug text-gray-500">{bookingAddress.line}</p>
              </div>
            ) : (
              <div>
                <p className="text-[13px] font-medium text-amber-600">
                  {locationStatus === "denied"
                    ? "Location access denied — enable it in your browser/device settings, then tap \"Use current location\"."
                    : "No address set yet — tap \"Use current location\" above to continue."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-1.5 text-[13px] font-semibold text-gray-900">Offer Code</h2>
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
      </div>

      <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:py-4">
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
        {discountAmount > 0 && (
          <div className="mb-2.5 flex items-center justify-between text-[12.5px]">
            <span className="text-emerald-600">{appliedOffer.code} discount</span>
            <span className="font-semibold text-emerald-600">-₹{discountAmount}</span>
          </div>
        )}
        <button
          onClick={handleCheckout}
          disabled={submitting || !bookingAddress}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-dark active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? "Placing order..." : !bookingAddress ? "Set your location to continue" : `Checkout · ₹${payable}`}
        </button>
        <p className="mt-2 text-center text-[10.5px] text-gray-400">
          You won't be charged now. Payment after service completion.
        </p>
      </div>
    </div>
  );
}
