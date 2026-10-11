import { useNavigate } from "react-router-dom";
import { BackIcon } from "./icons";

export default function ScreenHeader({ title, subtitle, onBack, right, maxWidth = "lg:max-w-2xl" }) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-shrink-0 items-center gap-3 px-4 pb-3 pt-2 lg:mx-auto lg:w-full lg:px-8 lg:pb-5 lg:pt-6 ${maxWidth}`}>
      <button
        onClick={onBack || (() => navigate(-1))}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink hover:bg-mist active:scale-95"
        aria-label="Go back"
      >
        <BackIcon width={19} height={19} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-[19px] font-extrabold text-ink lg:text-2xl">{title}</h1>
        {subtitle && <p className="truncate text-[12.5px] text-ink-muted lg:text-sm">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
