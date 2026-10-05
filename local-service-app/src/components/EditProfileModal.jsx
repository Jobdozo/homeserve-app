import { useState } from "react";
import { useApp } from "../context/AppContext";

const AVATARS = ["🧑", "👩", "👨", "🧔", "👩‍🦱", "🧑‍💼", "🙂", "😎"];

// Change the display name and avatar. The phone number is the login, so it isn't editable here.
export default function EditProfileModal({ onClose }) {
  const { customer, updateProfile, showToast } = useApp();
  const [name, setName] = useState(customer?.name || "");
  const [avatar, setAvatar] = useState(customer?.avatar || AVATARS[0]);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), avatar });
      onClose();
    } catch (err) {
      showToast(err.message || "Could not update your profile");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <p className="text-[16px] font-bold text-gray-900">Edit profile</p>

        <p className="mt-4 text-[12px] font-semibold text-gray-600">Avatar</p>
        <div className="mt-2 grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xl ${avatar === a ? "bg-brand-light ring-2 ring-brand" : "bg-gray-50 hover:bg-gray-100"}`}
            >
              {a}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[12px] font-semibold text-gray-600" htmlFor="profile-name">
          Name
        </label>
        <input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          autoFocus
          className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[14px] text-gray-800 outline-none focus:border-brand"
        />
        <p className="mt-1.5 text-[11px] text-gray-400">Your phone number is your login, so it can't be changed here.</p>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13.5px] font-semibold text-gray-600">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || saving} className="flex-1 rounded-xl bg-brand py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
