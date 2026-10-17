#!/usr/bin/env bash
# Connects the Engineering agents (Bug Triage, Developer, Code Reviewer, Tester) to GitHub as
# your "tikdum-agents" GitHub App (agents/README.md → Engineering team, step 1). Asks for the
# App ID and the private key (.pem contents pasted at a hidden prompt — never shown or saved in
# the shell history), checks with GitHub that they match and that the App is installed on the
# repository, then saves the key where the agents read it and restarts them.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/set-github-app.sh
#
# Safe to run again (e.g. with a new private key): it replaces the old one.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
SECRETS=/root/tikdum-data/agents-secrets
PEM="$SECRETS/github-app.pem"
[ -f "$ENV_FILE" ] || { echo "$PWD/$ENV_FILE not found — stopping."; exit 1; }
command -v openssl >/dev/null || { echo "openssl is needed (apt install openssl) — stopping."; exit 1; }
REPO="$(grep '^GITHUB_REPO=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
REPO="${REPO:-Jobdozo/homeserve-app}"

printf "GitHub App ID (the number under 'App ID' on the app's settings page): "
IFS= read -r APP_ID
APP_ID="$(printf %s "$APP_ID" | tr -d '[:space:]')"
case "$APP_ID" in
  '' | *[!0-9]*) echo "The App ID is a number, like 1234567. Nothing was changed."; exit 1 ;;
esac

key="$(mktemp)"
body="$(mktemp)"
chmod 600 "$key" "$body"
trap 'rm -f "$key" "$body"' EXIT
echo
echo "Now open the downloaded .pem file in Notepad, press Ctrl+A, Ctrl+C, and paste it here"
echo "(right-click or Ctrl+Shift+V). It won't show. It stops by itself at the -----END line."
while IFS= read -rs line; do
  line="${line%$'\r'}"
  printf '%s\n' "$line" >> "$key"
  case "$line" in *-----END*PRIVATE\ KEY-----*) break ;; esac
done
echo
if ! openssl pkey -in "$key" -noout 2>/dev/null; then
  echo "That isn't a complete private key (it starts with -----BEGIN and ends with -----END). Nothing was changed."
  exit 1
fi

# A 9-minute app token signed with the key, the same way the agents do it (agents/src/github.js).
b64u() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64u)
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$APP_ID" | b64u)
sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -sign "$key" -binary | b64u)
JWT="$header.$payload.$sig"
github() {
  curl -s -o "$body" -w '%{http_code}' --max-time 20 -H "Authorization: Bearer $JWT" \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "https://api.github.com$1" || echo 000
}

echo "== checking with GitHub"
code=$(github /app)
case "$code" in
  200) ;;
  401) echo "GitHub didn't accept it (401): the App ID and the private key don't belong together. Nothing was changed."; exit 1 ;;
  *) echo "GitHub answered $code. Nothing was changed."; exit 1 ;;
esac
slug="$(grep -o '"slug": *"[^"]*"' "$body" | head -1 | cut -d'"' -f4)"
echo "   App: ${slug:-?} (ID $APP_ID)"
if grep -q '"workflows": *"write"' "$body"; then
  echo "   WARNING: this App can change GitHub workflows (CI). Set Permissions → Workflows → No access."
fi
code=$(github "/repos/$REPO/installation")
case "$code" in
  200) echo "   Installed on $REPO" ;;
  404) echo "The App isn't installed on $REPO yet: open the App on GitHub → Install App → your account →"
       echo "'Only select repositories' → homeserve-app → Install. Then run this again. Nothing was changed."; exit 1 ;;
  *) echo "GitHub answered $code when checking the installation. Nothing was changed."; exit 1 ;;
esac
unset JWT sig

mkdir -p "$SECRETS"
[ -f "$PEM" ] && chmod 600 "$PEM"
cat "$key" > "$PEM"
chown 1000:1000 "$PEM"   # the agents container runs as user 1000
chmod 400 "$PEM"
echo "== private key saved as $PEM (readable only by the agents)"

tmp="$(mktemp)"
grep -v '^GITHUB_APP_ID=' "$ENV_FILE" > "$tmp" || true
printf 'GITHUB_APP_ID=%s\n' "$APP_ID" >> "$tmp"
cat "$tmp" > "$ENV_FILE"
rm -f "$tmp"
echo "== GITHUB_APP_ID saved in .env"

keys="$(grep '^AGENT_KEYS_ENGINEERING=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr ',' '\n' | grep -c . || true)"
echo "== rebuilding and restarting the agents"
bash deploy/build-images.sh agents
echo
echo "GITHUB IS CONNECTED. Engineering agent keys on the server: ${keys:-0} of 4."
[ "${keys:-0}" -ge 4 ] || echo "Add each one with:  bash deploy/set-agent-key.sh ENGINEERING   (once per agent)"
