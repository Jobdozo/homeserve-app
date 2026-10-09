#!/usr/bin/env bash
# Builds Tikdum's images and restarts them. Use this instead of `docker compose up --build`.
#
# Why: newer Docker Compose builds through BuildKit "bake", which refuses the host-network
# setting our builds need on this VPS (the default network times out reaching npm):
#   additional privileges requested: pass "--allow=network.host"
# This script builds each image with the classic builder, which accepts --network=host, then lets
# compose start the containers from those images (project "homeserve", so the names match).
#
#   cd /tmp/homeserve-deploy && git pull && bash deploy/build-images.sh server admin-dashboard local-service-app
#   (no arguments = server, admin-dashboard, local-service-app, provider-app)
set -euo pipefail
cd "$(dirname "$0")/.."

services=("$@")
[ ${#services[@]} -eq 0 ] && services=(server admin-dashboard local-service-app provider-app)

# Only this one value is needed from .env (the public address of the API baked into the web apps).
VITE_SERVER_URL="$(grep -E '^VITE_SERVER_URL=' .env | head -1 | cut -d= -f2- | tr -d "\"'" | tr -d '\r')"
if [ -z "$VITE_SERVER_URL" ]; then echo "VITE_SERVER_URL is missing in .env — stopping."; exit 1; fi

export DOCKER_BUILDKIT=0
export COMPOSE_BAKE=false
for s in "${services[@]}"; do
  case "$s" in
    server|agents) extra=() ;;
    admin-dashboard|local-service-app|provider-app) extra=(--build-arg "VITE_SERVER_URL=$VITE_SERVER_URL") ;;
    *) echo "Unknown service: $s"; exit 1 ;;
  esac
  echo "== building $s"
  docker build --network=host "${extra[@]}" -t "homeserve-$s" "./$s"
done

echo "== starting"
docker compose -p homeserve up -d --no-build "${services[@]}"
docker compose -p homeserve ps
