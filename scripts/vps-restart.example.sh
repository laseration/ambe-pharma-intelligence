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
# pm2 reload ambe-web --update-env
# pm2 save

# systemctl example:
# sudo systemctl restart ambe-api.service
# sudo systemctl restart ambe-web.service

# Docker Compose example:
# docker compose up -d --build

