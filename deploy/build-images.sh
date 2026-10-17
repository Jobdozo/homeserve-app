#!/usr/bin/env bash
# Builds Tikdum's images and restarts them. Use this instead of `docker compose up --build`.
#
# Why: newer Docker Compose builds through BuildKit "bake", which refuses the host-network
# setting our builds need on this VPS (the default network times out reaching npm):
#   additional privileges requested: pass "--allow=network.host"
# This script builds each image itself with host networking, then lets compose start the
# containers from those images (project "homeserve", so the names match).
#
# It uses BuildKit (docker buildx, with network.host allowed) and only falls back to the old
# classic builder if BuildKit can't build here — the classic builder prints a "deprecated" notice.
#
#   cd /root/homeserve-deploy && git pull && bash deploy/build-images.sh server admin-dashboard local-service-app
#   (no arguments = server, admin-dashboard, local-service-app, provider-app)
set -euo pipefail
cd "$(dirname "$0")/.."

# Ubuntu empties /tmp on every boot: on 17 Oct 2026 a VPS restart deleted the old
# /tmp/homeserve-deploy and its .env. Never deploy from there again.
case "$PWD" in
  /tmp/*) echo "This folder is in /tmp, which is wiped when the server restarts. Deploy from /root/homeserve-deploy (see deploy/recover-env.sh). Stopping."; exit 1 ;;
esac
[ -f .env ] || { echo "$PWD/.env is missing: deploying now would start the apps without their settings. If it was lost, run deploy/recover-env.sh first. Stopping."; exit 1; }

services=("$@")
[ ${#services[@]} -eq 0 ] && services=(server admin-dashboard local-service-app provider-app)

# The Network Bot (netwatch) runs from the agents image: "netwatch" builds that image, and
# building agents restarts the bot too, so it never runs older code than the agents.
build_list=()
for s in "${services[@]}"; do
  [ "$s" = netwatch ] && s=agents
  case " ${build_list[*]:-} " in *" $s "*) ;; *) build_list+=("$s") ;; esac
done
services=("${build_list[@]}")
start=("${services[@]}")
case " ${services[*]} " in *" agents "*) start+=(netwatch) ;; esac

# Only this one value is needed from .env (the public address of the API baked into the web apps).
VITE_SERVER_URL="$(grep -E '^VITE_SERVER_URL=' .env | head -1 | cut -d= -f2- | tr -d "\"'" | tr -d '\r')"
if [ -z "$VITE_SERVER_URL" ]; then echo "VITE_SERVER_URL is missing in .env — stopping."; exit 1; fi

export COMPOSE_BAKE=false

# "buildkit" until BuildKit fails once, then "classic" for the rest of the run. A failure after
# BuildKit has already worked here is a real build error, so it stops the deploy as before.
mode=buildkit
docker buildx version >/dev/null 2>&1 || mode=classic
buildkit_worked=no

build() {
  local name="$1"; shift
  if [ "$mode" = buildkit ]; then
    if DOCKER_BUILDKIT=1 docker buildx build --load --network=host --allow network.host "$@" -t "homeserve-$name" "./$name"; then
      buildkit_worked=yes
      return 0
    fi
    if [ "$buildkit_worked" = yes ]; then return 1; fi
    echo "== BuildKit couldn't build here — using the classic builder instead"
    mode=classic
  fi
  DOCKER_BUILDKIT=0 docker build --network=host "$@" -t "homeserve-$name" "./$name"
}

for s in "${services[@]}"; do
  case "$s" in
    server|agents) extra=() ;;
    admin-dashboard|local-service-app|provider-app) extra=(--build-arg "VITE_SERVER_URL=$VITE_SERVER_URL") ;;
    *) echo "Unknown service: $s"; exit 1 ;;
  esac
  echo "== building $s"
  build "$s" "${extra[@]}"
done

echo "== starting"
docker compose -p homeserve up -d --no-build "${start[@]}"
docker compose -p homeserve ps
