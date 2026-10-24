#!/usr/bin/env bash
# Connects Tikdum's Threads account (server/src/socialThreads.js): the Marketing Agent's posts then
# go to Threads too, with a shorter text. Asks for a Threads user token (typed at a hidden prompt —
# never shown, saved in the shell history or kept) and, if the token is a short-lived one, the
# Threads app secret to swap it for a long-lived one. Saves THREADS_USER_ID / THREADS_TOKEN in
# .env and restarts the API. The server renews the token by itself every week after that.
# Nothing is posted.
#
# Get the token: developers.facebook.com → your app → Use cases → "Access the Threads API" →
# Customize → Permissions: add threads_basic, threads_content_publish and threads_manage_insights;
# Settings → "User Token Generator" → add your Threads account (accept the invite in the Threads
# app: Settings → Account → Website permissions → Invites) → Generate access token.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-threads.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
API="https://graph.threads.net"
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
command -v python3 >/dev/null || { echo "python3 is needed (apt install python3) — stopping."; exit 1; }

work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
json() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); v=($2); print('' if v is None else v)" "$1" 2>/dev/null || true; }

echo "(Paste with right-click → Paste or Ctrl+Shift+V — plain Ctrl+V doesn't work in most terminals.)"
printf "Threads access token (it won't show): "
IFS= read -rs TOKEN; echo
TOKEN="$(printf %s "$TOKEN" | tr -d '[:space:]')"
[ -n "$TOKEN" ] || { echo "   Nothing was pasted. Nothing was changed — run this again."; exit 1; }
echo "   ✓ received (${#TOKEN} characters)"
printf %s "$TOKEN" > "$work/token"
unset TOKEN

echo "== checking the token"
curl -s -G --max-time 20 "$API/v1.0/me" -o "$work/me.json" --data-urlencode "fields=id,username" --data-urlencode "access_token@$work/token" || true
USER_ID="$(json "$work/me.json" "d.get('id')")"
USERNAME="$(json "$work/me.json" "d.get('username')")"
if [ -z "$USER_ID" ]; then
  echo "Threads didn't accept it: $(json "$work/me.json" "d.get('error',{}).get('message')")"
  echo "Make a fresh token (see the top of this script). Nothing was changed."
  exit 1
fi
echo "   Threads account: @$USERNAME"

echo "== making it long-lived (60 days, then renewed by the server)"
printf "Threads app secret (Use cases → Threads → Settings; press Enter to skip if the token came from the User Token Generator): "
IFS= read -rs SECRET; echo
SECRET="$(printf %s "$SECRET" | tr -d '[:space:]')"
if [ -n "$SECRET" ]; then
  printf %s "$SECRET" > "$work/secret"
  unset SECRET
  curl -s -G --max-time 20 "$API/access_token" -o "$work/ll.json" --data-urlencode grant_type=th_exchange_token \
    --data-urlencode "client_secret@$work/secret" --data-urlencode "access_token@$work/token" || true
  LONG="$(json "$work/ll.json" "d.get('access_token')")"
  if [ -n "$LONG" ]; then
    printf %s "$LONG" > "$work/token"
    unset LONG
    echo "   ✓ swapped for a long-lived token"
  else
    echo "   Couldn't swap it ($(json "$work/ll.json" "d.get('error',{}).get('message')")) — keeping the token as it is (fine if it's already long-lived)."
  fi
else
  echo "   skipped — keeping the token as it is"
fi

tmp="$(mktemp)"
grep -vE '^THREADS_(USER_ID|TOKEN)=' "$ENV_FILE" > "$tmp" || true
{
  printf 'THREADS_USER_ID=%s\n' "$USER_ID"
  printf 'THREADS_TOKEN=%s\n' "$(cat "$work/token")"
} >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "== saved in .env (the token isn't shown)"

echo "== restarting the API"
bash deploy/build-images.sh server
echo
echo "THREADS CONNECTED (@$USERNAME). The Marketing Agent's next posts go to Threads as well."
