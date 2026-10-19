import { useRef, useState } from "react";
import { api, SERVER_URL } from "../api";

// The big picture on a push notification (server/src/pushPictures.js): one of Tikdum's
// ready-made banners (local-service-app/public/push-banners) or an uploaded picture,
// which the server re-saves as a 1024×512 banner. value is the picture's path, or null.
export const PUSH_BANNERS = [
  { path: "/push-banners/home-cleaning.jpg", label: "Home Cleaning" },
  { path: "/push-banners/electrician.jpg", label: "Electrician" },
  { path: "/push-banners/appliance-repair.jpg", label: "Appliance Repair" },
  { path: "/push-banners/gas-stove-chimney.jpg", label: "Gas Stove & Chimney" },
  { path: "/push-banners/computer-repair.jpg", label: "Computer & Laptop" },
  { path: "/push-banners/pest-control.jpg", label: "Pest Control" },
  // Festival greetings
  { path: "/push-banners/dussehra.jpg", label: "Dussehra" },
  { path: "/push-banners/karwa-chauth.jpg", label: "Karwa Chauth" },
  { path: "/push-banners/dhanteras.jpg", label: "Dhanteras" },
  { path: "/push-banners/diwali.jpg", label: "Diwali" },
  { path: "/push-banners/bhai-dooj.jpg", label: "Bhai Dooj" },
  { path: "/push-banners/gurpurab.jpg", label: "Gurpurab" },
];
export const pictureUrl = (path) => (!path ? null : path.startsWith("/uploads/") ? `${SERVER_URL}${path}` : `https://tikdum.com${path}`);

export default function PushPicturePicker({ value, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const choose = (path) => {
    onChange(path);
    setOpen(false);
    setError("");
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const { image } = await api.uploadPushPicture(file);
      choose(image);
    } catch (e) {
      setError(e.message || "Couldn't upload the picture");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {value ? (
        <div className="flex items-end gap-2">
          <img src={pictureUrl(value)} alt="Notification picture" className={`${compact ? "w-36" : "w-64"} aspect-[2/1] rounded-lg border border-gray-100 object-cover`} />
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-left text-[11.5px] font-semibold text-brand-dark">
              Change
            </button>
            <button type="button" onClick={() => choose(null)} className="text-left text-[11.5px] font-semibold text-gray-500">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:border-brand hover:text-brand-dark"
        >
          + Add picture
        </button>
      )}
      {open && (
        <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PUSH_BANNERS.map((b) => (
              <button
                key={b.path}
                type="button"
                onClick={() => choose(b.path)}
                className={`overflow-hidden rounded-lg border bg-white text-left ${value === b.path ? "border-brand ring-2 ring-brand/30" : "border-gray-100 hover:border-brand"}`}
              >
                <img src={pictureUrl(b.path)} alt="" className="aspect-[2/1] w-full object-cover" loading="lazy" />
                <span className="block truncate px-2 py-1 text-[11px] font-semibold text-gray-700">{b.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex aspect-[2/1] flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white px-2 text-center text-[11.5px] font-semibold text-gray-600 hover:border-brand disabled:opacity-60"
            >
              {busy ? "Uploading…" : "Upload your own"}
              <span className="mt-0.5 text-[10px] font-normal text-gray-400">Wide pictures work best (2:1)</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          {error && <p className="mt-1.5 text-[11.5px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
