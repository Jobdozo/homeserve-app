#!/usr/bin/env bash
# Puts one AI agent's key (from Super Admin → AI Agents → the agent → New key) into the VPS .env
# — typed at a prompt, never shown on screen or saved in the shell history — after checking with
# the Tikdum API that the key works. Then rebuilds and restarts the agents.
#
#   cd /tmp/homeserve-deploy && git pull && bash deploy/set-agent-key.sh COMPLAINTS
#
# Agent names: OPERATIONS REPORTING CEO COMPLAINTS SUPPORT REGISTRATION VERIFICATION DISPATCH QUALITY RETENTION FRAUD REVIEWS PAYMENTS.
# Safe to run again (e.g. after making a new key): it replaces the old line.
# SPECIALIST (Marketing, SEO, Analyst, Research …) and ENGINEERING keys share one comma-separated
# list (AGENT_KEYS_SPECIALISTS / AGENT_KEYS_ENGINEERING): run once per agent; each run adds one key
# and keeps the others.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
NAMES="OPERATIONS REPORTING CEO COMPLAINTS SUPPORT REGISTRATION VERIFICATION DISPATCH QUALITY RETENTION FRAUD REVIEWS PAYMENTS SPECIALIST ENGINEERING"

NAME="$(printf %s "${1:-}" | tr '[:lower:]' '[:upper:]')"
if [ -z "$NAME" ] || ! printf ' %s ' "$NAMES" | grep -q " $NAME "; then
  echo "Which agent? Run it like: bash deploy/set-agent-key.sh COMPLAINTS"
  echo "Names: $NAMES"
  exit 1
fi
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

printf "Paste the %s agent's key (starts with tkag_; it won't show) and press Enter: " "$NAME"
IFS= read -rs KEY
echo
KEY="$(printf %s "$KEY" | tr -d '[:space:]')"
case "$KEY" in
  tkag_*) ;;
  *) echo "That doesn't look like an agent key (it starts with tkag_). Nothing was changed."; exit 1 ;;
esac

echo "== checking the key with the Tikdum API"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST http://127.0.0.1:4000/api/agents/token \
  -H "Content-Type: application/json" --data "{\"apiKey\":\"$KEY\"}" || echo 000)
case "$code" in
  200) ;;
  403) echo "   (the key is right, but this agent is switched off in Super Admin — switch it on there)" ;;
  401) unset KEY; echo "The key wasn't accepted (401) — it may be an old key; make a new one in Super Admin. Nothing was changed."; exit 1 ;;
  *) unset KEY; echo "The Tikdum API answered $code. Nothing was changed."; exit 1 ;;
esac

tmp="$(mktemp)"
case "$NAME" in
  SPECIALIST|ENGINEERING)
    # Keys an earlier version of this script saved as AGENT_KEYS_ENGINEERINGS (a typo) are moved over.
    if [ "$NAME" = SPECIALIST ]; then VAR=AGENT_KEYS_SPECIALISTS; LINES="^AGENT_KEYS_SPECIALISTS="; else VAR=AGENT_KEYS_ENGINEERING; LINES="^AGENT_KEYS_ENGINEERINGS?="; fi
    OLD="$( { grep -E "$LINES" "$ENV_FILE" || true; } | cut -d= -f2- | tr ',' '\n' | { grep . || true; } | awk '!seen[$0]++' | paste -sd, - )"
    if printf ',%s,' "$OLD" | grep -qF ",$KEY,"; then
      LIST="$OLD"
      echo "   (this key was already in the list)"
    else
      LIST="${OLD:+$OLD,}$KEY"
    fi
    grep -vE "$LINES" "$ENV_FILE" > "$tmp" || true
    printf '%s=%s\n' "$VAR" "$LIST" >> "$tmp"
    SAVED="${VAR} ($(printf %s "$LIST" | tr ',' '\n' | grep -c .) key(s) in the list)"
    unset OLD LIST
    ;;
  *)
    grep -v "^AGENT_KEY_${NAME}=" "$ENV_FILE" > "$tmp" || true
    printf 'AGENT_KEY_%s=%s\n' "$NAME" "$KEY" >> "$tmp"
    SAVED="AGENT_KEY_${NAME}"
    ;;
esac
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset KEY
echo "== ${SAVED} saved in .env (not shown)"

echo "== rebuilding and restarting the agents"
bash deploy/build-images.sh agents
echo
echo "Done. The ${NAME} agent starts within a minute — Super Admin → AI Agents shows it working."
