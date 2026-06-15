#!/usr/bin/env bash
#
# ambe-vps-health.sh — READ-ONLY VPS runtime snapshot.
#
# Makes NO changes: no restart/deploy/migrate/start, no enabling polling, no
# marking emails read, no firewall edits. Prints NO secrets: no .env dumps, no
# pm2 env/jlist, no connection strings. The INTERNAL_API_KEY (if present) is
# used only as a request header and never echoed.
#
# Usage:  bash scripts/ops/ambe-vps-health.sh
# Env:    APP_DIR (default /var/www/ambe-pharma-intelligence), API_PORT (4000),
#         WEB_PORT (3000), INTERNAL_API_KEY (optional; enables auth checks).

set -u

APP_DIR="${APP_DIR:-/var/www/ambe-pharma-intelligence}"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"

hr() { printf '\n===== %s =====\n' "$1"; }

hr "PROCESS MANAGERS"
command -v pm2 >/dev/null 2>&1 && echo "pm2: present ($(pm2 -v 2>/dev/null))" || echo "pm2: absent"
command -v docker >/dev/null 2>&1 && echo "docker: present" || echo "docker: absent"
command -v systemctl >/dev/null 2>&1 && echo "systemd: present" || echo "systemd: absent"

hr "PM2 PROCESS TABLE (state only, no env)"
pm2 list 2>/dev/null || echo "(pm2 absent or managing nothing)"

hr "AMBE PROCESS DETAIL (fields only, no env)"
for p in ambe-api ambe-web ambe-worker; do
  echo "--- $p ---"
  pm2 describe "$p" 2>/dev/null | grep -E "status|uptime|restarts|script path|exec cwd|exec mode" || echo "($p not found)"
done

hr "APP DIR: $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "branch:      $(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "HEAD:        $(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null)"
  echo "origin/main: $(git -C "$APP_DIR" rev-parse --short origin/main 2>/dev/null || echo 'no local ref')  (last-fetched; may be stale)"
  echo "working tree (git status --short):"
  git -C "$APP_DIR" status --short 2>/dev/null
  echo "(empty above = clean)"
else
  echo "Not a git checkout: $APP_DIR (set APP_DIR=...)"
fi

hr "BUILD ARTIFACTS PRESENT"
ls -l "$APP_DIR/apps/api/dist/index.js"  2>/dev/null || echo "MISSING apps/api/dist/index.js"
ls -l "$APP_DIR/apps/api/dist/worker.js" 2>/dev/null || echo "MISSING apps/api/dist/worker.js"
ls -l "$APP_DIR/apps/web/.next/BUILD_ID" 2>/dev/null || echo "MISSING apps/web/.next/BUILD_ID"

hr "LISTENERS ON $API_PORT/$WEB_PORT (port-conflict check)"
{ command -v ss >/dev/null 2>&1 && ss -tln 2>/dev/null || netstat -tln 2>/dev/null; } \
  | grep -E ":($API_PORT|$WEB_PORT)\b" || echo "(nothing listening on $API_PORT/$WEB_PORT)"

hr "FIREWALL (inspection only)"
ufw status 2>/dev/null || echo "(ufw not present / not permitted)"

hr "API /health (port $API_PORT)"
curl -fsS -m 5 "http://127.0.0.1:$API_PORT/health" 2>/dev/null && echo || echo "(no 200 from /health)"

hr "API readiness + workers (only if INTERNAL_API_KEY already in env; safe JSON)"
if [ -n "${INTERNAL_API_KEY:-}" ]; then
  echo "-- readiness --"
  curl -fsS -m 10 -H "x-internal-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:$API_PORT/api/system/readiness" 2>/dev/null && echo || echo "(readiness call failed)"
  echo "-- workers --"
  curl -fsS -m 10 -H "x-internal-api-key: $INTERNAL_API_KEY" "http://127.0.0.1:$API_PORT/api/system/workers" 2>/dev/null && echo || echo "(workers call failed)"
else
  echo "skipped (INTERNAL_API_KEY not in env; /health alone proves the API is up)"
fi

hr "WEB smoke (status codes only, no HTML)"
curl -s -o /dev/null -m 5 -w "web /          -> HTTP %{http_code}\n" "http://127.0.0.1:$WEB_PORT/"          2>/dev/null || echo "web / unreachable on $WEB_PORT"
curl -s -o /dev/null -m 5 -w "web /dashboard -> HTTP %{http_code}\n" "http://127.0.0.1:$WEB_PORT/dashboard" 2>/dev/null || echo "web /dashboard unreachable on $WEB_PORT"

hr "DONE — read-only. No changes made."
