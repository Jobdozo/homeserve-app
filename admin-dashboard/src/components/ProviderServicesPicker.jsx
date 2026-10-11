import { useEffect, useMemo, useState } from "react";
import { api, SERVER_URL } from "../api";
import { useApp } from "../context/AppContext";

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
const STATE_LABEL = { active: "Live", pending_approval: "Waiting approval", inactive: "Off", rejected: "Rejected" };
const STATE_STYLE = {
  active: "bg-emerald-100 text-emerald-700",
  pending_approval: "bg-blue-100 text-blue-700",
  inactive: "bg-gray-100 text-gray-500",
  rejected: "bg-red-100 text-red-600",
};
const BULK = 25; // the server adds at most this many catalog items per call

// Every catalog service in the provider's category, ticked when the provider offers it.
// Tick = add it from the catalog (or switch an existing one back on); untick = switch it off.
// Switching off keeps the service and its bookings; ticking again turns the same one back on.
export default function ProviderServicesPicker({ provider, services, onChanged }) {
  const { categories, showToast } = useApp();
  const [catalog, setCatalog] = useState(null);
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    api.listServiceCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Start on the provider's own category (by name), else the category most of their services are in.
  useEffect(() => {
    if (categoryId || !categories.length) return;
    const byName = categories.find((c) => norm(c.name) === norm(provider?.category));
    const counts = {};
    for (const s of services || []) counts[s.categoryId] = (counts[s.categoryId] || 0) + 1;
    const mostUsed = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    setCategoryId(byName?.id || mostUsed || categories[0]?.id || "");
  }, [categories, provider?.category, services, categoryId]);

  const mine = useMemo(() => {
    const m = new Map();
    for (const s of services || []) m.set(`${s.categoryId}|${norm(s.name)}`, s);
    return m;
  }, [services]);

  const rows = useMemo(() => {
    if (!catalog) return [];
    const q = norm(search);
    const fromCatalog = catalog
      .filter((c) => c.categorySlug === categoryId && c.active !== false)
      .map((c) => ({ key: `${c.categorySlug}|${norm(c.name)}`, item: c, service: mine.get(`${c.categorySlug}|${norm(c.name)}`) || null }));
    // The provider's own services that aren't in the catalog are listed too, so nothing is hidden.
    const inCatalog = new Set(fromCatalog.map((r) => r.key));
    const own = (services || [])
      .filter((s) => s.categoryId === categoryId && !inCatalog.has(`${s.categoryId}|${norm(s.name)}`))
      .map((s) => ({ key: `${s.categoryId}|${norm(s.name)}`, item: null, service: s }));
    return [...fromCatalog, ...own]
      .filter((r) => !q || norm(r.item?.name || r.service?.name).includes(q))
      .sort((a, b) => (a.item?.name || a.service?.name).localeCompare(b.item?.name || b.service?.name));
  }, [catalog, categoryId, mine, services, search]);

  const ticked = (r) => Boolean(r.service && (r.service.status === "active" || r.service.status === "pending_approval"));
  const offeredHere = rows.filter(ticked).length;

  const toggle = async (r) => {
    setBusyKey(r.key);
    try {
      if (ticked(r)) {
        await api.setServiceStatus(r.service.id, "inactive");
        showToast(`${r.service.name} switched off`);
      } else if (r.service) {
        await api.setServiceStatus(r.service.id, "active");
        showToast(`${r.service.name} is live again`);
      } else {
        await api.applyServiceCatalogItem(r.item.id, provider.id);
        showToast(`${r.item.name} added`);
      }
      await onChanged();
    } catch (e) {
      showToast(e.message || "Couldn't update the service");
    } finally {
      setBusyKey(null);
    }
  };

  // Tick everything shown that the provider doesn't have yet (in batches the server accepts).
  const addAllShown = async () => {
    const toAdd = rows.filter((r) => !r.service && r.item).map((r) => r.item.id);
    const toEnable = rows.filter((r) => r.service && !ticked(r) && r.service.status !== "rejected");
    if (!toAdd.length && !toEnable.length) return;
    setBulkBusy(true);
    let added = 0;
    let failed = 0;
    try {
      for (let i = 0; i < toAdd.length; i += BULK) {
        const r = await api.applyManyServiceCatalog(toAdd.slice(i, i + BULK), provider.id);
        added += r?.added?.length || 0;
        failed += r?.failed?.length || 0;
      }
      for (const r of toEnable) await api.setServiceStatus(r.service.id, "active");
      const done = added + toEnable.length;
      showToast(failed ? `${done} ticked, ${failed} couldn't be added` : `Done — ${done} service${done === 1 ? "" : "s"} ticked`);
    } catch (e) {
      showToast(e.message || `Stopped after ${added} — try again`);
    } finally {
      await onChanged();
      setBulkBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-bold text-gray-900">Services</p>
          <p className="text-[11.5px] text-gray-400">Tick to add a service to this provider, untick to switch it off.</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
          {offeredHere} of {rows.length} ticked
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[12.5px] outline-none focus:border-brand"
          aria-label="Category"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {norm(c.name) === norm(provider?.category) ? " (provider's category)" : ""}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services…"
          className="min-w-[160px] flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-[12.5px] outline-none focus:border-brand"
        />
        <button
          onClick={addAllShown}
          disabled={bulkBusy || !rows.some((r) => !ticked(r) && r.service?.status !== "rejected")}
          className="rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {bulkBusy ? "Adding…" : "Tick all shown"}
        </button>
      </div>

      <div className="mt-3 max-h-[60vh] divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
        {catalog === null && <p className="p-4 text-[12px] text-gray-400">Loading the catalog…</p>}
        {catalog && rows.length === 0 && (
          <p className="p-4 text-[12px] text-gray-400">
            {search ? "No service matches your search." : "No catalog services in this category yet — add them under Services & Categories → Catalog."}
          </p>
        )}
        {rows.map((r) => {
          const on = ticked(r);
          const name = r.item?.name || r.service?.name;
          const price = r.service?.price ?? r.item?.price;
          const photo = r.service?.imageUrl || r.item?.imageUrl;
          return (
            <label key={r.key} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50 ${busyKey === r.key || bulkBusy ? "pointer-events-none opacity-60" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(r)} className="h-4 w-4 flex-shrink-0 accent-brand" />
              <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {photo && <img src={SERVER_URL + photo} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-gray-800">{name}</span>
                <span className="text-[11px] text-gray-400">
                  ₹{price}
                  {!r.item && " · not in the catalog"}
                </span>
              </span>
              {r.service && (
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATE_STYLE[r.service.status] || "bg-gray-100 text-gray-500"}`}>
                  {busyKey === r.key ? "Saving…" : STATE_LABEL[r.service.status] || r.service.status}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
