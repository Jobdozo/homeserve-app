#!/usr/bin/env bash
# Puts a Google Gemini API key into the VPS .env for Image Studio — typed at a prompt, never shown
# on screen or saved in the shell history — after checking with Google that it works and can draw
# pictures. Then restarts the API. Cloudflare Workers AI stays as the fallback.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-gemini-key.sh
#
# Safe to run again (e.g. with a new key): it replaces the old line.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }

printf "Paste the Gemini API key (it won't show) and press Enter: "
IFS= read -rs KEY
echo
KEY="$(printf %s "$KEY" | tr -d '[:space:]')"
# Older keys start with "AIza", newer ones with "AQ."; Google itself decides below whether it works.
case "$KEY" in
  AIza* | AQ.*) ;;
  *) echo "That doesn't look like a Gemini API key (they start with AIza or AQ.). Nothing was changed."; exit 1 ;;
esac
[ "${#KEY}" -ge 30 ] || { echo "That key looks too short — copy the whole key. Nothing was changed."; exit 1; }

API=https://generativelanguage.googleapis.com/v1beta
body="$(mktemp)"
cleanup() { rm -f "$body"; }
trap cleanup EXIT
say_google() {
  msg="$(grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' "$body" | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')"
  [ -n "$msg" ] && echo "Google says: $msg"
  return 0
}

echo "== checking the key with Google"
code=$(curl -s -o "$body" -w '%{http_code}' --max-time 20 -H "x-goog-api-key: $KEY" "$API/models?pageSize=200" || echo 000)
if [ "$code" != "200" ]; then
  unset KEY
  case "$code" in
    400|401|403) why="the key is wrong, deleted, or not allowed to use the Gemini API" ;;
    000) why="couldn't reach Google from this server" ;;
    *) why="unexpected answer" ;;
  esac
  echo "Google answered $code — $why. Nothing was changed."
  say_google
  exit 1
fi

# The newest "flash image" model this key can use (the same choice Image Studio makes).
MODEL="$(grep -o '"name"[[:space:]]*:[[:space:]]*"models/[^"]*flash-image[^"]*"' "$body" | sed 's/.*models\///; s/"$//' | sort -V | tail -1)"
if [ -z "$MODEL" ]; then
  echo "== the key works, but it can't use any Gemini image model — saving it anyway (Cloudflare draws the pictures)"
else
  echo "== drawing one small test picture with $MODEL"
  code=$(curl -s -o "$body" -w '%{http_code}' --max-time 90 -H "x-goog-api-key: $KEY" -H "Content-Type: application/json" \
    "$API/models/$MODEL:generateContent" \
    -d '{"contents":[{"parts":[{"text":"a small purple ceramic cup on a white table, soft light"}]}],"generationConfig":{"responseModalities":["IMAGE"]}}' || echo 000)
  if [ "$code" = "200" ] && grep -q '"data"' "$body"; then
    echo "== Gemini drew the test picture"
  elif [ "$code" = "429" ]; then
    echo "!! Google answered 429: this key's project has no quota for pictures (free tier used up or billing off)."
    say_google
    echo "   The key is saved anyway; Image Studio keeps using Cloudflare until Google allows pictures."
    echo "   To fix: in Google AI Studio, turn on billing for this key's project (or use a key from a project with billing)."
  else
    echo "!! The picture test answered $code — the key is saved anyway; Cloudflare stays the fallback."
    say_google
  fi
fi

# Replace any old line, keep everything else (and the file's owner and permissions).
tmp="$(mktemp)"
grep -v '^GEMINI_API_KEY=' "$ENV_FILE" > "$tmp" || true
printf 'GEMINI_API_KEY=%s\n' "$KEY" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
unset KEY
echo "== key saved in .env (not shown)"

echo "== restarting the API with the new key"
docker compose -p homeserve up -d --no-build server

echo
echo "Done. Super Admin → Services & Categories → Image Studio shows \"Gemini connected\"."
