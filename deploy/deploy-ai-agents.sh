#!/usr/bin/env bash
# Deploys the AI agents release on the VPS. Run as root from the repo checkout:
#   cd /tmp/homeserve-deploy && git pull && bash deploy/deploy-ai-agents.sh
#
# What it does (safe to re-run):
#   1. Takes a backup first (tikdum-backup, if installed).
#   2. Creates the agents' state folder and a WhatsApp webhook secret if missing.
#   3. Rebuilds and restarts only the changed services: server, admin-dashboard, agents.
#      The customer and provider sites are not touched.
#   4. Health-checks the API.
# The agents worker starts idle until agent keys are added to .env (see agents/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."
# Use the same compose project the running containers belong to (on this VPS
# it's "homeserve", not the folder name) so we replace them instead of
# starting a second copy that fights over the same ports.
PROJECT="${COMPOSE_PROJECT_NAME:-$(docker ps --filter "label=com.docker.compose.project.working_dir=$PWD" --format '{{.Label "com.docker.compose.project"}}' | head -1)}"
PROJECT="${PROJECT:-homeserve}"
dc() { docker compose -p "$PROJECT" "$@"; }
echo "Compose project: $PROJECT"

echo "== 1/4 Backup"
if command -v tikdum-backup >/dev/null 2>&1; then
  tikdum-backup || { echo "Backup failed — stopping. Fix the backup or re-run with SKIP_BACKUP=1."; [ "${SKIP_BACKUP:-0}" = 1 ] || exit 1; }
else
  echo "tikdum-backup not installed — copying /root/tikdum-data instead"
  mkdir -p /root/tikdum-backups
  tar -czf "/root/tikdum-backups/pre-ai-agents-$(date +%Y%m%d-%H%M%S).tar.gz" -C /root tikdum-data
fi

echo "== 2/4 Config"
mkdir -p /root/tikdum-data/agents-state
chown 1000:1000 /root/tikdum-data/agents-state
touch .env
if ! grep -q '^WHATSAPP_WEBHOOK_SECRET=' .env; then
  echo "WHATSAPP_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env
  echo "Added WHATSAPP_WEBHOOK_SECRET to .env (use it as the x-webhook-secret header in MSG91)"
fi
for k in AGENT_KEY_OPERATIONS AGENT_KEY_REPORTING AGENT_KEY_COMPLAINTS AGENT_KEY_SUPPORT AGENT_KEY_REGISTRATION AGENT_KEY_VERIFICATION AGENT_KEY_PAYMENTS ANTHROPIC_API_KEY; do
  grep -q "^$k=" .env || echo "$k=" >> .env
done

echo "== 3/4 Build & restart (server, admin-dashboard, agents)"
docker compose -p homeserve up -d --build server admin-dashboard agents

echo "== 4/4 Health check"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/api/app-version >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:4000/api/app-version >/dev/null && echo "API: up" || { echo "API: NOT responding — check: docker compose -p homeserve logs --tail=100 server"; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"apiKey":"tkag_check"}' http://127.0.0.1:4000/api/agents/token)
[ "$code" = 401 ] && echo "AI agents API: up" || echo "AI agents API: unexpected status $code"
docker compose -p homeserve ps
echo
echo "Done. Next: open admin.tikdum.com -> AI Agents, create the agents, put their keys in .env, then:"
echo "  docker compose -p homeserve up -d agents && docker compose -p homeserve logs -f agents"
