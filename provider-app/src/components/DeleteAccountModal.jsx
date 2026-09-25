import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Permanent, self-service account deletion (a Google Play requirement).
// Only the account owner sees this; staff sign-ins can't delete the company.
export default function DeleteAccountModal({ onClose }) {
  const { logout, showToast } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount();
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
