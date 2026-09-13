import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import LogoMark from "../components/LogoMark";

export default function LoginScreen() {
  const { login } = useApp();
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRequestOtp(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.requestOtp(phone.trim(), "admin");
      setDevOtp(res.devOtp || null);
      setStep("otp");
    } catch (err) {
      setError(err.message || "Failed to send code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    setBusy(true);
    try {
      const { token, user } = await api.verifyOtp(phone.trim(), code.trim(), "admin");
      login(token, user);
    } catch (err) {
      setError(err.message || "Incorrect code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand">
            <LogoMark size={30} />
          </span>
          <h1 className="text-xl font-extrabold text-gray-900">Tikdum Admin</h1>
          <p className="text-[13px] text-gray-400">Log in with your admin WhatsApp number</p>
        </div>

        {step === "phone" && (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-3">
            <label className="text-[13px] font-semibold text-gray-700">
              WhatsApp number
              <input
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] focus:border-brand focus:outline-none"
              />
            </label>
            {error && <p className="text-[12.5px] font-medium text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy || !phone.trim()}
              className="mt-2 rounded-xl bg-brand py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "Sending code…" : "Send WhatsApp code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
            <p className="text-center text-[13px] text-gray-500">
              We sent a code via WhatsApp to <span className="font-semibold text-gray-800">{phone}</span>
            </p>
            {devOtp && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[12.5px] font-medium text-amber-700">
                No WhatsApp provider connected yet — dev code: <span className="font-bold">{devOtp}</span>
              </p>
            )}
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              maxLength={6}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-[18px] tracking-[0.4em] focus:border-brand focus:outline-none"
            />
            {error && <p className="text-center text-[12.5px] font-medium text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="mt-2 rounded-xl bg-brand py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError("");
              }}
              className="text-[12.5px] font-semibold text-gray-400"
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
