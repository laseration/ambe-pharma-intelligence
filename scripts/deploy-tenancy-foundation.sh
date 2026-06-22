#!/usr/bin/env bash
#
# Guarded deploy for the tenancy foundation (Organization migration + seed).
#
# Run ON THE VPS, from the App A repo root:
#   bash scripts/deploy-tenancy-foundation.sh <your-name>
#
# Encodes the shared-VPS rules: takes the App A advisory lock, restarts ONLY App
# A processes (ambe-api, ambe-worker), and prints pm2 status before/after so you
# can confirm App B (the MT5 bot) did not restart. On any error it stops and
# releases the lock. The Organization migration is additive and all new code
# falls back to env until the seed runs, so a partial run cannot change
# behaviour.
set -euo pipefail

WHO="${1:-tenancy-deploy}"
LOCK=/root/ambe-app-A.lock.sh

if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: pm2 not found — run this ON THE VPS, not your Mac." >&2
  exit 1
fi
if [ ! -f "$LOCK" ]; then
  echo "ERROR: $LOCK not found — this must run on the App A VPS." >&2
  exit 1
fi
if [ ! -f apps/api/prisma/schema.prisma ]; then
  echo "ERROR: run from the App A repo root (apps/api/prisma/schema.prisma not found)." >&2
  exit 1
fi

echo "=== Process status BEFORE (note the bot's uptime) ==="
pm2 list

echo "=== Acquiring App A advisory lock ==="
bash "$LOCK" acquire "$WHO"
trap 'echo "=== Releasing App A advisory lock ==="; bash "$LOCK" release || true' EXIT

echo "=== Updating code on branch $(git rev-parse --abbrev-ref HEAD) ==="
git pull --ff-only

echo "=== Installing dependencies ==="
pnpm install --frozen-lockfile

echo "=== Building @ambe/api ==="
pnpm --filter @ambe/api build

echo "=== Applying the additive Organization migration ==="
pnpm --filter @ambe/api exec prisma migrate deploy

echo "=== Seeding the default (Ambe) organisation ==="
pnpm --filter @ambe/api exec tsx src/scripts/seedDefaultOrganization.ts

echo "=== Restarting App A only (ambe-api, ambe-worker) ==="
pm2 restart ambe-api ambe-worker --update-env

echo "=== Process status AFTER (confirm the bot's uptime did NOT reset) ==="
pm2 list

echo
echo "Deploy complete. Verify with:"
echo "  pnpm --filter @ambe/api exec tsx src/scripts/listOrganizations.ts   (expect '* ambe ACTIVE ...')"
echo "  and open /dashboard/setup in the browser."
