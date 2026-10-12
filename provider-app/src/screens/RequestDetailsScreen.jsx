import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { api, SERVER_URL } from "../api";
import { MapPinIcon, PhoneIcon, CameraIcon, CheckIcon, BackIcon, ChatIcon, NavigateIcon } from "../components/icons";
import { Card, inr, initials, whenLabel, JOB_STATUS } from "../components/biz";
import { compressImage } from "../utils/imageCompress";

const LOCATION_TRACKED_STATUSES = ["Pending", "Accepted", "In Progress"];

export default function RequestDetailsScreen() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { getRequest, requests, acceptRequest, rejectRequest, swapRequest, showToast, can, staff, setRequestAssignee } = useApp();
  const request = getRequest(requestId);
  const [liveLocation, setLiveLocation] = useState(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const canAct = can("orders.act");
  // Whether swapping is on and which reasons to offer are set by the Super
  // Admin (Business Rules), so they're read from the server; the built-in
  // reasons below are only the fallback if that can't be reached.
  const [swapRules, setSwapRules] = useState(null);
  useEffect(() => {
    if (request?.status === "Accepted") api.getSwapRules().then(setSwapRules).catch(() => {});
  }, [request?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the customer's real-time position every 30s (matching how often
  // they report it) so directions target where they actually are.
  useEffect(() => {
    setLiveLocation(null);
    if (!request || !LOCATION_TRACKED_STATUSES.includes(request.status)) return;
    let cancelled = false;
    const poll = () => {
      api
        .getBookingLiveLocation(request.id)
        .then((loc) => {
          if (!cancelled) setLiveLocation(loc);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [request?.id, request?.status]);

  if (!request) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-500">Request not found.</p>
        <button onClick={() => navigate("/dashboard")} className="text-sm font-semibold text-brand-dark">
          Back to orders
        </button>
      </div>
    );
  }

  const customer = request.customer;
  // One request: every service of this order that was booked with this provider.
  const siblings = request.orderId ? requests.filter((r) => r.orderId === request.orderId && r.id !== request.id) : [];
  const requestTotal = siblings.reduce((sum, r) => sum + (r.amount || 0), request.amount || 0);

  const steps = ["Accepted", "On the way", "Started", "Done"];
  const stepIndex = { Pending: -1, Accepted: 0, "In Progress": 2, Completed: 3 }[request.status] ?? -1;
  const headline =
    request.status === "Pending"
      ? { eyebrow: "New request", title: whenLabel(request.date, request.time), tone: "text-marigold" }
      : request.status === "Accepted"
        ? { eyebrow: "Confirmed", title: `Ask ${firstName(customer?.name)} for the start code`, tone: "text-brand-glow" }
        : request.status === "In Progress"
          ? { eyebrow: "Working", title: "Finish, then ask for the completion code", tone: "text-go" }
          : request.status === "Completed"
            ? { eyebrow: "Done", title: "Job finished", tone: "text-go" }
            : { eyebrow: JOB_STATUS[request.status]?.label || request.status, title: request.service?.name || "Request", tone: "text-red-400" };
  const lat = liveLocation?.lat ?? request.address?.lat;
  const lng = liveLocation?.lng ?? request.address?.lng;
  const mapsUrl = lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null;
  const live = ["Accepted", "In Progress"].includes(request.status);
  const lines = [request, ...siblings];

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pt-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        <button onClick={() => navigate(-1)} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink">
          <BackIcon width={20} height={20} />
        </button>
        <span className="text-[13px] font-semibold text-ink-muted">Job #{request.ref || request.id.slice(0, 8)}</span>
        <button onClick={() => navigate("/profile/help")} className="h-11 rounded-full bg-card px-4 text-[13.5px] font-bold text-ink">
          Help
        </button>
      </div>

      <div className="flex-1 space-y-3 px-4 pb-6 pt-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div>
          <p className={`text-[12px] font-extrabold uppercase tracking-[0.12em] ${headline.tone}`}>{headline.eyebrow}</p>
          <h1 className="mt-1 font-display text-[26px] font-extrabold leading-[1.1] text-ink">{headline.title}</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {whenLabel(request.date, request.time)} · {lines.length} service{lines.length === 1 ? "" : "s"}
          </p>
        </div>

        {stepIndex >= 0 && (
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            {steps.map((s, i) => (
              <span key={s} className="flex flex-col gap-1.5">
                <span className={`h-[5px] rounded-full ${i < stepIndex || stepIndex === 3 ? "bg-go" : i === stepIndex ? "bg-ink" : "bg-gray-200"}`} />
                <span className={`text-[11.5px] font-bold ${i <= stepIndex ? "text-ink" : "text-ink-muted"}`}>{s}</span>
              </span>
            ))}
          </div>
        )}

        {!["Pending", "Rejected", "Cancelled", "Swapped", "Completed"].includes(request.status) && canAct && (
          <OtpVerifyCard bookingId={request.id} type={request.status === "Accepted" ? "start" : "complete"} />
        )}

        {/* customer */}
        <Card className="space-y-3.5 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-marigold font-display text-[18px] font-extrabold text-marigold-ink">
              {initials(customer?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-extrabold text-ink">{customer?.name || "Customer"}</p>
              {live && customer?.phone && <p className="text-[12.5px] text-ink-muted">{customer.phone}</p>}
            </div>
          </div>
          {live && (
            <div className="grid grid-cols-3 gap-2">
              {customer?.phone ? (
                <a href={`tel:${customer.phone}`} className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-raised text-[13.5px] font-bold text-ink">
                  <PhoneIcon width={17} height={17} /> Call
                </a>
              ) : (
                <span />
              )}
              {can("messages.use") ? (
                <button onClick={() => navigate(`/chat/${request.id}`)} className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-raised text-[13.5px] font-bold text-ink">
                  <ChatIcon width={17} height={17} /> Chat
                </button>
              ) : (
                <span />
              )}
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-raised text-[13.5px] font-bold text-ink">
                  <NavigateIcon width={17} height={17} /> Map
                </a>
              ) : (
                <span />
              )}
            </div>
          )}
          <div className="flex gap-2.5 border-t border-dashed border-gray-200 pt-3">
            <MapPinIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-brand-dark" />
            <div className="min-w-0">
              <p className="text-[14px] font-bold leading-snug text-ink">{request.address?.line || request.address?.label}</p>
              {request.address?.label && request.address?.line && <p className="text-[12.5px] text-ink-muted">{request.address.label}</p>}
              {liveLocation && live && (
                <p className="mt-0.5 text-[11.5px] font-semibold text-go-soft">
                  Directions use the customer's live location{typeof liveLocation.accuracy === "number" ? ` (±${Math.round(liveLocation.accuracy)} m)` : ""}
                </p>
              )}
            </div>
          </div>
        </Card>

        {(request.contact || request.issue) && (
          <Card className="space-y-3 p-4">
            {request.contact && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Person at the address</p>
                  <p className="truncate text-[14.5px] font-bold text-ink">
                    {request.contact.name}
                    {live ? ` · ${request.contact.phone}` : ""}
                  </p>
                </div>
                {live && (
                  <a href={`tel:${request.contact.phone}`} aria-label="Call the person at the address" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-raised text-ink">
                    <PhoneIcon width={17} height={17} />
                  </a>
                )}
              </div>
            )}
            {request.issue && <p className="rounded-2xl bg-raised px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-soft">“{request.issue}”</p>}
          </Card>
        )}

        {/* what to do */}
        <Card className="space-y-3.5 p-4">
          <h2 className="font-display text-[18px] font-bold text-ink">What to do</h2>
          {lines.map((r) => (
            <button key={r.id} onClick={() => r.id !== request.id && navigate(`/requests/${r.id}`)} className="flex w-full justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-ink">{r.service?.name}</span>
                {r.options?.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.options.map((o) => (
                      <span key={`${o.group}-${o.choice}`} className="rounded-lg bg-raised px-2 py-0.5 text-[12px] font-semibold text-brand-dark">
                        {o.choice}
                        {o.price ? ` +₹${o.price}` : ""}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="flex-shrink-0 text-[15px] font-extrabold text-ink tabular">{inr(r.amount)}</span>
            </button>
          ))}
          {siblings.length > 0 && <p className="text-[12px] text-ink-muted">One code starts and finishes all of these together.</p>}
        </Card>

        {!["Rejected", "Cancelled", "Swapped"].includes(request.status) &&
          (request.assignedStaff || (can("orders.assign") && request.status !== "Completed")) && (
            <Card className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Assigned to</p>
                <p className="truncate text-[14.5px] font-bold text-ink">{request.assignedStaff?.name || "Not assigned yet"}</p>
              </div>
              {can("orders.assign") && request.status !== "Completed" && (
                <button onClick={() => setAssignOpen(true)} className="h-11 rounded-2xl border border-gray-300 px-4 text-[13.5px] font-bold text-ink">
                  {request.assignedStaff ? "Change" : "Assign"}
                </button>
              )}
            </Card>
          )}

        {["Accepted", "In Progress", "Completed"].includes(request.status) && <JobCheckpoints bookingId={request.id} locked={request.status === "Completed"} />}
        {["Accepted", "In Progress", "Completed"].includes(request.status) && <JobPhotos bookingId={request.id} />}

        {/* money for this job */}
        <Card className="space-y-2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-extrabold text-ink">{request.status === "Completed" ? "Collected from customer" : "Collect after the job"}</span>
            <span className="font-display text-[24px] font-extrabold text-ink tabular">{inr(requestTotal)}</span>
          </div>
          <p className="text-[12.5px] text-ink-muted">Cash or UPI, paid to you. Tikdum's fee comes out of your wallet when the job is finished.</p>
        </Card>

        {request.status === "Swapped" && (
          <p className="rounded-2xl bg-card px-4 py-3 text-center text-[12.5px] text-ink-muted">
            You passed this order to another provider{request.swapReason ? ` (${request.swapReason})` : ""}. It's kept here for your records.
          </p>
        )}

        {request.status === "Accepted" && canAct && swapRules?.enabled !== false && (
          <button onClick={() => setSwapOpen(true)} className="h-12 w-full rounded-2xl border border-amber-300 text-[14px] font-bold text-amber-700">
            Can't do it? Pass to another pro
          </button>
        )}
      </div>

      {swapOpen && (
        <SwapOrderModal
          reasons={swapRules?.reasons?.map((r) => [r.key, r.label])}
          serviceName={request.service?.name}
          onClose={() => setSwapOpen(false)}
          onConfirm={async (data) => {
            await swapRequest(request.id, data);
            setSwapOpen(false);
            navigate("/dashboard");
          }}
        />
      )}

      {assignOpen && (
        <AssignOrderModal
          request={request}
          onClose={() => setAssignOpen(false)}
          onAssigned={(assignedStaff) => {
            setRequestAssignee(request.id, assignedStaff);
            setAssignOpen(false);
            showToast(assignedStaff ? `Assigned to ${assignedStaff.name}` : "Assignment cleared");
          }}
        />
      )}

      {request.status === "Pending" && canAct && (
        <div className="sticky bottom-0 grid flex-shrink-0 grid-cols-[1fr_2fr] gap-2.5 border-t border-gray-100 bg-ground px-4 py-3 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:py-4">
          <button
            onClick={() => {
              rejectRequest(request.id);
              navigate(-1);
            }}
            className="h-[52px] rounded-2xl border-[1.5px] border-gray-300 text-[15px] font-extrabold text-ink active:scale-[0.98]"
          >
            Decline
          </button>
          <button onClick={() => acceptRequest(request.id)} className="h-[52px] rounded-2xl bg-go text-[16px] font-extrabold text-go-ink active:scale-[0.98]">
            Accept job · {inr(requestTotal)}
          </button>
        </div>
      )}
    </div>
  );
}

const firstName = (name) => String(name || "the customer").trim().split(/\s+/)[0];

const pinOf = (text) => (String(text || "").match(/\b\d{6}\b/) || [])[0] || "";

// Pick who handles this order. Staff whose services and areas fit are listed
// first; others can still be chosen (with a note) since the company decides.
function AssignOrderModal({ request, onClose, onAssigned }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listAssignableStaff().then(setList).catch((e) => {
      setList([]);
      setError(e.message || "Couldn't load staff");
    });
  }, []);

  const pin = pinOf(request.address?.line);
  const fit = (s) => ({
    service: !s.serviceIds?.length || s.serviceIds.includes(request.serviceId),
    area: !s.pincodes?.length || !pin || s.pincodes.includes(pin),
  });
  const sorted = (list || [])
    .map((s) => ({ ...s, fit: fit(s) }))
    .sort((a, b) => Number(b.fit.service && b.fit.area) - Number(a.fit.service && a.fit.area) || a.pending - b.pending);

  const choose = async (staffId) => {
    setBusy(true);
    setError("");
    try {
      const { assignedStaff } = await api.assignOrder(request.id, staffId);
      onAssigned(assignedStaff);
    } catch (e) {
      setError(e.message || "Couldn't assign");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 sm:rounded-3xl">
        <h2 className="text-[16px] font-bold text-gray-900">Assign this order</h2>
        <p className="mt-1 text-[12px] text-gray-500">{request.service?.name}{pin ? ` · PIN ${pin}` : ""}</p>
        <div className="mt-3 space-y-2">
          {list === null && <p className="py-6 text-center text-[13px] text-gray-400">Loading…</p>}
          {list?.length === 0 && !error && <p className="py-6 text-center text-[13px] text-gray-400">No active staff yet.</p>}
          {sorted.map((s) => (
            <button key={s.id} disabled={busy} onClick={() => choose(s.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left ${request.assignedStaff?.id === s.id ? "border-brand bg-brand-light" : "border-gray-200"}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-gray-900">{s.name}</span>
                <span className="block text-[11.5px] text-gray-500">{s.role} · {s.pending} open order{s.pending === 1 ? "" : "s"}</span>
                {(!s.fit.service || !s.fit.area) && (
                  <span className="block text-[11px] text-amber-600">{!s.fit.service ? "Doesn't usually handle this service" : "Outside their usual area"}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">
            Cancel
          </button>
          {request.assignedStaff && (
            <button onClick={() => choose(null)} disabled={busy} className="flex-1 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-600">
              Unassign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const SWAP_REASONS = [
  ["unavailable", "I'm no longer available at that time"],
  ["emergency", "Personal emergency"],
  ["location", "I can't reach the customer's location"],
  ["tools", "I don't have the required tools or parts"],
  ["other", "Other"],
];

// Confirmation + reason before an accepted order is released to another provider.
function SwapOrderModal({ serviceName, reasons = SWAP_REASONS, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = reason && (reason !== "other" || note.trim());

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ reason, note: note.trim() });
    } catch (e) {
      setError(e.message || "Couldn't swap this order");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 sm:rounded-3xl">
        <h2 className="text-[16px] font-bold text-gray-900">Swap this order?</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
          {serviceName ? `${serviceName} will be released and sent to another provider as a new order. ` : ""}
          You won't be able to get it back, and the customer will be told their provider has changed. Only do this if you truly can't complete it.
        </p>
        <div className="mt-4 space-y-2">
          {reasons.map(([value, label]) => (
            <label key={value} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] ${reason === value ? "border-brand bg-brand-light" : "border-gray-200"}`}>
              <input type="radio" name="swap-reason" checked={reason === value} onChange={() => setReason(value)} />
              {label}
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder={reason === "other" ? "Tell us the reason (required)" : "Add a note (optional)"}
          className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-brand"
        />
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">
            Keep order
          </button>
          <button onClick={submit} disabled={!ready || busy} className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Swapping…" : "Confirm swap"}
          </button>
        </div>
      </div>
    </div>
  );
}

const OTP_COPY = {
  start: {
    title: "Start code from the customer",
    hint: "They see it in their Tikdum app. The job starts only when it matches — it protects you if a visit is disputed.",
  },
  complete: {
    title: "Completion code from the customer",
    hint: "Once they're happy with the work, they read out the 4-digit code from their app.",
  },
};

const PAID_BY = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "other", label: "Other" },
];

// The code the customer reads out, typed into four big boxes. Closing a job also
// asks how the customer paid, which is what splits Money into cash and UPI.
function OtpVerifyCard({ bookingId, type }) {
  const { verifyJobOtp, showToast } = useApp();
  const [code, setCode] = useState("");
  const [paidBy, setPaidBy] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const copy = OTP_COPY[type];
  const needsPayment = type === "complete";
  const ready = code.length === 4 && (!needsPayment || paidBy);

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    try {
      await verifyJobOtp(bookingId, type, code, needsPayment ? paidBy : undefined);
      setCode("");
      showToast(type === "start" ? "Job started" : "Job finished — well done");
    } catch (err) {
      showToast(err.message || "That code doesn't match — ask the customer again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-[22px] bg-card p-4">
      <div>
        <label htmlFor={`otp-${type}`} className="text-[15px] font-bold text-ink">
          {copy.title}
        </label>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">{copy.hint}</p>
      </div>
      <div className="relative grid grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`flex h-[60px] items-center justify-center rounded-2xl border-2 bg-raised font-display text-[28px] font-extrabold text-ink ${
              code.length === i ? "border-brand-glow" : code[i] ? "border-brand/60" : "border-gray-300"
            }`}
          >
            {code[i] || ""}
          </span>
        ))}
        <input
          id={`otp-${type}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
      </div>
      {needsPayment && (
        <fieldset>
          <legend className="text-[13.5px] font-bold text-ink">How did the customer pay?</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PAID_BY.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaidBy(p.id)}
                aria-pressed={paidBy === p.id}
                className={`h-11 rounded-xl text-[14px] font-bold ${paidBy === p.id ? "bg-ink text-ground" : "border border-gray-300 text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <button type="submit" disabled={submitting || !ready} className="h-[52px] rounded-2xl bg-go text-[16px] font-extrabold text-go-ink disabled:opacity-40">
        {submitting ? "Checking…" : type === "start" ? "Verify code & start job" : "Verify code & finish job"}
      </button>
    </form>
  );
}

const CHECKPOINT_STEPS = [
  { type: "reached_location", label: "Reached the address" },
  { type: "started_job", label: "Started the work" },
  { type: "left_location", label: "Left the address" },
];

function JobCheckpoints({ bookingId, locked }) {
  const { showToast } = useApp();
  const [checkpoints, setCheckpoints] = useState([]);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listJobCheckpoints(bookingId)
      .then((data) => !cancelled && setCheckpoints(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const markDone = (type) => async () => {
    setSaving(type);
    try {
      const checkpoint = await api.addJobCheckpoint(bookingId, type);
      setCheckpoints((prev) => (prev.some((c) => c.type === type) ? prev : [...prev, checkpoint]));
    } catch (err) {
      showToast(err.message || "Couldn't save — please try again");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <h2 className="mb-2 mt-1 font-display text-[18px] font-bold text-ink">Checkpoints</h2>
      <div className="divide-y divide-gray-100 rounded-[22px] bg-card">
        {CHECKPOINT_STEPS.map(({ type, label }) => {
          const done = checkpoints.find((c) => c.type === type);
          return (
            <div key={type} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className={`text-[14px] font-semibold ${done ? "text-ink" : "text-ink-soft"}`}>{label}</p>
                {done && (
                  <p className="text-[10.5px] text-gray-400">
                    {new Date(done.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
              {done ? (
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckIcon width={13} height={13} />
                </span>
              ) : (
                <button
                  onClick={markDone(type)}
                  disabled={locked || saving === type}
                  className="h-10 flex-shrink-0 rounded-xl bg-raised px-3.5 text-[13px] font-bold text-ink disabled:opacity-50"
                >
                  {saving === type ? "Saving…" : "Mark done"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PHOTO_SLOTS = [
  { photoType: "before", label: "Before" },
  { photoType: "after", label: "After" },
];

function JobPhotos({ bookingId }) {
  const { showToast } = useApp();
  const [photos, setPhotos] = useState([]);
  const [uploadingType, setUploadingType] = useState(null);
  const fileInputs = useRef({});

  useEffect(() => {
    let cancelled = false;
    api
      .listJobPhotos(bookingId)
      .then((data) => !cancelled && setPhotos(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const handlePick = (photoType) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingType(photoType);
    try {
      const compressed = await compressImage(file);
      const photo = await api.uploadJobPhoto(bookingId, compressed, photoType);
      setPhotos((prev) => [...prev, photo]);
    } catch (err) {
      showToast(err.message || "Upload failed — please try again");
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div>
      <h2 className="mb-2 mt-1 font-display text-[18px] font-bold text-ink">Before & after photos</h2>
      <div className="grid grid-cols-2 gap-3">
        {PHOTO_SLOTS.map(({ photoType, label }) => {
          const slotPhotos = photos.filter((p) => p.photoType === photoType);
          const isUploading = uploadingType === photoType;
          return (
            <div key={photoType} className="rounded-[22px] bg-card p-3">
              <p className="mb-2 text-[11.5px] font-semibold text-gray-600">{label}</p>
              {slotPhotos.length > 0 ? (
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  {slotPhotos.map((p) => (
                    <img
                      key={p.id}
                      src={`${SERVER_URL}${p.url}`}
                      alt={`${label} photo`}
                      className="aspect-square w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              ) : (
                <div className="mb-2 flex aspect-square w-full items-center justify-center rounded-lg bg-gray-50 text-gray-300">
                  <CameraIcon width={20} height={20} />
                </div>
              )}
              <button
                onClick={() => fileInputs.current[photoType]?.click()}
                disabled={isUploading}
                className="h-11 w-full rounded-xl bg-raised text-[13px] font-bold text-ink disabled:opacity-50"
              >
                {isUploading ? "Uploading…" : `Add ${label} Photo`}
              </button>
              <input
                ref={(el) => (fileInputs.current[photoType] = el)}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePick(photoType)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
