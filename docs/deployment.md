# Deployment

This document describes a safe local or pilot deployment for Ambe Pharma
Intelligence. It is factual to this repo and does not include real secrets.

## Runtime Shape

The repo is a pnpm monorepo:

- `apps/api`: Express API, Prisma, PostgreSQL
- `apps/web`: Next.js internal dashboard
- `packages/shared`: shared TypeScript utilities

Required runtime tools:

- Node.js 20+
- pnpm 9+
- PostgreSQL reachable through `DATABASE_URL`

The API defaults to port `4000`. The web app defaults to port `3000` when run
with Next.js locally.

## Required Pilot Configuration

Create environment files from the examples:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Required API values for a pilot:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | Use `production` in the pilot environment. |
| `PORT` | yes | API HTTP port, default `4000`. |
| `DATABASE_URL` | yes | PostgreSQL connection string used by Prisma. |
| `INTERNAL_API_KEY` | yes | Internal API key for protected operator routes. |
| `INTERNAL_ADMIN_API_KEY` | recommended | Admin key for admin/debug-only internal calls. |
| `ENABLE_DEBUG_ROUTES` | recommended | Use `false` in production-like pilot environments. |

Required web values for a pilot:

| Variable | Required | Purpose |
| --- | --- | --- |
| `WEB_AUTH_USERNAME` | yes | Internal dashboard username. |
| `WEB_AUTH_PASSWORD` | yes | Internal dashboard password. |
| `WEB_AUTH_ROLE` | yes | `viewer`, `operator`, or `admin`. |
| `WEB_AUTH_SESSION_SECRET` | yes | At least 32 random characters. |
| `WEB_AUTH_SESSION_TTL_SECONDS` | optional | Session duration, default is 8 hours. |
| `INTERNAL_API_BASE_URL` | recommended | Server-side web URL for the API `/api` base. |
| `ACCOUNT_OPENING_EXPORT_DOWNLOAD_TOKEN` | optional | Download token for account-opening export files. |

Do not use `NEXT_PUBLIC_*` for secrets. The dashboard auth secret, dashboard
password, internal API keys, Graph credentials, Telegram token, OpenAI key, and
database URL must stay server-side.

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
pnpm --filter @ambe/web start
```

Local development can use:

```bash
pnpm dev
```

Do not enable live integrations in local development unless the operator knows
which mailbox, Telegram bot, and database are being used.

## Microsoft Graph Mail

Mail configuration is optional unless the pilot uses outbound email alerts or
inbox polling.

Preferred env vars for the mail app:

| Variable | Purpose |
| --- | --- |
| `MICROSOFT_MAIL_TENANT_ID` | Mail app tenant. |
| `MICROSOFT_MAIL_CLIENT_ID` | Mail app client ID. |
| `MICROSOFT_MAIL_CLIENT_SECRET` | Mail app client secret. |
| `MICROSOFT_GRAPH_SENDER_MAILBOX` | Mailbox used for sendMail and inbox polling. |
| `MICROSOFT_GRAPH_REFRESH_TOKEN` | Delegated token path for personal Outlook.com style setup. |
| `INTERNAL_ALERT_EMAIL_RECIPIENTS` | Comma-separated internal recipients. |

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
EMAIL_INBOUND_POLLING_ENABLED=false
EMAIL_INBOUND_POLLING_INTERVAL_MS=30000
```

Enable it only after configuring:

- `MICROSOFT_GRAPH_SENDER_MAILBOX`
- mail Graph credentials or refresh token
- `EMAIL_INBOUND_ALLOWED_SENDERS`
- `EMAIL_INBOUND_SUPPLIER_MAPPINGS` where deterministic supplier mapping is
  safe

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
- `TELEGRAM_POLLING_ENABLED=false`
- `TELEGRAM_POLLING_INTERVAL_MS=5000`
- `TELEGRAM_ALLOWED_USER_IDS`
- `TELEGRAM_ALLOWED_CHAT_IDS`

Pilot guidance:

- Keep `TELEGRAM_DRY_RUN=true` until internal operators confirm message content.
- Use allowlists before accepting inbound files.
- Keep polling disabled unless the API process is intended to poll Telegram.
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

- `/dashboard/setup`
- `/dashboard/setup/diagnostics`

API checks:

- `GET /health`
- `GET /api/system/readiness`
- `GET /api/system/workers`

The API system endpoints require internal API authentication.
