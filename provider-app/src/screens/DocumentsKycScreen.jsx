import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";
import { ShieldCheckIcon } from "../components/icons";

const statusConfig = {
  approved: {
    icon: "✅",
    title: "Verified",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    message: "Your account is verified. Customers can see your verified badge on your profile.",
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

export default function DocumentsKycScreen() {
  const { provider } = useApp();
  const status = statusConfig[provider.verificationStatus] || statusConfig.pending;

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

        <div className="flex items-start gap-3 rounded-2xl border border-gray-100 p-4">
          <ShieldCheckIcon width={18} height={18} className="mt-0.5 flex-shrink-0 text-gray-400" />
          <div>
            <p className="text-[13px] font-semibold text-gray-800">Document upload coming soon</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-gray-500">
              Uploading ID proof, GST certificate, and other documents directly here isn't available yet. For now,
              verification is based on the information in your profile — keep it accurate and up to date.
            </p>
          </div>
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
