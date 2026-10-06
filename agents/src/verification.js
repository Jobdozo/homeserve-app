// Verification Pre-check Agent — rule-based, no AI, no document images sent
// anywhere. For providers waiting for verification it reads the server's
// checklist (backoffice.js) and:
//   - when every required check passes, PROPOSES approval with the checklist
//     and links to the uploaded documents — a person still opens the ID and
//     decides;
//   - flags possible duplicate accounts as a warning.
// It never proposes rejection: turning someone away stays a human decision.
const state = require("./state");

const docLabel = { id_proof: "ID proof", gst_certificate: "GST certificate", other: "Other document" };

function proposalFor(p) {
  const lines = p.checks.map((c) => `${c.ok ? "✓" : c.required ? "✗" : "–"} ${c.label}${c.detail ? ` (${c.detail})` : ""}`);
  const docs = p.docs.map((d) => `${docLabel[d.docType] || d.docType}: ${d.url}`);
  return {
    title: `Approve provider ${p.name} (${p.category || "no category"})`,
    summary: `All required checks pass. Before approving, open the ID proof and confirm the name and photo match this provider.\n\n${lines.join("\n")}`,
    reasoning: `Automated checklist only — documents were not read by AI.\nPhone: ${p.phone} · waiting ${p.waitingDays ?? "?"} days\n${docs.join("\n")}`,
    dedupeKey: `verify:${p.providerId}`,
    request: { method: "PATCH", path: `/providers/${encodeURIComponent(p.providerId)}/verification`, body: { status: "approved" } },
  };
}

async function tick(client, log) {
  const st = state.load("verification");
  st.proposed = st.proposed || {};
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
  // A provider who drops out of the pending list (approved/rejected) can be proposed again if they come back.
  const ids = new Set(pending.map((p) => p.providerId));
  for (const id of Object.keys(st.proposed)) if (!ids.has(id)) delete st.proposed[id];
  state.save("verification", st);
  return proposed || dupes ? `${pending.length} pending, ${proposed} approvals proposed, ${dupes} duplicate warnings` : null;
}

module.exports = { tick, proposalFor };
