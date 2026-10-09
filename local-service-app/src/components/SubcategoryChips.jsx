import CategoryPhoto from "./CategoryPhoto";
import { typeIllustration } from "../utils/illustrations";

// Long names such as "Installation/uninstallation" may wrap after a slash or hyphen (and, as a last
// resort, anywhere) instead of spilling over the next tile.
function softBreak(name) {
  return String(name)
    .split(/(?<=[/-])/)
    .flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

// One picture tile for a type (or "All"): used in the mobile row, the desktop
// "Select a service" panel and the home page rows.
export function TypeTile({ name, imageUrl, categoryId, active, onClick, className = "", sub }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={Boolean(active)}
      className={"flex min-w-0 flex-col items-center gap-1.5 text-center " + className}
    >
      <span
        className={
          "block h-16 w-16 overflow-hidden rounded-2xl border-2 bg-gray-50 transition-colors " +
          (active ? "border-brand" : "border-transparent")
        }
      >
        <CategoryPhoto categoryId={categoryId} imageUrl={imageUrl} fallbackSrc={name === "All" ? null : typeIllustration(name, categoryId)} size={64} rounded="rounded-xl" />
      </span>
      <span className={"w-full min-w-0 text-[11.5px] leading-tight [overflow-wrap:anywhere] " + (active ? "font-bold text-brand-dark" : "font-medium text-gray-700")}>{softBreak(name)}</span>
      {sub && <span className="-mt-1 text-[10.5px] text-gray-400">{sub}</span>}
    </button>
  );
}

// "All | Window AC | Split AC | VRF AC" as a row of picture tiles (mobile).
export default function SubcategoryChips({ chips, value, onChange, categoryId, showAll = true, className = "" }) {
  if (!chips.length) return null;
  return (
    <div role="tablist" aria-label="Type" className={"no-scrollbar flex gap-4 overflow-x-auto pb-1 " + className}>
      {showAll && <TypeTile name="All" categoryId={categoryId} active={value === ""} onClick={() => onChange("")} className="w-[76px] flex-shrink-0" />}
      {chips.map((c) => (
        <TypeTile
          key={c.id}
          name={c.name}
          imageUrl={c.imageUrl}
          categoryId={categoryId}
          active={value === c.id}
          onClick={() => onChange(c.id)}
          className="w-[76px] flex-shrink-0"
        />
      ))}
    </div>
  );
}
