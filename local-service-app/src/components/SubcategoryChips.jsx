// "All | Window AC | Split AC | VRF AC" — the type picker on a category page.
export default function SubcategoryChips({ chips, value, onChange, total, className = "" }) {
  if (!chips.length) return null;
  const items = [{ id: "", name: "All", count: total }, ...chips];
  return (
    <div role="tablist" aria-label="Type" className={"no-scrollbar flex gap-2 overflow-x-auto " + className}>
      {items.map((c) => (
        <button
          key={c.id || "all"}
          role="tab"
          aria-selected={value === c.id}
          onClick={() => onChange(c.id)}
          className={
            "flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors " +
            (value === c.id ? "bg-brand text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300")
          }
        >
          {c.name}
          <span className={"ml-1.5 text-[11.5px] font-medium " + (value === c.id ? "text-white/80" : "text-gray-400")}>{c.count}</span>
        </button>
      ))}
    </div>
  );
}
