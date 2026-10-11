import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { StarIcon, CheckIcon, XIcon } from "../components/icons";

const TABS = [
  ["all", "All"],
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
];
const PAGE = 60;
const SORTS = [
  ["newest", "Newest first"],
  ["name", "Name A–Z"],
  ["rating", "Highest rated"],
  ["wallet", "Lowest wallet"],
  ["lastSeen", "Recently active"],
];
const verificationStyles = { pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700", rejected: "bg-red-100 text-red-600" };
const SEVERITY = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", low: "bg-gray-100 text-gray-600" };
const ALERT_LABEL = {
  document_expired: "Document expired",
  document_expiring: "Document expiring",
  documents_waiting: "Documents to review",
  wallet_empty: "Wallet empty",
  wallet_low: "Wallet low",
  inactive: "Inactive",
  rating_drop: "Rating dropping",
};
const FILTER_KEYS = ["q", "status", "category", "pin", "tag", "docs", "wallet", "inactiveDays", "maxRating", "paused", "sort"];

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function downloadCsv(rows) {
  const head = ["Name", "Business", "Phone", "Email", "Category", "Status", "Rating", "Reviews", "Wallet (₹)", "Documents waiting", "Documents complete", "Tags", "Paused", "Last active", "Joined"];
  const lines = rows.map((p) =>
    [p.name, p.businessName, p.phone, p.email, p.category, p.verificationStatus, p.rating, p.reviews, p.walletBalance, p.docsWaiting, p.kycComplete ? "yes" : "no", (p.tags || []).join("; "), p.paused ? p.paused.reason : "", p.lastSeenAt ? p.lastSeenAt.slice(0, 10) : "", p.joinedAt ? String(p.joinedAt).slice(0, 10) : ""]
      .map(csvCell)
      .join(",")
  );
  const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tikdum-providers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Providers Verification: the list is searched and filtered on the server and loaded a page at a time, so it
// stays fast with thousands of providers. Filters live in the address, so "Back to providers" keeps them.
export default function ProvidersPage() {
  const { categories, approveProvider, rejectProvider, showToast } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ""]));
  const status = f.status || "all";
  const setParam = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );

  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [tags, setTags] = useState([]);
  const [alerts, setAlerts] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [msg, setMsg] = useState({ title: "", message: "" });
  const [bulkBusy, setBulkBusy] = useState(false);
  const queryKey = FILTER_KEYS.map((k) => `${k}=${f[k]}`).join("&");
  const latest = useRef(0);

  const load = useCallback(
    async (pageNo) => {
      const ticket = ++latest.current;
      setLoading(true);
      try {
        const r = await api.searchProviders({ ...f, status, page: pageNo, pageSize: PAGE });
        if (ticket !== latest.current) return; // a newer search has started
        setResult(r);
        setRows((prev) => (pageNo === 1 ? r.rows : [...prev, ...r.rows]));
        setPage(pageNo);
      } catch (e) {
        if (ticket === latest.current) showToast(e.message || "Couldn't load providers");
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey]
  );

  // typing in the search box waits a moment before asking the server
  useEffect(() => {
    const t = setTimeout(() => load(1), f.q ? 300 : 0);
    setSelected(new Set());
    return () => clearTimeout(t);
  }, [load, f.q]);

  useEffect(() => {
    api.listProviderTags().then(setTags).catch(() => {});
    api.getProviderAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  const alertCounts = useMemo(() => {
    const c = {};
    for (const a of alerts || []) c[a.type] = (c[a.type] || 0) + 1;
    return c;
  }, [alerts]);

  const toggleSel = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allShownSelected = rows.length > 0 && rows.every((p) => selected.has(p.id));

  const verify = async (fn, id) => {
    try {
      await fn(id);
      await load(1);
    } catch (e) {
      showToast(e.message || "Action failed");
    }
  };

  const bulkApprove = async () => {
    const ids = rows.filter((p) => selected.has(p.id) && p.verificationStatus !== "approved").map((p) => p.id);
    if (!ids.length) return showToast("The selected providers are already approved");
    setBulkBusy(true);
    let done = 0;
    const failed = [];
    for (const id of ids) {
      try {
        await api.setProviderVerification(id, "approved");
        done++;
      } catch (e) {
        failed.push(`${rows.find((p) => p.id === id)?.name}: ${e.message}`);
      }
    }
    setBulkBusy(false);
    showToast(failed.length ? `${done} approved. ${failed.length} not: ${failed[0]}${failed.length > 1 ? " …" : ""}` : `${done} approved`);
    setSelected(new Set());
    load(1);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    setBulkBusy(true);
    try {
      const r = await api.messageProviders([...selected], msg.title.trim(), msg.message.trim());
      showToast(`Sent to ${r.sent} provider${r.sent === 1 ? "" : "s"}`);
      setMessaging(false);
      setMsg({ title: "", message: "" });
    } catch (err) {
      showToast(err.message || "Couldn't send it");
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = async () => {
    try {
      const all = await api.searchProviders({ ...f, status, all: "1" });
      downloadCsv(selected.size ? all.rows.filter((p) => selected.has(p.id)) : all.rows);
    } catch (e) {
      showToast(e.message || "Couldn't export");
    }
  };

  const input = "rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-brand";
  const activeFilters = ["category", "pin", "tag", "docs", "wallet", "inactiveDays", "maxRating", "paused"].filter((k) => f[k]).length;

  return (
    <div className="space-y-4">
      {alerts && alerts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <button onClick={() => setAlertsOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
            <span className="text-[14px] font-bold text-amber-900">Needs attention · {alerts.length}</span>
            <span className="flex flex-wrap gap-1.5">
              {Object.entries(alertCounts).map(([type, n]) => (
                <span key={type} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {ALERT_LABEL[type] || type}: {n}
                </span>
              ))}
              <span className="text-[12px] font-semibold text-amber-700">{alertsOpen ? "Hide" : "Show"}</span>
            </span>
          </button>
          {alertsOpen && (
            <div className="mt-3 max-h-80 divide-y divide-amber-100 overflow-auto rounded-xl bg-white">
              {alerts.map((a, i) => (
                <button key={i} onClick={() => navigate(`/providers/${a.providerId}`)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-amber-50/50">
                  <span className={`w-36 flex-shrink-0 rounded-full px-2 py-0.5 text-center text-[10.5px] font-semibold ${SEVERITY[a.severity]}`}>{ALERT_LABEL[a.type] || a.type}</span>
                  <span className="w-40 flex-shrink-0 truncate font-semibold text-gray-800">{a.name}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-500">{a.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-card">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setParam("status", key)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-colors ${status === key ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"}`}
          >
            {label}
            <span className={`ml-1.5 ${status === key ? "text-white/75" : "text-gray-400"}`}>{result?.counts?.[key] ?? "…"}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <input value={f.q} onChange={(e) => setParam("q", e.target.value)} placeholder="Search by phone number, name, business or tag…" className={`${input} min-w-[240px] flex-1`} aria-label="Search providers" />
          <select value={f.sort || "newest"} onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)} className={input} aria-label="Sort">
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button onClick={() => setMoreFilters((v) => !v)} className={`${input} font-semibold text-gray-600`}>
            Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </button>
          <button onClick={exportCsv} className={`${input} font-semibold text-gray-600`}>
            Export CSV
          </button>
        </div>
        {(moreFilters || activeFilters > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={f.category} onChange={(e) => setParam("category", e.target.value)} className={input} aria-label="Category">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <input value={f.pin} onChange={(e) => setParam("pin", e.target.value.replace(/[^0-9]/g, ""))} placeholder="PIN code" inputMode="numeric" maxLength={6} className={`${input} w-28`} aria-label="PIN code" />
            <select value={f.tag} onChange={(e) => setParam("tag", e.target.value)} className={input} aria-label="Tag">
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={f.docs} onChange={(e) => setParam("docs", e.target.value)} className={input} aria-label="Documents">
              <option value="">Any documents</option>
              <option value="waiting">Documents waiting for review</option>
              <option value="incomplete">Required documents missing</option>
            </select>
            <select value={f.wallet} onChange={(e) => setParam("wallet", e.target.value)} className={input} aria-label="Wallet">
              <option value="">Any wallet</option>
              <option value="low">Low or empty wallet</option>
            </select>
            <select value={f.inactiveDays} onChange={(e) => setParam("inactiveDays", e.target.value)} className={input} aria-label="Activity">
              <option value="">Any activity</option>
              <option value="7">Inactive 7+ days</option>
              <option value="30">Inactive 30+ days</option>
            </select>
            <select value={f.maxRating} onChange={(e) => setParam("maxRating", e.target.value)} className={input} aria-label="Rating">
              <option value="">Any rating</option>
              <option value="4">Rated under 4</option>
              <option value="3.5">Rated under 3.5</option>
            </select>
            <select value={f.paused} onChange={(e) => setParam("paused", e.target.value)} className={input} aria-label="Paused">
              <option value="">Paused or not</option>
              <option value="yes">Paused only</option>
            </select>
            {activeFilters > 0 && (
              <button onClick={() => ["category", "pin", "tag", "docs", "wallet", "inactiveDays", "maxRating", "paused"].forEach((k) => setParam(k, ""))} className="text-[12px] font-semibold text-gray-400 hover:text-gray-700">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1 text-[12px] text-gray-500">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? new Set() : new Set(rows.map((p) => p.id)))} className="h-4 w-4 accent-brand" />
          Select shown
        </label>
        <span>{result ? `${result.total} provider${result.total === 1 ? "" : "s"}` : "Loading…"}</span>
        {selected.size > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-800">{selected.size} selected</span>
            <button disabled={bulkBusy} onClick={bulkApprove} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-50">
              Approve
            </button>
            <button disabled={bulkBusy} onClick={() => setMessaging((v) => !v)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700">
              Message
            </button>
            <button disabled={bulkBusy} onClick={exportCsv} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700">
              Export selected
            </button>
            <button onClick={() => setSelected(new Set())} className="font-semibold text-gray-400">
              Clear
            </button>
          </span>
        )}
      </div>
      {messaging && selected.size > 0 && (
        <form onSubmit={sendMessage} className="space-y-2 rounded-2xl bg-white p-4 shadow-card">
          <p className="text-[13px] font-bold text-gray-900">Message {selected.size} provider{selected.size === 1 ? "" : "s"} (in-app notification)</p>
          <input value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} placeholder="Title" maxLength={120} className={`${input} w-full`} />
          <textarea value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} rows={3} placeholder="Message" maxLength={1000} className={`${input} w-full resize-none`} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMessaging(false)} className="text-[12px] font-semibold text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={bulkBusy || !msg.title.trim() || !msg.message.trim()} className="rounded-lg bg-brand px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">
              Send
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((p) => (
          <div key={p.id} onClick={() => navigate(`/providers/${p.id}`)} className={`relative cursor-pointer rounded-2xl bg-white p-4 shadow-card transition-shadow hover:shadow-md ${selected.has(p.id) ? "ring-2 ring-brand" : ""}`}>
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleSel(p.id)}
              className="absolute left-3 top-3 h-4 w-4 accent-brand"
              aria-label={`Select ${p.name}`}
            />
            <div className="flex items-start gap-3 pl-5">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-2xl">{p.avatar}</div>
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
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verificationStyles[p.verificationStatus] || verificationStyles.pending}`}>{p.verificationStatus || "pending"}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
              <span className={`rounded-full px-2 py-0.5 ${p.walletBalance <= 0 ? "bg-red-100 text-red-600" : p.walletLow ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>₹{p.walletBalance} wallet</span>
              {p.docsWaiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{p.docsWaiting} doc{p.docsWaiting === 1 ? "" : "s"} to review</span>}
              {!p.kycComplete && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">Documents incomplete</span>}
              {p.paused && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-600">Paused</span>}
              {(p.tags || []).map((t) => (
                <span key={t} className="rounded-full bg-brand-light px-2 py-0.5 text-brand-dark">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between text-[11.5px] text-gray-400">
              <span>{p.phone}</span>
              <span>{p.lastSeenAt ? `Active ${new Date(p.lastSeenAt).toLocaleDateString("en-IN")}` : p.live ? "App connected" : "Never opened the app"}</span>
            </div>

            {p.verificationStatus === "pending" && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    verify(rejectProvider, p.id);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-[12px] font-semibold text-red-600 active:scale-[0.98]"
                >
                  <XIcon width={13} height={13} /> Reject
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    verify(approveProvider, p.id);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-[12px] font-semibold text-white active:scale-[0.98]"
                >
                  <CheckIcon width={13} height={13} /> Approve
                </button>
              </div>
            )}
          </div>
        ))}
        {result && rows.length === 0 && !loading && <p className="col-span-full py-12 text-center text-sm text-gray-400">{f.q || activeFilters ? "No provider matches." : "No providers here."}</p>}
      </div>

      {result && rows.length < result.total && (
        <div className="text-center">
          <button disabled={loading} onClick={() => load(page + 1)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            {loading ? "Loading…" : `Show more (${result.total - rows.length} left)`}
          </button>
        </div>
      )}
    </div>
  );
}
