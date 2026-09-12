export default function StatCard({ icon, label, value, change, tone = "brand" }) {
  const toneStyles = {
    brand: "bg-brand-light text-brand-dark",
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-600",
    purple: "bg-violet-100 text-violet-700",
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${toneStyles[tone]}`}>
          {icon}
        </span>
        {change != null && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
              change >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            }`}
          >
            {change >= 0 ? "↑" : "↓"} {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-gray-900">{value}</p>
      <p className="mt-0.5 text-[12px] text-gray-400">{label}</p>
    </div>
  );
}
