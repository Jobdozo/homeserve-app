import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Choices a customer makes when adding this service (e.g. "AC type": Split +₹50 /
// Window), each adding to the service price. Saved separately from the rest of
// the service; optionally copied to every service with the same name.
const blankChoice = () => ({ name: "", price: "" });
const blankGroup = () => ({ name: "", required: true, max: 1, choices: [blankChoice(), blankChoice()] });

// A required pick-one group whose every choice costs as much as the service
// itself was almost certainly typed as full prices (1 BHK ₹4,500 on a ₹4,500
// service → customer pays ₹9,000); the editor offers to turn them into extras.
function looksLikeFullPrices(group, basePrice) {
  const prices = group.choices.filter((c) => String(c.name).trim()).map((c) => Number(c.price) || 0);
  return Boolean(!group.fullPrice && group.required && group.max === 1 && basePrice > 0 && prices.length && Math.min(...prices) >= basePrice);
}
// What the customer pays when only this choice is picked (server/src/serviceOptions.js prices it the same way).
const pays = (group, choice, basePrice) => (group.fullPrice ? 0 : basePrice) + (Number(choice.price) || 0);

export default function ServiceOptionsEditor({ service }) {
  const { showToast } = useApp();
  const [groups, setGroups] = useState(null);
  const [sameNameCount, setSameNameCount] = useState(1);
  const [sameName, setSameName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api
      .getServiceOptions(service.id)
      .then((r) => {
        setGroups(r.groups || []);
        setSameNameCount(r.sameNameCount || 1);
      })
      .catch(() => setGroups([]));
  }, [service.id]);

  const change = (fn) => {
    setGroups((g) => fn(structuredClone(g)));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = groups.map((g) => ({ ...g, choices: g.choices.filter((c) => c.name.trim()).map((c) => ({ ...c, price: Number(c.price) || 0 })) }));
      const r = await api.setServiceOptions(service.id, clean, sameName);
      setGroups(r.groups);
      setDirty(false);
      showToast(r.groups.length ? `Options saved${r.updated > 1 ? ` on ${r.updated} services` : ""}` : "Options removed");
    } catch (e) {
      showToast(e.message || "Couldn't save the options");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand";
  if (groups === null) return <p className="text-[12px] text-gray-400">Loading options…</p>;

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12.5px] font-bold text-gray-900">Options customers choose</p>
          <p className="text-[11px] text-gray-500">
            Each choice adds its price to ₹{service.price} (AC type, extras…), or — with "Choice price is the full price" — replaces it (1 BHK ₹4,500 / 2 BHK ₹6,500).
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {groups.map((g, gi) => (
          <div key={g.id || gi} className="rounded-lg bg-gray-50 p-2.5">
            <div className="flex gap-2">
              <input value={g.name} onChange={(e) => change((x) => ((x[gi].name = e.target.value), x))} placeholder="Group name, e.g. AC type" className={input} />
              <button type="button" onClick={() => change((x) => x.filter((_, i) => i !== gi))} className="flex-shrink-0 px-1 text-[11.5px] font-semibold text-red-500">
                Remove
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-gray-600">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={g.required} onChange={(e) => change((x) => ((x[gi].required = e.target.checked), x))} className="accent-brand" />
                Required
              </label>
              <label className="flex items-center gap-1.5">
                Customer picks up to
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, g.choices.length)}
                  value={g.max}
                  onChange={(e) => change((x) => ((x[gi].max = Math.max(1, Math.min(x[gi].choices.length || 1, Number(e.target.value) || 1))), x))}
                  className="w-12 rounded border border-gray-200 px-1.5 py-0.5 text-center"
                />
              </label>
              <label className="flex items-center gap-1.5" title={`On: the choice's price replaces ₹${service.price}. Off: it's added to ₹${service.price}.`}>
                <input type="checkbox" checked={Boolean(g.fullPrice)} onChange={(e) => change((x) => ((x[gi].fullPrice = e.target.checked), x))} className="accent-brand" />
                Choice price is the full price
              </label>
            </div>
            {looksLikeFullPrices(g, service.price) && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11.5px] text-amber-800">
                These look like full prices. Right now customers pay ₹{service.price} <b>plus</b> the choice, e.g. {g.choices[0]?.name || "choice 1"} = ₹
                {pays(g, g.choices[0] || {}, service.price).toLocaleString("en-IN")}.
                <button type="button" onClick={() => change((x) => ((x[gi].fullPrice = true), x))} className="ml-1 font-semibold text-brand underline">
                  Use them as full prices
                </button>
              </div>
            )}
            <div className="mt-2 space-y-1.5">
              {g.choices.map((c, ci) => (
                <div key={c.id || ci} className="flex items-center gap-1.5">
                  <input value={c.name} onChange={(e) => change((x) => ((x[gi].choices[ci].name = e.target.value), x))} placeholder={`Choice ${ci + 1}`} className={input} />
                  <span className="text-[12px] text-gray-400">{g.fullPrice ? "₹" : "+₹"}</span>
                  <input
                    type="number"
                    min="0"
                    value={c.price}
                    onChange={(e) => change((x) => ((x[gi].choices[ci].price = e.target.value), x))}
                    placeholder="0"
                    className="w-20 flex-shrink-0 rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-brand"
                  />
                  <span className="w-16 flex-shrink-0 text-right text-[11px] text-gray-400 tabular-nums" title="What the customer pays for this choice">
                    = ₹{pays(g, c, service.price).toLocaleString("en-IN")}
                  </span>
                  <button type="button" aria-label="Remove choice" onClick={() => change((x) => ((x[gi].choices = x[gi].choices.filter((_, i) => i !== ci)), x))} className="px-1 text-[14px] text-gray-400 hover:text-red-500">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => change((x) => (x[gi].choices.push(blankChoice()), x))} className="text-[11.5px] font-semibold text-brand">
                + Add a choice
              </button>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => change((x) => [...x, blankGroup()])} className="mt-3 w-full rounded-lg border border-dashed border-brand/50 py-1.5 text-[12px] font-semibold text-brand">
        + Add an option group
      </button>

      {sameNameCount > 1 && (
        <label className="mt-3 flex items-center gap-2 text-[11.5px] text-gray-600">
          <input type="checkbox" checked={sameName} onChange={(e) => { setSameName(e.target.checked); setDirty(true); }} className="accent-brand" />
          Also use these on all {sameNameCount} "{service.name}" services (every provider)
        </label>
      )}

      <button type="button" onClick={save} disabled={saving || !dirty} className="mt-3 w-full rounded-lg bg-gray-900 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
        {saving ? "Saving…" : "Save options"}
      </button>
    </div>
  );
}
