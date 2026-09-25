import { useEffect, useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import { useApp } from "../context/AppContext";
import { api } from "../api";

const STATUS_STYLES = {
  active: { label: "Running", className: "bg-emerald-100 text-emerald-700" },
  paused: { label: "Paused", className: "bg-gray-100 text-gray-600" },
  paused_low_balance: { label: "Paused — low balance", className: "bg-red-100 text-red-600" },
};

export default function AdsScreen() {
  const { services, wallet, showToast } = useApp();
  const [ads, setAds] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => api.listAds().then(setAds).catch(() => setAds([]));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runningAds = (ads || []).filter((a) => a.status !== "stopped");
  const advertisedServiceIds = new Set(runningAds.map((a) => a.serviceId));
  const eligibleServices = services.filter((s) => s.status === "active" && !advertisedServiceIds.has(s.id));

  const handleCreate = async () => {
    if (!selectedServiceId) return;
    setCreating(true);
    try {
      await api.createAd(selectedServiceId);
      setSelectedServiceId("");
      showToast("Advertisement created");
      await load();
    } catch (err) {
      showToast(err.message || "Failed to create advertisement");
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (ad) => {
    setBusyId(ad.id);
    try {
      const next = ad.status === "active" ? "paused" : "active";
      await api.setAdStatus(ad.id, next);
      showToast(next === "active" ? "Advertisement resumed" : "Advertisement paused");
      await load();
    } catch (err) {
      showToast(err.message || "Failed to update advertisement");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Advertisements" />

      <div className="flex-1 space-y-5 px-4 pb-8 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
          <div>
            <p className="text-[11px] text-gray-400">Wallet balance</p>
            <p className="text-xl font-extrabold text-gray-900">₹{wallet.balance.toLocaleString("en-IN")}</p>
          </div>
          <p className="max-w-[55%] text-right text-[11px] leading-snug text-gray-400">
            Every click on an advertised service deducts the CPC rate from this balance.
          </p>
        </div>

        {eligibleServices.length > 0 && (
          <div>
            <h2 className="mb-2 text-[13px] font-bold text-gray-900">Advertise a Service</h2>
            <div className="flex gap-2">
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand"
              >
                <option value="">Select a service…</option>
                {eligibleServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreate}
                disabled={!selectedServiceId || creating}
                className="flex-shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {creating ? "Adding…" : "Advertise"}
              </button>
            </div>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Your Advertisements</h2>
          {ads === null && <p className="text-[12.5px] text-gray-400">Loading…</p>}
          {ads !== null && runningAds.length === 0 && (
            <p className="text-[12.5px] text-gray-400">
              No advertisements yet — advertise a service above to get more visibility.
            </p>
          )}
          <div className="space-y-3">
            {runningAds.map((ad) => {
              const status = STATUS_STYLES[ad.status] || STATUS_STYLES.paused;
              return (
                <div key={ad.id} className="rounded-2xl border border-gray-100 p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ad.serviceIcon}</span>
                      <p className="text-[13.5px] font-semibold text-gray-900">{ad.serviceName}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-gray-50 py-2">
                      <p className="text-[15px] font-extrabold text-gray-900">{ad.clicks}</p>
                      <p className="text-[10px] text-gray-400">Total Clicks</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 py-2">
                      <p className="text-[15px] font-extrabold text-gray-900">₹{ad.amountSpent}</p>
                      <p className="text-[10px] text-gray-400">Amount Spent</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleStatus(ad)}
                    disabled={busyId === ad.id}
                    className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-[12px] font-semibold text-gray-600 disabled:opacity-50"
                  >
                    {busyId === ad.id ? "Updating…" : ad.status === "active" ? "Pause" : "Resume"}
                  </button>
                  {ad.status === "paused_low_balance" && (
                    <p className="mt-2 text-center text-[11px] text-red-500">
                      Auto-paused — your wallet balance was too low to cover the next click. Recharge, then tap Resume.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
