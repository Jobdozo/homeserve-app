import { CameraIcon, InfoIcon } from "./icons";
import { Card, Switch } from "./biz";
import { useState } from "react";

// The service score gauge against top pros, then the two changes that move it
// most: real photos, and pausing services nobody books.
export default function ServiceScore({ score, services, onPhoto, onToggle, photoBusy }) {
  const [explain, setExplain] = useState(false);
  if (!score || score.score === null) return null;
  const s = score.score;
  const top = score.top ?? 100;
  const word = s >= 85 ? "Great" : s >= 65 ? "Good" : s >= 45 ? "Fair" : "Needs work";
  const tone = s >= 65 ? "#2BC27A" : s >= 45 ? "#F5A524" : "#FF7A7A";
  const byId = new Map(services.map((x) => [x.id, x]));
  const unbooked = score.unbooked.map((u) => byId.get(u.id)).filter((x) => x && x.status === "active").slice(0, 3);

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[18px] font-bold text-ink">Your service score</h2>
          <button onClick={() => setExplain((v) => !v)} aria-expanded={explain} aria-label="How the score works" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted">
            <InfoIcon width={18} height={18} />
          </button>
        </div>
        {explain && (
          <p className="rounded-[14px] bg-raised px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
            Each live service earns up to 100: your own photo 40, a tagline or what's included 30, options for customers to choose 15, a price close to what others charge 15. Your score is the average; top pros are the best 10% on Tikdum.
          </p>
        )}
        <div className="relative flex h-[150px] justify-center">
          <svg width="260" height="150" viewBox="0 0 260 150" role="img" aria-label={`Score ${s} out of 100; top pros score ${top}`}>
            <path d="M30 136 A100 100 0 0 1 230 136" fill="none" stroke="#332D48" strokeWidth="20" strokeLinecap="round" pathLength="100" />
            <path d="M30 136 A100 100 0 0 1 230 136" fill="none" stroke={tone} strokeWidth="20" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(0.5, s)} 100`} />
            <path d="M30 136 A100 100 0 0 1 230 136" fill="none" stroke="#F4F2FA" strokeWidth="26" pathLength="100" strokeDasharray={`0 ${Math.max(0, top - 0.3)} 0.6 100`} />
          </svg>
          <span className="absolute inset-x-0 bottom-3 text-center font-display text-[32px] font-extrabold" style={{ color: tone }}>
            {word}
          </span>
        </div>
        <div className="grid grid-cols-2 text-center">
          <div>
            <p className="font-display text-[24px] font-extrabold text-ink">{s}%</p>
            <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: tone }} /> Your score
            </p>
          </div>
          <div>
            <p className="font-display text-[24px] font-extrabold text-ink">{top}%</p>
            <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-ink-muted">
              <span className="h-[3px] w-2 bg-ink" /> Top pros
            </p>
          </div>
        </div>
      </Card>

      {score.noPhoto.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3.5">
            <p className="text-[16px] font-extrabold text-ink">
              Add your own photo to {score.noPhoto.length} service{score.noPhoto.length === 1 ? "" : "s"}
            </p>
            <p className="text-[12.5px] text-ink-muted">
              Raises your score by up to <span className="font-bold text-go-soft">{score.photoGain}%</span> — a real photo of your work gets booked more than a stock one
            </p>
          </div>
          {score.noPhoto.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-dashed border-gray-100 px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{p.name}</p>
                <p className="text-[12.5px] text-ink-muted">₹{p.price}</p>
                <p className={`text-[12.5px] font-semibold ${p.bookings60 ? "text-go-soft" : "text-ink-muted"}`}>
                  {p.bookings60} booking{p.bookings60 === 1 ? "" : "s"} in 60 days
                </p>
              </div>
              <label className={`flex h-[88px] w-[88px] flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-gray-300 text-[13px] font-extrabold text-ink ${photoBusy === p.id ? "opacity-50" : ""}`}>
                <CameraIcon width={22} height={22} />
                {photoBusy === p.id ? "Uploading…" : "Add photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={photoBusy === p.id}
                  onChange={(e) => {
                    onPhoto(p.id, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          ))}
        </Card>
      )}

      {unbooked.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3.5">
            <p className="text-[16px] font-extrabold text-ink">Pause services nobody books</p>
            <p className="text-[12.5px] text-ink-muted">A shorter list is easier for customers to choose from — switch one back on any time</p>
          </div>
          {unbooked.map((svc) => (
            <div key={svc.id} className="flex items-center gap-3 border-b border-dashed border-gray-100 px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{svc.name}</p>
                <p className="text-[12.5px] font-semibold text-red-400">No bookings in the last 60 days</p>
              </div>
              <Switch on={svc.status === "active"} onChange={() => onToggle(svc.id)} label={`${svc.name} available`} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
