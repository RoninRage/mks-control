#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (claude.ai/code).
# Does nothing locally. In the cloud it starts Docker, installs dependencies
# and Playwright Chromium, and starts CouchDB.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

LOG_DIR="${TMPDIR:-/tmp}/mks-cloud-session"
mkdir -p "$LOG_DIR"
COUCHDB_SERVICE=couchdb

say() { echo "[cloud-session] $*"; }
fail() {
  echo "[cloud-session] FEHLER: $*" >&2
  exit 1
}

# Run a step quietly; on failure show the tail of its log.
run() {
  local name="$1"
  shift
  local log="$LOG_DIR/$name.log"
  if ! "$@" >"$log" 2>&1; then
    tail -n 30 "$log" >&2
    fail "$name fehlgeschlagen (Log: $log)"
  fi
}

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo -n"
fi

# 1. Docker
if ! docker info >/dev/null 2>&1; then
  say "starte dockerd ..."
  command -v dockerd >/dev/null 2>&1 || fail "dockerd nicht gefunden"
  $SUDO nohup dockerd >"$LOG_DIR/dockerd.log" 2>&1 &
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || {
    tail -n 20 "$LOG_DIR/dockerd.log" >&2 || true
    fail "Docker ist nach 60 s nicht bereit"
  }
fi
say "Docker bereit"

# 2. Leftover .env.test would switch the backend into test mode
if [ -f .env.test ]; then
  rm -f .env.test
  say "verwaiste .env.test geloescht"
fi

# 3. Dependencies
run npm-ci npm ci --workspaces --include-workspace-root --no-audit --no-fund
say "npm ci ok ($(node -v))"

# 4. Playwright browser
run playwright-install npx playwright install chromium
say "Playwright Chromium ok"

# 5. CouchDB
docker compose config --services 2>/dev/null | grep -qx "$COUCHDB_SERVICE" ||
  fail "Service '$COUCHDB_SERVICE' fehlt in docker-compose.yml"
run couchdb-up docker compose up -d "$COUCHDB_SERVICE"
for _ in $(seq 1 60); do
  if curl -sf http://localhost:5984/_up >/dev/null 2>&1; then
    say "CouchDB bereit auf http://localhost:5984"
    exit 0
  fi
  sleep 1
done
docker compose logs --tail 20 "$COUCHDB_SERVICE" >&2 || true
fail "CouchDB ist nach 60 s nicht erreichbar (http://localhost:5984/_up)"
