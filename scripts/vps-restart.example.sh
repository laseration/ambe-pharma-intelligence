#!/usr/bin/env bash
set -euo pipefail

# Copy this file on the VPS to:
#   scripts/vps-restart.sh
# Then replace the placeholder section below with the restart command for the
# process manager actually used on the server. Keep the real file out of git.

echo "Configure scripts/vps-restart.sh on the VPS before enabling deployment." >&2
echo "Choose one of the PM2, systemctl, or Docker examples in docs/vps-deployment.md." >&2
exit 1

# PM2 example:
# pm2 reload ambe-api --update-env
# pm2 reload ambe-worker --update-env
# pm2 reload ambe-web --update-env
# pm2 status ambe-api ambe-worker ambe-web
# pm2 save

# systemctl example:
# sudo systemctl restart ambe-api.service
# sudo systemctl restart ambe-worker.service
# sudo systemctl restart ambe-web.service
# sudo systemctl status ambe-api.service ambe-worker.service ambe-web.service

# Docker Compose example:
# docker compose up -d --build

# Optional post-restart smoke checks, if INTERNAL_API_KEY is already present in
# the server shell environment:
# curl -fsS http://127.0.0.1:4000/health
# curl -fsS -H "x-internal-api-key: $INTERNAL_API_KEY" http://127.0.0.1:4000/api/system/readiness
# curl -fsS -H "x-internal-api-key: $INTERNAL_API_KEY" http://127.0.0.1:4000/api/system/workers
