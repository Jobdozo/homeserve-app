#!/usr/bin/env bash
# Rebuilds the VPS .env from the settings the running containers were started with.
#
# Why: the deploy folder used to be /tmp/homeserve-deploy, and Ubuntu empties /tmp on every
# boot. When Hostinger restarted the VPS on 17 Oct 2026 the folder, and the .env in it with
# every secret, was deleted, while the containers kept running with their own copy. This reads
# that copy back (docker inspect), so nothing has to be typed in again. No values are shown.
#
#   git clone -q https://github.com/Jobdozo/homeserve-app.git /root/homeserve-deploy
#   cd /root/homeserve-deploy && bash deploy/recover-env.sh
#
# Run it BEFORE restarting or redeploying anything: a container started again without .env
# loses its settings for good. Changes nothing outside this folder.
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=.env
if [ -f "$ENV_FILE" ]; then echo "$PWD/$ENV_FILE already exists. Nothing was changed."; exit 1; fi
docker inspect homeserve-server-1 > /dev/null 2>&1 || { echo "The server container (homeserve-server-1) isn't there, so there's nothing to read from. Nothing was changed."; exit 1; }

# "service KEY VAR" for every "KEY: ${VAR...}" line in docker-compose.yml (build args too).
map="$(tr -d '\r' < docker-compose.yml | awk '
  /^  [a-z0-9-]+:[[:space:]]*$/ { svc = $1; sub(":", "", svc) }
  /^[[:space:]]+[A-Z0-9_]+: .*\$\{[A-Z0-9_]+/ {
    key = $1; sub(":", "", key)
    var = $0; sub(/.*\$\{/, "", var); sub(/[:}].*/, "", var)
    print svc, key, var
  }')"

tmp="$(mktemp)"
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
declare -A found=()
write() { # name value -> one .env line; single quotes keep $ and # literal
  if [[ "$2" != *"'"* ]]; then
    printf "%s='%s'\n" "$1" "$2" >> "$tmp"
  else
    local v="${2//\\/\\\\}"; v="${v//\"/\\\"}"; v="${v//\$/\$\$}"
    printf '%s="%s"\n' "$1" "$v" >> "$tmp"
  fi
  found[$1]=1
}

while read -r svc key var; do
  if [ -z "$var" ] || [ -n "${found[$var]:-}" ]; then continue; fi
  val="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "homeserve-${svc}-1" 2>/dev/null | grep -m1 "^${key}=" | cut -d= -f2- || true)"
  if [ -n "$val" ]; then write "$var" "$val"; fi
done <<< "$map"

# The web apps' API address is baked into their files at build time, not kept as a setting.
if [ -z "${found[VITE_SERVER_URL]:-}" ]; then
  url="$(docker exec homeserve-local-service-app-1 sh -c "grep -ohE 'https://api\.tikdum\.com' /usr/share/nginx/html/assets/*.js" 2>/dev/null | head -1 || true)"
  if [ -n "$url" ]; then write VITE_SERVER_URL "$url"; echo "== VITE_SERVER_URL=$url (read from the website's files)"; fi
fi

missing="$(printf '%s\n' "$map" | awk '{print $3}' | sort -u | while read -r v; do [ -n "${found[$v]:-}" ] || printf '%s ' "$v"; done)"
for need in JWT_SECRET ADMIN_PHONES MSG91_AUTH_KEY VITE_SERVER_URL; do
  if [ -z "${found[$need]:-}" ]; then echo "$need couldn't be recovered, so .env was NOT written. Stop here and ask for help."; exit 1; fi
done

cp "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "== .env written: ${#found[@]} settings recovered (values not shown)"
if [ -n "$missing" ]; then echo "   Empty in the running containers, so left out (their defaults apply): $missing"; fi

# Proof: what compose would now start each running container with = what it runs with today.
echo "== comparing with the running containers"
docker compose -p homeserve config --format json > "$tmp"
python3 - "$tmp" <<'PY'
import json, subprocess, sys
cfg = json.load(open(sys.argv[1]))
bad, checked = [], 0
for svc, s in cfg.get("services", {}).items():
    try:
        out = subprocess.run(["docker", "inspect", "-f", "{{json .Config.Env}}", f"homeserve-{svc}-1"], capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        continue  # not running (e.g. netwatch before its first start)
    running = dict(e.split("=", 1) for e in json.loads(out) if "=" in e)
    for k, v in (s.get("environment") or {}).items():
        checked += 1
        if (v or "") != running.get(k, ""):
            bad.append(f"{svc}.{k}")
if bad:
    print("   DIFFERENT from the running containers: " + ", ".join(bad))
    print("   Don't deploy yet. Ask for help with the names above.")
    sys.exit(1)
print(f"   all {checked} settings match. Safe to deploy from {__import__('os').getcwd()}")
PY
