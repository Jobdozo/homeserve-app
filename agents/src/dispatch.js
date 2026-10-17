// Dispatch Agent — rule-based, no AI. Watches the assignment desk (bookings no
// provider accepted) and, for each one, PROPOSES the best-ranked provider with
// the reasons (server/src/dispatchRank.js): online, accepts requests, rating,
// open jobs, fairness, complaints. A person approves it in Admin → AI Agents with
// one tap; the server then rings that provider like any new request.
//   - one suggestion per waiting booking; approving it after the booking was
//     assigned or accepted some other way is refused (onlyIfWaiting);
//   - when nobody is available it posts a warning so someone phones a provider.
// It never assigns on its own.
const state = require("./state");

const minsSince = (iso, now) => Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
const pinOf = (line) => (String(line || "").match(/\b\d{6}\b/) || [""])[0];
const clock = (iso) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function describe(item) {
  const b = item.booking;
  const pin = pinOf(b.address?.line);
  return `#${b.ref || b.id} · ${b.service?.name || "service"}${pin ? ` · PIN ${pin}` : ""} · ${b.date} ${b.time || "as soon as possible"}`;
}

const optionLine = (o) => `${o.name} — ${o.match?.reasons?.join(", ") || "no data yet"}; customer pays ₹${o.customerPays}${o.cover > 0 ? ` (+₹${o.cover} covered)` : ""}`;

function proposalFor(item, best, now = Date.now()) {
  const b = item.booking;
  const others = item.options.filter((o) => o.providerId !== best.providerId && o.sameService && o.available && !o.passed).slice(0, 3);
  return {
    title: `Give booking #${b.ref || b.id} (${b.service?.name || "service"}) to ${best.name}`,
    summary:
      `${describe(item)}\nNo provider accepted it — waiting ${minsSince(item.since, now)} min; the customer is told sorry at ${clock(item.deadline)}.\n\n` +
      `Best match: ${optionLine(best)}.\n` +
      (best.cover > 0 ? `${item.responsible?.name || "The booked provider"} pays the ₹${best.cover} difference when the job is done.\n` : "") +
      `Approving rings ${best.name} like a new request; if they don't take it, it comes back to the desk.`,
    reasoning: `Ranked by rules (no AI) among providers who offer this service, are available now and haven't passed on it.${others.length ? `\nNext best:\n${others.map((o) => `• ${optionLine(o)}`).join("\n")}` : "\nNo other provider is available right now."}`,
    dedupeKey: `assign:${b.id}@${item.since}`,
    request: { method: "POST", path: `/admin/bookings/${encodeURIComponent(b.id)}/assign`, body: { providerId: best.providerId, onlyIfWaiting: true } },
  };
}

async function tick(client, log, now = Date.now()) {
  const st = state.load("dispatch");
  st.proposed = st.proposed || {};
  st.nobody = st.nobody || {};
  const { items = [] } = await client.get("/admin/assignments");
  let proposed = 0;
  let nobody = 0;
  for (const item of items) {
    const id = item.booking.id;
    const key = `${id}@${item.since}`; // a booking that comes back to the desk is a new wait
    if (st.proposed[key]) continue;
    const best = item.options.find((o) => o.providerId === item.suggestedProviderId);
    if (best) {
      const out = await client.propose(proposalFor(item, best, now)).catch((e) => (log.warn("dispatch", "propose failed", { bookingId: id, error: e.message }), null));
      if (out) {
        st.proposed[key] = now;
        if (!out.duplicate) proposed++;
      }
      continue;
    }
    if (st.nobody[key]) continue;
    const res = await client
      .feed({
        kind: "alert",
        severity: "warning",
        title: `Booking #${item.booking.ref || id} — no provider available to suggest`,
        body: `${describe(item)}. Everyone who offers it is offline, outside the area, busy or already passed on it. Phone a provider, then assign it in the assignment desk. The customer is told sorry at ${clock(item.deadline)}.`,
        refs: { bookingId: id },
        dedupeKey: `dispatch-nobody:${key}`,
      })
      .catch(() => null);
    if (res) {
      st.nobody[key] = now;
      if (!res.duplicate) nobody++;
    }
  }
  // A booking that leaves the desk (assigned, accepted, cancelled) can be suggested again if it comes back.
  const waiting = new Set(items.map((x) => `${x.booking.id}@${x.since}`));
  for (const list of ["proposed", "nobody"]) for (const key of Object.keys(st[list])) if (!waiting.has(key)) delete st[list][key];
  state.save("dispatch", st);
  return proposed || nobody ? `${items.length} waiting, ${proposed} suggestions, ${nobody} with nobody available` : null;
}

module.exports = { tick, proposalFor };
