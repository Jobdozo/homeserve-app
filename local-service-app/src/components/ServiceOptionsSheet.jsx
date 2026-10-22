import { useCallback, useEffect, useMemo, useState } from "react";
import { SheetContext } from "./optionsSheetContext";
import { useApp } from "../context/AppContext";
import CategoryPhoto from "./CategoryPhoto";
import { XIcon, CheckIcon } from "./icons";
import { QtyStepper, RatingPill, inr } from "./ui";
import { unitPrice } from "../utils/cartMath";

// When a service has options (AC type, extras…), ADD opens this sheet instead
// of adding straight away. The total updates as choices change; the server
// prices the booking from the same options (see server/src/serviceOptions.js).

export function OptionsSheetProvider({ children }) {
  const [state, setState] = useState(null); // { service, likeServiceId }
  const open = useCallback((service, likeServiceId) => setState({ service, likeServiceId }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <SheetContext.Provider value={value}>
      {children}
      {state && <OptionsSheet service={state.service} likeServiceId={state.likeServiceId} onClose={() => setState(null)} />}
    </SheetContext.Provider>
  );
}

function OptionsSheet({ service, likeServiceId, onClose }) {
  const { cart, addToCart, getProvider } = useApp();
  const provider = getProvider(service.providerId);
  const groups = service.options || [];
  const line = cart.find((c) => c.serviceId === service.id);
  const [picked, setPicked] = useState(() => {
    if (line?.options) return line.options;
    // a required pick-one group starts on its first choice, so the price shows straight away
    const start = {};
    for (const g of groups) if (g.required && g.max === 1 && g.choices[0]) start[g.id] = [g.choices[0].id];
    return start;
  });
  const [qty, setQty] = useState(line?.quantity || 1);
  const [note, setNote] = useState(line?.issue || "");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (g, choiceId) =>
    setPicked((p) => {
      const cur = p[g.id] || [];
      if (g.max === 1) return { ...p, [g.id]: cur[0] === choiceId && !g.required ? [] : [choiceId] };
      if (cur.includes(choiceId)) return { ...p, [g.id]: cur.filter((x) => x !== choiceId) };
      if (cur.length >= g.max) return p;
      return { ...p, [g.id]: [...cur, choiceId] };
    });

  // Full-price choices arrive as their difference from the service price: the first one picked
  // takes the service price's place, further ones count in full (server/src/serviceOptions.js).
  let fullPicks = 0;
  const lines = groups.flatMap((g) =>
    (picked[g.id] || [])
      .map((id) => g.choices.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => ({ group: g.name, choice: c.name, price: g.fullPrice && fullPicks++ > 0 ? c.price + service.price : c.price }))
  );
  const unit = unitPrice(service, { optionLines: lines });
  const needsPick = groups.some((g) => g.fullPrice) && !fullPicks ? [{ name: "an option" }] : [];
  const missing = [...groups.filter((g) => g.required && !(picked[g.id] || []).length), ...needsPick];

  const add = () => {
    if (missing.length) return;
    addToCart(service.id, likeServiceId, { options: picked, optionLines: lines, quantity: qty, note: note.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-ink/60 lg:items-center lg:justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={`Choose options for ${service.name}`}>
      <button onClick={onClose} aria-label="Close" className="mx-auto mb-3 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-ink text-white active:scale-95 lg:hidden">
        <XIcon width={20} height={20} />
      </button>
      {/* overflow-clip, not -hidden: a hidden box can still be scrolled by the browser (focusing a
          choice deep in the list scrolled the whole panel away and left it blank); a clipped one can't. */}
      <div className="relative flex max-h-[86vh] w-full animate-slide-up flex-col overflow-clip rounded-t-[26px] bg-mist lg:max-w-lg lg:rounded-[26px]">
        {/* On a phone the round button above the sheet closes it; on a computer it sits on the photo's corner. */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-6 z-10 hidden h-10 w-10 items-center justify-center rounded-full bg-ink/80 text-white shadow-lg hover:bg-ink active:scale-95 lg:flex"
        >
          <XIcon width={18} height={18} />
        </button>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-[22px] bg-white">
            <div className="h-[170px]">
              <CategoryPhoto categoryId={service.categoryId} imageUrl={service.imageUrl} size={170} />
            </div>
            <div className="space-y-1.5 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[21px] font-extrabold leading-tight text-ink">{service.name}</h2>
                <RatingPill rating={service.rating} count={service.reviewCount} size="sm" />
              </div>
              {(service.tagline || service.includes?.length > 0) && <p className="text-[13.5px] leading-relaxed text-ink-soft">{service.tagline || service.includes.join(", ")}</p>}
              {provider && <p className="text-[12.5px] text-ink-muted">{provider.name}{provider.verified ? " · Verified" : ""}</p>}
            </div>
          </div>

          {groups.map((g) => {
            const cur = picked[g.id] || [];
            const single = g.max === 1;
            return (
              <fieldset key={g.id} className="rounded-[22px] bg-white p-3.5">
                <legend className="sr-only">{g.name}</legend>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[16px] font-extrabold text-ink">{g.name}</span>
                  {g.required && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${cur.length ? "bg-trust-light text-trust-dark" : "bg-marigold-light text-marigold-dark"}`}>
                      {cur.length ? "Done" : "Required"}
                    </span>
                  )}
                </div>
                <p className="pb-1.5 text-[12.5px] text-ink-muted">{single ? "Choose 1" : `Choose up to ${g.max}`}</p>
                {g.choices.map((c) => {
                  const on = cur.includes(c.id);
                  const full = !on && !single && cur.length >= g.max;
                  return (
                    <label key={c.id} className={`relative flex cursor-pointer items-center gap-3 border-t border-[#F0EEF7] py-2.5 ${full ? "opacity-45" : ""}`}>
                      <input type={single ? "radio" : "checkbox"} name={g.id} checked={on} disabled={full} onChange={() => toggle(g, c.id)} className="sr-only" />
                      <span className="flex-1 text-[14.5px] font-semibold text-ink">{c.name}</span>
                      <span className="text-[14px] text-ink tabular">{g.fullPrice ? inr(service.price + c.price) : c.price ? `+${inr(c.price)}` : "Included"}</span>
                      {single ? (
                        <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-brand" : "border-[#C9C4D9]"}`}>
                          {on && <span className="h-2.5 w-2.5 animate-pop rounded-full bg-brand" />}
                        </span>
                      ) : (
                        <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[7px] ${on ? "bg-brand" : "border-2 border-[#C9C4D9]"}`}>
                          {on && <CheckIcon width={13} height={13} stroke="#fff" strokeWidth={3.4} />}
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            );
          })}

          <label className="block rounded-[22px] bg-white p-3.5">
            <span className="text-[16px] font-extrabold text-ink">Anything the pro should know?</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="e.g. One AC is above the bed"
              className="mt-2 w-full resize-none rounded-2xl border border-line px-3 py-2.5 text-[14px] text-ink outline-none focus:border-brand"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 bg-white px-4 pb-5 pt-3 shadow-[0_-8px_24px_rgba(27,21,48,0.08)]">
          <div className="w-[128px] flex-shrink-0">
            <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} variant="outline" size="lg" label={service.name} />
          </div>
          <button
            onClick={add}
            disabled={missing.length > 0}
            className="flex h-[54px] flex-1 items-center justify-center rounded-2xl bg-brand px-3 text-[15.5px] font-bold text-white shadow-cta active:scale-[0.98] disabled:bg-ink-muted disabled:shadow-none"
          >
            {missing.length ? `Choose ${missing[0].name.toLowerCase()}` : `${line ? "Update" : "Add"} · ${inr(unit * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
