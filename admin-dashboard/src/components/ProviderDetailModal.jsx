import { useEffect, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";
import { StarIcon, CheckIcon, XIcon, WalletIcon, FileIcon } from "./icons";

const verificationStyles = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

const DOC_LABELS = {
  id_proof: "ID Proof",
  gst_certificate: "GST Certificate",
};

export default function ProviderDetailModal({ providerId, onClose }) {
  const { providers, approveProvider, rejectProvider, showToast } = useApp();
  const provider = providers.find((p) => p.id === providerId);
  const [services, setServices] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [documents, setDocuments] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setServices(null);
    setEarnings(null);
    setReviews(null);
    setDocuments(null);
    Promise.all([
      api.getProviderServices(providerId),
      api.getProviderEarnings(providerId).catch(() => null),
      api.getProviderReviews(providerId),
      api.getProviderKycDocuments(providerId).catch(() => []),
    ]).then(([s, e, r, d]) => {
      if (cancelled) return;
      setServices(s);
      setEarnings(e);
      setReviews(r);
      setDocuments(d);
    });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  if (!provider) return null;

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn(provider.id);
    } catch (err) {
      showToast(err.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[15px] font-bold text-gray-900">Provider Account</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
            <XIcon width={16} height={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-3xl">
              {provider.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-bold text-gray-900">{provider.name}</p>
              <p className="truncate text-[12.5px] text-gray-500">{provider.businessName || provider.category}</p>
              {provider.reviews > 0 ? (
                <div className="mt-1 flex items-center gap-1 text-[11.5px] text-gray-500">
                  <StarIcon filled width={13} height={13} /> {provider.rating} ({provider.reviews}+ reviews)
                </div>
              ) : (
                <p className="mt-1 text-[11.5px] text-gray-400">No reviews yet</p>
              )}
            </div>
            <span
              className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verificationStyles[provider.verificationStatus]}`}
            >
              {provider.verificationStatus}
            </span>
          </div>

          <div className="rounded-xl bg-gray-50 px-3 py-2 text-[11.5px] text-gray-500">
            {provider.live ? "🟢 Connected via Provider App" : "⚪ Managed by admin (no live app)"}
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            <Field label="Phone" value={provider.phone} />
            <Field label="Email" value={provider.email} />
            <Field label="Category" value={provider.category} />
            <Field label="Service area" value={provider.serviceArea} />
            <Field label="Experience" value={provider.experience ? `${provider.experience} yrs` : null} />
            <Field label="GST number" value={provider.gstNumber} />
            <Field label="Response rate" value={provider.responseRate != null ? `${provider.responseRate}%` : null} />
            <Field label="Joined" value={provider.joinedAt ? new Date(provider.joinedAt).toLocaleDateString("en-IN") : null} />
          </div>

          {provider.verificationStatus === "pending" && (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => act(rejectProvider)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-[12px] font-semibold text-red-600 active:scale-[0.98] disabled:opacity-50"
              >
                <XIcon width={13} height={13} /> Reject
              </button>
              <button
                disabled={busy}
                onClick={() => act(approveProvider)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-[12px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
              >
                <CheckIcon width={13} height={13} /> Approve
              </button>
            </div>
          )}

          <Section title="Documents">
            {documents === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {documents?.length === 0 && <p className="text-[12px] text-gray-400">No documents uploaded.</p>}
            {documents?.map((d) => (
              <a
                key={d.id}
                href={`${SERVER_URL}${d.url}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
              >
                <img src={`${SERVER_URL}${d.url}`} alt="" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-gray-800">
                    {DOC_LABELS[d.docType] || d.docType}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(d.uploadedAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <FileIcon width={16} height={16} className="flex-shrink-0 text-gray-300" />
              </a>
            ))}
          </Section>

          <Section title="Services">
            {services === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {services?.length === 0 && <p className="text-[12px] text-gray-400">No services listed.</p>}
            {services?.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <span className="flex items-center gap-2 text-[12.5px] text-gray-700">
                  <span>{s.icon}</span> {s.name}
                </span>
                <span className="text-[12.5px] font-semibold text-gray-900">₹{s.price}</span>
              </div>
            ))}
          </Section>

          <Section title="Earnings">
            {earnings === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {earnings && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-[12.5px]">
                <WalletIcon width={16} height={16} className="text-gray-400" />
                <span className="text-gray-500">Total completed:</span>
                <span className="font-semibold text-gray-900">₹{earnings.allTime.toLocaleString("en-IN")}</span>
              </div>
            )}
          </Section>

          <Section title="Reviews">
            {reviews === null && <p className="text-[12px] text-gray-400">Loading…</p>}
            {reviews?.length === 0 && <p className="text-[12px] text-gray-400">No reviews yet.</p>}
            {reviews?.slice(0, 5).map((r) => (
              <div key={r.id} className="rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-gray-800">{r.customer?.name || "Customer"}</span>
                  <span className="flex items-center gap-1 text-[11.5px] text-gray-500">
                    <StarIcon filled width={12} height={12} /> {r.rating}
                  </span>
                </div>
                {r.text && <p className="mt-1 text-[11.5px] text-gray-500">{r.text}</p>}
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="truncate text-gray-800">{value || "—"}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
