import { useState } from "react";
import { useApp } from "../context/AppContext";
import LogoMark from "../components/LogoMark";
import { CheckIcon } from "../components/icons";
import { AGREEMENT_VERSION, AGREEMENT_SECTIONS, AGREEMENT_DECLARATION } from "../data/providerAgreement";

export default function AgreementScreen() {
  const { provider, acceptAgreement, logout, showToast } = useApp();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAccept = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    try {
      await acceptAgreement();
    } catch (err) {
      showToast(err.message || "Couldn't record your acceptance — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-body">
        <div className="phone-frame">
          <div className="screen no-scrollbar px-5 py-6">
            <div className="mb-5 flex flex-col items-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white">
                <LogoMark size={26} />
              </span>
              <h1 className="text-lg font-extrabold text-gray-900">Service Provider Agreement</h1>
              <p className="text-[11.5px] text-gray-400">
                Version {AGREEMENT_VERSION} — please read fully before continuing, {provider?.name || "there"}.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 p-4">
              <div className="space-y-4 text-[12px] leading-relaxed text-gray-600">
                {AGREEMENT_SECTIONS.map(([title, body]) => (
                  <div key={title}>
                    <h2 className="mb-1 text-[12px] font-bold text-gray-900">{title}</h2>
                    <p>{body}</p>
                  </div>
                ))}

                <div>
                  <h2 className="mb-1 text-[12px] font-bold text-gray-900">43. Service Provider Declaration</h2>
                  <p className="mb-2">By registering with Tikdum, I confirm that:</p>
                  <ul className="list-disc space-y-1 pl-4">
                    {AGREEMENT_DECLARATION.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-gray-400">
                  This Agreement, Tikdum's Privacy Policy and other applicable platform policies govern your use of
                  Tikdum as an independent Service Provider. You're encouraged to seek independent legal advice
                  before accepting. For company and registration details, see Help &amp; Support in the app.
                </p>
              </div>
            </div>

            <label className="mt-5 flex items-start gap-2.5 rounded-xl bg-gray-50 p-3.5 text-[12px] leading-snug text-gray-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand"
              />
              I have read and understood the Tikdum Service Provider Agreement above, and I accept it electronically.
            </label>

            <button
              onClick={handleAccept}
              disabled={!checked || submitting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <CheckIcon width={16} height={16} /> {submitting ? "Recording your acceptance…" : "I Agree & Continue"}
            </button>

            <button onClick={logout} className="mt-3 w-full py-2 text-center text-[12px] font-semibold text-gray-400">
              Log out instead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
