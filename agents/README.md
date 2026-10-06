# Tikdum AI agents worker

Runs Tikdum's AI agents 24/7. Each agent is a non-human staff account created in
**Admin → AI Agents**, works under one normal staff role, and talks to the API
over HTTP only (never to the data files). Safety model: `server/src/agents.js`.

| Agent | Role to give it | Uses AI? | What it does |
|---|---|---|---|
| Operations | Operations Team | No (rules) | Every 5 min: alerts on requests stuck without a provider, providers late for accepted bookings (and nudges them once in-app), very long jobs |
| Reporting | Reporting / Management Team | Yes (Claude Haiku) | Daily at 09:00 IST: founder brief for yesterday, posted to Admin → AI Agents and (best effort) WhatsApp |
| Complaint Triage | Complaint Handling Team | Yes | Every 3 min: new complaints get category, priority, an internal "[AI triage]" note and escalation for safety issues; a first customer reply and refund-claim decisions are **proposed** for approval |
| Customer Support | Customer Support | Yes | Every 20 s: answers WhatsApp chats in AI mode from the customer's own bookings + your Support knowledge; logs complaints; hands refunds, safety, legal, abuse and anything unsure to a person |

## What agents can never do
- Hold Super Admin / Admin, or touch users, settings, data import/export or AI settings.
- Approve/reject providers or services, decide refunds, resolve/close complaints,
  delete anything, move money, or message more than one person at a time.
  They can only **propose** those; a person approves in Admin → AI Agents → Approvals,
  and it then runs as that person.
- Run when switched off: "Stop all" (or an agent's own switch) takes effect on the next request.

## WhatsApp inbox setup (for Customer Support)
1. Pick a long random secret, e.g. `openssl rand -hex 32`, and set `WHATSAPP_WEBHOOK_SECRET` in the VPS `.env`.
2. MSG91 → WhatsApp → Webhook (New) → Create: event **On Inbound Request Received**,
   URL `https://<your API host>/api/webhooks/whatsapp/msg91`, header `x-webhook-secret: <the secret>`.
3. Send a WhatsApp message to the business number and check **WhatsApp Inbox** in admin.
4. Write the support agent's knowledge (hours, prices policy, how to cancel/reschedule in the app, areas served)
   in Admin → AI Agents → Support knowledge. The agent only answers from this and the customer's own bookings.
5. Test replies with your own number before creating the Support agent. MSG91's free-form
   send path in `whatsapp.js` has not been verified against a real account yet.

## Setup (VPS)
1. Deploy the updated server + admin dashboard.
2. Admin → AI Agents → Agents → **Add agent** once per agent (roles above). Copy each key when shown.
3. In the VPS `.env` used by docker compose add:
   ```
   AGENT_KEY_OPERATIONS=tkag_...
   AGENT_KEY_REPORTING=tkag_...
   AGENT_KEY_COMPLAINTS=tkag_...
   AGENT_KEY_SUPPORT=tkag_...
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. `mkdir -p /root/tikdum-data/agents-state && chown 1000:1000 /root/tikdum-data/agents-state`
5. `docker compose up -d --build agents` and check `docker compose logs -f agents`.

## Local run
```
cp .env.example .env   # fill in keys; TIKDUM_API_URL=http://localhost:4000/api
npm run once           # run each agent once now (reporting forced), then exit
npm start              # run continuously
npm test
```
No npm dependencies (Node ≥ 20.6).

## Costs
Operations uses no AI. Reporting makes ~1 Claude Haiku call/day (well under $0.01).
Complaint Triage: ~1 call per complaint/refund claim (~2k tokens ≈ $0.003). Support: ~1 call per customer
message (~2–4k tokens with knowledge ≈ $0.003–0.006); a busy day of 300 messages ≈ $1–2.
Each agent has a daily USD budget in Admin; when reached it stops calling the AI and posts plain numbers instead.

## Known limits (Phase 1)
- WhatsApp copies of the brief only arrive if you messaged the business number in the
  last 24h (Meta rule). Reliable delivery needs an approved WhatsApp template.
- Proposal approvals run synchronously; if the server restarts mid-approval the item can
  stay in "executing" — reject/re-propose it.
