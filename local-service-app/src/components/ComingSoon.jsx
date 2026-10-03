import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { MapPinIcon } from "./icons";

// Shown when nobody is serving the customer's area yet. `categoryName` makes
// it the smaller "this category isn't in your area yet" version.
export default function ComingSoon({ categoryName }) {
  const navigate = useNavigate();
  const { customer, activePincode, detectLocation, reloadCatalog } = useApp();
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await detectLocation();
      await reloadCatalog();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mx-4 mt-6 flex flex-col items-center rounded-3xl bg-brand-light/50 px-6 py-9 text-center lg:mx-auto lg:max-w-xl lg:py-14">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand shadow-card">
        <MapPinIcon width={26} height={26} />
      </span>
      <h2 className="mt-4 text-[17px] font-extrabold text-gray-900 lg:text-xl">
        {categoryName ? `${categoryName} is coming to your area soon` : "We're coming to your area soon"}
      </h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-gray-600 lg:text-[14px]">
        {categoryName
          ? `We don't have ${categoryName} providers near ${activePincode || "you"} just yet, but we're working hard to bring trusted professionals to your neighbourhood.`
          : `Tikdum doesn't have service providers near ${activePincode || "you"} just yet. We're working hard to bring trusted professionals to your neighbourhood, and we'll be there very soon.`}{" "}
        Thank you for your patience. Please check back in a little while.
      </p>
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={checkAgain}
          disabled={checking}
          className="rounded-xl bg-brand py-3 text-[13.5px] font-bold text-white shadow-card active:scale-[0.98] disabled:opacity-60"
        >
          {checking ? "Checking…" : "Check again"}
        </button>
        {customer && (
          <button onClick={() => navigate("/address")} className="py-1.5 text-[12.5px] font-semibold text-brand">
            Use a different address
          </button>
        )}
      </div>
    </div>
  );
}
