#!/usr/bin/env bash
# Puts the Google Maps browser key (Google Cloud → Credentials, restricted to the websites
# https://tikdum.com/* and https://www.tikdum.com/*, and to Maps JavaScript API, Places API (New)
# and Geocoding API) into the VPS .env — typed at a prompt, never shown on screen or saved in the
# shell history — after one test lookup made as tikdum.com. Then restarts the API, which hands the
# key to the location picker (/api/maps/config). Without it the picker uses OpenStreetMap.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-maps-key.sh
#
# Safe to run again (e.g. after rotating the key): it replaces the old line.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

printf "Paste the Google Maps API key (it won't show) and press Enter: "
IFS= read -rs KEY
echo
KEY="$(printf %s "$KEY" | tr -d '[:space:]')"
case "$KEY" in
  AIza*) ;;
  *) echo "That doesn't look like a Google API key (they start with AIza). Nothing was changed."; exit 1 ;;
esac

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
echo "== test: Jammu's address, asked as the tikdum.com website"
code=$(curl -s -o "$body" -w '%{http_code}' --max-time 20 -H "Referer: https://tikdum.com/" \
  "https://maps.googleapis.com/maps/api/geocode/json?latlng=32.7266,74.857&key=$KEY" || echo 000)
status="$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | head -1 | sed 's/.*"\([A-Z_]*\)"$/\1/')"
why="$(grep -o '"error_message"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
if [ "$status" = "OK" ]; then
  echo "== Google answered: $(grep -o '"formatted_address"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
else
  echo "!! Google answered ${status:-HTTP $code}${why:+ — $why}"
  echo "   Common causes: Geocoding API not enabled or not ticked on the key, billing not set up on the project,"
  echo "   or the key's website list doesn't include https://tikdum.com/* — fix it in Google Cloud, then run this again."
  printf "Save the key anyway? (y/N): "
  IFS= read -r yes
  case "$yes" in y|Y) ;; *) unset KEY; echo "Nothing was changed."; exit 1 ;; esac
fi

tmp="$(mktemp)"
grep -v '^GOOGLE_MAPS_BROWSER_KEY=' "$ENV_FILE" > "$tmp" || true
printf 'GOOGLE_MAPS_BROWSER_KEY=%s\n' "$KEY" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset KEY
echo "== key saved in .env (not shown)"

echo "== restarting the API"
docker compose -p homeserve up -d --no-build server

echo
echo "Done. tikdum.com → choose a location → the map is now Google Maps (OpenStreetMap if Google refuses the key)."
