# Local Runtime Smoke Runbook

This runbook proves the API can start and answer safe read-only checks against a disposable local PostgreSQL database. It is intentionally not a migration, seed, production readiness, or external integration diagnostic.

## Command

From the repo root:

```bash
pnpm --filter @ambe/api smoke:local-runtime
```

The command imports `createApp()` directly. It does not import `src/index.ts`, does not start Telegram or email polling workers, does not call OpenAI, does not send email, and does not upload to Microsoft Graph, SharePoint, or Drive.

For the fake commercial pilot dataset, use the separate guarded demo smoke:

```bash
pnpm --filter @ambe/api demo:smoke-pilot
```

That command uses the same local/disposable database guard, runs the fake pilot demo seed, and verifies the seeded review, buy decision, buy execution, and trade opportunity records. It does not run migrations or call external services.

For a browser smoke that uses the real API, real dashboard, migrations, and the
same fake pilot data, run:

```bash
pnpm --filter @ambe/web test:e2e:local-runtime
```

This command starts the API and web app locally for Playwright. It refuses
managed or live-looking database URLs before migrations run, applies Prisma
migrations only to the accepted disposable database, seeds only fake
`AMBE_FAKE_PILOT_DEMO` records, then checks the setup/readiness page,
diagnostics page, review queue, review detail provenance, correction/audit
summary, approval-required state, and a broader fake operator scenario matrix
through the browser.

## Local Postgres Prerequisite

The smoke command expects a running disposable local PostgreSQL database. It does not create a database, run migrations, seed data, or start Docker for you.

If Docker is available, start only the repo's local Postgres service with explicit local-only values:

```powershell
$env:POSTGRES_DB = "ambe_local_smoke"
$env:POSTGRES_USER = "ambe_local_smoke"
$env:POSTGRES_PASSWORD = "<local-only-password>"
docker compose up -d postgres
```

Then set `DATABASE_URL` for the current shell only, using the same local values. Do not put Neon or any managed database URL here:

```powershell
$env:DATABASE_URL = "postgresql://ambe_local_smoke:<local-only-password>@127.0.0.1:5432/ambe_local_smoke?schema=public"
```

Before running the smoke command, the safe classification should be:

- host: `127.0.0.1` or `localhost`
- database: `ambe_local_smoke`
- classification: `local`

If Docker is not installed, `127.0.0.1:5432` is not listening, and no other disposable local PostgreSQL instance is available, skip the smoke run. A connection failure to `127.0.0.1:5432` means the harness has not proven runtime readiness yet; it only proves the guard avoided any managed or external database.

## CI Runtime Smoke

The GitHub Actions workflow `.github/workflows/local-runtime-smoke.yml` proves the same guarded smoke path against a disposable PostgreSQL service container. It uses dummy CI-only database credentials, a local database named `ambe_local_smoke`, and no repository secrets.

The CI workflow:

1. starts only a PostgreSQL service container;
2. confirms the `DATABASE_URL` with the local smoke classifier before any migration command;
3. runs `prisma validate`, `prisma generate`, and `prisma migrate deploy` only against that disposable CI database;
4. runs `pnpm --filter @ambe/api smoke:local-runtime`;
5. disables OpenAI, Telegram polling, email, Microsoft Graph, SharePoint, and OneDrive modes.

The CI smoke must not be repointed at Neon, Supabase, RDS, Azure PostgreSQL, or any unknown public database host. Managed databases remain forbidden for this smoke path.

## Database Safety Rules

The smoke command refuses to run unless `DATABASE_URL` is clearly local and disposable.

Accepted hosts:

- `localhost`
- `127.0.0.1`
- `[::1]`
- `postgres`, matching the service name in `docker-compose.yml`

The database name must contain one of:

- `local`
- `dev`
- `test`
- `demo`
- `smoke`
- `ci`

Example safe local values:

```bash
DATABASE_URL="postgresql://ambe:ambe@localhost:5432/ambe_local?schema=public"
DATABASE_URL="postgresql://ambe:ambe@postgres:5432/ambe_dev?schema=public"
DATABASE_URL="postgresql://ambe:ambe@localhost:5432/ambe_demo?schema=public"
DATABASE_URL="postgresql://ci:ci@localhost:5432/ambe_ci?schema=public"
```

Rejected examples include Neon, Supabase, AWS RDS, Azure PostgreSQL, invalid URLs, empty values, and any unknown public host. The guard reports only safe metadata such as host, database name, classification, and reason. It must not print credentials or a full connection string.

## External Integration Guard

The smoke command refuses to run when live-capable modes are enabled:

- `OPENAI_PARSER_ENABLED=true`
- `OPENAI_EMAIL_REVIEW_ENABLED=true`
- `TELEGRAM_POLLING_ENABLED=true`
- `TELEGRAM_DRY_RUN=false` while a bot token and chat are configured
- `EMAIL_ALERTS_ENABLED=true`
- `EMAIL_INBOUND_POLLING_ENABLED=true`
- `SHAREPOINT_ACCOUNT_OPENING_ENABLED=true`
- `ONEDRIVE_ACCOUNT_OPENING_ENABLED=true`

Credentials may be present in local env files if the corresponding live mode is disabled. The smoke command still force-disables those integration flags in-process before creating the Express app.

## What It Checks

After the database and integration guards pass, the command:

1. connects Prisma to the approved local database;
2. runs `verifyDatabaseReadiness()`;
3. starts the Express app on an ephemeral `127.0.0.1` port;
4. calls `GET /health`;
5. calls `GET /api/debug/env` with an in-process smoke admin key;
6. closes the HTTP server;
7. disconnects Prisma.

It does not run migrations, seeds, `prisma migrate status`, mutating API routes, send routes, upload routes, or supplier-facing actions.

The browser local-runtime command is intentionally broader than
`smoke:local-runtime`: it runs `prisma migrate deploy` and the fake pilot demo
seed before starting the API. It still refuses unsafe databases first and keeps
all live-capable integrations disabled. It does not submit approvals,
corrections, messages, uploads, mailbox polling, or supplier/customer-facing
actions.

The fake pilot dataset now includes stable local-runtime scenario IDs for:

- clean supplier offer ready for review;
- ambiguous supplier;
- blocked or restricted supplier;
- stale correction after approval;
- missing price or currency;
- high MOQ;
- low margin;
- near-expiry or expired stock;
- dead stock / push opportunity;
- already ordered or executed item.

The browser smoke asserts review queue coverage, blocked-state messaging,
correction/audit visibility, deal margin/stock/push signals, and that source
body canaries, raw correction canaries, connection strings, local smoke
credentials, Graph payload canaries, and Telegram payload canaries are not
rendered.

## Expected Output

A passing run prints a short safe summary:

- database host;
- database name;
- database classification;
- endpoint statuses;
- integration statuses such as `disabled`, `dry-run`, or `present-disabled`.

No secrets or full connection strings should appear in the output.

## If It Refuses To Run

Treat refusal as the expected safe behaviour. Common causes are:

- `DATABASE_URL` points at Neon or another managed database;
- the database name does not contain `local`, `dev`, `test`, `demo`, `smoke`, or `ci`;
- OpenAI, Telegram polling, email sending, inbox polling, SharePoint filing, or OneDrive filing is enabled.

Change only local disposable env values before re-running. Do not point this command at Neon or any production-like database.
