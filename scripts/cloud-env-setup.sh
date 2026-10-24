#!/usr/bin/env bash
# Setup script for the Claude Code cloud environment (claude.ai/code).
# NOT run automatically: paste it into the environment's "Setup script" field.
# Runs as root before Claude Code starts. Installed packages, Docker images and
# written files are cached; running containers and processes are not.
set -euo pipefail

PLAYWRIGHT_VERSION=1.58.1 # keep in sync with package-lock.json
export DEBIAN_FRONTEND=noninteractive

echo "[setup] apt packages"
apt-get update -qq
apt-get install -y -qq --no-install-recommends libpcsclite-dev python3 make g++ curl ca-certificates >/dev/null

echo "[setup] Node.js 22"
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  if ! command -v npm >/dev/null 2>&1; then
    apt-get install -y -qq --no-install-recommends nodejs npm >/dev/null
  fi
  npm i -g n >/dev/null
  n 22 >/dev/null
  hash -r
fi
echo "[setup] node $(node -v), npm $(npm -v)"

echo "[setup] Playwright ${PLAYWRIGHT_VERSION}: system deps + Chromium"
npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium >/dev/null

echo "[setup] Docker"
if ! docker info >/dev/null 2>&1; then
  nohup dockerd >/tmp/dockerd-setup.log 2>&1 &
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || {
    tail -n 20 /tmp/dockerd-setup.log
    echo "[setup] FEHLER: Docker nicht bereit"
    exit 1
  }
fi
docker pull -q couchdb:3.3

echo "[setup] fertig"
