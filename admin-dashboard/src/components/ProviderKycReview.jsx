import { useEffect, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";

const STATUS = {
  approved: ["Approved", "bg-emerald-100 text-emerald-700"],
  rejected: ["Rejected", "bg-red-100 text-red-600"],
  waiting: ["Waiting for review", "bg-amber-100 text-amber-700"],
  expired: ["Expired", "bg-red-100 text-red-600"],
  missing: ["Not uploaded", "bg-gray-100 text-gray-500"],
};

// Documents: the required checklist, and approve / reject each one (with a reason the provider sees) and an expiry date.
export default function ProviderKycReview({ provider, onChanged }) {
  const { showToast } = useApp();
  const [kyc, setKyc] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState({});
  const [expiry, setExpiry] = useState({});

  const load = () => api.getProviderKyc(provider.id).then(setKyc).catch((e) => showToast(e.message || "Couldn't load documents"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  const run = async (key, fn, done) => {
    setBusy(key);
    try {
      await fn();
      showToast(done);
      await load();
      onChanged?.();
    } catch (e) {
      showToast(e.message || "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const upload = (type) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return showToast("That photo is over 15 MB — choose a smaller one");
    await run(type, () => api.uploadProviderKycDocument(provider.id, file, type), "Document uploaded");
  };

  if (!kyc) return <p className="text-[12.5px] text-gray-400">Loading documents…</p>;
  return (
    <div className="space-y-4">
      <div className={`rounded-xl px-4 py-3 text-[12.5px] ${kyc.complete ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {kyc.complete ? (
          <p className="font-semibold">All required documents are approved.</p>
        ) : (
          <p>
            <span className="font-semibold">Still needed before approval:</span> {kyc.missing.join(", ")}
          </p>
        )}
        {kyc.waiting > 0 && <p className="mt-0.5">{kyc.waiting} document{kyc.waiting === 1 ? "" : "s"} waiting for your review.</p>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {kyc.types.map((t) => {
          const [label, style] = STATUS[t.status];
          const d = t.doc;
          return (
            <div key={t.type} className="rounded-xl border border-gray-100 p-3">
              <div className="flex items-start gap-3">
                {d ? (
                  <a href={SERVER_URL + d.url} target="_blank" rel="noreferrer" className="block h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-gray-100" title="Open full size">
                    <img src={SERVER_URL + d.url} alt={t.label} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 text-[10.5px] text-gray-400">No file</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900">
                    {t.label} {t.required && <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">Required</span>}
                  </p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${style}`}>{label}</span>
                  {d?.uploadedAt && <p className="mt-1 text-[11px] text-gray-400">Uploaded {new Date(d.uploadedAt).toLocaleDateString("en-IN")}</p>}
                  {d?.expiresAt && <p className="text-[11px] text-gray-400">Valid till {new Date(d.expiresAt).toLocaleDateString("en-IN")}</p>}
                  {d?.status === "rejected" && d.note && <p className="text-[11px] text-red-600">Reason: {d.note}</p>}
                </div>
              </div>

              {d && rejecting[d.id] !== undefined ? (
                <div className="mt-3 flex gap-2">
                  <input
                    value={rejecting[d.id]}
                    onChange={(e) => setRejecting({ ...rejecting, [d.id]: e.target.value })}
                    placeholder="Reason the provider will see"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-brand"
                  />
                  <button
                    disabled={busy === d.id || !rejecting[d.id].trim()}
                    onClick={() => run(d.id, () => api.reviewProviderDocument(provider.id, d.id, { status: "rejected", note: rejecting[d.id].trim() }), "Document rejected").then(() => setRejecting((p) => ({ ...p, [d.id]: undefined })))}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Reject
                  </button>
                  <button onClick={() => setRejecting((p) => ({ ...p, [d.id]: undefined }))} className="text-[12px] font-semibold text-gray-400">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {d && t.status !== "approved" && (
                    <>
                      <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        Valid till
                        <input
                          type="date"
                          value={expiry[d.id] || ""}
                          onChange={(e) => setExpiry({ ...expiry, [d.id]: e.target.value })}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] outline-none focus:border-brand"
                        />
                      </label>
                      <button
                        disabled={busy === d.id}
                        onClick={() => run(d.id, () => api.reviewProviderDocument(provider.id, d.id, { status: "approved", expiresAt: expiry[d.id] || null }), "Document approved")}
                        className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button onClick={() => setRejecting({ ...rejecting, [d.id]: "" })} className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-600">
                        Reject
                      </button>
                    </>
                  )}
                  <label className={`cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 ${busy === t.type ? "pointer-events-none opacity-50" : ""}`}>
                    {busy === t.type ? "Uploading…" : d ? "Upload a new one" : "Upload for them"}
                    <input type="file" accept="image/*" className="hidden" onChange={upload(t.type)} />
                  </label>
                  {d && (
                    <button
                      disabled={busy === `del-${d.id}`}
                      onClick={() => run(`del-${d.id}`, () => api.deleteProviderKycDocument(provider.id, d.id), "Document removed")}
                      className="text-[12px] font-semibold text-gray-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400">Required documents are set in Settings → Business Rules → Services. The provider gets a notice for every decision, and reminders 30 and 7 days before an approved document expires.</p>
    </div>
  );
}
