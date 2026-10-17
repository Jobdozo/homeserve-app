# Outside watcher (Cloudflare Worker)

Runs every minute on Cloudflare, away from the Hostinger VPS, for the one outage the
Network Bot on the VPS can't report: the whole server off or cut off. Both tikdum.com and
api.tikdum.com failing on 2 runs in a row -> WhatsApp to `OWNER_PHONES` through MSG91's
notice template; a reminder every 30 min; a message when it's reachable again. Free plan:
1,440 runs a day, KV written only when the state changes.

## Set up (once)
1. Free Cloudflare account (dash.cloudflare.com). The site's DNS stays at Hostinger.
2. From this folder: `npx wrangler login`, then `npx wrangler kv namespace create STATE`,
   put the id in `wrangler.toml`, then `npx wrangler deploy`.
3. Cloudflare dashboard -> Workers -> tikdum-outside-watcher -> Settings -> Variables and Secrets:
   `MSG91_AUTH_KEY` (type Secret), `MSG91_WHATSAPP_NUMBER`, `OWNER_PHONES` (e.g. 91XXXXXXXXXX).
4. Within a minute: WhatsApp "Outside watcher: ✅ I'm on". Opening the Worker's
   workers.dev address shows its last known state.

Tests: `node --test monitor/outside-watcher/worker.test.mjs`
