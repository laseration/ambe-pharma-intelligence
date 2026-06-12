# VPS Deployment

This runbook describes the GitHub Actions workflow that deploys `main` to a
single VPS. It intentionally keeps hostnames, users, paths, SSH keys, and
production environment values out of the repository.

## Workflow

The workflow is `.github/workflows/deploy-vps.yml`.

It runs on:

- pushes to `main`
- manual `workflow_dispatch`

The workflow SSHes to the VPS, changes to `VPS_APP_DIR`, resets the checkout to
`origin/main`, enables Corepack, installs with the lockfile, runs safe
verification, builds the API and web apps, and then runs a server-local restart
hook.

The restart hook is intentionally not hardcoded because the production process
manager has not been confirmed.

On push events, the workflow skips deployment with a notice if the required VPS
secrets are not configured. Manual `workflow_dispatch` runs fail clearly when
required secrets are missing, so setup can be tested deliberately.

## Required GitHub Secrets

Configure these in GitHub repository or environment secrets:

| Secret        | Purpose                                               |
| ------------- | ----------------------------------------------------- |
| `VPS_HOST`    | VPS hostname or IP address.                           |
| `VPS_USER`    | SSH user used for deployment. Prefer a non-root user. |
| `VPS_PORT`    | SSH port, for example `22` or a custom port.          |
| `VPS_SSH_KEY` | Private SSH key for the deploy user.                  |
| `VPS_APP_DIR` | Absolute path to the repo checkout on the VPS.        |

Do not store production database URLs, dashboard credentials, Graph secrets,
Telegram tokens, OpenAI keys, or SSH private keys in git.

Use a protected GitHub environment for production if manual approval is needed
before deployment.

## One-Time VPS Setup

The VPS should have:

- Node.js 20 or newer.
- Corepack available.
- Git.
- `pnpm` available through Corepack.
- The repository checked out at `VPS_APP_DIR`.
- Server-side production env files or service environment configuration.
- A process manager configured for `ambe-web`, `ambe-api`, and exactly one
  `ambe-worker` process.

Create a restricted deployment user where possible:

```bash
sudo adduser deploy
sudo install -d -o deploy -g deploy /srv/ambe-pharma-intelligence
```

Create an SSH key pair locally or in a secure admin workstation. Add the public
key to the deploy user's `~/.ssh/authorized_keys`, and store the private key in
GitHub as `VPS_SSH_KEY`.

The workflow uses `ssh-keyscan` to populate `known_hosts` for the configured
host and port. Verify the VPS host key fingerprint out of band before enabling
the workflow in production.

## Initial Checkout

On the VPS, check out the repository once using the deploy user:

```bash
cd /srv
git clone git@github.com:laseration/ambe-pharma-intelligence.git ambe-pharma-intelligence
cd /srv/ambe-pharma-intelligence
git checkout main
```

If the VPS pulls over HTTPS instead of SSH, configure credentials on the VPS
without committing tokens or passwords to the repo.

## Restart Hook

The workflow requires an executable server-local file:

```bash
scripts/vps-restart.sh
```

This file is ignored by git so each VPS can keep its real process-manager
commands out of source control. Start from the template:

```bash
cp scripts/vps-restart.example.sh scripts/vps-restart.sh
chmod +x scripts/vps-restart.sh
```

Edit `scripts/vps-restart.sh` on the VPS for the real process manager.

PM2 example:

```bash
pm2 reload ambe-api --update-env
pm2 reload ambe-worker --update-env
pm2 reload ambe-web --update-env
pm2 status ambe-api ambe-worker ambe-web
pm2 logs ambe-api ambe-worker ambe-web --lines 100
pm2 save
```

systemctl example:

```bash
sudo systemctl restart ambe-api.service
sudo systemctl restart ambe-worker.service
sudo systemctl restart ambe-web.service
sudo systemctl status ambe-api.service ambe-worker.service ambe-web.service
journalctl -u ambe-api.service -u ambe-worker.service -u ambe-web.service -n 200 --no-pager
```

If using `sudo`, grant the deploy user passwordless access only to the exact
service commands required.

Configure the API service with `START_WORKERS_WITH_API=false` in production.
Use `START_WORKERS_WITH_API=true` only for a deliberately combined
local/transitional process where there is no separate `ambe-worker`.

Docker Compose example:

```bash
docker compose up -d --build
```

Use the option that matches the server. Do not leave the template's failing
placeholder command in place.

## Deployment Commands Run On The VPS

The workflow runs:

```bash
git fetch origin main --prune
git reset --hard origin/main
corepack enable
pnpm install --frozen-lockfile
pnpm verify:safe
pnpm --filter @ambe/api build
pnpm --filter @ambe/web build
./scripts/vps-restart.sh
```

`pnpm verify:safe` is run with test-mode environment overrides and disabled
external integrations so verification does not use production credentials or
call live services. The production services should receive their real runtime
environment from systemd, PM2, Docker, or server-side env files when restarted.
Production must run web, API, and one worker process. The deploy workflow does
not directly manage process definitions; `scripts/vps-restart.sh` is responsible
for restarting all three services on the server.

The workflow does not run `git clean`; untracked server-local files such as
`.env` files and `scripts/vps-restart.sh` are preserved.

## Post-Restart Smoke Checks

After the restart hook completes, run safe local checks from the VPS:

```bash
curl -fsS http://127.0.0.1:4000/health
curl -fsS -H "x-internal-api-key: $INTERNAL_API_KEY" http://127.0.0.1:4000/api/system/readiness
curl -fsS -H "x-internal-api-key: $INTERNAL_API_KEY" http://127.0.0.1:4000/api/system/workers
```

`/health` proves the API process is responding. `/api/system/readiness` reports
API/database readiness and the expected split-worker mode. `/api/system/workers`
reports the latest safe polling status snapshots written by the worker runtime.
Do not hard-code `INTERNAL_API_KEY` in the restart hook; provide it through the
server's existing secret management or run smoke checks from a shell where it is
already available.

When using PM2, the equivalent process-manager checks are:

```bash
pm2 status ambe-api ambe-worker ambe-web
pm2 logs ambe-api ambe-worker ambe-web --lines 100
```

## Testing With Workflow Dispatch

Before relying on push-to-main deployment:

1. Configure the required GitHub secrets.
2. Confirm the VPS can pull `origin/main`.
3. Confirm `scripts/vps-restart.sh` exists and is executable on the VPS.
4. Confirm the restart hook restarts `ambe-web`, `ambe-api`, and exactly one
   `ambe-worker`.
5. Open GitHub Actions.
6. Select `Deploy VPS`.
7. Run the workflow manually with `workflow_dispatch`.
8. Confirm the workflow reaches the restart step and the public site still
   responds after restart.
9. Run the API readiness and worker status smoke checks above.

If the workflow fails at the restart step, fix `scripts/vps-restart.sh` on the
VPS rather than adding server-specific commands to the repository.

## Production Safety Notes

- Keep `/dashboard` protected by application middleware and any hosting-level
  access controls required for the deployment.
- Keep `/login` noindexed and `/dashboard` out of the sitemap.
- Back up the database before any intentional production migration.
- Do not run `prisma migrate dev` against production or pilot data.
- Do not configure live email, Telegram, Microsoft Graph, storage, or OpenAI
  integrations until the operator has explicitly signed off.
- Do not run more than one `ambe-worker` process per environment. Multiple
  worker processes can duplicate Microsoft Graph and Telegram polling.
- Keep `START_WORKERS_WITH_API=false` in production API services when the
  dedicated worker is running.
