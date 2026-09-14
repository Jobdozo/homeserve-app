import { useApp } from "../context/AppContext";

export default function OfflineBanner() {
  const { isOffline } = useApp();
  if (!isOffline) return null;

  return (
    <div className="flex-shrink-0 bg-gray-900 px-4 py-1.5 text-center text-[11px] font-medium text-white">
      You're offline — showing saved data. Some actions need a connection.
    </div>
  );
}
