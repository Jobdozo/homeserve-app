import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

const TABS = [
  ["overview", "Overview"],
  ["invoices", "Invoices"],
  ["returns", "GST returns"],
  ["settings", "Settings"],
];

const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
const thisMonth = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function downloadCsv(name, columns, rows) {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const text = [columns.map((c) => cell(c[1])).join(","), ...rows.map((r) => columns.map((c) => cell(r[c[0]])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// A printable GST tax invoice / credit note in a new window ("Save as PDF" from the print dialog).
function printDocument(inv) {
  const credit = inv.type === "credit_note";
  const s = inv.supplier || {};
  const r = inv.recipient || {};
  const taxRows = [
    inv.cgst > 0 && `<tr><td>CGST @ ${inv.gstRate / 2}%</td><td class="n">${inr(inv.cgst)}</td></tr>`,
    inv.sgst > 0 && `<tr><td>SGST / UTGST @ ${inv.gstRate / 2}%</td><td class="n">${inr(inv.sgst)}</td></tr>`,
    inv.igst > 0 && `<tr><td>IGST @ ${inv.gstRate}%</td><td class="n">${inr(inv.igst)}</td></tr>`,
  ].filter(Boolean).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title>
<style>
  body{font:13px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:32px auto;max-width:720px}
  h1{font-size:20px;margin:0 0 2px} .muted{color:#555} .row{display:flex;justify-content:space-between;gap:24px}
  table{width:100%;border-collapse:collapse;margin-top:16px} th,td{border:1px solid #ccc;padding:7px 9px;text-align:left;vertical-align:top}
  th{background:#f4f4f4} .n{text-align:right;font-variant-numeric:tabular-nums} .tot td{font-weight:700}
  .box{border:1px solid #ccc;padding:10px 12px;flex:1} .small{font-size:11.5px;color:#555;margin-top:18px}
  @media print{body{margin:12mm}}
</style></head><body>
<div class="row"><div><h1>${credit ? "Credit Note" : "Tax Invoice"}</h1><div class="muted">${esc(inv.number)} · ${esc(day(inv.date))}</div>
${credit ? `<div class="muted">Against invoice ${esc(inv.originalNumber)} dated ${esc(day(inv.originalDate))}</div>` : ""}</div>
<div style="text-align:right"><strong>${esc(s.legalName)}</strong>${s.tradeName && s.tradeName !== s.legalName ? `<br>(${esc(s.tradeName)})` : ""}<br>GSTIN: ${esc(s.gstin)}${s.pan ? `<br>PAN: ${esc(s.pan)}` : ""}<br>${esc(s.address)}<br>State: ${esc(s.stateName)} (${esc(s.stateCode)})</div></div>
<div class="row" style="margin-top:16px"><div class="box"><strong>Billed to</strong><br>${esc(r.name)}<br>${r.gstin ? `GSTIN: ${esc(r.gstin)}` : "GSTIN: Unregistered"}${r.address ? `<br>${esc(r.address)}` : ""}</div>
<div class="box"><strong>Place of supply</strong><br>${esc(inv.placeOfSupply)} (${esc(inv.placeOfSupplyCode)})${inv.bookingRef ? `<br>Booking: #${esc(inv.bookingRef)}` : ""}${credit ? `<br>Reason: ${esc(inv.reason)}` : ""}</div></div>
<table><tr><th>Description</th><th>SAC</th><th class="n">Taxable value</th></tr>
<tr><td>${esc(inv.description)}</td><td>${esc(inv.sacCode)}</td><td class="n">${inr(inv.taxableValue)}</td></tr></table>
<table style="width:55%;margin-left:auto"><tr><td>Taxable value</td><td class="n">${inr(inv.taxableValue)}</td></tr>${taxRows}
<tr class="tot"><td>${credit ? "Total credited" : "Invoice total"}</td><td class="n">${inr(inv.total)}</td></tr></table>
<p class="small">${inv.feeIncludesGst ? "The platform fee charged includes GST. " : ""}This is a computer-generated document. Fees are deducted from the provider's Tikdum wallet.</p>
<script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card">
      <p className="text-[11.5px] font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function Table({ columns, rows, empty, foot }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="no-scrollbar overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-gray-100 text-gray-400">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium ${c.num ? "text-right" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || r.number || i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 ${c.num ? "text-right tabular-nums" : ""} text-gray-700`}>
                    {c.render ? c.render(r) : r[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-gray-400">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
          {foot}
        </table>
      </div>
    </div>
  );
}

function MonthPicker({ month, setMonth }) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600">
      Month
      <input
        type="month"
        value={month}
        max={thisMonth()}
        onChange={(e) => e.target.value && setMonth(e.target.value)}
        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-normal text-gray-800 outline-none focus:border-brand"
      />
    </label>
  );
}

function Overview({ month, setMonth, goSettings }) {
  const { showToast, categories } = useApp();
  const [summary, setSummary] = useState(null);
  const [exposure, setExposure] = useState(null);

  useEffect(() => {
    setSummary(null);
    api.getAccountingSummary(month).then(setSummary).catch((e) => showToast(e.message || "Couldn't load the summary"));
    api.getEcoExposure(month).then(setExposure).catch(() => setExposure(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const catName = (id) => categories.find((c) => String(c.id) === String(id))?.name || id;
  const t = summary?.gstr3b;

  return (
    <div className="space-y-4">
      <MonthPicker month={month} setMonth={setMonth} />

      {summary && !summary.settings.enabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[12.5px] text-amber-800">
          Invoicing is <strong>off</strong>, so platform fees are not being invoiced yet. Add Tikdum's GSTIN and details, then turn it on.{" "}
          <button onClick={goSettings} className="font-semibold underline">
            Open settings
          </button>
        </div>
      )}
      {summary && summary.uninvoicedFees > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-[12.5px] text-red-700">
          {summary.uninvoicedFees} fee{summary.uninvoicedFees === 1 ? " was" : "s were"} charged since invoicing started but {summary.uninvoicedFees === 1 ? "has" : "have"} no tax invoice. Check the
          server log for "Tax invoice … failed" and tell your developer.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoices issued" value={summary ? summary.counts.invoices : "…"} sub={summary ? `${summary.counts.creditNotes} credit note(s)` : ""} />
        <Stat label="Taxable value (net)" value={t ? inr(t.taxableValue) : "…"} sub="GSTR-3B 3.1(a)" />
        <Stat label="GST payable (net)" value={t ? inr(t.totalTax) : "…"} sub="after credit notes" />
        <Stat label="CGST + SGST / IGST" value={t ? `${inr(t.cgst + t.sgst)} / ${inr(t.igst)}` : "…"} sub="for the month" />
      </div>

      {exposure && exposure.categories.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-card">
          <p className="text-[13px] font-bold text-gray-900">Section 9(5) exposure — for your accountant</p>
          <p className="mt-1 max-w-3xl text-[11.5px] text-gray-500">
            Jobs completed this month in categories you marked "ECO-liable", by providers with no GSTIN. For these the platform may owe GST on the whole job value. Nothing is
            charged or filed from this figure.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Jobs" value={exposure.jobs} />
            <Stat label="Job value" value={inr(exposure.jobValue)} />
            <Stat label={`GST @ ${exposure.rate}% added on top`} value={inr(exposure.gstIfAddedOnTop)} />
            <Stat label={`GST @ ${exposure.rate}% if included`} value={inr(exposure.gstIfIncluded)} />
          </div>
          <p className="mt-3 text-[11.5px] text-gray-500">{exposure.categories.map((c) => `${catName(c.categoryId)}: ${c.jobs} jobs, ${inr(c.jobValue)}`).join(" · ")}</p>
        </div>
      )}

      <div className="rounded-2xl bg-white p-4 text-[12px] leading-relaxed text-gray-500 shadow-card">
        <p className="mb-1 text-[13px] font-bold text-gray-900">What this covers</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>A GST tax invoice for every platform fee taken from a provider's wallet (when they accept a request), numbered without gaps for each financial year.</li>
          <li>Credit notes when a fee is refunded, and monthly figures laid out like GSTR-1 and GSTR-3B for your accountant.</li>
          <li>
            <strong>Not covered yet:</strong> sponsored/ad-click charges are not invoiced, and fees charged before invoicing was switched on have no invoice.
          </li>
          <li>Customers pay providers directly, so GST TCS (section 52) and income-tax TDS (194-O) don't apply to Tikdum today. That changes if Tikdum starts collecting customer payments.</li>
          <li>Rates, the SAC code and the section 9(5) categories are settings. Have your chartered accountant confirm them before filing.</li>
        </ul>
      </div>
    </div>
  );
}

function Invoices({ month, setMonth, canManage }) {
  const { showToast } = useApp();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [creditFor, setCreditFor] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    api
      .listTaxInvoices({ from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}`, type, q })
      .then(setRows)
      .catch((e) => {
        showToast(e.message || "Couldn't load invoices");
        setRows([]);
      });
  }, [month, type, q, showToast]);

  useEffect(() => {
    setRows(null);
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const issue = async () => {
    setBusy(true);
    try {
      const note = await api.issueCreditNote(creditFor.id, reason);
      showToast(`Credit note ${note.number} issued`);
      setCreditFor(null);
      setReason("");
      load();
    } catch (e) {
      showToast(e.message || "Couldn't issue the credit note");
    }
    setBusy(false);
  };

  const columns = [
    { key: "number", label: "Number", render: (r) => <span className="font-semibold text-gray-900">{r.number}</span> },
    { key: "date", label: "Date", render: (r) => day(r.date) },
    { key: "type", label: "Type", render: (r) => (r.type === "credit_note" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Credit note</span> : "Invoice") },
    { key: "name", label: "Provider", render: (r) => (<>{r.recipient?.name}{r.recipient?.gstin && <span className="block text-[11px] text-gray-400">{r.recipient.gstin}</span>}</>) },
    { key: "taxableValue", label: "Taxable", num: true, render: (r) => inr(r.taxableValue) },
    { key: "gst", label: "GST", num: true, render: (r) => inr(r.cgst + r.sgst + r.igst) },
    { key: "total", label: "Total", num: true, render: (r) => <strong>{inr(r.total)}</strong> },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <span className="flex gap-3 whitespace-nowrap">
          <button onClick={() => !printDocument(r) && showToast("Allow pop-ups to open the invoice")} className="text-[12px] font-semibold text-brand hover:underline">
            View / print
          </button>
          {canManage && r.type === "invoice" && !r.creditNoteId && (
            <button onClick={() => setCreditFor(r)} className="text-[12px] font-semibold text-gray-400 hover:underline">
              Credit note
            </button>
          )}
          {r.creditNoteId && <span className="text-[11px] text-gray-400">credited</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <MonthPicker month={month} setMonth={setMonth} />
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700 outline-none focus:border-brand">
          <option value="">Invoices and credit notes</option>
          <option value="invoice">Invoices only</option>
          <option value="credit_note">Credit notes only</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search number, provider, GSTIN, booking…"
          className="min-w-[220px] flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-[13px] text-gray-800 outline-none focus:border-brand"
        />
      </div>

      <Table columns={columns} rows={rows || []} empty={rows === null ? "Loading…" : "No invoices this month."} />

      {creditFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.target === e.currentTarget && !busy && setCreditFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5">
            <h2 className="text-[16px] font-bold text-gray-900">Issue credit note</h2>
            <p className="mt-1 text-[12.5px] text-gray-500">
              For invoice {creditFor.number} ({inr(creditFor.total)}). This reduces the month's GST. It does not put money back in the provider's wallet — do that with a wallet top-up.
            </p>
            <label className="mt-4 block text-[12px] font-semibold text-gray-700">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 300))}
              placeholder="e.g. Customer cancelled after acceptance"
              className="mt-1 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setCreditFor(null)} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600">
                Cancel
              </button>
              <button onClick={issue} disabled={busy || !reason.trim()} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Issuing…" : "Issue credit note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children, onCsv }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-gray-900">{title}</p>
          {hint && <p className="text-[11.5px] text-gray-400">{hint}</p>}
        </div>
        {onCsv && (
          <button onClick={onCsv} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50">
            Download CSV
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Returns({ month, setMonth }) {
  const { showToast } = useApp();
  const [s, setS] = useState(null);

  useEffect(() => {
    setS(null);
    api.getAccountingSummary(month).then(setS).catch((e) => showToast(e.message || "Couldn't load the return figures"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const money = (k) => (r) => inr(r[k]);
  const cols = {
    b2b: [["gstin", "GSTIN of recipient"], ["name", "Receiver name"], ["number", "Invoice number"], ["date", "Invoice date"], ["total", "Invoice value"], ["placeOfSupply", "Place of supply"], ["rate", "Rate %"], ["taxableValue", "Taxable value"], ["igst", "IGST"], ["cgst", "CGST"], ["sgst", "SGST"]],
    b2c: [["placeOfSupply", "Place of supply"], ["rate", "Rate %"], ["invoices", "Invoices"], ["taxableValue", "Taxable value"], ["igst", "IGST"], ["cgst", "CGST"], ["sgst", "SGST"]],
    cn: [["gstin", "GSTIN of recipient"], ["name", "Receiver name"], ["number", "Credit note number"], ["date", "Credit note date"], ["originalNumber", "Original invoice"], ["originalDate", "Original invoice date"], ["reason", "Reason"], ["taxableValue", "Taxable value"], ["igst", "IGST"], ["cgst", "CGST"], ["sgst", "SGST"], ["total", "Value"]],
    sac: [["sacCode", "SAC"], ["rate", "Rate %"], ["count", "Net invoices"], ["taxableValue", "Taxable value"], ["igst", "IGST"], ["cgst", "CGST"], ["sgst", "SGST"], ["total", "Total value"]],
  };
  const tableCols = (list) => list.map(([key, label]) => ({ key, label, num: ["total", "taxableValue", "igst", "cgst", "sgst", "rate", "count", "invoices"].includes(key), render: ["total", "taxableValue", "igst", "cgst", "sgst"].includes(key) ? money(key) : undefined }));
  const t = s?.gstr3b;

  return (
    <div className="space-y-6">
      <MonthPicker month={month} setMonth={setMonth} />
      <p className="max-w-3xl text-[11.5px] text-gray-400">
        Laid out like the GST portal's tables so your accountant can copy the figures into the return. Check them against the portal before filing.
      </p>

      <Section title="GSTR-3B 3.1(a) — outward taxable supplies" hint="Net of credit notes issued in the month">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Taxable value" value={t ? inr(t.taxableValue) : "…"} />
          <Stat label="IGST" value={t ? inr(t.igst) : "…"} />
          <Stat label="CGST" value={t ? inr(t.cgst) : "…"} />
          <Stat label="SGST / UTGST" value={t ? inr(t.sgst) : "…"} />
          <Stat label="Total GST" value={t ? inr(t.totalTax) : "…"} />
        </div>
      </Section>

      <Section title="GSTR-1 table 4A — B2B (registered providers)" onCsv={s && (() => downloadCsv(`gstr1-b2b-${month}.csv`, cols.b2b, s.b2b))}>
        <Table columns={tableCols(cols.b2b)} rows={s?.b2b || []} empty={s ? "None this month." : "Loading…"} />
      </Section>
      <Section title="GSTR-1 table 7 — B2C small (unregistered providers)" hint="Totals by place of supply and rate" onCsv={s && (() => downloadCsv(`gstr1-b2c-${month}.csv`, cols.b2c, s.b2c))}>
        <Table columns={tableCols(cols.b2c)} rows={s?.b2c || []} empty={s ? "None this month." : "Loading…"} />
      </Section>
      <Section title="GSTR-1 table 9B — credit notes" onCsv={s && (() => downloadCsv(`gstr1-credit-notes-${month}.csv`, cols.cn, s.creditNotes))}>
        <Table columns={tableCols(cols.cn)} rows={s?.creditNotes || []} empty={s ? "None this month." : "Loading…"} />
      </Section>
      <Section title="GSTR-1 table 12 — SAC summary" onCsv={s && (() => downloadCsv(`gstr1-sac-${month}.csv`, cols.sac, s.sacSummary))}>
        <Table columns={tableCols(cols.sac)} rows={s?.sacSummary || []} empty={s ? "None this month." : "Loading…"} />
      </Section>
    </div>
  );
}

function Settings({ canManage }) {
  const { showToast, categories } = useApp();
  const [s, setS] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getAccountingSettings()
      .then((d) => {
        setS(d);
        setForm({ ...d });
      })
      .catch((e) => showToast(e.message || "Couldn't load settings"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!form) return <p className="py-10 text-center text-gray-400">Loading…</p>;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const field = (k, label, props = {}) => (
    <label className="block text-[12px] font-semibold text-gray-600">
      {label}
      <input
        value={form[k] ?? ""}
        onChange={(e) => set(k, props.upper ? e.target.value.toUpperCase() : e.target.value)}
        disabled={!canManage || props.disabled}
        placeholder={props.placeholder}
        className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] font-normal text-gray-800 outline-none focus:border-brand disabled:bg-gray-50"
      />
    </label>
  );
  const toggleEco = (id) => set("ecoCategoryIds", form.ecoCategoryIds.includes(id) ? form.ecoCategoryIds.filter((x) => x !== id) : [...form.ecoCategoryIds, id]);
  const derivedState = s?.states?.[String(form.gstin || "").slice(0, 2)];

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const patch = {
        legalName: form.legalName, tradeName: form.tradeName, gstin: form.gstin, pan: form.pan, address: form.address, sacCode: form.sacCode,
        sacDescription: form.sacDescription, gstRate: Number(form.gstRate), feeIncludesGst: form.feeIncludesGst, invoicePrefix: form.invoicePrefix,
        creditNotePrefix: form.creditNotePrefix, ecoCategoryIds: form.ecoCategoryIds, enabled: form.enabled,
      };
      const d = await api.updateAccountingSettings(patch);
      setS(d);
      setForm({ ...d });
      showToast("Accounting settings saved");
    } catch (err) {
      showToast(err.message || "Couldn't save");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="max-w-3xl space-y-5">
      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[13px] font-bold text-gray-900">Company</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {field("legalName", "Legal name (as on GST registration)")}
          {field("tradeName", "Trade name")}
          {field("gstin", "GSTIN", { upper: true, placeholder: "01ABCDE1234F1Z5" })}
          {field("pan", "PAN", { upper: true, placeholder: "ABCDE1234F" })}
        </div>
        <div className="mt-3">{field("address", "Registered address")}</div>
        <p className="mt-2 text-[11.5px] text-gray-400">{derivedState ? `State from GSTIN: ${derivedState}` : "The state is read from the first two digits of the GSTIN."}</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[13px] font-bold text-gray-900">Platform fee invoices</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {field("sacCode", "SAC code")}
          {field("gstRate", "GST rate %")}
          <label className="block text-[12px] font-semibold text-gray-600">
            Fee and GST
            <select
              value={form.feeIncludesGst ? "in" : "on"}
              onChange={(e) => set("feeIncludesGst", e.target.value === "in")}
              disabled={!canManage}
              className="mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] font-normal text-gray-800 outline-none focus:border-brand"
            >
              <option value="in">Fee already includes GST</option>
              <option value="on">Add GST on top of the fee</option>
            </select>
          </label>
        </div>
        <div className="mt-3">{field("sacDescription", "Description on the invoice")}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {field("invoicePrefix", "Invoice prefix (1–3 letters/digits)", { upper: true })}
          {field("creditNotePrefix", "Credit note prefix", { upper: true })}
        </div>
        <p className="mt-2 text-[11.5px] text-gray-400">Numbers look like {form.invoicePrefix}/26-27/000001. Prefixes and the GSTIN can't change after the first invoice, so numbering stays continuous.</p>
        <p className="mt-1 text-[11.5px] text-amber-600">
          "Fee already includes GST" keeps providers paying the same amount (₹40 → ₹33.90 + ₹6.10 GST). "Add on top" raises what they pay, so the apps would need to show it.
        </p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-card">
        <p className="text-[13px] font-bold text-gray-900">Section 9(5) — categories where the platform may owe the GST</p>
        <p className="mt-1 text-[11.5px] text-gray-500">
          For some home services (such as housekeeping, plumbing, carpentry) supplied through an e-commerce platform, the platform can be liable for the GST when the provider is not registered. Tick the categories your
          accountant says are covered. Used only for the exposure figure on the Overview.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] ${form.ecoCategoryIds.includes(String(c.id)) ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-600"}`}>
              <input type="checkbox" className="accent-brand" disabled={!canManage} checked={form.ecoCategoryIds.includes(String(c.id))} onChange={() => toggleEco(String(c.id))} />
              {c.name}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-card">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-brand" disabled={!canManage} checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          <span>
            <span className="block text-[13px] font-bold text-gray-900">Issue GST invoices for platform fees</span>
            <span className="block text-[11.5px] text-gray-500">
              When on, every fee taken from a provider's wallet from now on gets a numbered tax invoice. Fees charged earlier are not invoiced. Needs the GSTIN, legal name and address above.
            </span>
          </span>
        </label>
        {s?.startedAt && <p className="mt-2 text-[11.5px] text-gray-400">Invoicing started {day(s.startedAt)}.</p>}
      </div>

      {canManage ? (
        <button disabled={busy} className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
      ) : (
        <p className="text-[12px] text-gray-400">You can view these settings but not change them.</p>
      )}
    </form>
  );
}

export default function AccountingPage() {
  const { can } = useApp();
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(thisMonth());
  const canManage = can("accounting.manage");

  return (
    <div className="space-y-4">
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-semibold ${tab === id ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview month={month} setMonth={setMonth} goSettings={() => setTab("settings")} />}
      {tab === "invoices" && <Invoices month={month} setMonth={setMonth} canManage={canManage} />}
      {tab === "returns" && <Returns month={month} setMonth={setMonth} />}
      {tab === "settings" && <Settings canManage={canManage} />}
    </div>
  );
}
