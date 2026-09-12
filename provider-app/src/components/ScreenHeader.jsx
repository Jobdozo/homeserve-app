import { useNavigate } from "react-router-dom";
import { BackIcon } from "./icons";

export default function ScreenHeader({ title, subtitle, onBack, right, maxWidth = "lg:max-w-2xl" }) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-1 lg:mx-auto lg:w-full lg:px-8 lg:pb-5 lg:pt-6 ${maxWidth}`}>
      <button
        onClick={onBack || (() => navigate(-1))}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95 lg:h-10 lg:w-10"
        aria-label="Go back"
      >
        <BackIcon width={18} height={18} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold text-gray-900 lg:text-xl">{title}</h1>
        {subtitle && <p className="truncate text-xs text-gray-500 lg:text-sm">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
