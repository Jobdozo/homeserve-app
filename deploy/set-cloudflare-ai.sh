#!/usr/bin/env bash
# Connects Image Studio to Cloudflare Workers AI (the FLUX picture model) — the picture maker used
# when Gemini isn't set up or is out of quota. Asks for the Cloudflare account ID and an API token
# (typed at a prompt, never shown on screen or saved in the shell history), draws one small test
# picture to check the token works, saves both in .env and restarts the API.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-cloudflare-ai.sh
#
# The token: Cloudflare dashboard → My Profile → API Tokens → Create Token → "Workers AI" template
# (Account → Workers AI → Read and Edit), for the Tikdum account only.
# Safe to run again (e.g. with a new token): it replaces the old lines.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

DEFAULT_ACCOUNT="15795f3116e27726387d32069bca8292"
printf "Cloudflare account ID [%s]: " "$DEFAULT_ACCOUNT"
IFS= read -r ACCOUNT
ACCOUNT="$(printf %s "${ACCOUNT:-$DEFAULT_ACCOUNT}" | tr -d '[:space:]')"
case "$ACCOUNT" in
  *[!0-9a-f]* | "") echo "That doesn't look like a Cloudflare account ID (32 letters a–f and numbers). Nothing was changed."; exit 1 ;;
esac

printf "Paste the Cloudflare API token (it won't show) and press Enter: "
IFS= read -rs TOKEN
echo
TOKEN="$(printf %s "$TOKEN" | tr -d '[:space:]')"
[ -n "$TOKEN" ] || { echo "No token given. Nothing was changed."; exit 1; }

echo "== drawing one test picture with Cloudflare Workers AI"
body="$(mktemp)"
code=$(curl -s -o "$body" -w '%{http_code}' --max-time 90 \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/ai/run/@cf/black-forest-labs/flux-1-schnell" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"prompt":"a small purple ceramic cup on a white table, soft light","steps":4}' || echo 000)
if [ "$code" != "200" ] || ! grep -q '"image"' "$body"; then
  unset TOKEN
  case "$code" in
    400) why="the request was refused — check the account ID" ;;
    401|403) why="the token is wrong or doesn't have Workers AI permission" ;;
    429) why="the free daily Workers AI allowance is used up — try again tomorrow" ;;
    000) why="couldn't reach Cloudflare from this server" ;;
    *) why="unexpected answer" ;;
  esac
  echo "Cloudflare answered $code — $why. Nothing was changed."
  msg="$(grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
  [ -n "$msg" ] && echo "Cloudflare says: $msg"
  rm -f "$body"
  exit 1
fi
rm -f "$body"

# Replace any old lines, keep everything else (and the file's owner and permissions).
tmp="$(mktemp)"
grep -vE '^(CF_AI_ACCOUNT_ID|CF_AI_TOKEN)=' "$ENV_FILE" > "$tmp" || true
printf 'CF_AI_ACCOUNT_ID=%s\nCF_AI_TOKEN=%s\n' "$ACCOUNT" "$TOKEN" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset TOKEN
echo "== token works and is saved in .env (not shown)"

echo "== restarting the API with the new settings"
docker compose -p homeserve up -d --no-build server

echo
echo "Done. Super Admin → Services & Categories → Image Studio now shows \"Cloudflare AI connected\"."
