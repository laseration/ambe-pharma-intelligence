# Deployment

This document describes a safe local or pilot deployment for Ambe Pharma
Intelligence. It is factual to this repo and does not include real secrets.

## Runtime Shape

The repo is a pnpm monorepo:

- `apps/api`: Express API, Prisma, PostgreSQL
- `apps/api` worker: standalone polling process for Telegram and Microsoft
  Graph inbox intake
- `apps/web`: Next.js public website with internal dashboard routes behind
  `/login` and `/dashboard`
- `packages/shared`: shared TypeScript utilities

Required runtime tools:

- Node.js 20+
- pnpm 9+
- PostgreSQL reachable through `DATABASE_URL`

The API defaults to port `4000`. The web app defaults to port `3000` when run
with Next.js locally. The worker process does not expose HTTP; it connects to
PostgreSQL, writes safe polling status snapshots, and owns polling timers.

## Production/VPS Deployment Checklist

Before a production or pilot VPS deployment, confirm:

- The deploy target, app path, process manager, and reverse proxy are known.
- Production secrets are stored outside git and outside GitHub workflow logs.
- `NODE_ENV=production` is set for the API and web runtime services.
- `DATABASE_URL` points at the intended Neon/PostgreSQL database.
- A recent database backup exists and has a known restore path.
- `INTERNAL_VIEWER_API_KEY`, `INTERNAL_API_KEY`, and
  `INTERNAL_ADMIN_API_KEY` are configured as separate server-side secrets.
- Web auth variables are configured in the web runtime only.
- `ENABLE_DEBUG_ROUTES=false` for production.
- `START_WORKERS_WITH_API=false` for the API service.
- Exactly one `ambe-worker` process is configured for the environment.
- `EMAIL_INBOUND_POLLING_ENABLED=false` until Graph preflight, mailbox review,
  and allowed sender review are complete.
- `TELEGRAM_POLLING_ENABLED=false` until Telegram allowlists are complete.
- `TELEGRAM_DRY_RUN=true` until internal operators approve message content.
- `OPENAI_PARSER_ENABLED=false` and `OPENAI_EMAIL_REVIEW_ENABLED=false` unless
  the pilot has explicitly accepted review-first AI fallback.
- `SHAREPOINT_ACCOUNT_OPENING_ENABLED=false` and
  `ONEDRIVE_ACCOUNT_OPENING_ENABLED=false` until storage diagnostics and folder
  ownership are reviewed.
- `/dashboard/setup` and `/dashboard/setup/diagnostics` load after deployment
  without exposing secret values.
- Public pages, `/health`, and authenticated readiness checks pass.

Do not enable optional integrations as part of first deploy. Deploy the app,
verify the dashboard, verify imports/review workflow, then enable integrations
one at a time with operator sign-off.

## Required Pilot Configuration

Create environment files from the examples:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Required API values for a pilot:

| Variable                 | Required    | Purpose                                                                                    |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`               | yes         | Use `production` in the pilot environment.                                                 |
| `PORT`                   | yes         | API HTTP port, default `4000`.                                                             |
| `DATABASE_URL`           | yes         | PostgreSQL connection string used by Prisma.                                               |
| `INTERNAL_API_KEY`       | yes         | Internal API key for protected operator routes.                                            |
| `INTERNAL_ADMIN_API_KEY` | recommended | Admin key for admin/debug-only internal calls.                                             |
| `ENABLE_DEBUG_ROUTES`    | recommended | Use `false` in production-like pilot environments.                                         |
| `START_WORKERS_WITH_API` | recommended | Use `false` in production. `true` is only for local/transitional combined API+worker mode. |

Required web values for a pilot:

| Variable                                | Required | Purpose                                                                                                    |
| --------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                  | yes      | Canonical public site URL, for example `https://ambemedical.com`.                                          |
| `WEB_AUTH_USERNAME`                     | yes      | Internal dashboard username.                                                                               |
| `WEB_AUTH_PASSWORD`                     | yes      | Internal dashboard password.                                                                               |
| `WEB_AUTH_ROLE`                         | yes      | `viewer`, `operator`, or `admin`.                                                                          |
| `WEB_AUTH_SESSION_SECRET`               | yes      | At least 32 random characters.                                                                             |
| `WEB_AUTH_SESSION_TTL_SECONDS`          | optional | Session duration, default is 8 hours.                                                                      |
| `INTERNAL_API_BASE_URL`                 | yes      | Server-side web URL for the API `/api` base.                                                               |
| `PUBLIC_TRADE_API_BASE_URL`             | optional | Server-side web URL for the public API `/public` base. Defaults from `INTERNAL_API_BASE_URL` when omitted. |
| `INTERNAL_API_KEY`                      | yes      | Server-side API key for dashboard API requests.                                                            |
| `ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN` | optional | Download token for account-opening export files.                                                           |

Do not use `NEXT_PUBLIC_*` for secrets. The dashboard auth secret, dashboard
password, internal API keys, Graph credentials, Telegram token, OpenAI key, and
database URL must stay server-side.

Do not use local development or end-to-end smoke credentials in production.
`NEXT_PUBLIC_INTERNAL_API_BASE_URL` is only for local browser smoke setups; the
production dashboard uses the server-side `INTERNAL_API_BASE_URL`.

## Environment Variable Checklist

Use the example files as name inventories only:

- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`

Do not copy real production values into docs, tickets, screenshots, shell
history, GitHub workflow output, or support messages.

Required API runtime names:

| Name                        | Production expectation                              |
| --------------------------- | --------------------------------------------------- |
| `NODE_ENV`                  | `production`.                                       |
| `PORT`                      | API listen port.                                    |
| `LOG_LEVEL`                 | Safe operational log level.                         |
| `DATABASE_URL`              | Server-side database URL only.                      |
| `INTERNAL_VIEWER_API_KEY`   | Read-only internal API key.                         |
| `INTERNAL_API_KEY`          | Operator internal API key.                          |
| `INTERNAL_ADMIN_API_KEY`    | Admin/setup internal API key.                       |
| `ENABLE_DEBUG_ROUTES`       | `false` for production.                             |
| `START_WORKERS_WITH_API`    | `false` when a dedicated worker process is running. |
| `OPPORTUNITY_BUSINESS_MODE` | Keep explicit for the deployment.                   |

Required web runtime names:

| Name                                    | Production expectation                     |
| --------------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_APP_NAME`                  | Public display name only.                  |
| `NEXT_PUBLIC_SITE_URL`                  | Public site URL only.                      |
| `WEB_AUTH_USERNAME`                     | Server-side pilot dashboard username.      |
| `WEB_AUTH_PASSWORD`                     | Server-side pilot dashboard password.      |
| `WEB_AUTH_ROLE`                         | `viewer`, `operator`, or `admin`.          |
| `WEB_AUTH_SESSION_SECRET`               | High-entropy server-side signing secret.   |
| `WEB_AUTH_SESSION_TTL_SECONDS`          | Session lifetime.                          |
| `INTERNAL_API_BASE_URL`                 | Server-side API `/api` base URL.           |
| `PUBLIC_TRADE_API_BASE_URL`             | Server-side public API `/public` base URL. |
| `INTERNAL_API_KEY`                      | Server-side dashboard API key.             |
| `ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN` | Optional server-side download token.       |

Optional integration names that should default disabled:

| Area                   | Names to review before enabling                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph mail             | `MICROSOFT_MAIL_TENANT_ID`, `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`, `MICROSOFT_GRAPH_REFRESH_TOKEN`, `MICROSOFT_GRAPH_SENDER_MAILBOX`, `EMAIL_ALERTS_ENABLED`, `EMAIL_INBOUND_POLLING_ENABLED`, `EMAIL_INBOUND_POLLING_INTERVAL_MS`                                                        |
| Sender controls        | `EMAIL_INBOUND_ALLOWED_SENDERS`, `EMAIL_INBOUND_SUPPLIER_MAPPINGS`, `EMAIL_INBOUND_INTERNAL_DOMAINS`, `EMAIL_INBOUND_INTERNAL_COMPANY_NAMES`                                                                                                                                                                   |
| Telegram               | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_INTERNAL_CHAT_ID`, `TELEGRAM_DRY_RUN`, `TELEGRAM_POLLING_ENABLED`, `TELEGRAM_POLLING_INTERVAL_MS`, `TELEGRAM_ALLOWED_USER_IDS`, `TELEGRAM_ALLOWED_CHAT_IDS`                                                                                                                    |
| Microsoft storage      | `MICROSOFT_STORAGE_TENANT_ID`, `MICROSOFT_STORAGE_CLIENT_ID`, `MICROSOFT_STORAGE_CLIENT_SECRET`, `ACCOUNT_OPENING_STORAGE_PROVIDER`, `SHAREPOINT_ACCOUNT_OPENING_ENABLED`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_ID`, `ONEDRIVE_ACCOUNT_OPENING_ENABLED`, `ONEDRIVE_USER_ID`, `ONEDRIVE_DRIVE_ID`            |
| OpenAI fallback        | `OPENAI_API_KEY`, `OPENAI_PARSER_ENABLED`, `OPENAI_PARSER_MODEL`, `OPENAI_PARSER_TIMEOUT_MS`, `OPENAI_PARSER_MIN_CHARS`, `OPENAI_PARSER_MAX_CHARS`, `OPENAI_EMAIL_REVIEW_ENABLED`, `OPENAI_EMAIL_REVIEW_DAILY_LIMIT`, `OPENAI_EMAIL_REVIEW_PER_SUPPLIER_DAILY_LIMIT`, `OPENAI_EMAIL_REVIEW_MIN_BUSINESS_SCORE` |
| Account opening safety | `SUPPLIER_CONTACT_AUTO_ACCEPT_ENABLED`, `ACCOUNT_OPENING_ORIGINAL_UPLOAD_ENABLED`, `ACCOUNT_OPENING_AUTOFILL_ENABLED`, `ACCOUNT_OPENING_AUTO_FILE_SHAREPOINT_ENABLED`, `ACCOUNT_OPENING_FORBIDDEN_FIELDS_ENFORCED`, `ACCOUNT_OPENING_MIN_CLASSIFIER_SCORE`                                                     |

Account-opening profile variables can be configured only from approved
operator-provided source values. Leave them blank rather than inventing missing
company, regulatory, signatory, or payment details.

## Database And Prisma

Prisma uses `apps/api/prisma.config.ts`. When Prisma commands are run from
`apps/api`, env loading checks:

1. `apps/api/.env`
2. repo root `.env` only if `DATABASE_URL` is missing

Recommended checks:

```bash
pnpm --filter @ambe/api exec prisma validate
pnpm --filter @ambe/api db:generate
```

For a pilot database, apply migrations intentionally:

```bash
pnpm --filter @ambe/api exec prisma migrate deploy
```

Migration cautions:

- Do not run migrations against a real pilot database without a recent backup.
- Do not run `prisma migrate dev` against a pilot or production database.
- Do not run `pnpm --filter @ambe/api db:seed` against pilot data.
- Keep database connection strings out of logs, screenshots, and support
  tickets.

The local runtime smoke harness is documented in
[local-runtime-smoke-runbook.md](local-runtime-smoke-runbook.md). It refuses
managed databases and is only for disposable local PostgreSQL.

## Safe Migration Process

Use this process for pilot or production migrations:

1. Prepare.
   - Confirm the git commit, release notes, and expected migration files.
   - Confirm the target database host and database name from a trusted server
     shell without printing the full `DATABASE_URL`.
   - Confirm no import, polling, or review-critical operation is currently in
     progress.
   - Pause optional polling if needed by stopping `ambe-worker` or keeping
     polling flags disabled.

2. Back up.
   - Take a Neon backup, branch, snapshot, or provider-supported backup.
   - Record backup identifier, timestamp, and restore owner in deployment notes
     outside the repo.
   - Do not paste the database URL or credentials into the notes.

3. Inspect.
   - Run schema validation:

     ```bash
     pnpm --filter @ambe/api exec prisma validate
     ```

   - Review pending migration files in `apps/api/prisma/migrations`.
   - Confirm migrations do not contain destructive operations unless explicitly
     accepted by the operator and covered by the backup/rollback plan.

4. Apply.
   - Run production migrations from the VPS or controlled deploy environment:

     ```bash
     pnpm --filter @ambe/api exec prisma migrate deploy
     pnpm --filter @ambe/api db:generate
     ```

   - Never use `pnpm --filter @ambe/api db:migrate` or `prisma migrate dev`
     against pilot or production data.

5. Restart.
   - Restart `ambe-api`, `ambe-worker`, and `ambe-web` through the process
     manager or `scripts/vps-restart.sh`.

6. Verify.
   - Run `/health`, authenticated `/api/system/readiness`, and
     `/api/system/workers`.
   - Open `/dashboard/setup` and `/dashboard/setup/diagnostics`.
   - Check imports list, review queue, and a read-only dashboard page.
   - Check process logs for safe errors only.

7. Resume.
   - Resume polling only after readiness and diagnostics are clean.

Rollback after migrations depends on the provider backup/restore plan. Prisma
migrations are forward-only in normal operation. If a migration must be undone,
prefer restoring the backed-up database into a new target and redeploying the
last known good application commit against that restored database.

## Database Backup And Restore Outline

Backup expectations:

- Use Neon/provider snapshots, branches, or scheduled backups for the managed
  database.
- Keep at least one backup before every migration.
- Periodically test restore into a non-production database.
- Store backup identifiers and restore steps in an operator-owned location
  outside the repo.

Restore outline:

1. Stop or pause `ambe-worker`.
2. Put the app into maintenance mode at the reverse proxy if available.
3. Restore the provider backup to a new database or restore point.
4. Update `DATABASE_URL` in the process manager secret store, not in git.
5. Run `pnpm --filter @ambe/api exec prisma validate`.
6. Start `ambe-api`, then `ambe-web`, then `ambe-worker` only after readiness
   checks pass.
7. Run production smoke checks.
8. Confirm operators can access dashboard setup and review pages.

Do not run seed scripts as part of restore. Demo seed commands are for guarded
local or disposable pilot-demo databases only.

## Secrets Handling And Rotation

Store production secrets in the VPS process manager, a protected server-local
environment file, or a secret manager. Do not commit `.env` files.

Rotation guidance:

- `INTERNAL_VIEWER_API_KEY`, `INTERNAL_API_KEY`, `INTERNAL_ADMIN_API_KEY`:
  rotate by updating API and web runtime configuration together, reloading
  services, verifying dashboard/API access, then removing the old value.
- `WEB_AUTH_PASSWORD`: rotate during a maintenance window and communicate the
  new credential through an approved private channel.
- `WEB_AUTH_SESSION_SECRET`: rotating invalidates existing dashboard sessions;
  reload web after the new value is configured.
- `DATABASE_URL`: rotate through the database provider, update service secrets,
  restart API and worker, then verify readiness.
- Microsoft Graph secrets and refresh tokens: rotate in Microsoft Entra or the
  delegated account flow, update only server-side env, run preflight before
  enabling polling.
- `TELEGRAM_BOT_TOKEN`: rotate in BotFather, update server-side env, keep
  polling disabled until allowlists and dry-run behavior are rechecked.
- `OPENAI_API_KEY`: rotate in the provider console, keep fallback disabled
  until daily limits and review policy are rechecked.

Suspected leak handling is covered in the incident checklist below.

## Build And Start

Install and validate:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm --filter @ambe/api eval:extraction
pnpm build
```

Start built services:

```bash
pnpm --filter @ambe/api start
pnpm --filter @ambe/api start:worker
pnpm --filter @ambe/web start
```

Production deployments should run three named processes:

| Process       | Package     | Command                                | Purpose                                        |
| ------------- | ----------- | -------------------------------------- | ---------------------------------------------- |
| `ambe-web`    | `@ambe/web` | `pnpm --filter @ambe/web start`        | Public site and internal dashboard.            |
| `ambe-api`    | `@ambe/api` | `pnpm --filter @ambe/api start`        | Express API and Prisma-backed internal routes. |
| `ambe-worker` | `@ambe/api` | `pnpm --filter @ambe/api start:worker` | Microsoft Graph and Telegram polling.          |

PM2 example:

```bash
START_WORKERS_WITH_API=false pm2 start "pnpm --filter @ambe/api start" --name ambe-api --time
pm2 start "pnpm --filter @ambe/api start:worker" --name ambe-worker --time
pm2 start "pnpm --filter @ambe/web start" --name ambe-web --time
pm2 save
```

PM2 operations:

```bash
pm2 status ambe-api ambe-worker ambe-web
pm2 reload ambe-api --update-env
pm2 reload ambe-worker --update-env
pm2 reload ambe-web --update-env
pm2 logs ambe-api ambe-worker ambe-web
```

Run exactly one worker process for each deployment environment. Running polling
workers in multiple API replicas or multiple worker replicas can duplicate
Telegram and inbox polling. The API process does not start polling workers by
default; set `START_WORKERS_WITH_API=true` only when intentionally running a
single combined local/transitional process.

The public website is served from the web app at `/`. The internal dashboard
entry points remain `/login` and `/dashboard`. In production, unauthenticated
requests to `/dashboard` and child routes must redirect to `/login?next=...`.

Local development can use:

```bash
pnpm dev
pnpm --filter @ambe/api worker:dev
```

Do not enable live integrations in local development unless the operator knows
which mailbox, Telegram bot, and database are being used.

For the old single-process local shape, start the API with
`START_WORKERS_WITH_API=true`. Do not use that mode for production replicas.

## VPS Process Layout

A single VPS deployment should have these layers:

| Layer           | Responsibility                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reverse proxy   | TLS termination, public host routing, request size/time limits, optional IP allowlists for internal dashboard paths.                                                                              |
| `ambe-web`      | Next.js public site and internal dashboard. Listens on a private local port.                                                                                                                      |
| `ambe-api`      | Express API. Listens on a private local port. Does not own polling timers in production.                                                                                                          |
| `ambe-worker`   | Dedicated worker process for Microsoft Graph inbox polling and Telegram polling when those flags are enabled. No public HTTP port.                                                                |
| PostgreSQL/Neon | Managed database reached through `DATABASE_URL`.                                                                                                                                                  |
| Logs            | Process manager logs plus reverse proxy logs. Logs must not contain raw secrets, raw email bodies, attachment contents, Graph payloads, Telegram payloads, OpenAI content, or connection strings. |

Reverse proxy expectations:

- Route the public web host to `ambe-web`.
- Route API traffic to `ambe-api` only for intended API paths.
- Keep `ambe-api` and `ambe-worker` private to the VPS/network.
- Preserve `x-request-id` if supplied, or allow the API to generate one.
- Apply upload limits compatible with the API's import upload cap.
- Do not log request bodies for import, Graph, Telegram, account-opening, or
  review routes.

Process manager expectations:

- Start services after reboot.
- Restart failed services with backoff.
- Keep separate logs for web, API, and worker.
- Provide a safe way to reload environment variables.
- Run exactly one worker per deployment environment.

Common service commands:

```bash
pm2 status ambe-api ambe-worker ambe-web
pm2 logs ambe-api ambe-worker ambe-web --lines 200
pm2 reload ambe-api --update-env
pm2 reload ambe-worker --update-env
pm2 reload ambe-web --update-env
```

Equivalent `systemctl` deployments should provide separate units such as
`ambe-api.service`, `ambe-worker.service`, and `ambe-web.service`, with
environment values loaded from root-readable or service-user-readable files
outside git.

## GitHub Actions VPS Deployment

The repository includes a conservative VPS deployment workflow at
`.github/workflows/deploy-vps.yml`. It runs on pushes to `main` and can also be
started manually with `workflow_dispatch`.

The workflow requires GitHub Actions secrets for the VPS connection:

- `VPS_HOST`
- `VPS_USER`
- `VPS_PORT`
- `VPS_SSH_KEY`
- `VPS_APP_DIR`

It does not hardcode a process manager. The VPS must provide an executable
server-local restart hook at `scripts/vps-restart.sh`. Use
[`vps-deployment.md`](vps-deployment.md) for the full setup, SSH key, restart
hook, PM2/systemctl/Docker examples, and manual test procedure.

## Microsoft Graph Mail

Mail configuration is optional unless the pilot uses outbound email alerts or
inbox polling.

Preferred env vars for the mail app:

| Variable                          | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `MICROSOFT_MAIL_TENANT_ID`        | Mail app tenant.                                           |
| `MICROSOFT_MAIL_CLIENT_ID`        | Mail app client ID.                                        |
| `MICROSOFT_MAIL_CLIENT_SECRET`    | Mail app client secret.                                    |
| `MICROSOFT_GRAPH_SENDER_MAILBOX`  | Mailbox used for sendMail and inbox polling.               |
| `MICROSOFT_GRAPH_REFRESH_TOKEN`   | Delegated token path for personal Outlook.com style setup. |
| `INTERNAL_ALERT_EMAIL_RECIPIENTS` | Comma-separated internal recipients.                       |

Legacy mail vars still exist for compatibility:

- `MICROSOFT_GRAPH_TENANT_ID`
- `MICROSOFT_GRAPH_CLIENT_ID`
- `MICROSOFT_GRAPH_CLIENT_SECRET`

Permissions documented by the repo:

- Inbox polling requires Microsoft Graph `Mail.ReadWrite` as an application
  permission for business-mailbox polling.
- Outbound sending requires `Mail.Send`.
- The device-code helper requests delegated `Mail.ReadWrite` and `Mail.Send`
  for the refresh-token path.

Least-privilege guidance:

- Use a dedicated intake mailbox for supplier email forwarding.
- Grant only mail permissions needed for the enabled mode.
- Keep the mail app separate from the Microsoft storage app.

## Inbox Polling

Inbox polling is optional and disabled by default:

```bash
START_WORKERS_WITH_API=false
EMAIL_INBOUND_POLLING_ENABLED=false
EMAIL_INBOUND_POLLING_INTERVAL_MS=30000
```

Enable it only after configuring:

- `MICROSOFT_GRAPH_SENDER_MAILBOX`
- mail Graph credentials or refresh token
- `EMAIL_INBOUND_ALLOWED_SENDERS`
- `EMAIL_INBOUND_SUPPLIER_MAPPINGS` where deterministic supplier mapping is
  safe

Before enabling polling, run the read-only preflight:

```bash
pnpm --filter @ambe/api email:graph-preflight
```

For the controlled real-mailbox procedure, use
[`docs/graph-readonly-mailbox-dry-run.md`](graph-readonly-mailbox-dry-run.md).
That runbook requires a dedicated pilot mailbox, read-only Graph access,
polling disabled, and explicit operator sign-off before any real inbound pilot.

The command reports mailbox configuration, credential source/mode, polling
state, allowed sender count, supplier mapping count, and dry-run readiness. When
credentials are present and polling is disabled, it clearly announces a live
read-only Microsoft Graph call and lists redacted unread message summaries only.
It does not mark messages read, ingest messages, persist content, download
attachment contents, call OpenAI, call Telegram, send email, or upload files.

Do not set `EMAIL_INBOUND_POLLING_ENABLED=true` until an operator has reviewed
the dry-run output, confirmed the mailbox and sender allowlists, and confirmed
that the dedicated worker process is the only process responsible for polling.

Enable worker-backed polling in this order:

1. Keep `EMAIL_INBOUND_POLLING_ENABLED=false`.
2. Configure the dedicated mailbox and Graph mail credentials.
3. Configure `EMAIL_INBOUND_ALLOWED_SENDERS`.
4. Configure `EMAIL_INBOUND_SUPPLIER_MAPPINGS` where deterministic mapping is
   safe.
5. Run `pnpm --filter @ambe/api email:graph-preflight`.
6. Review redacted sender/domain and subject summaries with an operator.
7. Confirm `/dashboard/setup` shows allowed senders and Graph preflight
   readiness.
8. Enable polling in the worker runtime environment.
9. Restart exactly one `ambe-worker`.
10. Watch `/api/system/workers` and worker logs for first-run failures.

Related safety controls:

- `GRAPH_USE_MESSAGE_DELTA=true`
- `GRAPH_USE_IMMUTABLE_IDS=true`
- `EMAIL_INBOUND_INTERNAL_DOMAINS`
- `EMAIL_INBOUND_INTERNAL_COMPANY_NAMES`

The poller marks a Graph message read only after successful handling, duplicate
handling, or safe malformed-message skip. Valid message failures remain unread
for retry.

## Microsoft Storage

Storage for account-opening archive and completed form filing is optional and
disabled by default.

Preferred storage app env vars:

- `MICROSOFT_STORAGE_TENANT_ID`
- `MICROSOFT_STORAGE_CLIENT_ID`
- `MICROSOFT_STORAGE_CLIENT_SECRET`

Storage mode and folders:

- `ACCOUNT_OPENING_STORAGE_PROVIDER=SHAREPOINT` or `ONEDRIVE`
- `MICROSOFT_DRIVE_ROOT_FOLDER`
- `SHAREPOINT_ACCOUNT_OPENING_ENABLED`
- `SHAREPOINT_SITE_ID`
- `SHAREPOINT_DRIVE_ID`
- `SHAREPOINT_ACCOUNT_OPENING_FOLDER`
- `ONEDRIVE_ACCOUNT_OPENING_ENABLED`
- `ONEDRIVE_USER_ID`
- `ONEDRIVE_DRIVE_ID`
- `ONEDRIVE_ACCOUNT_OPENING_FOLDER`

Permissions documented by the repo for the storage app:

- `Sites.ReadWrite.All`
- `Files.ReadWrite.All`

Do not reuse the mail app client ID for storage checks. The code intentionally
separates mail credentials from storage credentials.

## Telegram

Telegram is optional and disabled by default.

Core env vars:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_INTERNAL_CHAT_ID`
- `TELEGRAM_DRY_RUN=true`
- `START_WORKERS_WITH_API=false`
- `TELEGRAM_POLLING_ENABLED=false`
- `TELEGRAM_POLLING_INTERVAL_MS=5000`
- `TELEGRAM_ALLOWED_USER_IDS`
- `TELEGRAM_ALLOWED_CHAT_IDS`

Pilot guidance:

- Keep `TELEGRAM_DRY_RUN=true` until internal operators confirm message content.
- Use allowlists before accepting inbound files.
- Keep polling disabled unless the dedicated worker process is intended to poll
  Telegram.
- Telegram publishing remains internal-only and manual.

## OpenAI Optional Parser

OpenAI is optional and disabled by default:

- `OPENAI_API_KEY`
- `OPENAI_PARSER_ENABLED=false`
- `OPENAI_PARSER_MODEL`
- `OPENAI_PARSER_TIMEOUT_MS`
- `OPENAI_PARSER_MIN_CHARS`
- `OPENAI_PARSER_MAX_CHARS`
- `OPENAI_EMAIL_REVIEW_ENABLED=false`
- `OPENAI_EMAIL_REVIEW_DAILY_LIMIT`
- `OPENAI_EMAIL_REVIEW_PER_SUPPLIER_DAILY_LIMIT`
- `OPENAI_EMAIL_REVIEW_MIN_BUSINESS_SCORE`

AI fallback remains review-first in this repo:

- deterministic extraction runs first
- AI outputs are staged as candidates
- AI fallback items must not auto-write canonical Product, Supplier,
  SupplierPriceItem, InventorySnapshot, or SalesRecord records
- AI fallback items remain review-required unless existing explicit approval
  paths are used by an operator

## Human Approval Boundaries

Pilot deployment must preserve these boundaries:

- Human approval is required before customer-facing publishing.
- Supplier offer review decisions are operator actions.
- AI-derived candidates do not bypass review or supplier qualification gates.
- Telegram and email sending are manual/internal unless explicitly configured.
- Account-opening auto-fill and storage filing are disabled by default.

## Safe Verification

Use these safe checks after deployment:

```bash
pnpm --filter @ambe/api exec prisma validate
pnpm --filter @ambe/api db:generate
pnpm lint
pnpm test
pnpm --filter @ambe/api eval:extraction
pnpm build
```

Dashboard checks:

- `/dashboard` redirects unauthenticated users to `/login?next=%2Fdashboard`
- `/login` loads the internal sign-in form
- `/dashboard/setup`
- `/dashboard/setup/diagnostics`

Public website checks:

- `/`
- `/about`
- `/services`
- `/comparator-sourcing`
- `/onboarding`
- `/contact`
- `/sitemap.xml` includes only public routes
- `/robots.txt` disallows `/login` and `/dashboard`

API checks:

- `GET /health`
- `GET /api/system/readiness`
- `GET /api/system/workers`

The API readiness endpoint reports API readiness and whether polling workers are
expected in the separate worker process. The worker status endpoint reports the
latest safe polling counters persisted by the API or worker process. The API
system endpoints require internal API authentication.

Example authenticated smoke checks from the server, using a secret already
present in the shell or service environment:

```bash
curl -fsS http://127.0.0.1:4000/health
curl -fsS -H "x-internal-api-key: $INTERNAL_API_KEY" http://127.0.0.1:4000/api/system/readiness
curl -fsS -H "x-internal-api-key: $INTERNAL_API_KEY" http://127.0.0.1:4000/api/system/workers
```

Do not paste API keys into terminal history on shared hosts. Prefer a shell
session or service account where `INTERNAL_API_KEY` is already provided by the
process manager or a protected server-local environment file.

## Production Smoke Checks

Run these after every deploy and after any secrets/process change:

1. Process manager:
   - `ambe-api` is online.
   - `ambe-web` is online.
   - `ambe-worker` is online only when intentionally configured.
   - There is exactly one worker process for the environment.
2. Reverse proxy:
   - Public HTTPS host serves `/`.
   - `/dashboard` redirects unauthenticated users to login.
   - API private port is not directly exposed unless intentionally routed.
3. API:
   - `GET /health` returns success.
   - Authenticated `GET /api/system/readiness` returns safe JSON.
   - Authenticated `GET /api/system/workers` returns safe worker counters.
4. Web:
   - `/login` renders.
   - Admin user can open `/dashboard/setup`.
   - Setup and diagnostics pages show env var names only.
5. Business-safe UI:
   - `/dashboard/imports` loads.
   - `/dashboard/review` loads.
   - `/dashboard/opportunities` loads.
6. Safety:
   - Optional integrations remain disabled unless approved.
   - Logs do not show secrets, raw email bodies, attachment text, Graph
     payloads, Telegram payloads, OpenAI content, or connection strings.

Use Playwright e2e only when the environment is configured for safe browser
testing. Do not point local-runtime smoke commands at Neon or any managed
database.

## Rollback Procedure

Application-only rollback:

1. Identify the last known good git commit.
2. Stop or pause `ambe-worker` if the issue involves polling/import side
   effects.
3. Deploy the last known good commit.
4. Run `pnpm install --frozen-lockfile` if dependencies changed.
5. Rebuild API and web.
6. Restart `ambe-api`, `ambe-web`, and then `ambe-worker` if safe.
7. Run production smoke checks.

Database-involved rollback:

1. Stop `ambe-worker`.
2. Stop or restrict web/API access if operators could write new data during the
   restore.
3. Restore from the provider backup or branch to the selected restore target.
4. Update `DATABASE_URL` in service secrets.
5. Deploy the application commit compatible with the restored database.
6. Restart services.
7. Run production smoke checks.
8. Confirm the operator-visible state with `/dashboard/setup`,
   `/dashboard/imports`, and `/dashboard/review`.

Do not attempt ad hoc SQL deletion or `git reset --hard` on the server as a
data rollback strategy. Use a database backup/restore plan.

## Incident Checklist

Failed imports:

- Open `/dashboard/imports` and the failed import detail page.
- Review detected columns, invalid row counts, warning categories, and redacted
  row samples.
- Do not edit source files in a way that removes provenance.
- Retry only with a corrected fixture/source file approved by an operator.
- Check API logs using request ID if present.

Broken polling:

- Open `/dashboard/setup/diagnostics`.
- Check `GET /api/system/workers`.
- Confirm only one `ambe-worker` is running.
- Confirm polling env flags and allowlists.
- For Graph, check mailbox, app permissions, admin consent, and preflight.
- For Telegram, check allowlisted user/chat IDs and dry-run state.
- Leave valid failed Graph messages unread for retry unless an operator decides
  they should be skipped.

Auth issues:

- Confirm `WEB_AUTH_*` values are present in the web runtime.
- Confirm `WEB_AUTH_SESSION_SECRET` is at least 32 characters.
- Confirm internal API keys are present in both API and web runtime as needed.
- Confirm role is `viewer`, `operator`, or `admin`.
- Confirm `/dashboard` redirects unauthenticated users and setup pages require
  admin access.
- Rotate dashboard password or session secret if compromise is suspected.

Database outage:

- Check provider status and database connectivity from the VPS.
- Check API logs for database readiness failures.
- Keep `ambe-worker` stopped until the database is stable.
- Do not run migrations while connectivity is unstable.
- Restore from backup only after identifying the restore target and expected
  data-loss window.

Suspected secret leak:

- Treat screenshots, logs, shell history, uploaded files, and tickets as
  possible exposure sources.
- Rotate the affected secret at the source provider.
- Update server-side runtime configuration.
- Restart affected services.
- Verify readiness and login/API behavior.
- Review recent logs and access history.
- Remove leaked material from tickets/channels where possible.
- Never paste the replacement secret into chat or issue comments.

## Non-Goals And Boundaries

This deployment guide does not enable or claim:

- autonomous external email or Telegram sending;
- autonomous customer-facing publishing;
- warehouse operation or stockholding capability;
- marketplace operation;
- bank, payment authority, direct debit, or signatory completion;
- unverified regulatory, licence, or compliance status;
- replacement for operator review, supplier qualification, or human approval.

The production deployment should preserve the repo's current safety posture:
deterministic processing first, optional integrations disabled by default,
review-first AI fallback, and human approval before external action.
