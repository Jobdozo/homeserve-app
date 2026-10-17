#!/usr/bin/env bash
# Turns on Meta ads measurement (server/src/metaEvents.js + the tikdum.com Meta Pixel): asks for
# the dataset (Pixel) ID and a Conversions API access token from Meta Events Manager (the token
# typed at a hidden prompt — never shown or saved in the shell history), checks them with Meta,
# saves META_PIXEL_ID / META_CAPI_TOKEN / META_TEST_EVENT_CODE in .env and restarts the API.
#
#   cd /tmp/homeserve-deploy && git pull && bash deploy/set-meta-pixel.sh
#
# With a test event code, events show up live in Events Manager → Test events (and nowhere else);
# run this again and press Enter at that question to go live. Safe to run again.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
GRAPH="${META_GRAPH_URL:-https://graph.facebook.com/v23.0}"
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT

printf "Dataset (Pixel) ID (Events Manager → your dataset → Settings): "
IFS= read -r PIXEL_ID
PIXEL_ID="$(printf %s "$PIXEL_ID" | tr -d '[:space:]')"
case "$PIXEL_ID" in '' | *[!0-9]*) echo "The dataset ID is a number. Nothing was changed."; exit 1 ;; esac
echo "(Paste with right-click → Paste or Ctrl+Shift+V — plain Ctrl+V doesn't work in most terminals.)"
printf "Conversions API access token (Settings → Conversions API → Generate access token; it won't show): "
IFS= read -rs TOKEN; echo
TOKEN="$(printf %s "$TOKEN" | tr -d '[:space:]')"
[ -n "$TOKEN" ] || { echo "   Nothing was pasted. Nothing was changed — run this again."; exit 1; }
echo "   ✓ received (${#TOKEN} characters)"
printf %s "$TOKEN" > "$work/token"
printf "Test event code (Events Manager → Test events, like TEST12345), or press Enter to go live: "
IFS= read -r TEST_CODE
TEST_CODE="$(printf %s "$TEST_CODE" | tr -d '[:space:]')"
case "$TEST_CODE" in '' | TEST[A-Za-z0-9]*) ;; *) echo "A test code starts with TEST. Nothing was changed."; exit 1 ;; esac

echo "== checking with Meta"
msg_of() { grep -o '"message":"[^"]*"' "$1" | head -1 | cut -d'"' -f4 || true; }
# Reading the dataset needs more than sending to it (a system-user token may only be allowed to
# send), so a refused read isn't the end: with a test code we check by sending one test event.
code=$(curl -s -G --max-time 20 -o "$work/check.json" -w '%{http_code}' "$GRAPH/$PIXEL_ID" \
  --data-urlencode "fields=id" --data-urlencode "access_token@$work/token" || echo 000)
if [ "$code" = 200 ]; then
  echo "   Dataset $PIXEL_ID found"
elif [ -n "$TEST_CODE" ]; then
  echo "   (Meta won't show the dataset to this token: $(msg_of "$work/check.json") — checking by sending one test event instead)"
  now=$(date +%s)
  printf '[{"event_name":"PageView","event_time":%d,"event_id":"setup-check-%d","action_source":"website","event_source_url":"https://tikdum.com/","user_data":{"client_user_agent":"Tikdum setup check","country":["%s"]}}]' \
    "$now" "$now" "$(printf in | sha256sum | cut -d' ' -f1)" > "$work/event.json"
  code=$(curl -s --max-time 20 -o "$work/send.json" -w '%{http_code}' "$GRAPH/$PIXEL_ID/events" \
    --data-urlencode "data@$work/event.json" --data-urlencode "test_event_code=$TEST_CODE" --data-urlencode "access_token@$work/token" || echo 000)
  if [ "$code" != 200 ] || ! grep -q '"events_received":1' "$work/send.json"; then
    echo "Meta didn't accept a test event (${code}): $(msg_of "$work/send.json")"
    echo "Check the dataset ID and that the system user has the Tikdum Website dataset (Business Settings → System users). Nothing was changed."
    exit 1
  fi
  echo "   ✓ a test PageView reached the dataset — it shows in Events Manager → Test events"
else
  echo "Meta didn't accept it (${code}): $(msg_of "$work/check.json")"
  echo "Run this again with the test event code (Events Manager → Test events) — that checks the token by"
  echo "sending one test event, which works even when the token can't read the dataset. Nothing was changed."
  exit 1
fi

tmp="$(mktemp)"
grep -vE '^META_(PIXEL_ID|CAPI_TOKEN|TEST_EVENT_CODE)=' "$ENV_FILE" > "$tmp" || true
{
  printf 'META_PIXEL_ID=%s\n' "$PIXEL_ID"
  printf 'META_CAPI_TOKEN=%s\n' "$(cat "$work/token")"
  printf 'META_TEST_EVENT_CODE=%s\n' "$TEST_CODE"
} >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset TOKEN
echo "== saved in .env (the token isn't shown)"

echo "== restarting the API"
bash deploy/build-images.sh server
echo
if [ -n "$TEST_CODE" ]; then
  echo "META ADS MEASUREMENT IS ON IN TEST MODE: open tikdum.com, look around, book something — the events"
  echo "appear in Events Manager → Test events. Run this again without a test code to go live."
else
  echo "META ADS MEASUREMENT IS LIVE: tikdum.com page views, service views, sign-ups and bookings (website and"
  echo "app) are sent to Meta. Events Manager shows them within about 20 minutes."
fi
