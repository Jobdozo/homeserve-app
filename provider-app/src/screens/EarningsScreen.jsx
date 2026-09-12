import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { TrendUpIcon } from "../components/icons";
import CategoryIcon from "../components/CategoryIcon";

const TABS = ["Daily", "Weekly", "Monthly", "Yearly"];
const FACTORS = { Daily: 1 / 30, Weekly: 7 / 30, Monthly: 1, Yearly: 12 };
const PERIOD_LABEL = { Daily: "Day", Weekly: "Week", Monthly: "Month", Yearly: "Year" };

export default function EarningsScreen() {
  const { earnings, showToast } = useApp();
  const [tab, setTab] = useState("Monthly");
  const [showAll, setShowAll] = useState(false);

  const factor = FACTORS[tab];
  const total = Math.round(earnings.thisMonth * factor);
  const breakdown = earnings.breakdown;
  const scaled = {
    completed: Math.round(breakdown.completedJobs * factor),
    inProgress: Math.round(breakdown.inProgressJobs * factor),
    cancelled: Math.round(breakdown.cancelledJobs * factor),
    fee: Math.round(breakdown.platformFeeAmt * factor),
  };

  const visibleTx = showAll ? earnings.transactions : earnings.transactions.slice(0, 3);

  return (
    <div className="flex flex-1 flex-col pb-4 lg:px-8 lg:py-8">
      <div className="flex items-center justify-between px-4 pt-1 lg:px-0 lg:pt-0">
        <h1 className="text-lg font-bold text-gray-900 lg:text-2xl">Earnings</h1>
      </div>

      <div className="mt-3 flex gap-2 px-4 lg:mt-5 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors lg:px-4 lg:py-2 lg:text-sm ${
              tab === t ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="lg:mt-6 lg:grid lg:grid-cols-2 lg:gap-6">
        <div>
          <div className="mx-4 mt-4 rounded-2xl bg-brand p-4 text-white lg:mx-0 lg:mt-0 lg:p-6">
            <p className="text-[11px] text-white/75">This {PERIOD_LABEL[tab]} Earnings</p>
            <p className="mt-1 text-2xl font-extrabold lg:text-3xl">₹{total.toLocaleString("en-IN")}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-200">
              <TrendUpIcon width={12} height={12} /> +{earnings.changePct}% from last {PERIOD_LABEL[tab].toLowerCase()}
            </p>
          </div>

          <div className="mx-4 mt-4 rounded-2xl border border-gray-100 p-4 lg:mx-0 lg:p-6">
            <h2 className="mb-3 text-[13px] font-bold text-gray-900 lg:text-[15px]">Breakdown</h2>
            <Row label="Completed Jobs" value={`+₹${scaled.completed.toLocaleString("en-IN")}`} positive />
            <Row label="In Progress Jobs" value={`+₹${scaled.inProgress.toLocaleString("en-IN")}`} positive />
            <Row label="Cancelled Jobs" value={`₹${scaled.cancelled}`} />
            <Row label={`Platform Fee (${breakdown.platformFeePct}%)`} value={`-₹${scaled.fee.toLocaleString("en-IN")}`} negative />
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
              <span className="text-[13px] font-bold text-gray-900">Total Earnings</span>
              <span className="text-[15px] font-extrabold text-brand">₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="mx-4 mt-4 flex items-center justify-between lg:mx-0 lg:mt-0">
            <h2 className="text-[13.5px] font-bold text-gray-900 lg:text-[15px]">Recent Transactions</h2>
          </div>
          <div className="mx-4 mt-2 space-y-2 lg:mx-0">
            {visibleTx.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                <CategoryIcon categoryId={t.categoryId} size={40} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-gray-900">{t.service}</p>
                  <p className="text-[10.5px] text-gray-400">{formatDate(t.date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-emerald-600">+₹{t.amount}</p>
                  <p className="text-[10px] text-gray-400">{t.status}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mx-4 mt-3 lg:mx-0">
            <button
              onClick={() => (earnings.transactions.length > 3 ? setShowAll((v) => !v) : showToast("No more transactions"))}
              className="w-full rounded-xl border border-gray-200 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              {showAll ? "Show Less" : "View All Transactions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, positive, negative }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px]">
      <span className="text-gray-500">{label}</span>
      <span className={positive ? "font-medium text-emerald-600" : negative ? "font-medium text-red-500" : "font-medium text-gray-600"}>
        {value}
      </span>
    </div>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
