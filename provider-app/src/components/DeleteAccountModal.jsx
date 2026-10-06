import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Permanent, self-service account deletion (a Google Play requirement).
// Only the account owner sees this; staff sign-ins can't delete the company.
const REASONS = [
  ["found_better", "I found a better option"],
  ["not_needed", "I no longer need the service"],
  ["bad_service", "A bad experience with a booking"],
  ["price", "Prices are too high"],
  ["app_issues", "The app has problems or is hard to use"],
  ["notifications", "Too many notifications"],
  ["privacy", "Privacy concerns"],
  ["other", "Something else"],
];

export default function DeleteAccountModal({ onClose }) {
  const { logout, showToast } = useApp();
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount({ reason, note: note.trim(), contactOk });
      showToast("Your account has been deleted");
      logout();
    } catch (e) {
      setError(e.message || "Couldn't delete your account");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <h2 className="text-[16px] font-bold text-gray-900">Delete your provider account?</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-gray-500">
          This permanently removes your business profile, phone number, email, documents and staff logins, and takes your services off Tikdum. It
          can't be undone. Records of completed orders and payments are kept without your personal details, as the law requires. You can't delete
          your account while you have orders in progress.
        </p>
        <label className="mt-4 block text-[12px] font-semibold text-gray-700">Why are you leaving? <span className="font-normal text-gray-400">(optional)</span></label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-red-400">
          <option value="">Choose a reason</option>
          {REASONS.map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Anything you'd like us to know? (optional)" className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-red-400" />
        <label className="mt-2 flex items-start gap-2 text-[12px] leading-snug text-gray-600">
          <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-red-600" />
          <span>Yes, Tikdum may keep my name and phone number to contact me about my feedback. Leave this unticked and nothing personal is kept — only the reason.</span>
        </label>
        <label className="mt-4 block text-[12px] font-semibold text-gray-700">Type DELETE to confirm</label>
        <input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-red-400" />
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">
            Keep my account
          </button>
          <button onClick={confirm} disabled={busy || text.trim() !== "DELETE"} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
