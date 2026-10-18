import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../context/AppContext";

// Scheduled push notification campaigns (server/src/pushCampaigns.js): the server sends
// each message to all customers at its time. Created here, or by approving a Marketing
// Agent proposal in AI Agents → Approvals.
const inputCls = "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-brand";
const labelCls = "mb-1 block text-[12.5px] font-semibold text-gray-700";
const TIME_CHOICES = ["09:00", "12:00", "15:00", "18:00", "20:00"];
const IST_MS = 5.5 * 3600 * 1000;
const tomorrowIst = () => new Date(Date.now() + IST_MS + 86400000).toISOString().slice(0, 10);
const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

const STATUS = {
  active: ["Running", "bg-green-50 text-green-700"],
  finished: ["Finished", "bg-gray-100 text-gray-600"],
  cancelled: ["Stopped", "bg-red-50 text-red-600"],
};

function parseMessages(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim(), message: rest.join("|").trim() };
    });
}

function NewCampaign({ onCreated }) {
  const { showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(tomorrowIst());
  const [days, setDays] = useState(7);
  const [times, setTimes] = useState(["09:00", "12:00", "15:00", "18:00"]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const messages = parseMessages(text);
  const incomplete = messages.some((m) => !m.title || !m.message);

  const toggle = (t) => setTimes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort()));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createPushCampaign({ name: name.trim(), startDate, days: Number(days), times, messages });
      showToast("Push campaign scheduled");
      setOpen(false);
      setName("");
      setText("");
      onCreated();
    } catch (err) {
      showToast(err.message || "Couldn't schedule the campaign");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-brand px-4 py-2 text-[12.5px] font-semibold text-brand-dark hover:bg-brand-light">
        + New push campaign
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3.5 rounded-xl border border-gray-100 p-3.5">
      <div>
        <label className={labelCls}>Campaign name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jammu service rotation" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Start date</label>
          <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Days</label>
          <input type="number" min={1} max={30} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Send times (IST, up to 4 a day, 2 hours apart)</label>
        <div className="flex flex-wrap gap-2">
          {TIME_CHOICES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`rounded-xl border px-3 py-1.5 text-[12.5px] font-semibold ${times.includes(t) ? "border-brand bg-brand-light text-brand-dark" : "border-gray-200 text-gray-500"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelCls}>Messages, one per line: Title | Message</label>
        <textarea
          className={inputCls}
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"🏡 A clean home, a happy you | Book home cleaning in Jammu on Tikdum.\n⚡ Electrical problems? | Book a verified electrician on Tikdum."}
        />
        <p className="mt-1 text-[11.5px] text-gray-500">
          {messages.length} message(s), sent in turn at each time — about {times.length * (Number(days) || 0)} notifications in all.
          {incomplete && <span className="text-red-600"> Every line needs a title, a "|" and a message.</span>}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim() || !messages.length || incomplete || !times.length}
          className="rounded-xl bg-brand px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {saving ? "Scheduling…" : "Schedule campaign"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-gray-500 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Campaign({ c, onChange }) {
  const { showToast } = useApp();
  const [showAll, setShowAll] = useState(false);
  const sent = c.sends.filter((s) => s.status === "sent");
  const next = c.sends.find((s) => s.status === "scheduled");
  const [label, cls] = STATUS[c.status] || [c.status, "bg-gray-100 text-gray-600"];
  const reached = sent.reduce((n, s) => n + (s.reached || 0), 0);

  const stop = async () => {
    if (!window.confirm(`Stop "${c.name}"? The remaining notifications won't be sent.`)) return;
    try {
      await api.cancelPushCampaign(c.id);
      showToast("Campaign stopped");
      onChange();
    } catch (err) {
      showToast(err.message || "Couldn't stop the campaign");
    }
  };

  return (
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-900">{c.name}</p>
          <p className="text-[11.5px] text-gray-500">
            {c.times.join(", ")} IST · from {c.startDate} for {c.days} day(s) · by {c.createdBy || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
          {c.status === "active" && (
            <button type="button" onClick={stop} className="rounded-lg border border-red-200 px-2.5 py-1 text-[11.5px] font-semibold text-red-600 hover:bg-red-50">
              Stop
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-gray-700">
        {sent.length} of {c.sends.length} sent{reached ? ` (${reached} deliveries)` : ""}
        {next ? ` · next ${when(next.at)}: ${next.title}` : ""}
      </p>
      <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-[11.5px] font-semibold text-brand-dark">
        {showAll ? "Hide messages" : `Show ${c.messages.length} message(s)`}
      </button>
      {showAll && (
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[12px] text-gray-700">
          {c.messages.map((m, i) => (
            <li key={i}>
              <span className="font-semibold">{m.title}</span> — {m.message}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function PushCampaigns() {
  const [campaigns, setCampaigns] = useState(null);
  const refresh = () => api.listPushCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">Scheduled Push Campaigns</h2>
          <p className="text-[12px] text-gray-500">Sent to all customers at set times. The Marketing Agent proposes them for tasks titled "Push: …".</p>
        </div>
      </div>
      <div className="mt-3">
        <NewCampaign onCreated={refresh} />
      </div>
      {campaigns === null && <p className="py-6 text-center text-sm text-gray-400">Loading…</p>}
      {campaigns?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No push campaigns yet.</p>}
      <div className="mt-2 divide-y divide-gray-50">
        {campaigns?.map((c) => (
          <Campaign key={c.id} c={c} onChange={refresh} />
        ))}
      </div>
    </div>
  );
}
