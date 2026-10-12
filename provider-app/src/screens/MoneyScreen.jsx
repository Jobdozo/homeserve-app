import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { PageTitle, PillTabs, Card, SectionTitle, Empty, inr } from "../components/biz";
import { DownloadIcon, DocIcon, ChevronRightIcon, PhoneIcon, ChatIcon } from "../components/icons";

const SUPPORT_PHONE = "+919419149336";

// Money: what customers paid this week (cash / UPI), Tikdum's fees and what you
// keep; the fee wallet; past weeks with a report; monthly fee invoices.
export default function MoneyScreen() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "earnings";
  const { provider, showToast } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    api.getMoney().then(setData).catch((e) => setError(e.message || "Couldn't load money"));
  }, []);

  const week = data?.cycles[0];
  const prev = data?.cycles[1];
  const change = week && prev?.collected ? Math.round(((week.collected - prev.collected) / prev.collected) * 100) : null;

  const shareReport = async () => {
    const rows = [["Week from", "Week to", "Jobs", "Collected", "Cash", "UPI", "Not marked", "Tikdum fees", "You keep"]];
    for (const c of data.cycles) rows.push([c.from, c.to, c.jobs, c.collected, c.cash, c.upi, c.unmarked, c.fees, c.kept]);
    const csv = rows.map((r) => r.join(",")).join("\n");
    const name = `tikdum-earnings-${data.cycles[data.cycles.length - 1].from}-to-${data.cycles[0].to}.csv`;
    const file = new File([csv], name, { type: "text/csv" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${provider.name} — earnings` });
        return;
      }
    } catch {
      return; // the person closed the share sheet
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Report downloaded");
  };

  return (
    <div className="flex flex-col pb-6 lg:mx-auto lg:w-full lg:max-w-3xl">
      <PageTitle eyebrow={provider.name} title="Money" />
      <PillTabs
        className="mt-3.5"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        items={[
          { id: "earnings", label: "Earnings" },
          { id: "wallet", label: "Wallet" },
          { id: "invoices", label: "Invoices & GST" },
        ]}
      />

      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
        {!data && !error && [240, 160].map((h) => <div key={h} className="animate-pulse rounded-[22px] bg-card" style={{ height: h }} />)}

        {data && tab === "earnings" && (
          <>
            <SectionTitle>This week</SectionTitle>
            <Card className="overflow-hidden">
              <div className="p-4">
                <p className="text-[13px] text-ink-muted">Collected from customers · {range(week.from, week.to)}</p>
                <p className="font-display text-[34px] font-extrabold text-ink tabular">{inr(week.collected)}</p>
                <p className="text-[13.5px] text-ink-muted">
                  {week.jobs} job{week.jobs === 1 ? "" : "s"}
                  {change !== null && (
                    <>
                      {" · "}
                      <span className={`font-bold ${change >= 0 ? "text-go-soft" : "text-red-400"}`}>
                        {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
                      </span>{" "}
                      vs last week
                    </>
                  )}
                </p>
              </div>
              <div className="mx-4 grid grid-cols-2 gap-3 border-t border-dashed border-gray-200 py-3.5">
                <Figure label="Cash" value={inr(week.cash)} />
                <Figure label="UPI" value={inr(week.upi)} />
                <Figure label="Tikdum fees" value={`−${inr(week.fees)}`} />
                <Figure label="You keep" value={inr(week.kept)} tone="text-go-soft" />
              </div>
              {week.unmarked > 0 && <p className="mx-4 -mt-1 mb-3 text-[12px] text-ink-muted">{inr(week.unmarked)} from jobs closed before "how did they pay" was asked.</p>}
              <button onClick={() => navigate("/dashboard?tab=done")} className="flex h-[50px] w-full items-center justify-center gap-1.5 border-t border-gray-100 text-[14.5px] font-extrabold text-brand-dark">
                See finished jobs <ChevronRightIcon width={16} height={16} />
              </button>
            </Card>

            <SectionTitle
              action={
                <button onClick={shareReport} className="flex h-10 items-center gap-2 rounded-[14px] bg-ink px-3.5 text-[13.5px] font-extrabold text-ground">
                  <DownloadIcon width={16} height={16} /> Report
                </button>
              }
            >
              Past weeks
            </SectionTitle>
            <Card className="px-4 py-1">
              {data.cycles.slice(1).map((c) => (
                <div key={c.from} className="flex items-center justify-between border-b border-dashed border-gray-100 py-3 last:border-0">
                  <span>
                    <span className="block text-[14.5px] font-bold text-ink">{range(c.from, c.to)}</span>
                    <span className="block text-[12px] text-ink-muted">
                      {c.jobs} job{c.jobs === 1 ? "" : "s"} · fees {inr(c.fees)}
                    </span>
                  </span>
                  <span className="text-[15px] font-extrabold text-ink tabular">{inr(c.collected)}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        {data && tab === "wallet" && (
          <>
            <div className="flex flex-col gap-3 rounded-[22px] bg-brand-night p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] text-[#C9C0F2]">Wallet for Tikdum fees</p>
                  <p className={`font-display text-[32px] font-extrabold tabular ${data.wallet.suspended ? "text-red-500" : "text-white"}`}>{inr(data.wallet.balance)}</p>
                  <p className="text-[13px] text-[#DCD5FF]">
                    {data.wallet.suspended
                      ? "New jobs are paused until you add money"
                      : data.wallet.jobsLeft !== null
                        ? `Enough for about ${data.wallet.jobsLeft} more job${data.wallet.jobsLeft === 1 ? "" : "s"}`
                        : "Tikdum's fee is taken from here when you finish a job"}
                  </p>
                </div>
                <button onClick={() => setAddOpen(true)} className="h-11 flex-shrink-0 rounded-[14px] bg-marigold px-4 text-[14px] font-extrabold text-marigold-ink">
                  Add money
                </button>
              </div>
              <p className="rounded-[14px] bg-white/10 px-3 py-2.5 text-[12.5px] leading-snug text-[#DCD5FF]">
                {data.wallet.lowAt ? `We'll message you when it drops to ${inr(data.wallet.lowAt)}. ` : ""}At ₹0 you stop getting new requests.
                {data.wallet.avgFee ? ` Your average fee is ${inr(data.wallet.avgFee)} a job.` : ""}
              </p>
            </div>
            <SectionTitle>Wallet history</SectionTitle>
            {data.wallet.history.length === 0 ? (
              <Empty title="Nothing yet" text="Money added and fees taken show here." />
            ) : (
              <Card className="px-4 py-1">
                {data.wallet.history.map((h, i) => (
                  <div key={`${h.at}-${i}`} className="flex items-center justify-between border-b border-dashed border-gray-100 py-3 last:border-0">
                    <span>
                      <span className="block text-[14.5px] font-bold text-ink">{h.label}</span>
                      <span className="block text-[12px] text-ink-muted">{when(h.at)}</span>
                    </span>
                    <span className={`text-[15px] font-extrabold tabular ${h.amount >= 0 ? "text-go-soft" : "text-ink"}`}>
                      {h.amount >= 0 ? "+" : "−"}
                      {inr(Math.abs(h.amount))}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {data && tab === "invoices" && (
          <>
            {!data.invoicing.on && data.invoicing.months.length === 0 ? (
              <Empty
                icon={<DocIcon width={30} height={30} />}
                title="No fee invoices yet"
                text="Tikdum issues a GST invoice for every fee once invoicing is switched on. Your fees are always listed in the wallet history."
              />
            ) : (
              <Card className="px-4 py-1">
                {data.invoicing.months.map((m) => (
                  <button key={m.month} onClick={() => navigate(`/money/invoices/${m.month}`)} className="flex w-full items-center gap-3 border-b border-dashed border-gray-100 py-3 text-left last:border-0">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px] bg-raised text-ink">
                      <DocIcon width={20} height={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-ink">{monthName(m.month)} fee invoices</span>
                      <span className="block text-[12px] text-ink-muted">
                        {m.count} invoice{m.count === 1 ? "" : "s"} · GST {inr(m.gst)}
                      </span>
                    </span>
                    <span className="text-[15px] font-extrabold text-ink tabular">{inr(m.total)}</span>
                  </button>
                ))}
                {data.invoicing.months.length === 0 && <p className="py-6 text-center text-[13px] text-ink-muted">Invoices show here from your next finished job.</p>}
              </Card>
            )}
          </>
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="w-full max-w-md rounded-t-[26px] bg-card p-5 sm:rounded-[26px]">
            <h2 className="font-display text-[21px] font-extrabold text-ink">Add money to your wallet</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
              Pay Tikdum by UPI or bank transfer and send us the receipt — we add it to your wallet, usually within the hour. Call or WhatsApp us for the payment details.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <a href={`tel:${SUPPORT_PHONE}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-raised text-[14px] font-bold text-ink">
                <PhoneIcon width={17} height={17} /> Call Tikdum
              </a>
              <a href={`https://wa.me/${SUPPORT_PHONE.slice(1)}?text=${encodeURIComponent(`Hi, I'd like to add money to my Tikdum wallet (${provider.name}).`)}`} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-go text-[14px] font-extrabold text-go-ink">
                <ChatIcon width={17} height={17} /> WhatsApp
              </a>
            </div>
            <button onClick={() => setAddOpen(false)} className="mt-2.5 h-11 w-full rounded-2xl text-[14px] font-bold text-ink-muted">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, tone = "text-ink" }) {
  return (
    <div>
      <p className="text-[12.5px] text-ink-muted">{label}</p>
      <p className={`text-[17px] font-extrabold tabular ${tone}`}>{value}</p>
    </div>
  );
}

const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const range = (a, b) => `${day(a)} – ${day(b)}`;
const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const monthName = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
