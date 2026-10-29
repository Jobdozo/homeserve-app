#!/usr/bin/env bash
# Sets up Pinterest posting (server/src/socialPinterest.js): asks for the Pinterest app's ID and
# secret (the secret at a hidden prompt, never shown or saved in the shell history), saves them in
# .env and restarts the API. Then sign in from Admin → Social Media → Connect Pinterest.
#
# Before running (developers.pinterest.com, signed in as Tikdum's Pinterest business account):
#   1. My apps → Connect app → name "Tikdum", describe it (posting Tikdum's own tips and videos).
#   2. In the app: Redirect URIs → add  https://api.tikdum.com/api/social/pinterest/callback
#   3. Copy the App ID and the App secret key.
# A new app has "Trial access": Pins then only work in Pinterest's sandbox (nobody sees them).
# Ask for "Standard access" in the app's settings; once granted, Pins are public.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-pinterest.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

printf "Pinterest App ID (numbers): "
IFS= read -r APP_ID
APP_ID="$(printf %s "$APP_ID" | tr -d '[:space:]')"
case "$APP_ID" in ''|*[!0-9]*) echo "That doesn't look like a Pinterest App ID (only digits). Nothing was changed."; exit 1 ;; esac
echo "(Paste with right-click → Paste or Ctrl+Shift+V.)"
printf "Pinterest App secret key (it won't show): "
IFS= read -rs SECRET; echo
SECRET="$(printf %s "$SECRET" | tr -d '[:space:]')"
[ -n "$SECRET" ] || { echo "Nothing was pasted. Nothing was changed."; exit 1; }

tmp="$(mktemp)"
grep -vE '^PINTEREST_(CLIENT_ID|CLIENT_SECRET)=' "$ENV_FILE" > "$tmp" || true
printf 'PINTEREST_CLIENT_ID=%s\nPINTEREST_CLIENT_SECRET=%s\n' "$APP_ID" "$SECRET" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset SECRET
echo "== PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET saved in .env (the secret isn't shown)"

echo "== restarting the API"
bash deploy/build-images.sh server
echo
echo "Done. Now open Admin → Social Media and press Connect Pinterest."
