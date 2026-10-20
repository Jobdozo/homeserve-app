// Verification Pre-check Agent — rule-based, no AI, no document images sent
// anywhere. For providers waiting for verification it reads the server's
// checklist (backoffice.js) and:
//   - when every required check passes, PROPOSES approval with the checklist
//     and links to the uploaded documents — a person still opens the ID and
//     decides;
//   - flags possible duplicate accounts as a warning;
//   - follows up on WhatsApp (from Tikdum's number, /admin/inbox/send) with
//     providers whose application is incomplete, listing exactly what's
//     missing so their ID can be activated: first after a day, then every 3
//     days, at most 3 times, only 10:00–19:00 IST. Needs the agent's role to
//     have "WhatsApp inbox → Add"; without it, it says so once in the feed.
// It never proposes rejection: turning someone away stays a human decision.
const config = require("./config");
const state = require("./state");
const { istHour } = require("./time");
const { FRIENDLY } = require("./registration");

const docLabel = { id_proof: "ID proof", gst_certificate: "GST certificate", other: "Other document" };

function proposalFor(p) {
  const lines = p.checks.map((c) => `${c.ok ? "✓" : c.required ? "✗" : "–"} ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
  const docs = p.docs.map((d) => `${docLabel[d.docType] || d.docType}: ${d.url}`);
  return {
    title: `Approve provider ${p.name} (${p.category || "no category"})`,
    summary: `All required checks pass. Before approving, check the Udyam or GST number belongs to this provider (and open the ID proof if one was uploaded).\n\n${lines.join("\n")}`,
    reasoning: `Automated checklist only — documents were not read by AI.\nPhone: ${p.phone} · waiting ${p.waitingDays ?? "?"} days\n${docs.join("\n")}`,
    dedupeKey: `verify:${p.providerId}`,
    request: { method: "PATCH", path: `/providers/${encodeURIComponent(p.providerId)}/verification`, body: { status: "approved" } },
  };
}

// ---- WhatsApp follow-ups ----
const fixable = (p) => (p.missing || []).filter((k) => FRIENDLY[k]);

// Pure: who gets a WhatsApp now. Exported for tests.
function dueForWhatsApp(pending, sent, now, cfg = config.verification) {
  const hour = istHour(now);
  if (hour < cfg.waFromHourIst || hour >= cfg.waToHourIst) return [];
  return pending
    .filter((p) => !p.ready && p.phone && fixable(p).length)
    .filter((p) => (p.waitingDays ?? 0) * 24 >= cfg.waFirstAfterHours)
    .filter((p) => {
      const s = sent[p.providerId] || { count: 0, last: 0 };
      return s.count < cfg.waMax && now - s.last >= cfg.waEveryHours * 3600000;
    })
    .slice(0, cfg.waPerRun);
}

// The owner's wording: no list of what's missing (the app's Profile shows it).
function whatsAppText(p, count = 0, freeUntil = config.verification.waFreeUntil) {
  const opener = count === 0 ? "Your Tikdum Business ID is almost ready ✅" : "Reminder: your Tikdum Business ID is still pending.";
  const free = freeUntil ? `Free registration till ${freeUntil}!` : "Registration is free!";
  return `${opener} Complete the registration and start getting job requests. ${free} Tikdum Business app → Profile.`;
}

async function followUp(client, log, pending, st, now) {
  const self = await client.get("/agents/self").catch(() => ({}));
  const canWhatsApp = (self.agent?.permissions || []).includes("inbox.add");
  const due = dueForWhatsApp(pending, st.wa, now);
  if (!canWhatsApp) {
    if (due.length && !st.toldNoPermission) {
      await client
        .feed({
          kind: "alert",
          severity: "info",
          title: `${due.length} providers with incomplete documents are waiting for a WhatsApp follow-up`,
          body: 'To let the Verification Agent send them, give its role "WhatsApp inbox → Add" (Super Admin → Staff & Roles). Until then they only get the in-app reminder.',
          dedupeKey: "verification-wa-permission",
        })
        .catch(() => null);
      st.toldNoPermission = true;
    }
    return 0;
  }
  let sent = 0;
  for (const p of due) {
    const s = st.wa[p.providerId] || { count: 0, last: 0 };
    try {
      await client.post("/admin/inbox/send", { providerId: p.providerId, message: whatsAppText(p, s.count) });
      st.wa[p.providerId] = { count: s.count + 1, last: now };
      sent++;
    } catch (e) {
      log.warn("verification", "WhatsApp follow-up failed", { providerId: p.providerId, error: e.message });
      if (e.status === 429 || e.status === 503 || e.status === 409) break; // limit reached, WhatsApp off, or no template
      st.wa[p.providerId] = { count: s.count, last: now }; // a bad number isn't retried every run
    }
  }
  return sent;
}

async function tick(client, log, { now = Date.now() } = {}) {
  const st = state.load("verification");
  st.proposed = st.proposed || {};
  st.wa = st.wa || {};
  const pending = await client.get("/admin/verification/precheck");
  let proposed = 0;
  let dupes = 0;
  for (const p of pending) {
    if (p.ready && !st.proposed[p.providerId]) {
      const out = await client.propose(proposalFor(p)).catch((e) => (log.warn("verification", "propose failed", { providerId: p.providerId, error: e.message }), null));
      if (out) {
        st.proposed[p.providerId] = Date.now();
        if (!out.duplicate) proposed++;
      }
    }
    if (p.missing.includes("duplicate")) {
      const dup = p.checks.find((c) => c.key === "duplicate");
      const res = await client.feed({ kind: "alert", severity: "warning", title: `Possible duplicate provider account: ${p.name}`, body: `${p.phone}. ${dup?.detail || ""}`, refs: { providerId: p.providerId }, dedupeKey: `dupe:${p.providerId}` }).catch(() => null);
      if (res && !res.duplicate) dupes++;
    }
  }
  const whatsapped = await followUp(client, log, pending, st, now);
  // A provider who drops out of the pending list (approved/rejected) can be proposed again if they come back.
  const ids = new Set(pending.map((p) => p.providerId));
  for (const id of Object.keys(st.proposed)) if (!ids.has(id)) delete st.proposed[id];
  for (const id of Object.keys(st.wa)) if (!ids.has(id)) delete st.wa[id];
  state.save("verification", st);
  return proposed || dupes || whatsapped
    ? `${pending.length} pending, ${proposed} approvals proposed, ${dupes} duplicate warnings, ${whatsapped} WhatsApp follow-ups`
    : null;
}

module.exports = { tick, proposalFor, dueForWhatsApp, whatsAppText };
