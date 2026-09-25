import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { socket } from "../socket";
import { useApp } from "../context/AppContext";
import { columnsFromRows, downloadCsv, toCsv } from "../utils/csv";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400";

const STATUSES = [
  { key: "online", label: "Online", dot: "bg-emerald-500" },
  { key: "offline", label: "Offline", dot: "bg-gray-400" },
  { key: "waiting", label: "Waiting", dot: "bg-sky-500" },
  { key: "new_order", label: "New Order", dot: "bg-amber-500" },
  { key: "in_progress", label: "In Progress", dot: "bg-blue-600" },
  { key: "completed", label: "Completed", dot: "bg-teal-600" },
  { key: "rejected", label: "Rejected", dot: "bg-red-500" },
  { key: "busy", label: "Busy / Unavailable", dot: "bg-orange-600" },
];
const STATUS_BADGE = {
  new_order: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  busy: "bg-orange-100 text-orange-700",
  waiting: "bg-sky-100 text-sky-700",
  offline: "bg-gray-200 text-gray-600",
};
const STATUS_TEXT = {
  new_order: "New Order",
  in_progress: "In Progress",
  busy: "Busy / Unavailable",
  waiting: "Waiting",
  offline: "Offline",
};
const ORDER_BADGE = {
  Pending: "bg-amber-100 text-amber-700",
  Accepted: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Completed: "bg-gray-200 text-gray-600",
  Rejected: "bg-red-100 text-red-600",
  Cancelled: "bg-red-100 text-red-600",
};
const REPORTS = [
  { type: "daily", label: "Daily", hint: "the 'To' date" },
  { type: "weekly", label: "Weekly", hint: "7 days ending on the 'To' date" },
  { type: "monthly", label: "Monthly", hint: "the month of the 'To' date, up to that day" },
  { type: "provider", label: "Provider-wise", hint: "the selected date range" },
  { type: "status", label: "Status-wise", hint: "the selected date range" },
  { type: "order", label: "Order-wise", hint: "the selected date range" },
];

const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const shiftDay = (day, n) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const EMPTY = { provider: "", pin: "", area: "", serviceId: "", categoryId: "", status: "", orderId: "" };

function ago(iso) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default function MonitoringPage() {
  const { services, categories, showToast } = useApp();
  const [f, setF] = useState(EMPTY);
  const [range, setRange] = useState(() => ({ from: todayIst(), to: todayIst() }));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [auto, setAuto] = useState(true);
  const [downloading, setDownloading] = useState(null);
  const seq = useRef(0);

  const params = useMemo(() => {
    const p = { ...range };
    for (const [k, v] of Object.entries(f)) if (v.trim()) p[k] = v.trim();
    return p;
  }, [f, range]);

  const load = useCallback(() => {
    const mine = ++seq.current;
    return api
      .getMonitoring(params)
      .then((d) => {
        if (mine !== seq.current) return;
        setData(d);
        setError(null);
      })
      .catch((e) => mine === seq.current && setError(e.message || "Couldn't load monitoring data"));
  }, [params]);

  // Filters are debounced so typing in a search box doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Live: refresh every 15s, and immediately when orders/providers change.
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 15000);
    const onChange = () => load();
    socket.on("booking:created", onChange);
    socket.on("booking:updated", onChange);
    socket.on("provider:updated", onChange);
    return () => {
      clearInterval(id);
      socket.off("booking:created", onChange);
      socket.off("booking:updated", onChange);
      socket.off("provider:updated", onChange);
    };
  }, [auto, load]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const filtersActive = Object.values(f).some(Boolean);
  const visibleServices = f.categoryId ? services.filter((s) => s.categoryId === f.categoryId) : services;

  const setPreset = (days) => {
    const to = todayIst();
    setRange({ from: shiftDay(to, -(days - 1)), to });
  };

  const download = async (r) => {
    setDownloading(r.type);
    try {
      const rep = await api.getMonitoringReport(r.type, params);
      if (rep.rows.length === 0) {
        showToast("Nothing to export for these filters");
        return;
      }
      const name = `tikdum-monitoring-${r.type}-${rep.period.from}${rep.period.from === rep.period.to ? "" : `_to_${rep.period.to}`}.csv`;
      downloadCsv(name, toCsv(columnsFromRows(rep.rows), rep.rows));
      showToast(`${r.label} report downloaded`);
    } catch (e) {
      showToast(e.message || "Couldn't build the report");
    } finally {
      setDownloading(null);
    }
  };

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Live bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] text-gray-500">
          <span className={`h-2 w-2 rounded-full ${auto && !error ? "animate-pulse bg-emerald-500" : "bg-gray-400"}`} />
          {error ? (
            <span className="text-red-500">{error}</span>
          ) : data ? (
            <span>
              {auto ? "Live — refreshes every 15 s and on every order change" : "Paused"} · updated{" "}
              {new Date(data.generatedAt).toLocaleTimeString("en-IN")}
            </span>
          ) : (
            <span>Loading…</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setAuto((a) => !a)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-600">
            {auto ? "Pause" : "Resume live"}
          </button>
          <button onClick={load} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-600">
            Refresh
          </button>
        </div>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => set("status", f.status === s.key ? "" : s.key)}
            className={`rounded-2xl bg-white p-3 text-left shadow-card transition-shadow hover:shadow-md ${f.status === s.key ? "ring-2 ring-brand" : ""}`}
          >
            <p className="text-[22px] font-extrabold text-gray-900">{summary ? summary[s.key] : "–"}</p>
            <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} />
              {s.label}
            </p>
          </button>
        ))}
      </div>
      <p className="-mt-2 px-1 text-[11px] text-gray-400">
        Online = provider's app contacted the server in the last 90 seconds. Completed / Rejected count providers with such orders in the selected dates; the other tiles show the current state.
      </p>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Service provider</label>
            <input className={inputCls} value={f.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Name or phone" />
          </div>
          <div>
            <label className={labelCls}>PIN code</label>
            <input className={inputCls} value={f.pin} inputMode="numeric" maxLength={6} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} placeholder="560001" />
          </div>
          <div>
            <label className={labelCls}>Area</label>
            <input className={inputCls} value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="Indiranagar" />
          </div>
          <div>
            <label className={labelCls}>Order ID</label>
            <input className={inputCls} value={f.orderId} onChange={(e) => set("orderId", e.target.value)} placeholder="Full or partial ID" />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select className={inputCls} value={f.categoryId} onChange={(e) => setF((p) => ({ ...p, categoryId: e.target.value, serviceId: "" }))}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Service</label>
            <select className={inputCls} value={f.serviceId} onChange={(e) => set("serviceId", e.target.value)}>
              <option value="">All services</option>
              {visibleServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>From</label>
              <input type="date" className={inputCls} value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input type="date" className={inputCls} value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-gray-400">Date:</span>
          {[
            ["Today", 1],
            ["Last 7 days", 7],
            ["Last 30 days", 30],
          ].map(([label, days]) => (
            <button key={label} onClick={() => setPreset(days)} className="rounded-full border border-gray-200 px-3 py-1 font-semibold text-gray-600 hover:bg-gray-50">
              {label}
            </button>
          ))}
          {filtersActive && (
            <button onClick={() => setF(EMPTY)} className="ml-auto font-semibold text-brand underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Providers */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-[14px] font-bold text-gray-900">Service providers {data ? `(${data.providers.length})` : ""}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Provider</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Area / PIN codes</th>
                <th className="px-4 py-2.5 font-medium">Now</th>
                <th className="px-4 py-2.5 font-medium">In selected dates</th>
                <th className="px-4 py-2.5 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data?.providers.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 align-top last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{p.name}</p>
                    <p className="text-[11px] text-gray-400">{p.phone}</p>
                    <p className="text-[11px] capitalize text-gray-400">{(p.category || "").replace(/-/g, " ")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${p.online ? "bg-emerald-500" : "bg-gray-300"}`} title={p.online ? "Online" : "Offline"} />
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_BADGE[p.status]}`}>{STATUS_TEXT[p.status]}</span>
                    </span>
                    {p.unavailableReason && <p className="mt-1 text-[11px] text-orange-600">{p.unavailableReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>{p.serviceArea || "—"}</p>
                    <p className="text-[11px] text-gray-400">{p.serveAllAreas ? "All areas" : p.pincodes.length ? p.pincodes.join(", ") : "No PIN restriction"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">
                      <b className={p.newOrders ? "text-amber-600" : ""}>{p.newOrders}</b> new · <b className={p.inProgress ? "text-blue-600" : ""}>{p.inProgress}</b> in progress
                    </p>
                    {p.openOrders.map((o) => (
                      <p key={o.id} className="text-[11px] text-gray-400">
                        #{o.id.slice(0, 8)} · {o.service} · {o.status}
                      </p>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>
                      {p.completed} completed · {p.rejected} rejected
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {p.total} order{p.total === 1 ? "" : "s"} · ₹{p.completedValue.toLocaleString("en-IN")} · fees ₹{p.fee.toLocaleString("en-IN")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">{p.online ? "Online now" : ago(p.lastSeenAt)}</td>
                </tr>
              ))}
              {data && data.providers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No providers match these filters.
                  </td>
                </tr>
              )}
              {!data && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Orders */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-[14px] font-bold text-gray-900">Order activity {data ? `(${data.orderCount}${data.orderCount > data.orders.length ? `, latest ${data.orders.length} shown` : ""})` : ""}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Service</th>
                <th className="px-4 py-2.5 font-medium">Provider</th>
                <th className="px-4 py-2.5 font-medium">PIN</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody>
              {data?.orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-gray-500" title={o.id}>#{o.id.slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-gray-800">
                    {o.serviceName}
                    <p className="text-[11px] text-gray-400">{o.categoryName}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{o.providerName}</td>
                  <td className="px-4 py-2.5 text-gray-500">{o.pin || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ORDER_BADGE[o.status] || ""}`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">₹{o.amount}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-gray-500">{new Date(o.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
              {data && data.orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No orders match these filters and dates.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reports */}
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <h2 className="text-[14px] font-bold text-gray-900">Download reports (CSV)</h2>
        <p className="mt-1 text-[12px] text-gray-400">Reports use the filters and dates above. Daily uses the "To" date; Weekly is the 7 days ending on it; Monthly is that month up to it.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {REPORTS.map((r) => (
            <button
              key={r.type}
              disabled={downloading !== null}
              title={`Covers ${r.hint}`}
              onClick={() => download(r)}
              className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {downloading === r.type ? "Preparing…" : `${r.label} report`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
