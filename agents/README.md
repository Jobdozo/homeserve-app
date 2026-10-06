# Tikdum AI agents worker

Runs Tikdum's AI agents 24/7. Each agent is a non-human staff account created in
**Admin → AI Agents**, works under one normal staff role, and talks to the API
over HTTP only (never to the data files). Safety model: `server/src/agents.js`.

| Agent | Role to give it | Uses AI? | What it does |
|---|---|---|---|
| Operations | Operations Team | No (rules) | Every 5 min: alerts on requests stuck without a provider, providers late for accepted bookings (and nudges them once in-app), very long jobs |
| Reporting | Reporting / Management Team | Yes (Claude Haiku) | Daily at 09:00 IST: founder brief for yesterday, posted to Admin → AI Agents and (best effort) WhatsApp |

## What agents can never do
- Hold Super Admin / Admin, or touch users, settings, data import/export or AI settings.
- Approve/reject providers or services, decide refunds, resolve/close complaints,
  delete anything, move money, or message more than one person at a time.
  They can only **propose** those; a person approves in Admin → AI Agents → Approvals,
  and it then runs as that person.
- Run when switched off: "Stop all" (or an agent's own switch) takes effect on the next request.

## Setup (VPS)
1. Deploy the updated server + admin dashboard.
2. Admin → AI Agents → Agents → **Add agent** twice (roles above). Copy each key when shown.
3. In the VPS `.env` used by docker compose add:
   ```
   AGENT_KEY_OPERATIONS=tkag_...
   AGENT_KEY_REPORTING=tkag_...
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
Operations uses no AI. Reporting makes ~1 Claude Haiku call/day (~1–2k tokens ≈ well under $0.01).
Each agent has a daily USD budget in Admin; when reached it stops calling the AI and posts plain numbers instead.

## Known limits (Phase 1)
- WhatsApp copies of the brief only arrive if you messaged the business number in the
  last 24h (Meta rule). Reliable delivery needs an approved WhatsApp template.
- Proposal approvals run synchronously; if the server restarts mid-approval the item can
  stay in "executing" — reject/re-propose it.
