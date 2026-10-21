#!/usr/bin/env bash
# Puts the API Setu "GSTIN validator" (GSTN taxpayer details) client ID and API key into the
# VPS .env — the key is typed at a prompt, never shown on screen or saved in the shell history —
# after one test lookup with a GST number you type. Then restarts the API. Used by
# server/src/gstPortal.js: Admin → provider → "Check on GST portal", and the verification pre-check.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-apisetu-gst.sh
#
# Safe to run again (e.g. with a new key): it replaces the old lines.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
URL_TEMPLATE="$(grep '^APISETU_GST_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
URL_TEMPLATE="${URL_TEMPLATE:-https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}}"

printf "API Setu Client ID (shown on the API Setu dashboard next to the key) [com.tikdum.provider]: "
IFS= read -r CLIENT
CLIENT="$(printf %s "${CLIENT:-com.tikdum.provider}" | tr -d '[:space:]')"
printf "Paste the API key for GSTIN Validator (it won't show) and press Enter: "
IFS= read -rs KEY
echo
KEY="$(printf %s "$KEY" | tr -d '[:space:]')"
[ "${#KEY}" -ge 16 ] || { echo "That key looks too short — copy the whole key. Nothing was changed."; exit 1; }
printf "A GST number to test with (e.g. your company's own): "
IFS= read -r GSTIN
GSTIN="$(printf %s "$GSTIN" | tr -d '[:space:]-' | tr '[:lower:]' '[:upper:]')"
[ "${#GSTIN}" = 15 ] || { echo "A GST number has 15 characters. Nothing was changed."; exit 1; }

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
echo "== looking up $GSTIN through API Setu"
code=$(curl -s -o "$body" -w '%{http_code}' --max-time 30 \
  -H "X-APISETU-CLIENTID: $CLIENT" -H "X-APISETU-APIKEY: $KEY" -H "Accept: application/json" \
  "${URL_TEMPLATE/\{gstin\}/$GSTIN}" || echo 000)
field() { grep -o "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$body" | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'; }
case "$code" in
  200)
    echo "== API Setu answered: $(field lgnm || true) · status $(field sts || true)"
    [ -n "$(field lgnm)$(field sts)" ] || { echo "   (answer had no lgnm/sts fields — first part of it, for Claude:)"; head -c 600 "$body"; echo; } ;;
  404)
    echo "== the key works; API Setu says that GST number wasn't found" ;;
  401|403)
    echo "API Setu answered $code — the key or client ID is wrong, or this key isn't subscribed to the GSTN API. Nothing was changed."
    head -c 400 "$body"; echo
    unset KEY; exit 1 ;;
  *)
    echo "!! API Setu answered $code. First part of the answer (send this to Claude):"
    head -c 600 "$body"; echo
    printf "Save the key anyway? (y/N): "
    IFS= read -r yes
    case "$yes" in y|Y) ;; *) unset KEY; echo "Nothing was changed."; exit 1 ;; esac ;;
esac

# Replace any old lines, keep everything else (and the file's owner and permissions).
tmp="$(mktemp)"
grep -v -e '^APISETU_CLIENT_ID=' -e '^APISETU_API_KEY=' "$ENV_FILE" > "$tmp" || true
printf 'APISETU_CLIENT_ID=%s\nAPISETU_API_KEY=%s\n' "$CLIENT" "$KEY" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset KEY
echo "== saved in .env (the key isn't shown)"

echo "== restarting the API"
docker compose -p homeserve up -d --no-build server

echo
echo "Done. Admin → Providers → open one with a GST number → \"Check on GST portal\"."
