import { useApp } from "../context/AppContext";
import { CheckIcon } from "./icons";

export default function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className="toast-anim pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <CheckIcon width={13} height={13} stroke="#fff" strokeWidth={3} />
      </span>
      {toast}
    </div>
  );
}
