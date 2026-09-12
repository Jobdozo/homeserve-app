import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { serviceCategories } from "../data/mockData";
import ScreenHeader from "../components/ScreenHeader";
import { CameraIcon, XIcon } from "../components/icons";

export default function AddServiceScreen() {
  const navigate = useNavigate();
  const { addService, showToast } = useApp();

  const [name, setName] = useState("");
  const [category, setCategory] = useState(serviceCategories[0]);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [extraCharges, setExtraCharges] = useState("");
  const [serviceArea, setServiceArea] = useState("5 km around your location");
  const [images, setImages] = useState([]);

  const handleImagePick = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3 - images.length);
    const next = files.map((f) => ({ url: URL.createObjectURL(f), name: f.name }));
    setImages((prev) => [...prev, ...next].slice(0, 3));
    e.target.value = "";
  };

  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const canSave = name.trim() && price;

  const handleSave = () => {
    if (!canSave) {
      showToast("Please fill in service name and price");
      return;
    }
    addService({ name: name.trim(), category, description, price, originalPrice, extraCharges, serviceArea });
    navigate("/services", { replace: true });
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Add New Service" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Service Information</h2>
          <div className="space-y-3">
            <Field label="Service Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AC Repair & Service"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="Category">
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
            <Field label="Service Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe your service..."
                className="w-full resize-none bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Pricing</h2>
          <div className="space-y-3">
            <Field label="Starting Price (₹)">
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 499"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="Original Price (Optional — shows as a discount)">
              <input
                type="number"
                min="0"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                placeholder="e.g. 599 (crossed out, shows % OFF)"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
            <Field label="Additional Charges (Optional)">
              <input
                value={extraCharges}
                onChange={(e) => setExtraCharges(e.target.value)}
                placeholder="e.g. Gas refill, Parts extra"
                className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
              />
            </Field>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Service Area</h2>
          <Field label="Coverage">
            <input
              value={serviceArea}
              onChange={(e) => setServiceArea(e.target.value)}
              placeholder="e.g. 5 km around your location"
              className="w-full bg-transparent text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400"
            />
          </Field>
        </div>

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Service Images</h2>
          <p className="mb-2 text-[11px] text-gray-400">Add photos of your service (Min 3 recommended)</p>
          <div className="flex gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200">
                <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <XIcon width={9} height={9} strokeWidth={3} />
                </button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                <CameraIcon width={20} height={20} />
                <span className="text-[9px]">Add</span>
                <input type="file" accept="image/*" multiple onChange={handleImagePick} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 pb-4 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <button
          onClick={handleSave}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white shadow-card hover:bg-brand-dark active:scale-[0.98] disabled:opacity-50 lg:w-auto lg:px-10"
        >
          Save Service
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
