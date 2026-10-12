import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { PageTitle, Card, SectionTitle, inr } from "../components/biz";
import { TagIcon, MegaphoneIcon, ChevronRightIcon, PlusIcon, QrIcon, DownloadIcon } from "../components/icons";

export const PUBLIC_SITE = "https://tikdum.com";

// Grow: offers, ads, the link old customers book you again with, and the
// team & account settings that used to live under Profile.
export default function GrowScreen() {
  const navigate = useNavigate();
  const { provider, can, showToast } = useApp();
  const [offers, setOffers] = useState(null);
  const [ads, setAds] = useState(null);
  const [qr, setQr] = useState(null);
  const link = `${PUBLIC_SITE}/provider/${provider.id}`;

  useEffect(() => {
    api.listOffers().then((d) => setOffers(d.offers)).catch(() => setOffers([]));
    if (can("ads.manage")) api.listAds().then(setAds).catch(() => setAds([]));
  }, [can]);

  const live = (offers || []).filter((o) => o.live);
  const adClicks = (ads || []).reduce((n, a) => n + (a.clicks || 0), 0);
  const adSpent = (ads || []).reduce((n, a) => n + (a.amountSpent || 0), 0);
  const adsRunning = (ads || []).filter((a) => a.status === "active").length;

  const shareWhatsApp = () => {
    const text = `Book ${provider.name} on Tikdum — trusted, verified and you pay after the job: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied");
    } catch {
      showToast(link);
    }
  };
  const showQr = async () => {
    setQr(await QRCode.toDataURL(link, { width: 640, margin: 2, color: { dark: "#1B1530", light: "#FFFFFF" } }));
  };

  const account = [
    can(["staff.view", "staff.manage"]) && { to: "/profile/staff", label: "Staff & permissions", sub: "Who can accept jobs and see money" },
    can("profile.edit") && { to: "/profile/availability", label: "Working hours & area", sub: "When and where you take jobs" },
    can("profile.edit") && { to: "/profile/documents", label: "Documents & KYC", sub: provider.verified ? "Verified" : "Finish verification to get more jobs", good: provider.verified },
    can("profile.edit") && { to: "/profile/edit", label: "Business profile", sub: "Name, photo, GST and Udyam" },
    { to: "/profile/notifications", label: "Alerts & ringtone", sub: "How new jobs ring on this phone" },
    { to: "/profile/refer", label: "Invite another pro", sub: "You both get a reward after their first jobs" },
    { to: "/profile/help", label: "Help & support", sub: "Call, WhatsApp or email Tikdum" },
    { to: "/profile", label: "Account", sub: "Sign out, delete account, terms" },
  ].filter(Boolean);

  return (
    <div className="flex flex-col pb-6 lg:mx-auto lg:w-full lg:max-w-3xl">
      <PageTitle eyebrow={provider.name} title="Grow your business" />
      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        {/* offers */}
        <Card className="overflow-hidden">
          <button onClick={() => navigate("/grow/offers")} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px] bg-marigold-wash text-marigold">
              <TagIcon width={22} height={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold text-ink">Offers</span>
              <span className="block text-[12.5px] text-ink-muted">Turn people who look into people who book</span>
            </span>
            {live.length > 0 && <span className="rounded-lg bg-go-wash px-2 py-0.5 text-[12px] font-extrabold tracking-wide text-go-soft">{live.length} LIVE</span>}
          </button>
          {live.length > 0 && (
            <div className="mx-4 space-y-2.5 border-t border-dashed border-gray-200 py-3">
              {live.map((o) => (
                <div key={o.id} className="flex justify-between gap-2.5">
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold text-ink">{o.description}</span>
                    <span className="block text-[12px] text-ink-muted">
                      Code {o.code} · used {o.uses} time{o.uses === 1 ? "" : "s"}
                      {o.endsAt ? ` · ends ${new Date(o.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
          {can("ads.manage") && (
            <div className="px-4 pb-4">
              <button onClick={() => navigate("/grow/offers?new=1")} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-ink text-[14.5px] font-extrabold text-ground">
                <PlusIcon width={16} height={16} strokeWidth={2.8} /> Create an offer
              </button>
            </div>
          )}
        </Card>

        {/* ads */}
        {can("ads.manage") && (
          <Card className="flex flex-col gap-3 px-4 py-3.5">
            <button onClick={() => navigate("/profile/ads")} className="flex items-center gap-3 text-left">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[14px] bg-brand-light text-brand-dark">
                <MegaphoneIcon width={22} height={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold text-ink">Ads</span>
                <span className="block text-[12.5px] text-ink-muted">Show up first when people search · paid per click</span>
              </span>
              <ChevronRightIcon width={18} height={18} className="text-ink-muted" />
            </button>
            {ads && ads.length > 0 && (
              <div className="grid grid-cols-3 gap-2 rounded-[14px] bg-raised p-3 text-center">
                <Stat value={adsRunning} label="Running" />
                <Stat value={adClicks.toLocaleString("en-IN")} label="Customer clicks" />
                <Stat value={inr(adSpent)} label="Spent" />
              </div>
            )}
          </Card>
        )}

        {/* your link */}
        <div className="flex flex-col gap-3 rounded-[22px] bg-brand-night p-4">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-marigold">Your Tikdum link</p>
            <p className="font-display text-[19px] font-bold leading-tight text-white">Old customers can book you again in one tap</p>
          </div>
          <button onClick={copyLink} className="truncate rounded-xl bg-white/10 px-3 py-2.5 text-left text-[13.5px] font-bold text-[#DCD5FF]" title="Copy link">
            {link.replace("https://", "")}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={shareWhatsApp} className="h-[46px] rounded-[14px] bg-go text-[14px] font-extrabold text-go-ink">
              Share on WhatsApp
            </button>
            <button onClick={showQr} className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] bg-white/10 text-[14px] font-extrabold text-white">
              <QrIcon width={17} height={17} /> QR code
            </button>
          </div>
        </div>

        <SectionTitle>Your team & account</SectionTitle>
        <Card className="px-4 py-1">
          {account.map((a) => (
            <button key={a.to} onClick={() => navigate(a.to)} className="flex w-full items-center gap-3 border-b border-dashed border-gray-100 py-3 text-left last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{a.label}</span>
                <span className={`block truncate text-[12.5px] ${a.good ? "text-go-soft" : "text-ink-muted"}`}>{a.sub}</span>
              </span>
              <ChevronRightIcon width={18} height={18} className="flex-shrink-0 text-ink-muted" />
            </button>
          ))}
        </Card>
      </div>

      {qr && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={(e) => e.target === e.currentTarget && setQr(null)}>
          <div className="w-full max-w-sm rounded-t-[26px] bg-card p-5 text-center sm:rounded-[26px]">
            <h2 className="font-display text-[20px] font-extrabold text-ink">Scan to book {provider.name}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">Print it on your visiting card, van or shop counter.</p>
            <img src={qr} alt={`QR code that opens ${link}`} className="mx-auto mt-4 w-full max-w-[260px] rounded-2xl" />
            <a href={qr} download={`tikdum-${provider.name.replace(/\W+/g, "-").toLowerCase()}-qr.png`} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink text-[14.5px] font-extrabold text-ground">
              <DownloadIcon width={17} height={17} /> Save image
            </a>
            <button onClick={() => setQr(null)} className="mt-2 h-11 w-full rounded-2xl text-[14px] font-bold text-ink-muted">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-[17px] font-extrabold text-ink tabular">{value}</p>
      <p className="text-[11.5px] text-ink-muted">{label}</p>
    </div>
  );
}
