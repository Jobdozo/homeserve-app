import { useApp } from "../context/AppContext";
import { CheckIcon } from "./icons";

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className="toast-anim pointer-events-none absolute bottom-28 left-1/2 z-50 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-[13.5px] font-semibold text-white shadow-float">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-trust">
        <CheckIcon width={13} height={13} stroke="#fff" strokeWidth={3} />
      </span>
      {toast}
    </div>
  );
}
