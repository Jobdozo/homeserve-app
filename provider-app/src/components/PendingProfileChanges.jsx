import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const LABELS = {
  name: "Name",
  category: "Category",
  businessName: "Business name",
  experience: "Experience",
  serviceArea: "Service area",
  email: "Email",
  gstNumber: "GST number",
  photo: "Profile photo",
  pincodes: "PIN codes",
};

// What this provider has asked to change and is still waiting on, or the reason the last request was turned down.
export default function PendingProfileChanges() {
  const { profileChangeTick } = useApp();
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listProfileChanges()
      .then((list) => !cancelled && setLatest(list[0] || null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profileChangeTick]);

  if (!latest || latest.status === "approved") return null;
  const fields = Object.keys(latest.changes || {}).map((k) => LABELS[k] || k);
  if (latest.status === "pending") {
    return (
      <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-[12px] text-blue-800">
        <p className="font-semibold">Waiting for Tikdum approval</p>
        <p className="mt-0.5">{fields.join(", ")} — your profile keeps its current details until these are approved.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
      <p className="font-semibold">Your last profile change was not approved</p>
      <p className="mt-0.5">
        {fields.join(", ")}
        {latest.note ? ` — ${latest.note}` : ""}
      </p>
    </div>
  );
}
