#!/usr/bin/env bash
# Sets up the Email Inbox (server/src/mailbox.js) on the VPS: asks for the Postmark Server API
# token (typed at a prompt, never shown or saved in the shell history), checks it with Postmark,
# makes the inbound webhook password once, saves both in .env and restarts the server. Then it
# prints the inbound webhook URL to paste into Postmark (Servers → Tikdum → Default Inbound Stream
# → Settings → Webhook URL).
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-email-keys.sh
#
# Safe to run again (e.g. with a new token): the webhook password is kept, so Postmark's URL stays right.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

printf "Paste the Postmark Server API token (Servers → Tikdum → API Tokens; it won't show) and press Enter: "
IFS= read -rs TOKEN
echo
TOKEN="$(printf %s "$TOKEN" | tr -d '[:space:]')"
[ -n "$TOKEN" ] || { echo "Nothing pasted. Nothing was changed."; exit 1; }

echo "== checking the token with Postmark"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://api.postmarkapp.com/server \
  -H "Accept: application/json" -H "X-Postmark-Server-Token: $TOKEN" || echo 000)
if [ "$code" != 200 ]; then
  unset TOKEN
  echo "Postmark answered $code — that isn't a working Server API token (an Account token won't do). Nothing was changed."
  exit 1
fi

SECRET="$( { grep -aE '^EMAIL_WEBHOOK_SECRET=' "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
if [ -z "$SECRET" ]; then
  SECRET="$(openssl rand -hex 24)"
  echo "   (made a new webhook password)"
fi

tmp="$(mktemp)"
grep -vE '^(POSTMARK_SERVER_TOKEN|EMAIL_WEBHOOK_SECRET)=' "$ENV_FILE" > "$tmp" || true
printf 'POSTMARK_SERVER_TOKEN=%s\nEMAIL_WEBHOOK_SECRET=%s\n' "$TOKEN" "$SECRET" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset TOKEN
echo "== POSTMARK_SERVER_TOKEN and EMAIL_WEBHOOK_SECRET saved in .env (the token isn't shown)"

echo "== restarting the server with the new settings"
bash deploy/build-images.sh server
echo
echo "Done. Now paste this as the Webhook URL of Postmark's Default Inbound Stream:"
echo
echo "   https://postmark:${SECRET}@api.tikdum.com/api/webhooks/email/postmark"
echo
echo "Then Admin → Email Inbox stops showing the 'not set up' notice."
