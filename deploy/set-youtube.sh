#!/usr/bin/env bash
# Connects Tikdum's YouTube channel (server/src/socialYoutube.js): the daily Reel is then uploaded
# as a YouTube Short too. Uses Google's sign-in for devices: this prints a short code, you open
# google.com/device on your phone or computer, sign in with the channel's Google account and type
# the code — no token is ever pasted here. Asks for the OAuth client's ID and secret (the secret at
# a hidden prompt), saves YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN in .env
# and restarts the API. Nothing is uploaded.
#
# Before running (Google Cloud console, project tikdum-1edea):
#   1. APIs & Services → Library → "YouTube Data API v3" → Enable.
#   2. OAuth consent screen → External → app name "Tikdum", your email; Audience → Publish app
#      ("In production" — in "Testing" Google signs the server out every 7 days).
#   3. Credentials → Create credentials → OAuth client ID → type "TVs and Limited Input devices".
# Google keeps videos uploaded this way PRIVATE until the project passes YouTube's API audit
# (support.google.com/youtube/contact/yt_api_form); make them public in YouTube Studio meanwhile.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-youtube.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
command -v python3 >/dev/null || { echo "python3 is needed (apt install python3) — stopping."; exit 1; }

work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
json() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); v=($2); print('' if v is None else v)" "$1" 2>/dev/null || true; }

printf "OAuth client ID (ends with .apps.googleusercontent.com): "
IFS= read -r CLIENT_ID
CLIENT_ID="$(printf %s "$CLIENT_ID" | tr -d '[:space:]')"
case "$CLIENT_ID" in *.apps.googleusercontent.com) ;; *) echo "That doesn't look like an OAuth client ID. Nothing was changed."; exit 1 ;; esac
echo "(Paste with right-click → Paste or Ctrl+Shift+V.)"
printf "OAuth client secret (it won't show): "
IFS= read -rs SECRET; echo
SECRET="$(printf %s "$SECRET" | tr -d '[:space:]')"
[ -n "$SECRET" ] || { echo "Nothing was pasted. Nothing was changed."; exit 1; }
printf %s "$SECRET" > "$work/secret"
unset SECRET

echo "== asking Google for a sign-in code"
curl -s --max-time 20 https://oauth2.googleapis.com/device/code -o "$work/device.json" \
  --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "scope=https://www.googleapis.com/auth/youtube" || true
DEVICE="$(json "$work/device.json" "d.get('device_code')")"
CODE="$(json "$work/device.json" "d.get('user_code')")"
URL="$(json "$work/device.json" "d.get('verification_url')")"
WAIT="$(json "$work/device.json" "d.get('interval')")"
if [ -z "$DEVICE" ]; then
  echo "Google said: $(json "$work/device.json" "d.get('error_description') or d.get('error')")"
  echo "Check the client ID and that its type is \"TVs and Limited Input devices\". Nothing was changed."
  exit 1
fi
echo
echo "   1. Open  $URL  on your phone or computer"
echo "   2. Sign in with the Google account that owns Tikdum's YouTube channel"
echo "   3. Type this code:  $CODE"
echo "   (waiting up to 10 minutes…)"
echo
for _ in $(seq 1 120); do
  sleep "${WAIT:-5}"
  curl -s --max-time 20 https://oauth2.googleapis.com/token -o "$work/token.json" \
    --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "client_secret@$work/secret" \
    --data-urlencode "device_code=$DEVICE" --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:device_code" || true
  ERR="$(json "$work/token.json" "d.get('error')")"
  case "$ERR" in
    authorization_pending | slow_down) continue ;;
    "") break ;;
    *) echo "Google said: $(json "$work/token.json" "d.get('error_description') or d.get('error')"). Nothing was changed."; exit 1 ;;
  esac
done
json "$work/token.json" "d.get('refresh_token')" | tr -d '\n' > "$work/refresh"
json "$work/token.json" "d.get('access_token')" | tr -d '\n' > "$work/access"
[ -s "$work/refresh" ] || { echo "No sign-in came back (timed out?). Run this again. Nothing was changed."; exit 1; }

curl -s -G --max-time 20 "https://www.googleapis.com/youtube/v3/channels" -o "$work/channel.json" \
  --data-urlencode "part=snippet" --data-urlencode "mine=true" -H "Authorization: Bearer $(cat "$work/access")" || true
CHANNEL="$(json "$work/channel.json" "(d.get('items') or [{}])[0].get('snippet',{}).get('title')")"
if [ -z "$CHANNEL" ]; then
  echo "   WARNING: that Google account has no YouTube channel (or the YouTube Data API isn't enabled). Saving anyway."
else
  echo "   YouTube channel: $CHANNEL"
fi

tmp="$(mktemp)"
grep -vE '^YOUTUBE_(CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)=' "$ENV_FILE" > "$tmp" || true
{
  printf 'YOUTUBE_CLIENT_ID=%s\n' "$CLIENT_ID"
  printf 'YOUTUBE_CLIENT_SECRET=%s\n' "$(cat "$work/secret")"
  printf 'YOUTUBE_REFRESH_TOKEN=%s\n' "$(cat "$work/refresh")"
} >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "== saved in .env (nothing secret is shown)"

echo "== restarting the API"
bash deploy/build-images.sh server
echo
echo "YOUTUBE CONNECTED${CHANNEL:+ ($CHANNEL)}. The daily Reel goes up as a Short too (private until Google's API audit)."
