import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { SubHeader, Card, Switch, Empty, inr } from "../components/biz";
import { PlusIcon, TagIcon } from "../components/icons";

// Your own offers: up to three run at once, each with a code customers can
// also type. They come off your services only, at checkout.
export default function OffersScreen() {
  const [params, setParams] = useSearchParams();
  const { can, showToast } = useApp();
  const [data, setData] = useState(null);
  const creating = params.get("new") === "1";

  const load = () => api.listOffers().then(setData).catch(() => setData({ offers: [], max: 3 }));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (o) => {
    try {
      await api.setOfferActive(o.id, !o.live);
      load();
      showToast(o.live ? "Offer ended" : "Offer is live again");
    } catch (e) {
      showToast(e.message || "Couldn't change the offer");
    }
  };

  const live = (data?.offers || []).filter((o) => o.live);
  const canCreate = can("ads.manage") && data && live.length < data.max;

  return (
    <div className="flex flex-col pb-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <SubHeader
        title="Offers"
        subtitle={data ? `${live.length} of ${data.max} running` : undefined}
        right={
          canCreate && !creating ? (
            <button onClick={() => setParams({ new: "1" })} className="flex h-11 items-center gap-1.5 rounded-[14px] bg-ink px-4 text-[14px] font-extrabold text-ground">
              <PlusIcon width={16} height={16} strokeWidth={2.8} /> New
            </button>
          ) : null
        }
      />
      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        {creating && canCreate && (
          <OfferForm
            onDone={(created) => {
              setParams({});
              if (created) {
                load();
                showToast(`${created.code} is live`);
              }
            }}
          />
        )}
        {creating && data && !canCreate && <p className="rounded-2xl bg-marigold-wash px-4 py-3 text-[13px] text-marigold-soft">You can run {data.max} offers at a time — end one first.</p>}
        {!data && <div className="h-32 animate-pulse rounded-[22px] bg-card" />}
        {data && data.offers.length === 0 && !creating && (
          <Empty icon={<TagIcon width={30} height={30} />} title="No offers yet" text="A first-booking discount is the fastest way to win new customers in your area." />
        )}
        {data?.offers.map((o) => (
          <Card key={o.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-ink">{o.description}</p>
              <p className="text-[12.5px] text-ink-muted">
                Code <span className="font-bold text-ink-soft">{o.code}</span> · used {o.uses} time{o.uses === 1 ? "" : "s"}
                {o.endsAt ? ` · ${o.live ? "ends" : "ended"} ${new Date(o.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
              </p>
              <p className={`text-[12.5px] font-bold ${o.live ? "text-go-soft" : "text-ink-muted"}`}>{o.live ? "Live" : "Ended"}</p>
            </div>
            {can("ads.manage") && (o.live || !o.endsAt || Date.parse(o.endsAt) > Date.now()) && <Switch on={o.live} onChange={() => toggle(o)} label={`${o.code} live`} />}
          </Card>
        ))}
        <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
          Customers see your offers on your profile and in their cart, and the discount comes off your services only. You collect the lower amount; Tikdum's fee is worked out on what the customer pays.
        </p>
      </div>
    </div>
  );
}

function OfferForm({ onDone }) {
  const [kind, setKind] = useState("percent");
  const [value, setValue] = useState("15");
  const [maxDiscount, setMaxDiscount] = useState("150");
  const [minOrder, setMinOrder] = useState("");
  const [audience, setAudience] = useState("new");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const v = Number(value) || 0;
  const preview =
    kind === "percent"
      ? `${v}% off${Number(maxDiscount) > 0 ? ` up to ${inr(maxDiscount)}` : ""}${Number(minOrder) > 0 ? ` on ${inr(minOrder)}+` : ""}`
      : `${inr(v)} off${Number(minOrder) > 0 ? ` on ${inr(minOrder)}+` : ""}`;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api.createOffer({
        kind,
        value: v,
        maxDiscount: kind === "percent" ? Number(maxDiscount) || 0 : 0,
        minOrder: Number(minOrder) || 0,
        audience,
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
      });
      onDone(created);
    } catch (err) {
      setError(err.message || "Couldn't create the offer");
      setBusy(false);
    }
  };

  const field = "h-12 w-full rounded-[14px] border border-gray-200 bg-raised px-3.5 text-[15px] text-ink outline-none focus:border-brand";
  const seg = (on) => `h-11 rounded-xl text-[14px] font-bold ${on ? "bg-ink text-ground" : "border border-gray-300 text-ink"}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[22px] border border-gray-200 bg-card p-4">
      <h2 className="font-display text-[19px] font-bold text-ink">New offer</h2>
      <div>
        <p className="mb-2 text-[13px] font-bold text-ink-soft">Type</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={seg(kind === "percent")} onClick={() => { setKind("percent"); setValue("15"); }} aria-pressed={kind === "percent"}>
            % off
          </button>
          <button type="button" className={seg(kind === "flat")} onClick={() => { setKind("flat"); setValue("100"); setMinOrder("999"); }} aria-pressed={kind === "flat"}>
            ₹ off
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-soft">
          {kind === "percent" ? "Discount %" : "Amount off ₹"}
          <input className={field} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} required />
        </label>
        {kind === "percent" ? (
          <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-soft">
            Most it can save ₹
            <input className={field} inputMode="numeric" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value.replace(/\D/g, ""))} placeholder="No limit" />
          </label>
        ) : (
          <span />
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-soft">
          Minimum booking ₹
          <input className={field} inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/\D/g, ""))} placeholder="Any amount" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink-soft">
          Ends on
          <input className={field} type="date" value={endsAt} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-bold text-ink-soft">Who can use it</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={seg(audience === "new")} onClick={() => setAudience("new")} aria-pressed={audience === "new"}>
            New customers
          </button>
          <button type="button" className={seg(audience === "all")} onClick={() => setAudience("all")} aria-pressed={audience === "all"}>
            Everyone
          </button>
        </div>
      </div>
      <p className="rounded-[14px] bg-raised px-3.5 py-3 text-[14px] text-ink">
        Customers will see: <span className="font-extrabold">{preview}</span>
        {audience === "new" ? " · your first booking" : ""}
      </p>
      {error && <p className="text-[13px] text-red-500">{error}</p>}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" onClick={() => onDone(null)} className="h-12 rounded-[14px] border border-gray-300 text-[14.5px] font-bold text-ink">
          Cancel
        </button>
        <button type="submit" disabled={busy || !v} className="h-12 rounded-[14px] bg-go text-[15px] font-extrabold text-go-ink disabled:opacity-40">
          {busy ? "Creating…" : "Start offer"}
        </button>
      </div>
    </form>
  );
}
