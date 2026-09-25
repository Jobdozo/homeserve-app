import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { DownloadIcon } from "../components/icons";
import { columnsFromRows, downloadCsv, stamp, toCsv } from "../utils/csv";

const IMPORTS = {
  categories: {
    label: "Categories",
    columns: "name, icon",
    template: "name,icon\nGardening,🌿\nCar Wash,🚗\n",
  },
  customers: {
    label: "Customers",
    columns: "name, phone",
    template: "name,phone\nRiya Sharma,+919876543210\nAmit Verma,9123456789\n",
  },
  providers: {
    label: "Providers",
    columns: "name, phone, category (optional)",
    template: "name,phone,category\nSharma AC Services,+919811122233,AC Repair\nQuick Plumbers,9822233344,Plumbing\n",
  },
  services: {
    label: "Services",
    columns: "provider_phone, category, name, price, original_price (optional)",
    template:
      "provider_phone,category,name,price,original_price\n+919811122233,AC Repair,AC Gas Refilling,599,699\n+919811122233,AC Repair,AC Installation,799,\n",
  },
};

export default function DataManagementPage() {
  const { providers, services, bookings, categories, showToast, can } = useApp();
  const [busy, setBusy] = useState(null);

  const exporters = [
    {
      key: "customers",
      label: "Customers",
      note: "Name, phone, email, bookings and total spent",
      load: () => api.listCustomers(),
      columns: [
        ["ID", "id"],
        ["Name", "name"],
        ["Phone", "phone"],
        ["Email", "email"],
        ["Total bookings", "totalBookings"],
        ["Total spent (₹)", "totalSpent"],
      ],
    },
    {
      key: "providers",
      label: "Providers",
      note: "Verification status, ratings, service area and PIN codes",
      load: async () => providers,
      columns: [
        ["ID", "id"],
        ["Name", "name"],
        ["Business name", "businessName"],
        ["Phone", "phone"],
        ["Email", "email"],
        ["Category", "category"],
        ["Verification", "verificationStatus"],
        ["Rating", "rating"],
        ["Reviews", "reviews"],
        ["Experience", "experience"],
        ["Service area", "serviceArea"],
        ["GST number", "gstNumber"],
        ["PIN codes", (p) => (p.coverage?.pincodes || []).join(" ")],
        ["Serves all areas", (p) => (p.coverage?.serveAllAreas ? "Yes" : "No")],
        ["Accepting requests", (p) => (p.coverage?.acceptingRequests === false ? "No" : "Yes")],
        ["Joined", "joinedAt"],
      ],
    },
    {
      key: "services",
      label: "Services & categories",
      note: "Every service with price, status and provider",
      load: async () => services,
      columns: [
        ["ID", "id"],
        ["Name", "name"],
        ["Category", "categoryId"],
        ["Provider", (s) => providers.find((p) => p.id === s.providerId)?.name || ""],
        ["Provider ID", "providerId"],
        ["Price (₹)", "price"],
        ["Original price (₹)", "originalPrice"],
        ["Status", "status"],
        ["Rating", "rating"],
        ["Reviews", "reviewCount"],
      ],
    },
    {
      key: "categories",
      label: "Categories",
      note: "Category names and icons",
      load: async () => categories,
      columns: [
        ["ID", "id"],
        ["Name", "name"],
        ["Icon", "icon"],
      ],
    },
    {
      key: "bookings",
      label: "Bookings",
      note: "Every booking with customer, provider, status and amount",
      load: async () => bookings,
      columns: [
        ["Request ID", "ref"],
        ["Booking ID", "id"],
        ["Service", (b) => b.service?.name],
        ["Customer", (b) => b.customer?.name],
        ["Customer phone", (b) => b.customer?.phone],
        ["Provider", (b) => providers.find((p) => p.id === b.providerId)?.name || ""],
        ["Date", "date"],
        ["Time", "time"],
        ["Status", "status"],
        ["Amount (₹)", "amount"],
        ["Address", (b) => b.address?.line],
        ["Created", "createdAt"],
        ["Completed", (b) => b.statusHistory?.Completed],
      ],
    },
    {
      key: "payments",
      label: "Payments & transactions",
      note: "Completed bookings with platform fee and provider payout",
      load: () => api.getTransactions(),
    },
    {
      key: "reviews",
      label: "Reviews & ratings",
      note: "Every customer review",
      load: async () => bookings.filter((b) => b.reviewed && b.review),
      columns: [
        ["Request ID", "ref"],
        ["Booking ID", "id"],
        ["Customer", (b) => b.customer?.name],
        ["Service", (b) => b.service?.name],
        ["Provider", (b) => providers.find((p) => p.id === b.providerId)?.name || ""],
        ["Rating", (b) => b.review?.rating],
        ["Review", (b) => b.review?.text],
        ["Date", (b) => b.statusHistory?.Completed || b.createdAt],
      ],
    },
    {
      key: "disputes",
      label: "Disputes & refund claims",
      note: "Refund claims and how they were resolved",
      load: () => api.listRefundClaims(),
    },
    {
      key: "audit-logs",
      label: "Audit logs",
      note: "The latest 1,000 platform activity entries",
      load: () => api.listActivities(1000),
    },
  ];

  const handleExport = async (exporter) => {
    setBusy(exporter.key);
    try {
      const rows = await exporter.load();
      if (!rows || rows.length === 0) {
        showToast(`No ${exporter.label.toLowerCase()} to export yet`);
        return;
      }
      const columns = exporter.columns || columnsFromRows(rows);
      downloadCsv(`tikdum-${exporter.key}-${stamp()}.csv`, toCsv(columns, rows));
      showToast(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      showToast(e.message || "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {can("data.export") && (
      <section>
        <h2 className="text-[14px] font-bold text-gray-900">Export</h2>
        <p className="mt-0.5 text-[12px] text-gray-400">Download any module's data as a CSV file (opens in Excel or Google Sheets).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {exporters.map((ex) => (
            <div key={ex.key} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900">{ex.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-gray-400">{ex.note}</p>
              </div>
              <button
                onClick={() => handleExport(ex)}
                disabled={busy === ex.key}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                <DownloadIcon width={14} height={14} /> {busy === ex.key ? "…" : "CSV"}
              </button>
            </div>
          ))}
        </div>
      </section>
      )}

      {can("data.import") && (
      <section>
        <h2 className="text-[14px] font-bold text-gray-900">Import</h2>
        <p className="mt-0.5 text-[12px] text-gray-400">
          Upload a CSV to add records in bulk. Every row is checked first — nothing is saved until you confirm, and any
          problem rows are listed by line number. Ten-digit phone numbers are treated as Indian (+91).
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {Object.entries(IMPORTS).map(([key, def]) => (
            <ImportCard key={key} moduleKey={key} def={def} />
          ))}
        </div>
      </section>
      )}
    </div>
  );
}

function ImportCard({ moduleKey, def }) {
  const { showToast, refreshData } = useApp();
  const [csv, setCsv] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCsv(null);
    setFileName("");
    setResult(null);
    setError("");
  };

  const run = async (text, dryRun) => {
    setBusy(true);
    setError("");
    try {
      const r = await api.importCsv(moduleKey, text, dryRun);
      setResult(r);
      if (!dryRun) {
        showToast(`Imported ${r.imported} ${def.label.toLowerCase()}`);
        refreshData();
      }
    } catch (e) {
      setResult(null);
      setError(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError("That file is larger than 3 MB — split it into smaller files.");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setResult(null);
    run(text, true);
  };

  const downloadTemplate = () => downloadCsv(`tikdum-${moduleKey}-template.csv`, def.template);
  const downloadErrors = () =>
    downloadCsv(
      `tikdum-${moduleKey}-import-errors-${stamp()}.csv`,
      toCsv(
        [
          ["Row", "row"],
          ["Problem", "message"],
        ],
        result.errors
      )
    );

  const done = result && !result.dryRun;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-gray-900">{def.label}</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-gray-400">Columns: {def.columns}</p>
        </div>
        <button onClick={downloadTemplate} className="flex-shrink-0 text-[11.5px] font-semibold text-brand underline">
          Template
        </button>
      </div>

      <label className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-gray-300 px-3 py-3 text-[12.5px] font-medium text-gray-500 hover:border-brand hover:text-brand">
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        {fileName ? `${fileName} — choose another file` : "Choose a CSV file"}
      </label>

      {busy && <p className="mt-3 text-[12px] text-gray-400">Working…</p>}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Rows" value={result.total} />
            <Stat label={done ? "Imported" : "Valid"} value={done ? result.imported : result.valid} tone="good" />
            <Stat label="Problems" value={result.failed} tone={result.failed ? "bad" : undefined} />
          </div>
          {result.ignoredColumns.length > 0 && (
            <p className="text-[11px] text-amber-600">Ignored unknown columns: {result.ignoredColumns.join(", ")}</p>
          )}
          {result.errors.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-red-100">
              <table className="w-full text-left text-[11.5px]">
                <tbody>
                  {result.errors.map((er, i) => (
                    <tr key={i} className="border-b border-red-50 last:border-0">
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-red-600">Row {er.row}</td>
                      <td className="px-2.5 py-1.5 text-gray-600">{er.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.errorsTruncated && (
                <p className="px-2.5 py-1.5 text-[11px] text-gray-400">Showing the first {result.errors.length} problems.</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!done && result.valid > 0 && (
              <button
                onClick={() => run(csv, false)}
                disabled={busy}
                className="rounded-lg bg-brand px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                Import {result.valid} valid row{result.valid === 1 ? "" : "s"}
                {result.failed > 0 ? " (skip the rest)" : ""}
              </button>
            )}
            {result.errors.length > 0 && (
              <button
                onClick={downloadErrors}
                className="rounded-lg border border-gray-200 px-3.5 py-2 text-[12px] font-semibold text-gray-600"
              >
                Download error report
              </button>
            )}
            <button onClick={reset} className="px-2 py-2 text-[12px] font-semibold text-gray-400">
              {done ? "Import another" : "Clear"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-gray-900";
  return (
    <div className="rounded-lg bg-gray-50 py-2">
      <p className={`text-[15px] font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}
