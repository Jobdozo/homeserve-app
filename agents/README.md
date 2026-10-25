# Tikdum AI agents worker

Runs Tikdum's AI agents 24/7. Each agent is a non-human staff account created in
**Admin → AI Agents**, works under one normal staff role, and talks to the API
over HTTP only (never to the data files). Safety model: `server/src/agents.js`.

| Agent | Role to give it | Uses AI? | What it does |
|---|---|---|---|
| Operations | Operations Team | No (rules) | Every 5 min: alerts on requests stuck without a provider, providers late for accepted bookings (and nudges them once in-app), very long jobs. **Server watch:** reads `/api/health` and WhatsApps the owner (`ADMIN_PHONES`) when the API or database is down, a backup failed, the server is busy (scaling step 4), photos stop copying to cloud storage, or many requests are refused; reminds every 6 h while it lasts and says when it's fixed (`OPS_WATCH_SERVER`, `OPS_HEALTH_REMIND_HOURS`, `OPS_REFUSED_ALERT`) |
| Reporting | Reporting / Management Team | Yes (Claude Haiku) | Daily at 09:00 IST: founder brief for yesterday, posted to Admin → AI Agents and (best effort) WhatsApp |
| Complaint Triage | Complaint Handling Team | Yes | Every 3 min: new complaints get category, priority, an internal "[AI triage]" note and escalation for safety issues; a first customer reply and refund-claim decisions are **proposed** for approval |
| Customer Support | Customer Support | Yes | Every 20 s: drafts (review mode, default) or sends (auto-send) replies to WhatsApp chats in AI mode from the customer's own bookings + your Support knowledge; logs complaints; hands refunds, safety, legal, abuse and anything unsure to a person |
| Registration | Registration Team | No (rules) | Hourly: reminds providers with incomplete applications what's missing (in-app, max 3×, needs "Notifications → Add" on the role); daily 10:00 IST call list of unfinished sign-ups |
| Verification Pre-check | Provider Verification Team | No (rules) | Every 15 min: checks pending applications (ID proof, services, areas, agreement, GST format, duplicates); **proposes** approval only when complete — never rejection; documents are not sent to any AI |
| Dispatch | Operations Team | No (rules) | Every minute: for each booking on the assignment desk (nobody accepted it) **proposes** the best provider with reasons — online, accepts requests, rating, open jobs, fairness, open complaints (`server/src/dispatchRank.js`). One tap in Approvals rings them; an old suggestion is refused once the booking was assigned another way. Warns when nobody is available. The server uses the same ranking to pick who to ring next after a decline or missed ring |
| Provider Quality | Operations Team | No (rules) | Daily 11:00 IST: providers with low or falling ratings, 1–2★ reviews, ignored or missed requests, jobs dropped after accepting, complaints — a report, plus a **proposed** warning message for the ones that need action (once per provider per 14 days) |
| Retention | Operations Team | No (rules) | Monday 11:00 IST: customers whose last request got no provider, who booked once and never returned, or who stopped booking 1½–6 months ago — a report plus one **proposed** in-app message per group (mentions an active offer with no minimum order); a customer is included at most once per 30 days |
| Fraud | Operations Team | No (rules) | Hourly, alerts only: providers booking their own service, the same customer + provider 4+ times in 14 days, 2+ refund claims in 30 days, 4+ cancellations in 7 days, jobs completed within 5 min of accepting; serious ones also go to the owner on WhatsApp. First run puts existing patterns in one quiet report; providers tagged **test** in Super Admin are left out (Quality too). Never blocks or refunds |
| Reviews & Reputation | Reporting / Management Team | Yes (weekly summary only) | Every 10 min: a same-day alert for each new 1–2★ Tikdum review with the customer's words and number to call. Monday 12:00 IST: reputation report — new reviews, average, star split, best/worst providers, kind words to share, and a short AI summary of praise and complaints. First run only notes existing reviews. Never replies to anyone. Google reviews need the Google Business Profile connected (not built yet) |
| Renewals Bot | Reporting / Management Team | No (rules) | Every 3 h: the paid services in Super Admin → **Paid services** (domain, VPS, MSG91, AI, maps, storage…). WhatsApp + alert 30, 14, 7, 3 and 1 days before each date, on the day and every 2 days while overdue (auto-renew ones: 7, 1, 0); Monday 10:00 IST list of what's due in 60 days and what has no date. The server reads domain (RDAP) and HTTPS expiry dates twice a day by itself (`server/src/paidServices.js`). Never pays anything |
| Payments | Payment Team | No (rules) | Every 6 h: reconciles wallets vs recharge/deduction history, commission charged vs completed jobs, fees on cancelled jobs, negative wallets; alerts + daily 08:00 IST summary; never moves money |
| **CEO (chief of staff)** | Reporting / Management Team, **Type: CEO** | Yes | Reads every agent's reports/alerts, the task board and approvals. Answers you in **AI Agents → CEO chat** (or on WhatsApp from the owner number) within ~1 min; posts a daily review at 10:00 IST and **proposes** tasks and weekly goals for your approval. Can't approve, change data, contact customers or create agents |

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
4. Write the support agent's knowledge in Admin → AI Agents → **Support agent**
   ("Start from Tikdum basics" fills in what the apps do today; add hours and areas).
   The agent only answers from this and the customer's own bookings.
5. Test from a phone that is **not** in `ADMIN_PHONES` — messages from admin numbers go to the
   CEO chat, not the inbox. MSG91's free-form send path in `whatsapp.js` has not been verified
   against a real account yet, so send one reply by hand from the Inbox first.
6. The agent starts in **review mode**: it only writes a suggested reply on each chat
   (Inbox → AI drafts); a person sends, edits or discards it. Switch to **Auto-send** on the
   Support agent tab once the drafts are consistently right.

## Setup (VPS)
1. Deploy the updated server + admin dashboard.
2. Admin → AI Agents → Agents → **Add agent** once per agent (roles above). Copy each key when shown.
3. In the VPS `.env` used by docker compose add:
   ```
   AGENT_KEY_OPERATIONS=tkag_...
   AGENT_KEY_REPORTING=tkag_...
   AGENT_KEY_COMPLAINTS=tkag_...
   AGENT_KEY_SUPPORT=tkag_...
   AGENT_KEY_REGISTRATION=tkag_...
   AGENT_KEY_VERIFICATION=tkag_...
   AGENT_KEY_PAYMENTS=tkag_...
   AGENT_KEY_RENEWALS=tkag_...
   AGENT_KEY_CEO=tkag_...
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
Operations, Registration, Verification and Payments use no AI (free to run). The others use Claude
Haiku 5.5 (`claude-haiku-5-5`, $0.10 / $0.50 per million input / output tokens) at "low" effort; its short
thinking before each answer is billed as output. Reporting makes ~1 call/day (well under $0.01).
Complaint Triage: ~1 call per complaint/refund claim (≈ $0.001). Support: ~1 call per customer message
(~2–4k tokens with knowledge ≈ $0.001); a busy day of 300 messages ≈ $0.30. The CEO: ~1 call per chat
message and a daily review (≈ $0.002 each).
Each agent has a daily USD budget in Admin; when reached it stops calling the AI and posts plain numbers instead.

## Known limits (Phase 1)
- Owner WhatsApp messages (daily brief, server alerts) go as free text, which only arrives if you
  messaged the business number in the last 24h (Meta rule). When `MSG91_NOTICE_TEMPLATE` is set
  (an approved utility template), the server falls back to it, so they arrive any time.
- Server alerts come from this worker, on the same VPS: if the whole VPS is down, only the
  GitHub `uptime` check (email) notices, and GitHub runs it every few hours, not every 10 minutes.

## Network Bot (`src/netwatch.js`, compose service `netwatch`)
Fixed rules, no AI, its own container from the agents image (`build-images.sh agents` builds
and restarts both). Every second it checks the API (`/api/health`), the customer, provider and
admin website containers (ports 5175/5174/5177) and nginx (443); every 10 s it checks tikdum.com,
provider., admin. and api.tikdum.com over HTTPS and that the server has internet; every 6 hours
it checks the HTTPS certificates (warns 14 days ahead).
- Anything failing for 20 s (`NETWATCH_DOWN_AFTER_SEC`): one WhatsApp listing what's down, a
  reminder every 10 min (`NETWATCH_REMIND_MIN`), and "back up" with how long it lasted.
- WhatsApp goes straight to MSG91 with the notice template (`MSG91_NOTICE_TEMPLATE`) to
  `ADMIN_PHONES` (or `NETWATCH_PHONES`), never through the API, so "the API is down" gets out.
- After the VPS was switched off it says when it went dark and for how long, once it's back.
  It can't message during that time; only a watcher outside this server can.
- Optional `AGENT_KEY_NETWORK` (Admin → AI Agents → Teams → Network Bot, then
  `deploy/set-agent-key.sh NETWORK`) shows it in Admin with a heartbeat.
- Check by hand: `docker exec homeserve-netwatch-1 node src/netwatch.js --check`
- Proposal approvals run synchronously; if the server restarts mid-approval the item can
  stay in "executing" — reject/re-propose it.

## Agent Office (task board + CEO chat)
- **Tasks:** Proposed (by the CEO) → To do → In progress → Review → Done. Only people approve proposals and mark tasks done; agents can move their own tasks to In progress/Review.
- **CEO chat:** one thread between you and the CEO agent. Messages from the owner number(s) in `ADMIN_PHONES` to the business WhatsApp number land here instead of the customer inbox, and the CEO's answer goes back on WhatsApp (within WhatsApp's 24h window).
- **No agent-to-agent chat:** everything goes through task threads people can see. Daily caps: CEO 10 task proposals, 40 replies; other agents 60 messages; 5 goal proposals per week.

## Teams and specialist agents
Admin → AI Agents → **Teams** shows the whole organisation (Leadership, Operations, Marketing, Planning, R&D, Engineering), what's running, and an **Add** button for each available role. Role definitions live in `server/src/agentCatalog.js`.

**Specialists** (Marketing, SEO, Business Analyst, Research & Product) are one generic AI worker with different instructions. They only work on tasks assigned to them in **Tasks**: a new task gets a draft and moves to **Review**; move it back to **In progress** with a comment and they revise. They never publish, send or change anything. Put each specialist's key in `AGENT_KEYS_SPECIALISTS` (comma-separated) and restart the agents service.

**Facebook + Instagram (Marketing Agent).** Give the Marketing Agent the **Marketing Team** role. Once the Page is
connected (`bash deploy/set-meta.sh`, see `server/src/social.js`), it proposes one post on Monday, Wednesday and
Friday from 10:00 IST (`SOCIAL_POST_DAYS_IST`, `SOCIAL_POST_HOUR_IST`) and one for every task titled
**"Post: …"**. Claude writes the caption and picks one of Tikdum's own pictures (category photos, live banners,
service photos); Approvals shows the picture and caption, and approving publishes to both. Nothing is posted
without a person's approval; a rejected post is simply dropped.

With **Auto-post** on (AI Agents → Approvals) it publishes up to 5 a day by itself. Every post now:
- gets a **fresh picture** from Image Studio in the category's colour with the logo (`POST /admin/social/picture`,
  max `SOCIAL_PICTURES_PER_DAY`, default 8); if that fails it uses one of Tikdum's own pictures;
- may be a **carousel** (title card, 3–5 point cards and a "book now" card, drawn by `server/src/socialCards.js` with
  the bundled brand fonts) — at most one a day, switch in Approvals;
- follows the **festival & season calendar** in Admin → **Social Media** → Festival calendar
  (`server/src/marketingCalendar.js`): it only names festivals listed there, from `leadDays` before each;
- learns from **results**: the server reads likes, comments, shares, saves and reach of every post twice a day;
  the writer sees its best and worst recent posts, and after 10 measured posts the posting hours move to the
  ones that do best (one hour a day stays experimental).
The day's first post from 16:00 IST is also shared as a **Story** (switch in Approvals; max 2 a day, not counted
in the daily posts). Mondays from 11:00 IST it posts a **results report** to Alerts & reports.

**Threads.** Once `bash deploy/set-threads.sh` has saved a Threads token, every post also goes to Threads, with a
shorter text the writer makes for it (500 characters, one tag; `server/src/socialThreads.js`). The server renews the
60-day token by itself every week. Stories stay on Facebook and Instagram.

**Reels and YouTube Shorts.** Once a day from 18:00 IST (switch "Reels" in AI Agents → Approvals) the Marketing
Agent writes a title and 3–5 quick points; the server draws 9:16 frames (`socialCards.js`), makes a 12–18 s video with
ffmpeg (`socialVideo.js`, installed in the server image) and publishes it in the background to Instagram and Facebook
Reels, Threads and — after `bash deploy/set-youtube.sh` — YouTube as a Short (`socialYoutube.js`). Google keeps
API uploads private until the Cloud project passes YouTube's API audit. A Reel doesn't count in the daily posts.

**Video Studio (Video Studio Agent).** Add the agent from Teams (template `video`, Marketing Team role) and its key with
`bash deploy/set-agent-key.sh SPECIALIST`. In Admin → **Video Studio** you describe a video (one ~9 s scene or a 3-scene
~30 s story, upright 9:16 or wide 16:9, Hinglish/English/no voice, subtitles) or make a set (one per category, or per
festival in the next 45 days). The agent writes the scenes, voice lines and caption (`agents/src/videoStudio.js`); the
server makes each scene with Gemini Omni Flash, the voice with Gemini TTS, and puts it together with the logo, title,
subtitles and "Book" card (`server/src/videoStudio.js`), one at a time and at most N a day (default 2; ~₹75 a scene).
A person previews, publishes (Instagram, Facebook, Threads, YouTube), remakes or deletes; the agent can't.

**Blog (SEO Agent).** Give the SEO Agent the **Reporting / Management Team** role (template `seo`). Every Tuesday and
Friday from 10:00 IST (`BLOG_DAYS_IST`, `BLOG_HOUR_IST`) and for every task titled **"Blog: …"** it writes a
700–1,000-word article from the marketing calendar and the categories, with an Image Studio cover
(`agents/src/blogPosts.js`). The article is saved as a **draft** in Admin → **Blog** and the agent proposes publishing
it; approving puts it live at tikdum.com/blog/<slug> (server-rendered for search engines, in the sitemap). The
Marketing Agent then shares each new article once (at most one a day), with its link, at its next scheduled post.
With **Auto-publish** on (Admin → Blog → Publishing) it writes and publishes up to 10 articles a day itself, spread
from 07:00 to 21:00 IST, at least 600 words each, skipping any title too close to an earlier one; the server refuses
more than the day's number. Covers have their own daily picture count (`BLOG_PICTURES_PER_DAY`, default 10).

Not built yet (shown as "Not built yet"): the Google side of Reviews (needs Google Business Profile access), and the Engineering team (needs GitHub branch protection + a repo-only token first).

## Engineering team (GitHub): Bug Triage, Developer, Code Reviewer, Tester
All four work only through GitHub pull requests, comments and issues. They can't merge, approve,
push to `master`, edit CI/deploy/Docker/env files or dependencies, or touch the auth/permission/
agent code (`auth.js`, `access.js`, `agents.js`, `office.js`, …) — enforced in `src/engineering.js`
and again by the `protect-master` ruleset (PR + 1 approval from someone other than the pusher + green `test` check).

| Agent | What it does | Trigger |
|---|---|---|
| Bug Triage | App-related complaints → GitHub issue (no customer details) + a **proposed** "Fix: …" task for the Developer | every 2 h |
| Developer | Approved task → reads code → commits to `ai/<task id>` → opens a PR → task to Review. Revises when you comment on the task; tries to fix its own failing CI (2× per PR) | every 2 min |
| Code Reviewer | Comments on every open PR at each new commit (bugs, security, conventions). Never approves | every 2 min |
| Tester | Adds tests (new files in `server/test/` only) to Developer PRs; posts where CI failed | every 2 min |

Model: `claude-sonnet-5-5` ($2 in / $10 out per MTok). A Developer task costs roughly $0.10–0.40;
a review $0.02–0.10. Each agent's daily budget (Admin) caps it.

### 1. Create a GitHub App (identity for the agents) — do this yourself
GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App**
- Name: `tikdum-agents` · Homepage: `https://tikdum.com` · **Webhook: uncheck Active**
- Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**,
  **Issues: Read and write**, **Checks: Read-only**, **Actions: Read-only**, Metadata: Read-only.
  Leave **Workflows: No access** (so it can never change CI).
- "Where can this app be installed?": Only on this account → Create.
- Note the **App ID**. Generate a **private key** (.pem downloads).
- **Install App** → only select repository `homeserve-app`.
- Don't add the App to the `protect-master` bypass list.

Why not a personal token: fine-grained tokens can't act on another user's repo as a collaborator,
and your own token would let an agent bypass branch protection (you're on the bypass list).

### 2. Put it on the server
```
cd /root/homeserve-deploy && git pull && bash deploy/set-github-app.sh
```
Asks for the App ID and the `.pem` contents (pasted at a hidden prompt), checks with GitHub that they
match and that the App is installed on the repo, saves the key as
`/root/tikdum-data/agents-secrets/github-app.pem` (owner 1000, mode 400) and `GITHUB_APP_ID` in `.env`,
then restarts the agents. Each Engineering agent key: `bash deploy/set-agent-key.sh ENGINEERING` (once per agent).

### 3. Create the agents
Admin → AI Agents → Teams → Engineering → **Add** on each role (type Engineering, role pre-picked).
Suggested daily budgets: Developer $2, Reviewer $1, Tester $1, Bug Triage $0.5.

### 4. Use it
Assign a task to the Developer in AI Agents → Tasks (or approve one proposed by Bug Triage / the CEO).
Watch the PR on GitHub: CI runs, the Reviewer and Tester comment. Comment on the **task** to ask for
changes. When you're happy: approve + merge on GitHub, then deploy as usual.
