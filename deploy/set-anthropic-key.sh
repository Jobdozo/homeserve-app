#!/usr/bin/env bash
# Puts the Anthropic API key into the VPS .env for the AI agents — typed at a prompt, never
# shown on screen or saved in the shell history — after checking with Anthropic that it works.
# Then rebuilds and restarts the agents.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-anthropic-key.sh
#
# Safe to run again (e.g. with a new key): it replaces the old line.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

printf "Paste the Anthropic API key (starts with sk-ant-; it won't show) and press Enter: "
IFS= read -rs KEY
echo
KEY="$(printf %s "$KEY" | tr -d '[:space:]')"
case "$KEY" in
  sk-ant-*) ;;
  *) echo "That doesn't look like an Anthropic API key (it starts with sk-ant-). Nothing was changed."; exit 1 ;;
esac

echo "== checking the key with Anthropic"
body="$(mktemp)"
code=$(curl -s -o "$body" -w '%{http_code}' --max-time 20 https://api.anthropic.com/v1/models \
  -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" || echo 000)
if [ "$code" != "200" ]; then
  unset KEY
  case "$code" in
    401) why="the key is wrong or was deleted" ;;
    403) why="the key has no access" ;;
    000) why="couldn't reach Anthropic from this server" ;;
    *) why="unexpected answer" ;;
  esac
  echo "Anthropic answered $code — $why. Nothing was changed."
  # Anthropic's own explanation (it never contains the key).
  msg="$(grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
  type="$(grep -o '"type"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | sed -n 2p | sed 's/.*:[[:space:]]*"//; s/"$//')"
  [ -n "$msg" ] && echo "Anthropic says: ${type:+$type — }$msg"
  rm -f "$body"
  exit 1
fi
rm -f "$body"

# Replace any old line, keep everything else (and the file's owner and permissions).
tmp="$(mktemp)"
grep -v '^ANTHROPIC_API_KEY=' "$ENV_FILE" > "$tmp" || true
printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset KEY
echo "== key works and is saved in .env (not shown)"

echo "== agents with a key in .env:"
for name in OPERATIONS REPORTING CEO COMPLAINTS SUPPORT REGISTRATION VERIFICATION DISPATCH QUALITY RETENTION FRAUD REVIEWS PAYMENTS; do
  if grep -qE "^AGENT_KEY_${name}=.+" "$ENV_FILE"; then echo "   ✓ ${name}"; else echo "   – ${name} (not set up yet)"; fi
done

echo "== rebuilding and restarting the agents"
bash deploy/build-images.sh agents

echo
echo "Done. In a few minutes: Super Admin → AI Agents shows them working, and the CEO chat answers."
