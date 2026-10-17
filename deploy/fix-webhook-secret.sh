#!/usr/bin/env bash
# Repairs WHATSAPP_WEBHOOK_SECRET in the VPS .env — the shared secret MSG91 sends as the
# x-webhook-secret header with every incoming WhatsApp message (customer chats → Support inbox,
# owner messages → CEO chat). Without it the API refuses every message (503).
#
#   cd /tmp/homeserve-deploy && git pull && bash deploy/fix-webhook-secret.sh
#
# What it does, never printing the secret unless it has to make a new one:
#   - the line is there and filled in → only restarts the API;
#   - the line got glued onto the end of another line (an append to a .env whose last line had no
#     newline) → puts it back on its own line, keeping the same value, so MSG91 needs no change;
#   - it's gone → asks you to paste the value MSG91 still has (MSG91 → WhatsApp → Webhook → your
#     webhook → Headers → x-webhook-secret), or makes a new one that you then enter in MSG91.
# Then checks that the API answers 401 (secret set, request without it refused) instead of 503.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
VAR=WHATSAPP_WEBHOOK_SECRET
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
cp -p "$ENV_FILE" "$ENV_FILE.bak-webhook-$(date +%Y%m%d%H%M%S)"
# Make sure the file ends with a newline, so nothing appended later gets glued onto the last line.
[ -z "$(tail -c1 "$ENV_FILE")" ] || printf '\n' >> "$ENV_FILE"

value="$(grep "^${VAR}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
if [ -n "$value" ]; then
  echo "== ${VAR} is in .env (${#value} characters) — restarting the API so it picks it up"
else
  glued="$(grep -n ".${VAR}=" "$ENV_FILE" | grep -v "^[0-9]*:${VAR}=" | head -1 || true)"
  if [ -n "$glued" ]; then
    line="${glued%%:*}"
    owner="$(sed -n "${line}p" "$ENV_FILE" | cut -d= -f1)"
    echo "== found ${VAR} glued onto the end of the ${owner} line (line ${line}) — splitting them"
    tmp="$(mktemp)"
    awk -v n="$line" -v v="$VAR" 'NR == n { i = index($0, v "="); print substr($0, 1, i - 1); print substr($0, i); next } { print }' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE"
    rm -f "$tmp"
    value="$(grep "^${VAR}=" "$ENV_FILE" | tail -1 | cut -d= -f2-)"
    echo "   ${VAR} is back on its own line (${#value} characters, same value as before) and ${owner} is unchanged otherwise"
  else
    echo "${VAR} isn't in .env any more."
    echo "MSG91 still has it: MSG91 → WhatsApp → Webhook → your webhook → Headers → x-webhook-secret."
    echo "(Paste with right-click → Paste or Ctrl+Shift+V.)"
    printf "Paste that value here (it won't show), or just press Enter to make a new one: "
    IFS= read -rs value; echo
    value="$(printf %s "$value" | tr -d '[:space:]')"
    if [ -n "$value" ]; then
      echo "   ✓ received (${#value} characters)"
      made=no
    else
      value="$(openssl rand -hex 32)"
      made=yes
    fi
    printf '%s=%s\n' "$VAR" "$value" >> "$ENV_FILE"
  fi
fi

echo "== restarting the API"
bash deploy/build-images.sh server >/dev/null
for i in 1 2 3 4 5 6 7 8 9 10; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://127.0.0.1:4000/api/webhooks/whatsapp/msg91 -H 'Content-Type: application/json' --data '{}' || true)
  [ "$code" = 401 ] || [ "$code" = 503 ] && break
  sleep 3
done
case "$code" in
  401) echo "WHATSAPP WEBHOOK SECRET IS SET — incoming WhatsApp messages are accepted again." ;;
  503) echo "The API still says the secret isn't set (503). Send me the lines above."; exit 1 ;;
  *) echo "The API answered $code — send me the lines above."; exit 1 ;;
esac
if [ "${made:-}" = yes ]; then
  echo
  echo "A NEW secret was made. Put it in MSG91 now (WhatsApp → Webhook → your webhook → Headers →"
  echo "x-webhook-secret), replacing the old value — until then incoming messages are refused:"
  echo
  echo "    $value"
  echo
fi
