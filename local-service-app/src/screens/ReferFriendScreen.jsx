import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import ScreenHeader from "../components/ScreenHeader";

export default function ReferFriendScreen() {
  const { referral, refreshReferral, showToast } = useApp();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    refreshReferral().finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !referral) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader title="Refer & Earn" maxWidth="lg:max-w-2xl" />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-light border-t-brand" />
        </div>
      </div>
    );
  }

  const { code, balance, history, friendDiscount, reward } = referral;
  const link = `https://tikdum.com/?ref=${code}`;
  const message = `Use my Tikdum referral code ${code} to get ₹${friendDiscount} off your first booking! ${link}`;

  const shareVia = (channel) => {
    if (channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
      return;
    }
    if (channel === "messenger") {
      window.open(`fb-messenger://share?link=${encodeURIComponent(link)}`, "_blank");
      return;
    }
    navigator.clipboard
      .writeText(message)
      .then(() => showToast("Referral link copied"))
      .catch(() => showToast("Couldn't copy — try again"));
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Refer & Earn" maxWidth="lg:max-w-2xl" />

      <div className="flex-1 space-y-5 px-4 pb-8 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white">
          <p className="text-2xl">🎁</p>
          <p className="mt-2 text-[16px] font-bold">Refer and get FREE services</p>
          <p className="mt-1 text-[12.5px] leading-snug text-white/85">
            Invite your friends to try Tikdum services. They get instant ₹{friendDiscount} off. You win ₹{reward}{" "}
            once they take a service.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-brand/40 bg-brand-light/40 p-4 text-center">
          <p className="text-[11px] font-semibold text-gray-500">Your referral code</p>
          <p className="mt-1 text-2xl font-extrabold tracking-[0.15em] text-brand">{code}</p>
        </div>

        <div>
          <p className="mb-3 text-center text-[12px] text-gray-400">Refer via</p>
          <div className="flex items-center justify-center gap-8">
            <ShareButton emoji="💬" label="WhatsApp" onClick={() => shareVia("whatsapp")} />
            <ShareButton emoji="✉️" label="Messenger" onClick={() => shareVia("messenger")} />
            <ShareButton emoji="🔗" label="Copy Link" onClick={() => shareVia("copy")} />
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <p className="mb-3 text-[13.5px] font-bold text-gray-900">How it works?</p>
          <Step number={1} text="Invite your friends & get rewarded" />
          <Step number={2} text={`They get ₹${friendDiscount} on their first service`} />
          <Step number={3} text={`You get ₹${reward} once their service is completed`} last />
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-gray-100 p-4">
          <div>
            <p className="text-[11px] text-gray-400">Your referral credit</p>
            <p className="text-xl font-extrabold text-gray-900">₹{balance}</p>
          </div>
          {balance > 0 && <p className="text-[11px] font-medium text-emerald-600">Applies at your next checkout</p>}
        </div>

        {history.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-bold text-gray-900">Reward history</p>
            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
              {history
                .slice()
                .reverse()
                .map((h, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
                    <span className="text-gray-500">
                      {new Date(h.at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    <span className={`font-semibold ${h.amount >= 0 ? "text-emerald-600" : "text-gray-500"}`}>
                      {h.amount >= 0 ? "+" : ""}₹{h.amount}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareButton({ emoji, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-card">{emoji}</span>
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
    </button>
  );
}

function Step({ number, text, last }) {
  return (
    <div className={`flex items-start gap-3 ${last ? "" : "pb-4"}`}>
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-bold text-gray-600">
        {number}
      </span>
      <p className="pt-0.5 text-[12.5px] text-gray-700">{text}</p>
    </div>
  );
}
