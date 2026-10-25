#!/usr/bin/env bash
# Puts back META_IG_USER_ID (Instagram posting) and WHATSAPP_WEBHOOK_SECRET (incoming WhatsApp
# messages) after the 25 Oct 2026 .env repair dropped them: both had got glued onto the end of
# the AGENT_KEYS_SPECIALISTS line, and rewriting that line kept only the agent keys.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/restore-env-lines.sh
#
# Looks in the saved copies (.env.backup-*, .env.pre-restore, .env.bak-*) newest first, also where a
# value is glued onto another line. The Instagram ID can also be read from Facebook with the saved
# page token. Then puts back any other setting the last deploy's copy (.env.deploy-*, kept by
# build-images.sh) had. Values are never shown. Then restarts the API if anything changed.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
cp -p "$ENV_FILE" "$ENV_FILE.bak-restore-$(date +%Y%m%d%H%M%S)"
[ -z "$(tail -c1 "$ENV_FILE")" ] || printf '\n' >> "$ENV_FILE"

current() { # name -> its value in .env, without quotes ("" when missing or empty)
  { grep -a "^$1=" "$ENV_FILE" || true; } | tail -1 | cut -d= -f2- | tr -d "\r'\""
}
saved() { # name pattern -> the value in the newest saved copy that has one, glued or not
  local f v
  for f in $(ls -t "$ENV_FILE".* 2>/dev/null | grep -v '\.example$' || true); do
    v="$( { grep -aoE "$1=['\"]?$2" "$f" || true; } | tail -1 | cut -d= -f2- | tr -d "'\"")"
    if [ -n "$v" ]; then printf '%s' "$v"; return; fi
  done
}
put() { # name value -> replaces the line in .env
  local tmp; tmp="$(mktemp)"
  { grep -av "^$1=" "$ENV_FILE" || true; } > "$tmp"
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}
changed=no

if [ -n "$(current META_IG_USER_ID)" ]; then
  echo "== META_IG_USER_ID is already in .env"
else
  ig="$(saved META_IG_USER_ID '[0-9]+')"
  from="a saved copy"
  if [ -z "$ig" ]; then
    page="$(current META_PAGE_ID)"; token="$(current META_PAGE_TOKEN)"
    if [ -n "$page" ] && [ -n "$token" ]; then
      ig="$(curl -sG --max-time 20 "${META_GRAPH_URL:-https://graph.facebook.com/v23.0}/$page" \
        --data-urlencode fields=instagram_business_account --data-urlencode "access_token=$token" \
        | { grep -oE '"instagram_business_account":\{"id":"[0-9]+"' || true; } | grep -oE '[0-9]+' || true)"
      from="Facebook (the Page's linked Instagram account)"
    fi
    unset token
  fi
  if [ -n "$ig" ]; then
    put META_IG_USER_ID "$ig"
    changed=yes
    echo "== META_IG_USER_ID put back, from $from"
  else
    echo "!! The Instagram account ID wasn't found. Run: bash deploy/set-meta.sh"
  fi
fi

if [ -n "$(current WHATSAPP_WEBHOOK_SECRET)" ]; then
  echo "== WHATSAPP_WEBHOOK_SECRET is already in .env"
else
  # deploy-ai-agents.sh makes it with openssl rand -hex 32: exactly 64 hex characters, which also
  # tells it apart from whatever was glued on after it.
  secret="$(saved WHATSAPP_WEBHOOK_SECRET '[0-9a-f]{64}')"
  if [ -n "$secret" ]; then
    put WHATSAPP_WEBHOOK_SECRET "$secret"
    changed=yes
    echo "== WHATSAPP_WEBHOOK_SECRET put back from a saved copy (the same value, so MSG91 needs no change)"
  else
    echo "!! WHATSAPP_WEBHOOK_SECRET isn't in any saved copy. Run: bash deploy/fix-webhook-secret.sh"
  fi
  unset secret
fi

# Anything else that was in .env at the last deploy (deploy/build-images.sh keeps those copies).
last="$(ls -t "$ENV_FILE".deploy-* 2>/dev/null | head -1 || true)"
if [ -n "$last" ]; then
  while IFS= read -r line; do
    name="${line%%=*}"
    if ! grep -aq "^$name=" "$ENV_FILE"; then
      printf '%s\n' "$line" >> "$ENV_FILE"
      changed=yes
      echo "== $name put back (from $last)"
    fi
  done < <(tr -d '\r' < "$last" | grep -aE '^[A-Za-z_][A-Za-z0-9_]*=' || true)
fi

docker compose config -q 2>/dev/null || { echo "!! docker compose doesn't accept .env now — send me these lines."; exit 1; }
echo "== .env OK"
if [ "$changed" = yes ]; then
  echo "== restarting the API"
  bash deploy/build-images.sh server > /dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -X POST http://127.0.0.1:4000/api/webhooks/whatsapp/msg91 -H 'Content-Type: application/json' --data '{}' || true)
    [ "$code" = 401 ] || [ "$code" = 503 ] && break
    sleep 3
  done
  case "$code" in
    401) echo "Done. The API is back up; incoming WhatsApp messages are accepted." ;;
    503) echo "Done. The API is back up, but WhatsApp messages are still refused (no secret) — run deploy/fix-webhook-secret.sh." ;;
    *) echo "The API answered $code after the restart — send me these lines." ;;
  esac
else
  echo "Nothing changed, so the API wasn't restarted."
fi
