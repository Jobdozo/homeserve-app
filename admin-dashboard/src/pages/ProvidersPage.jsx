import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { StarIcon, CheckIcon, XIcon } from "../components/icons";

const TABS = ["All", "Pending", "Approved", "Rejected"];
const PAGE = 60; // cards drawn at a time — with thousands of providers the list grows on "Show more"

const verificationStyles = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};

export default function ProvidersPage() {
  const { providers, approveProvider, rejectProvider } = useApp();
  const navigate = useNavigate();
  // Tab and search live in the address, so "Back to providers" returns to the same list.
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "All";
  const query = params.get("q") || "";
  const setParam = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== "All") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  const [shown, setShown] = useState(PAGE);
  const [capacities, setCapacities] = useState({});

  useEffect(() => {
    api.listProviderCapacities().then(setCapacities).catch(() => {});
  }, []);
  useEffect(() => setShown(PAGE), [tab, query]);

  const counts = useMemo(() => {
    const c = { All: providers.length };
    for (const p of providers) c[p.verificationStatus] = (c[p.verificationStatus] || 0) + 1;
    return c;
  }, [providers]);

  // Phone numbers match on their digits, so "98765 43210", "+91 9876543210" and "9876543210" all find the same person.
  const filtered = useMemo(() => {
    const inTab = tab === "All" ? providers : providers.filter((p) => p.verificationStatus === tab.toLowerCase());
    const q = query.trim().toLowerCase();
    if (!q) return inTab;
    const digits = q.replace(/\D/g, "");
    return inTab.filter((p) => {
      const phone = String(p.phone || "").replace(/\D/g, "");
      if (digits.length >= 3 && phone.includes(digits.replace(/^91(?=\d{10}$)/, ""))) return true;
      return [p.name, p.businessName, p.email, p.category].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [providers, tab, query]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setParam("tab", t)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-colors ${
              tab === t ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {t}
            <span className={`ml-1.5 ${tab === t ? "text-white/75" : "text-gray-400"}`}>{t === "All" ? counts.All : counts[t.toLowerCase()] || 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Search by phone number, name or business…"
          className="w-full max-w-md rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] outline-none focus:border-brand"
          aria-label="Search providers"
        />
        <span className="text-[12px] text-gray-400">
          {filtered.length} provider{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.slice(0, shown).map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/providers/${p.id}`)}
            className="cursor-pointer rounded-2xl bg-white p-4 shadow-card transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-2xl">
                {p.avatar}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-gray-900">{p.name}</p>
                <p className="truncate text-[11.5px] text-gray-500">{p.category}</p>
                {p.reviews > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                    <StarIcon filled width={12} height={12} /> {p.rating} ({p.reviews}+ reviews)
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-400">No reviews yet</p>
                )}
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verificationStyles[p.verificationStatus]}`}
              >
                {p.verificationStatus}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              <span>{p.live ? "🟢 Connected via Provider App" : "⚪ Managed by admin (no live app)"}</span>
              {capacities[p.id]?.restricted && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  Hidden from customers
                </span>
              )}
            </div>

            {p.phone && <p className="mt-2 text-[11.5px] text-gray-400">{p.phone}</p>}

            {p.verificationStatus === "pending" && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    rejectProvider(p.id);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-[12px] font-semibold text-red-600 active:scale-[0.98]"
                >
                  <XIcon width={13} height={13} /> Reject
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    approveProvider(p.id);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-[12px] font-semibold text-white active:scale-[0.98]"
                >
                  <CheckIcon width={13} height={13} /> Approve
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-gray-400">{query ? "No provider matches your search." : `No ${tab.toLowerCase()} providers.`}</p>
        )}
      </div>

      {filtered.length > shown && (
        <div className="text-center">
          <button onClick={() => setShown((n) => n + PAGE)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50">
            Show more ({filtered.length - shown} left)
          </button>
        </div>
      )}
    </div>
  );
}
