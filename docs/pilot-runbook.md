# Pilot Operations Runbook

This runbook is for operating a controlled pilot of Ambe Pharma Intelligence.
It assumes the deployment has been configured using [deployment.md](deployment.md).

## Pilot Scope

The first pilot workflow is:

1. Forward or poll supplier price emails into one intake mailbox.
2. Extract supplier offers from email bodies and attachments.
3. Stage uncertain or AI-assisted offers for review.
4. Let operators approve, reject, request information, or correct extracted
   facts.
5. Turn approved offers into buy decisions and trade opportunities.
6. Track execution, deal history, correction history, and audit events.

The pilot is not an autonomous customer-facing selling system. Human approval is
required before external publishing or sending.

## Pre-Flight Checklist

Before processing real supplier messages:

- Confirm `NODE_ENV=production` or the intended pilot environment value.
- Confirm `DATABASE_URL` points at the pilot database, not a local smoke
  database.
- Confirm a recent database backup exists before any migration.
- Confirm `INTERNAL_API_KEY`, `INTERNAL_ADMIN_API_KEY`, and web auth values are
  set.
- Confirm `/dashboard` redirects unauthenticated users to login.
- Confirm `/dashboard/setup` reports database and internal auth readiness.
- Confirm `/dashboard/setup/diagnostics` loads without exposing secrets.
- Confirm `EMAIL_INBOUND_ALLOWED_SENDERS` is limited to known owners,
  supplier addresses, or trusted supplier domains.
- Run `pnpm --filter @ambe/api email:graph-preflight` and review the read-only
  unread-message summaries before enabling inbox polling.
- Keep optional integrations disabled until each one is tested deliberately.

## Required Vs Optional Integrations

Required for a basic pilot:

- API service
- web dashboard
- PostgreSQL database
- internal API auth
- web auth
- import and review workflow

Optional:

- Microsoft Graph inbox polling
- Microsoft Graph outbound email
- Microsoft Graph SharePoint or OneDrive storage
- Telegram inbound/publishing
- OpenAI parser and email review fallback
- account-opening original upload, auto-fill, and auto-file modes

Default optional modes should remain off until an operator has validated setup.

## Daily Operator Routine

1. Open `/dashboard`.
2. Check "Needs review now" for supplier emails awaiting decision.
3. Open `/dashboard/review` and process staged offers.
4. Inspect provenance, raw snippets, confidence, corrections, and audit history
   before approving.
5. Use structured corrections when supplier, product, manufacturer, price,
   MOQ, availability, or confidence assumptions are wrong.
6. Open `/dashboard/opportunities` for buy-side signals.
7. Open `/dashboard/deals` for trade opportunity and recent deal history.
8. Open `/dashboard/products` if duplicate or weak product records are blocking
   trust.
9. Open `/dashboard/setup` or `/dashboard/setup/diagnostics` when ingestion or
   integration status looks stale.

## Inbox Polling Operations

Inbox polling is controlled by:

- `EMAIL_INBOUND_POLLING_ENABLED`
- `EMAIL_INBOUND_POLLING_INTERVAL_MS`
- `MICROSOFT_GRAPH_SENDER_MAILBOX`
- Microsoft mail credentials or delegated refresh token
- `EMAIL_INBOUND_ALLOWED_SENDERS`
- `EMAIL_INBOUND_SUPPLIER_MAPPINGS`

Before enabling polling:

1. Keep `EMAIL_INBOUND_POLLING_ENABLED=false`.
2. Confirm the setup or diagnostics page shows Graph inbox dry-run as safe.
3. Run `pnpm --filter @ambe/api email:graph-preflight`.
4. Confirm the command says it is making a live read-only Graph call.
5. Review only the redacted sender/domain, truncated subject, received
   timestamp, and attachment count.
6. Confirm no unexpected unread messages are present and allowed senders are
   correct.
7. Enable polling only after manual operator signoff.

The preflight and dry-run do not mark messages read, ingest messages, persist
email content, download attachment content, call OpenAI, call Telegram, send
email, or upload files.

Use
[`docs/graph-readonly-mailbox-dry-run.md`](graph-readonly-mailbox-dry-run.md)
for the controlled dedicated-mailbox readiness plan before any real inbound
pilot. Do not run the dry-run against a production shared mailbox or a mailbox
that is already part of an operational workflow.

Expected behavior:

- unread messages are read oldest-first
- successfully handled messages are marked read
- duplicate processed messages are marked read
- safely skipped malformed messages can be marked read
- valid failed messages remain unread for retry
- the worker continues past one bad message

Monitor:

- `/dashboard/setup`
- `/dashboard/setup/diagnostics`
- `GET /api/system/workers`

If polling stops:

1. Check worker `running`, `lastRunFinishedAt`, `lastSuccessAt`, and
   `lastError`.
2. Check Graph permissions and admin consent.
3. Check the configured mailbox.
4. Check sender allowlists.
5. Use any request id or Graph request id in logs to trace the failure.

Do not manually mark unread supplier emails read unless an operator confirms
they should be skipped.

## Telegram Operations

Telegram is optional. Keep it disabled unless the pilot explicitly uses it.

Safe defaults:

- `TELEGRAM_DRY_RUN=true`
- `TELEGRAM_POLLING_ENABLED=false`
- allowlists set before inbound file intake

If enabled:

- inspect `/dashboard/setup/diagnostics` for worker status
- confirm `TELEGRAM_ALLOWED_USER_IDS` and `TELEGRAM_ALLOWED_CHAT_IDS`
- confirm duplicate file/message behavior before relying on it
- treat failed Telegram updates as resend-backed dead letters

Telegram publishing remains internal-only and manual.

## OpenAI Operations

OpenAI parser and email review fallback are optional.

Safe defaults:

- `OPENAI_PARSER_ENABLED=false`
- `OPENAI_EMAIL_REVIEW_ENABLED=false`

If enabled:

- set daily and per-supplier limits
- keep deterministic extraction first
- treat AI output as staged candidate data
- verify AI fallback items stay review-required
- run the deterministic eval before and after parser-related changes

Command:

```bash
pnpm --filter @ambe/api eval:extraction
```

Do not use AI output to silently mutate canonical product, supplier, pricing,
inventory, or sales records.

## Imports And Data Quality

Operators can import supplier price lists, inventory, and sales files through
the dashboard or API import routes.

Before relying on commercial signals:

- inspect import batch details
- review invalid row counts
- review warning categories
- resolve duplicate product candidates where practical
- preserve raw source data and avoid manual spreadsheet edits that remove
  provenance

Template guidance is in [import-templates.md](import-templates.md).

## Migrations, Backups, And Seed Safety

Before applying migrations to pilot:

1. Confirm the target `DATABASE_URL` host and database name.
2. Confirm a database backup exists.
3. Run `pnpm --filter @ambe/api exec prisma validate`.
4. Apply migrations with `pnpm --filter @ambe/api exec prisma migrate deploy`.
5. Run `pnpm --filter @ambe/api db:generate`.
6. Restart API and web services.
7. Check `/dashboard/setup`.

Never run these against pilot data:

- `pnpm --filter @ambe/api db:seed`
- destructive local reset commands
- local smoke harness with a managed database URL

The seed script is for a very small fake development dataset. It is not a pilot
data bootstrap process.

## Demo And Fixture Safety

Safe demo/eval commands:

- `pnpm --filter @ambe/api eval:extraction`
- `pnpm --filter @ambe/api demo:account-opening`
- `pnpm --filter @ambe/api demo:seed-pilot` only with a guarded local or
  disposable pilot-demo database
- `pnpm --filter @ambe/api demo:smoke-pilot` only with a guarded local or
  disposable pilot-demo database
- `pnpm --filter @ambe/api smoke:local-runtime` only with a disposable local
  PostgreSQL database

Demo and fixture files must not contain real supplier, customer, patient,
credential, or bank data.

The pilot demo seed and smoke commands upsert fake supplier-email, review, buy
decision, execution, and trade-opportunity records marked with
`AMBE_FAKE_PILOT_DEMO`. They are non-destructive, but they write database rows
and refuse managed/live-looking database URLs by default. They should not be run
against real pilot data. See
[demo-pilot-walkthrough.md](demo-pilot-walkthrough.md).

The local account-opening demo writes artifacts under `apps/api/tmp/`, uses fake
data, and does not call Microsoft Graph by default. See
[account-opening-demo-runbook.md](account-opening-demo-runbook.md).

## Troubleshooting

Use [troubleshooting.md](troubleshooting.md) for operator-safe error handling,
request IDs, redaction expectations, and common failure checks.

Key support pages:

- `/dashboard/setup`
- `/dashboard/setup/diagnostics`
- `/dashboard/imports`
- `/dashboard/review`

Key safe endpoints:

- `GET /health`
- `GET /api/system/readiness`
- `GET /api/system/workers`

Do not paste `.env` values, raw email bodies, attachment contents, database URLs,
Microsoft tokens, Telegram tokens, OpenAI keys, or full stack traces into
external support channels.

## Human Approval Boundaries

During the pilot:

- operators approve or reject supplier offers
- corrections remain bounded hints and do not bypass review
- unknown or blocked supplier qualification remains conservative
- AI fallback does not auto-promote offers
- outbound Telegram/email messages are internal/manual unless explicitly
  configured otherwise
- customer-facing publishing requires human approval

If any automation appears to bypass these boundaries, stop the pilot workflow
and review the relevant route, policy, and audit history before continuing.
