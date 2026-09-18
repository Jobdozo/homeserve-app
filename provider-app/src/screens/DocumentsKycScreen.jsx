import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { ShieldCheckIcon, CameraIcon, XIcon } from "../components/icons";
import { api, SERVER_URL } from "../api";
import { compressImage } from "../utils/imageCompress";

const statusConfig = {
  approved: {
    icon: "✅",
    title: "Verified",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    message:
      "Your account is verified. Customers can see your verified badge on your profile. Documents are locked — contact support to make changes.",
  },
  pending: {
    icon: "⏳",
    title: "Verification Pending",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    message: "Our team is reviewing your account. This usually takes 1-2 business days.",
  },
  rejected: {
    icon: "⚠️",
    title: "Verification Rejected",
    className: "border-red-200 bg-red-50 text-red-700",
    message: "Your verification was not approved. Contact support for details on what needs to be corrected.",
  },
};

const DOC_TYPES = [
  { docType: "id_proof", label: "ID Proof", description: "Aadhaar, PAN, or another government ID" },
  { docType: "gst_certificate", label: "GST Certificate", description: "Only if you're GST registered" },
];

export default function DocumentsKycScreen() {
  const { provider, showToast } = useApp();
  const status = statusConfig[provider.verificationStatus] || statusConfig.pending;
  const locked = provider.verificationStatus === "approved";
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState(null);
  const fileInputs = useRef({});

  useEffect(() => {
    let cancelled = false;
    api
      .listKycDocuments()
      .then((docs) => !cancelled && setDocuments(docs))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePick = (docType) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingType(docType);
    try {
      const compressed = await compressImage(file, { maxDimension: 2000 });
      const doc = await api.uploadKycDocument(compressed, docType);
      setDocuments((prev) => [...prev.filter((d) => d.docType !== docType), doc]);
    } catch (err) {
      showToast(err.message || "Upload failed — please try again");
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = (doc) => {
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    api.deleteKycDocument(doc.id).catch(() => showToast("Couldn't remove document"));
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Documents & KYC" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${status.className}`}>
          <span className="text-2xl">{status.icon}</span>
          <div>
            <p className="text-[13.5px] font-bold">{status.title}</p>
            <p className="mt-0.5 text-[12px] leading-snug">{status.message}</p>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Submitted Information</h2>
          <div className="space-y-2 rounded-2xl border border-gray-100 p-4">
            <InfoRow label="GST Number" value={provider.gstNumber} />
            <InfoRow label="Business Name" value={provider.businessName} last />
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Documents</h2>
          <div className="space-y-3">
            {DOC_TYPES.map(({ docType, label, description }) => {
              const doc = documents.find((d) => d.docType === docType);
              const isUploading = uploadingType === docType;
              return (
                <div key={docType} className="flex items-center gap-3 rounded-2xl border border-gray-100 p-3">
                  {doc ? (
                    <img
                      src={`${SERVER_URL}${doc.url}`}
                      alt={label}
                      className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-300">
                      <CameraIcon width={22} height={22} />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-800">{label}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{description}</p>
                  </div>

                  {!locked && (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {doc && (
                        <button
                          onClick={() => handleDelete(doc)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-400"
                          aria-label={`Remove ${label}`}
                        >
                          <XIcon width={14} height={14} />
                        </button>
                      )}
                      <button
                        onClick={() => fileInputs.current[docType]?.click()}
                        disabled={isUploading}
                        className="rounded-xl bg-brand px-3 py-2 text-[11.5px] font-semibold text-white disabled:opacity-50"
                      >
                        {isUploading ? "Uploading…" : doc ? "Retake" : "Add Photo"}
                      </button>
                      <input
                        ref={(el) => (fileInputs.current[docType] = el)}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={handlePick(docType)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!loading && !locked && (
            <p className="mt-2 px-1 text-[11px] text-gray-400">
              Tap "Add Photo" to take a picture with your camera or choose one from your gallery.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-gray-100 p-4">
          <ShieldCheckIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <p className="text-[11.5px] leading-snug text-gray-500">
            Documents you upload here are reviewed by our team as part of verifying your account. Keep the info in
            your profile accurate too.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-[12.5px] ${last ? "" : "border-b border-gray-50"}`}>
      <span className="text-gray-400">{label}</span>
      <span className="font-medium text-gray-700">{value || "Not provided"}</span>
    </div>
  );
}
