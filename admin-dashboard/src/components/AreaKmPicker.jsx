// Service area as a distance: − / + buttons, a slider and quick picks. Stored
// as text ("25 km") like before, so older free-text values still read; a value
// with no number (e.g. a town name) stays as it is until the distance is changed.
export const MAX_AREA_KM = 100;
export const areaKm = (text) => {
  const m = String(text || "").match(/(\d+(?:\.\d+)?)/);
  return m ? Math.min(MAX_AREA_KM, Math.max(1, Math.round(Number(m[1])))) : null;
};
const step = (km, dir) => {
  const by = (dir > 0 ? km >= 10 : km > 10) ? 5 : 1;
  return Math.min(MAX_AREA_KM, Math.max(1, km + dir * by));
};
const QUICK = [5, 10, 25, 50];

export default function AreaKmPicker({ value, onChange, disabled }) {
  const km = areaKm(value);
  const set = (n) => onChange(`${n} km`);
  const btn = "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 text-[18px] font-bold text-gray-700 hover:border-brand hover:text-brand disabled:opacity-40";
  return (
    <div className="mt-1 space-y-2 rounded-lg border border-gray-200 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button type="button" disabled={disabled || km === 1} onClick={() => set(step(km ?? 5, -1))} className={btn} aria-label="Smaller area">
          −
        </button>
        <span className="min-w-[96px] text-center text-[14px] font-bold text-gray-900">{km ? `${km} km` : "Not set"}</span>
        <button type="button" disabled={disabled || km === MAX_AREA_KM} onClick={() => set(km ? step(km, 1) : 5)} className={btn} aria-label="Bigger area">
          +
        </button>
        <input
          type="range"
          min={1}
          max={MAX_AREA_KM}
          value={km ?? 5}
          disabled={disabled}
          onChange={(e) => set(Number(e.target.value))}
          className="min-w-0 flex-1 accent-brand"
          aria-label="Service area in km"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => set(n)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${km === n ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {n} km
          </button>
        ))}
        <span className="text-[11px] font-normal text-gray-400">
          around their location{value && !km ? ` · now "${value}"` : ""}
        </span>
      </div>
    </div>
  );
}
