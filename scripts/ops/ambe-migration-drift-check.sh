#!/usr/bin/env bash
#
# ambe-migration-drift-check.sh — READ-ONLY Prisma migration status + worker presence.
#
# Runs `prisma migrate status` (read-only — it does NOT apply migrations) and
# filters any secret-like output. Reports whether the DB connection succeeds and
# whether migrations are up to date / drifted. Also confirms PM2 process presence.
# Makes NO changes.
#
# Usage:  bash scripts/ops/ambe-migration-drift-check.sh
# Env:    APP_DIR (default /var/www/ambe-pharma-intelligence).

set -u
APP_DIR="${APP_DIR:-/var/www/ambe-pharma-intelligence}"
hr() { printf '\n===== %s =====\n' "$1"; }

hr "PRISMA MIGRATE STATUS (read-only; secrets filtered)"
ms="$(cd "$APP_DIR" && pnpm --filter @ambe/api exec prisma migrate status 2>&1)"
printf '%s\n' "$ms" | grep -viE '://|password|DATABASE_URL'

hr "EVALUATION"
if printf '%s\n' "$ms" | grep -qiE 'P1001|can.?t reach database|P1002|P1017'; then
  echo "DB CONNECT : FAIL (Prisma cannot reach the database)"
else
  echo "DB CONNECT : OK (Prisma reached the database)"
fi
if printf '%s\n' "$ms" | grep -qiE 'up to date'; then
  echo "SCHEMA     : up to date"
elif printf '%s\n' "$ms" | grep -qiE 'not yet been applied|have not been applied|following migration'; then
  echo "SCHEMA     : DRIFT/PENDING — see status text above; consult docs/runbooks/migration-drift-remediation.md"
else
  echo "SCHEMA     : see status text above"
fi

hr "PM2 PRESENCE"
for p in ambe-api ambe-web ambe-worker; do
  pm2 describe "$p" >/dev/null 2>&1 && echo "$p: present" || echo "$p: absent"
done

hr "DONE — read-only. No migrations applied, no changes made."
