# VPS Runtime Baseline & Disabled-Worker Checklist

A read-only-first runbook for confirming the Ambe pilot VPS is in a known-good
runtime state, and for adding the dedicated polling worker **with polling still
disabled**. It assumes PM2 and a single VPS, consistent with
[`vps-deployment.md`](../vps-deployment.md) and [`deployment.md`](../deployment.md).

> Safety posture: every command in the "Inspect" sections is read-only. Mutating
> steps are clearly marked **REQUIRES APPROVAL**. Never print `.env` contents or
> secrets. Never run `pm2 restart/reload/stop all` — the box may host unrelated
> PM2 apps that must not be disturbed.

## Intended production topology

| Process       | Command                                | Notes                                                                  |
| ------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `ambe-api`    | `node dist/index.js`                   | Express API. Requires a prior `pnpm --filter @ambe/api build`.         |
| `ambe-web`    | `next start`                           | Next.js. Requires a prior `pnpm --filter @ambe/web build` (`.next/`).  |
| `ambe-worker` | `pnpm --filter @ambe/api start:worker` | `node dist/worker.js`. Owns Graph + Telegram polling. **Exactly one.** |

With `START_WORKERS_WITH_API=false` (the production default), the API starts no
in-process pollers and logs `workerProcessExpected: true`
(`apps/api/src/runtime/pollingWorkers.ts`). A dedicated `ambe-worker` is therefore
required. When polling flags are disabled the worker starts cleanly, logs
`"Polling worker process has no active workers to start"`, and idles
(`apps/api/src/worker.ts`). The worker **exits non-zero if the database is
unreachable** (`worker.ts` `verifyDatabaseReadiness`), so confirm DB readiness
before starting it.

## Phase C — read-only baseline inspection

Run on the VPS. None of these change anything.

```bash
APP=/var/www/ambe-pharma-intelligence   # adjust to the real VPS_APP_DIR

pm2 list                                  # all processes online; ambe-worker absent
pm2 describe ambe-api | grep -E "status|uptime|restarts|script path|exec cwd"
git -C "$APP" rev-parse --abbrev-ref HEAD && git -C "$APP" rev-parse --short HEAD
git -C "$APP" rev-parse --short origin/main
ls -l "$APP/apps/api/dist/worker.js"      # build artifact present
ls -l "$APP/apps/web/.next/BUILD_ID"
ss -tln | grep -E ':(3000|4000)\b'        # listeners / port-conflict check
ufw status                                # firewall (inspection only)
( cd "$APP" && pnpm --filter @ambe/api exec prisma migrate status ) # read-only

# Authenticated readiness/workers — key entered hidden, then cleared:
read -rs -p "INTERNAL_API_KEY (hidden): " K; echo
curl -fsS http://127.0.0.1:4000/health; echo
curl -fsS -H "x-internal-api-key: $K" http://127.0.0.1:4000/api/system/readiness; echo
curl -fsS -H "x-internal-api-key: $K" http://127.0.0.1:4000/api/system/workers;  echo
unset K
```

A reusable version of these checks lives in
[`scripts/ops/ambe-vps-health.sh`](../../scripts/ops/ambe-vps-health.sh).

### Gate to proceed to the worker

Proceed only when **all** hold:

- `prisma migrate status` connects and reports **no drift / up to date**
  (if it reports drift, follow [`migration-drift-remediation.md`](migration-drift-remediation.md) first).
- readiness reports `database = ready` and `workerProcessExpected = true`.
- `ambe-api`, `ambe-web`, and any unrelated apps are online; `ambe-worker` absent.
- `apps/api/dist/worker.js` exists.
- email polling reports `enabled:false` / `active:false`.

## Phase B — add the disabled `ambe-worker` (REQUIRES APPROVAL)

Only after the gate passes. The worker idles because polling flags stay disabled.

```bash
cd /var/www/ambe-pharma-intelligence
pm2 start "pnpm --filter @ambe/api start:worker" --name ambe-worker
```

Verify (immediately, then again ~60s later):

```bash
pm2 describe ambe-worker | grep -E "status|uptime|restarts"   # online; restarts not climbing
pm2 logs ambe-worker --lines 40 --nostream | grep -vi '://'   # expect "no active workers to start"
read -rs -p "INTERNAL_API_KEY (hidden): " K; echo
curl -fsS -H "x-internal-api-key: $K" http://127.0.0.1:4000/api/system/workers; echo  # email-inbound + telegram: enabled:false/active:false
unset K
pm2 list                                                      # all expected processes online; exactly one ambe-worker
pm2 save                                                      # persist across reboot — LAST, only after the above is clean
```

Abort path (if it crash-loops or logs a startup failure):

```bash
pm2 delete ambe-worker     # removes only the process just added
# do NOT pm2 save on abort; investigate before retrying
```

## Phase A — deploy latest `main` (DEFERRED; bundle with hardening)

Deploying does not fix DB drift: `.github/workflows/deploy-vps.yml` runs
`git reset --hard origin/main` + build + `scripts/vps-restart.sh`, but **never runs
`prisma migrate deploy`**. Treat a deploy as a separate, backed-up window:

1. Take a Neon backup/branch/PITR safety point; record the id and owner off-repo.
2. `prisma migrate status`; resolve any drift first (see the drift runbook).
3. Pause `ambe-worker` if running.
4. Update the checkout (`git fetch` + `git reset --hard origin/main`, or a
   customized `scripts/vps-restart.sh`). Untracked `.env*` survive a hard reset.
5. `pnpm install --frozen-lockfile`; build api + web by filter.
6. `prisma migrate deploy` + `db:generate` (only after backup + drift resolved).
7. Reload **only** `ambe-api` and `ambe-web` by name.
8. Re-run Phase C; restart `ambe-worker` (still polling-disabled); `pm2 save`.

A `scripts/vps-restart.sh` should be created on the VPS (from
`scripts/vps-restart.example.sh`) and must target only `ambe-api ambe-worker
ambe-web` by name — never `pm2 *all`.

## Do-not-run

- `pm2 restart all` / `pm2 reload all` / `pm2 stop all`, or any action on
  unrelated PM2 apps.
- `pm2 env <id>` / `pm2 jlist` / `cat .env*` (secret exposure).
- `EMAIL_INBOUND_POLLING_ENABLED=true` or `START_WORKERS_WITH_API=true` before
  the [email polling hardening](email-polling-hardening.md) work lands.
- `prisma migrate deploy/dev/resolve`, `prisma db push`, or any deploy without a
  prior DB backup and `migrate status` review.
- Firewall mutations (`ufw allow/deny/enable`) — `ufw status` is read-only.
