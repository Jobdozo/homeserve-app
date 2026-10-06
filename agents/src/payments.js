// Payments Reconciliation Agent — rule-based, no AI, read-only. Every few
// hours it runs the server's wallet/commission reconciliation and raises an
// alert for each new problem (wallet balance not matching its history,
// commission charged twice or not at all, fees on cancelled jobs, negative
// wallets). Once a day it posts a short money summary. It never moves money:
// wallet corrections stay with the Payment Team.
const config = require("./config");
const state = require("./state");
const { istDay, istHour } = require("./time");

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;

async function tick(client) {
  const st = state.load("payments");
  const r = await client.get("/admin/payments/reconciliation");
  let alerts = 0;
  for (const i of r.issues) {
    const res = await client.feed({
      kind: "alert",
      severity: i.severity,
      title: `Payments: ${i.detail}`.slice(0, 140),
      body: `Provider: ${i.providerName}${i.bookingId ? ` · booking ${i.bookingId}` : ""}${i.amountInr ? ` · difference ${inr(i.amountInr)}` : ""}\nType: ${i.type.replace(/_/g, " ")}`,
      refs: { providerId: i.providerId || undefined, bookingId: i.bookingId || undefined },
      dedupeKey: `pay:${i.key}`,
    });
    if (!res.duplicate) alerts++;
  }

  let report = false;
  const today = istDay();
  if (st.lastReport !== today && istHour() >= config.payments.reportHourIst) {
    const t = r.totals;
    const byType = r.issues.reduce((m, i) => ((m[i.type] = (m[i.type] || 0) + 1), m), {});
    await client.feed({
      kind: "report",
      severity: r.issues.some((i) => i.severity === "critical") ? "warning" : "info",
      title: `Wallets & commission check for ${today}: ${r.issueCount ? `${r.issueCount} issue(s)` : "all reconciled"}`,
      body: [
        `Provider wallets: ${t.wallets} · total balance ${inr(t.totalBalanceInr)} · ${t.negativeWallets} negative`,
        `All-time recharges ${inr(t.totalRechargedInr)} · commission recorded ${inr(t.totalCommissionInr)} on ${t.completedJobs} completed jobs`,
        r.issueCount ? `Open issues: ${Object.entries(byType).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ")} — see alerts.` : "Every wallet matches its recharge/deduction history and every charged job is accounted for.",
      ].join("\n"),
      dedupeKey: `pay-report:${today}`,
    });
    st.lastReport = today;
    report = true;
  }
  state.save("payments", st);
  return alerts || report ? `${r.issueCount} issues (${alerts} new alerts)${report ? ", daily summary posted" : ""}` : null;
}

module.exports = { tick };
