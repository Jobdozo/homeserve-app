import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { serviceCategories } from "../data/mockData";
import ScreenHeader from "../components/ScreenHeader";

export default function EditProfileScreen() {
  const navigate = useNavigate();
  const { provider, updateProfile, showToast } = useApp();

  const [name, setName] = useState(provider.name || "");
  const [category, setCategory] = useState(provider.category && provider.category !== "Not set" ? provider.category : serviceCategories[0]);
  const [businessName, setBusinessName] = useState(provider.businessName || "");
  const [experience, setExperience] = useState(provider.experience || "");
  const [serviceArea, setServiceArea] = useState(provider.serviceArea || "");
  const [email, setEmail] = useState(provider.email || "");
  const [gstNumber, setGstNumber] = useState(provider.gstNumber || "");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) {
      showToast("Name is required");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        category,
        businessName: businessName.trim(),
        experience: experience.trim(),
        serviceArea: serviceArea.trim(),
        email: email.trim(),
        gstNumber: gstNumber.trim(),
      });
      navigate("/profile", { replace: true });
    } catch (e) {
      showToast(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Edit Profile" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Basic Information</h2>
          <div className="space-y-3">
            <Field label="Your Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Amit Sharma"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="Primary Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none"
              >
                {serviceCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Business Information</h2>
          <div className="space-y-3">
            <Field label="Business Name">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Sharma AC Services"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="Experience">
              <input
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                placeholder="e.g. 5 Years"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="Service Area">
              <input
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                placeholder="e.g. 5 km around your location"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="GST Number (Optional)">
              <input
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="e.g. 07ABCDE1234F1Z5"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Contact</h2>
          <div className="space-y-3">
            <Field label="Phone">
              <p className="text-[13.5px] text-gray-400">{provider.phone}</p>
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. you@example.com"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <button
          onClick={handleSave}
          disabled={saving || !canSave}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-dark active:scale-[0.98] disabled:opacity-50 lg:w-auto lg:px-10"
        >
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-medium text-gray-500">{label}</label>
      <div className="rounded-xl border border-gray-200 px-3 py-2.5">{children}</div>
    </div>
  );
}
