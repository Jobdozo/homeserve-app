import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { api } from "../api";
import { SubHeader, Card, inr } from "../components/biz";

// One month's fee invoices, laid out like the statement an accountant expects:
// who issued them, each invoice's number, taxable value and GST, and the totals.
export default function InvoiceMonthScreen() {
  const { month } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getInvoiceMonth(month).then(setData).catch((e) => setError(e.message || "Couldn't load invoices"));
  }, [month]);

  const title = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const s = data?.summary;
  const r2 = (n) => `₹${(Math.round(Number(n || 0) * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col pb-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <SubHeader
        title={`${title} invoices`}
        subtitle="Tikdum's fees, with GST"
        right={
          !Capacitor.isNativePlatform() && data ? (
            <button onClick={() => window.print()} className="h-11 rounded-[14px] bg-ink px-4 text-[13.5px] font-extrabold text-ground">
              Print
            </button>
          ) : null
        }
      />
      <div className="mt-4 flex flex-col gap-3 px-4 lg:px-0">
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>}
        {data && (
          <>
            <Card className="p-4">
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Issued by</p>
              <p className="mt-1 text-[15px] font-bold text-ink">{data.supplier.legalName || data.supplier.tradeName}</p>
              {data.supplier.gstin && <p className="text-[12.5px] text-ink-muted">GSTIN {data.supplier.gstin}</p>}
              {data.supplier.address && <p className="text-[12.5px] text-ink-muted">{data.supplier.address}</p>}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-dashed border-gray-200 pt-3 text-center">
                <div>
                  <p className="text-[12px] text-ink-muted">Taxable</p>
                  <p className="text-[15px] font-extrabold text-ink tabular">{r2(s.taxable)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-ink-muted">GST</p>
                  <p className="text-[15px] font-extrabold text-ink tabular">{r2(s.gst)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-ink-muted">Total</p>
                  <p className="text-[15px] font-extrabold text-ink tabular">{r2(s.total)}</p>
                </div>
              </div>
            </Card>

            {data.invoices.length === 0 && <p className="py-8 text-center text-[13px] text-ink-muted">No invoices in {title}.</p>}
            {data.invoices.map((i) => (
              <Card key={i.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-bold text-ink">
                      {i.type === "credit_note" ? "Credit note " : ""}
                      {i.number}
                    </p>
                    <p className="text-[12px] text-ink-muted">
                      {new Date(i.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {i.bookingRef ? ` · Job #${i.bookingRef}` : ""}
                    </p>
                  </div>
                  <span className={`text-[15px] font-extrabold tabular ${i.type === "credit_note" ? "text-go-soft" : "text-ink"}`}>
                    {i.type === "credit_note" ? "−" : ""}
                    {inr(i.total)}
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
                  <span>Taxable value</span>
                  <span className="text-right tabular">{r2(i.taxableValue)}</span>
                  {i.igst > 0 ? (
                    <>
                      <span>IGST {i.gstRate}%</span>
                      <span className="text-right tabular">{r2(i.igst)}</span>
                    </>
                  ) : (
                    <>
                      <span>CGST {i.gstRate / 2}%</span>
                      <span className="text-right tabular">{r2(i.cgst)}</span>
                      <span>SGST {i.gstRate / 2}%</span>
                      <span className="text-right tabular">{r2(i.sgst)}</span>
                    </>
                  )}
                  <span>SAC</span>
                  <span className="text-right">{i.sacCode}</span>
                  {i.recipient?.gstin && (
                    <>
                      <span>Your GSTIN</span>
                      <span className="text-right">{i.recipient.gstin}</span>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
