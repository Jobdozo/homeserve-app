import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import LogoMark from "../components/LogoMark";
import PhoneInput from "../components/PhoneInput";
import { detectDefaultCountry, COUNTRY_CODES } from "../data/countryCodes";

export default function LoginScreen() {
  const { login } = useApp();
  const [step, setStep] = useState("phone"); // "phone" | "otp"
  const [country, setCountry] = useState(detectDefaultCountry);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const dial = COUNTRY_CODES.find((c) => c.iso2 === country)?.dial || "+91";
  const fullPhone = `${dial} ${number}`;

  async function handleRequestOtp(e) {
    e.preventDefault();
    if (!number.trim()) return;
    setError("");
    setBusy(true);
    try {
      const res = await api.requestOtp(fullPhone, "provider");
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
      const { token, user } = await api.verifyOtp(fullPhone, code.trim(), "provider", name.trim());
      login(token, user);
    } catch (err) {
      setError(err.message || "Incorrect code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="app-body">
        <div className="phone-frame">
          <div className="screen no-scrollbar flex flex-col justify-center px-6 py-10">
            <div className="mb-8 flex flex-col items-center gap-2 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white">
                <LogoMark size={30} />
              </span>
              <h1 className="text-xl font-extrabold text-gray-900">Tikdum Pro</h1>
              <p className="text-[13px] text-gray-400">Log in or register as a provider with WhatsApp</p>
            </div>

            {step === "phone" && (
              <form onSubmit={handleRequestOtp} className="flex flex-col gap-3">
                <label className="text-[13px] font-semibold text-gray-700">
                  WhatsApp number
                  <div className="mt-1">
                    <PhoneInput country={country} onCountryChange={setCountry} number={number} onNumberChange={setNumber} autoFocus />
                  </div>
                </label>
                <label className="text-[13px] font-semibold text-gray-700">
                  Name / business name <span className="font-normal text-gray-400">(new providers only)</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-[14px] focus:border-brand focus:outline-none"
                  />
                </label>
                {error && <p className="text-[12.5px] font-medium text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={busy || !number.trim()}
                  className="mt-2 rounded-xl bg-brand py-3 text-[14px] font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Sending code…" : "Send WhatsApp code"}
                </button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
                <p className="text-center text-[13px] text-gray-500">
                  We sent a code via WhatsApp to <span className="font-semibold text-gray-800">{fullPhone}</span>
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
      </div>
    </div>
  );
}
