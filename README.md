# Ambe Pharma Intelligence

Production-minded pnpm monorepo with:

- `apps/api` - Node.js, TypeScript, Express
- `apps/web` - Next.js, TypeScript
- `packages/shared` - shared types and utilities

## Requirements

- Node.js 20+
- pnpm 9+

## Local Setup

```bash
pnpm install
pnpm dev
```

This starts:

- API on `http://localhost:4000`
- Web on `http://localhost:3000`

## Environment

Copy the example files if needed and fill in real values locally:

- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`

Do not commit real secrets.

### Web dashboard auth

The Next.js dashboard uses a minimal internal sign-in flow for pilot use. It stores the web session in an HTTP-only cookie and protects all `/dashboard` routes.

Add these to `apps/web/.env`:

```bash
WEB_AUTH_USERNAME=pilot.operator
WEB_AUTH_PASSWORD=replace-with-local-development-password
WEB_AUTH_ROLE=operator
WEB_AUTH_SESSION_SECRET=replace-with-at-least-32-random-characters
WEB_AUTH_SESSION_TTL_SECONDS=28800
```

- `WEB_AUTH_USERNAME` and `WEB_AUTH_PASSWORD`: internal dashboard credentials for the pilot operator.
- `WEB_AUTH_ROLE`: one of `viewer`, `operator`, or `admin`. The web layer uses explicit server-side capabilities so read-only dashboard pages and operator actions are not gated by session presence alone.
- `WEB_AUTH_SESSION_SECRET`: signing secret for the HTTP-only session cookie. Use a unique high-entropy value; at least 32 characters are required.
- `WEB_AUTH_SESSION_TTL_SECONDS`: session lifetime in seconds. Defaults to 8 hours when omitted.

For local development, copy `apps/web/.env.example` to `apps/web/.env` and replace the placeholder values. In production, run the app with `NODE_ENV=production`; the session cookie is then marked `Secure`.

### Setup checklist

Authenticated dashboard users can open:

```text
/dashboard/setup
/dashboard/inventory
/dashboard/customers
/dashboard/customers/:id
```

The setup page calls the read-only API endpoint:

```text
GET /api/system/readiness
```

The endpoint returns safe pilot-readiness checks for database connectivity, API internal auth, email polling, Microsoft Graph mail credentials, allowed sender and supplier mapping setup, Microsoft storage settings, Telegram polling, OpenAI fallback configuration, import availability, demo/seed safety, and production safety warnings. The setup page groups those signals with web auth/session status and uses only `ready`, `missing`, `disabled`, and `warning` labels. It reports booleans, counts, status labels, documentation hints, and environment variable names only. It must not return secret values, full connection strings, tokens, or Graph credentials.

The readiness report also marks the read-only inventory and customer data APIs
as available once the API is running. These endpoints are internal-only,
viewer-readable, and do not send messages or publish customer-facing content:

```text
GET /api/inventory
GET /api/inventory/stock-risk
GET /api/customers
GET /api/customers/:id
GET /api/customers/contact-opportunities
```

Customer responses redact raw email addresses and return safe contact previews
only.

The API also exposes safe runtime polling status for authenticated internal callers:

```text
GET /api/system/workers
```

This returns safe status for the email and Telegram pollers: enabled/configured flags, running/in-flight state, last run timestamps, last safe error message, consecutive failures, processed/skipped/failed counters, and duplicate-skip counters where available. The API persists these snapshots in `AppSetting` so operators can still see the last known state after a restart. It does not include message bodies, tokens, connection strings, raw Graph payloads, or Telegram payloads. See [docs/operations-runbook.md](docs/operations-runbook.md) for retry and dead-letter guidance.

This page does not send email, send Telegram messages, call OpenAI, write Microsoft Graph files, or mutate business data. Use it as a first-run checklist before controlled fixture imports and pilot operator testing.

Operator-safe diagnostics are available at:

```text
/dashboard/setup/diagnostics
```

The diagnostics page summarizes readiness, worker status, safe last errors, and
next checks. API errors include an `x-request-id` response header and a safe
error payload with `message`, `code`, `requestId`, and `nextAction`. Logs redact
tokens, connection strings, raw message bodies, and file contents by default.
See [docs/troubleshooting.md](docs/troubleshooting.md) for support guidance.

For the API and Prisma commands, environment loading works in this order:

1. `apps/api/.env`
2. repo root `.env`

`apps/api/.env` is the primary location. The root `.env` is only a fallback when `DATABASE_URL` is missing in `apps/api/.env`.
Prisma loads these files through [apps/api/prisma.config.ts](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/prisma.config.ts:1) before it reads the schema.
Prisma resolves those env files relative to `process.cwd()`, so when you run `pnpm --filter @ambe/api ...`, the expected primary file is `apps/api/.env`.

## Useful Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm qa:trade
```

`pnpm qa:trade` runs the focused Trade Access/RFQ QA pass with deterministic
fake buyer data. It covers public RFQ validation and blocked submissions,
protected dashboard route checks, sitemap/robots safety, and the Playwright
public-submit-to-dashboard workflow against local fixture services only.

### CI quality gates

GitHub Actions runs `.github/workflows/ci.yml` on pull requests, pushes to `main`, and manual dispatch. The CI job uses Node 20 and pnpm 9.15.4, installs with `pnpm install --frozen-lockfile`, validates the Prisma schema, generates the Prisma client, then runs:

```bash
pnpm lint
pnpm test
pnpm --filter @ambe/api eval:extraction
pnpm build
```

CI uses safe placeholder environment variables and a dummy local `DATABASE_URL` for Prisma validation/generation only. It does not run migrations, connect to Neon, send email, call Telegram, use Microsoft Graph, or call OpenAI.

Latest local safe verification report: [docs/test-runs/full-safe-bot-verification-2026-06-01.md](docs/test-runs/full-safe-bot-verification-2026-06-01.md).

### Deployment and pilot operations

Production/VPS deployment setup and operations are documented in
[docs/deployment.md](docs/deployment.md).
Pilot operating procedures, safe defaults, migrations, backups, inbox polling,
optional integrations, and seed/demo cautions are documented in
[docs/pilot-runbook.md](docs/pilot-runbook.md).

### Pilot demo dataset

Seed the safe fake commercial walkthrough dataset with:

```bash
pnpm --filter @ambe/api demo:seed-pilot
```

The command upserts deterministic fake records for supplier-email ingestion,
review, buy decision, execution tracking, and deal visibility. It refuses
managed/live-looking database URLs by default and does not call Microsoft Graph,
Telegram, OpenAI, or outbound email services. Run it only against a guarded
local or disposable pilot-demo database.

Verify the seeded demo path with:

```bash
pnpm --filter @ambe/api demo:smoke-pilot
```

The smoke command runs the guarded seed and checks that review, buy decision,
buy execution, and trade opportunity records exist. See
[docs/demo-pilot-walkthrough.md](docs/demo-pilot-walkthrough.md).

### Extraction evaluation

Run the local extraction quality evaluation with:

```bash
pnpm --filter @ambe/api eval:extraction
```

The default eval uses sanitized fixtures in `apps/api/fixtures/extraction-evals` and does not require Microsoft Graph, OpenAI, OCR, PDF parsing, a database, or network access. It reports extracted offer counts, false positives, false negatives, review-required cases, auto-promotion-eligible cases, AI-used cases, and key mismatches. The command exits non-zero when deterministic fixtures fail, so CI can run it as a regression check.

See [docs/extraction-evals.md](docs/extraction-evals.md) for fixture format, optional live-AI mode, how to add sanitized cases, and recommended quality thresholds.

### Commercial audit history

Review, buy, execution, correction, automation-readiness, and related commercial decisions use domain event tables for audit history. The review detail screen shows combined workflow, buy decision, execution, correction, and deal history for each offer row. The deals dashboard shows recent deal event history.

See [docs/audit-history.md](docs/audit-history.md) for the consolidated commercial audit-history behavior and [docs/commercial-audit-history.md](docs/commercial-audit-history.md) for the earlier coverage notes.

## Product readiness

See [docs/product-readiness-audit.md](docs/product-readiness-audit.md) for the current product thesis, readiness gaps, commercial pilot scope, and ordered implementation roadmap.

## Database

The API uses Neon PostgreSQL with Prisma. Prisma lives in `apps/api/prisma`.

### Safe Local Runtime Smoke

When a disposable local PostgreSQL database is available, run the guarded API smoke harness:

```bash
pnpm --filter @ambe/api smoke:local-runtime
```

The harness refuses Neon, Supabase, AWS RDS, Azure PostgreSQL, unknown public hosts, invalid URLs, empty URLs, and local databases whose names do not clearly contain `local`, `dev`, `test`, `demo`, `smoke`, or `ci`. It also refuses live-capable OpenAI, Telegram polling, email, inbox polling, SharePoint, and OneDrive modes. It does not migrate, seed, run Prisma migrate status, start polling workers, send messages, or upload files.

Full instructions are in [docs/local-runtime-smoke-runbook.md](/d:/Users/User/Desktop/ambe-pharma-intelligence/docs/local-runtime-smoke-runbook.md:1).

### Configure Neon

1. Create `apps/api/.env` from `apps/api/.env.example`.
2. Set `DATABASE_URL` to your Neon connection string.
3. Optionally create a root `.env` from `.env.example` if you want the fallback behavior.

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
```

Use the pooled or direct Neon PostgreSQL connection string that Neon provides for your project. Keep `sslmode=require` in the URL.

The API connects to Neon on startup through Prisma. If the database is not reachable, startup fails with a clear log message that includes only safe connection details such as the database host.

### Run Prisma

```bash
pnpm --filter @ambe/api db:generate
pnpm --filter @ambe/api db:migrate
pnpm --filter @ambe/api db:seed
```

`db:migrate` creates and applies the development migration against your Neon database. `db:seed` loads a very small fake dataset for development.
These commands are plain Prisma commands. Environment loading is handled centrally in `apps/api/prisma.config.ts`, not by shell wrappers.

## Import API

The API supports CSV and XLSX uploads for supplier price lists, inventory snapshots, and sales history.

### Email Inbound Sender Configuration

For inbound email attachment processing, `EMAIL_INBOUND_ALLOWED_SENDERS` accepts:

- exact addresses such as `owner@ambe.test` or `pricing@supplier.co`
- trusted domains such as `supplier.co`

Recommended setup:

- add the business owner's forwarding address as an exact allowed sender
- add direct supplier addresses or supplier domains when you trust them to send files directly
- for forwarded owner workflows, pass `supplierName` in the inbound email payload when the owner knows the supplier and wants that to take priority

`EMAIL_INBOUND_SUPPLIER_MAPPINGS` remains useful for direct supplier emails where the sender address or domain can be mapped deterministically to a supplier name.

### Direct Inbox Polling

The API can poll the Microsoft Graph inbox for the configured sender mailbox and feed unread messages directly into the existing inbound email parser. This removes the need to manually forward emails into the API.

Add these to `apps/api/.env`:

```bash
EMAIL_INBOUND_POLLING_ENABLED=false
EMAIL_INBOUND_POLLING_INTERVAL_MS=30000
```

- `EMAIL_INBOUND_POLLING_ENABLED`: when `true`, the API polls unread inbox mail for `MICROSOFT_GRAPH_SENDER_MAILBOX`
- `EMAIL_INBOUND_POLLING_INTERVAL_MS`: polling interval in milliseconds

### Graph Inbox Preflight

Before enabling inbox polling, run the read-only Graph preflight:

```bash
pnpm --filter @ambe/api email:graph-preflight
```

The command first reports safe configuration status: mailbox configured, credential source, credential mode, polling enabled/disabled, allowed sender count, supplier mapping count, and dry-run readiness. If Graph mail credentials are complete and polling is disabled, it clearly announces a live read-only Microsoft Graph call and lists a small number of unread inbox message summaries.

The dry-run does not mark messages read, ingest messages, save inbound email rows, download attachment contents, call OpenAI, call Telegram, send email, or upload to SharePoint/OneDrive. It shows only message count, redacted sender/domain, truncated subject preview, received timestamp, and attachment count.

Keep `EMAIL_INBOUND_POLLING_ENABLED=false` until the dry-run output, mailbox ownership, and allowed sender configuration have been manually signed off.

Required Graph permission for this mode:

- `Mail.ReadWrite` as an `Application` permission

`Mail.ReadWrite` is needed because the poller reads inbox messages and marks them as read after ingestion. The existing outbound send flow still requires `Mail.Send`.

Recommended pilot path:

1. create a dedicated mailbox such as `supplier-intake@...`
2. point `MICROSOFT_GRAPH_SENDER_MAILBOX` at that mailbox
3. use the Ambe Bot Mailer app-only Graph auth with `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`, and `MICROSOFT_MAIL_TENANT_ID`
4. grant Microsoft Graph `Application` permission `Mail.ReadWrite` and admin consent
5. enable `EMAIL_INBOUND_POLLING_ENABLED=true`
6. restrict intake with `EMAIL_INBOUND_ALLOWED_SENDERS`
7. add `EMAIL_INBOUND_SUPPLIER_MAPPINGS` for direct supplier domains or addresses where deterministic mapping is safe

The poller reads unread inbox mail oldest-first, processes each message through the existing inbound email intake flow, marks successfully handled, duplicate, or safely skipped malformed messages as read, and continues past one bad message instead of stopping the whole loop. If handling a valid message fails, the message is left unread for retry. Runtime status is visible in `GET /api/system/workers` and included in the email polling readiness details. Safe status snapshots are persisted in `AppSetting`; raw message bodies and Graph response bodies are not stored in worker status.

### Email Extraction Flow

Inbound email now follows a staged extraction flow:

1. inbox intake
2. immutable raw email persistence
3. document decomposition
4. triage
5. deterministic extraction
6. normalization and entity-resolution candidates
7. staged email-derived offers
8. conservative promotion or review
9. AI fallback only for unclear but commercially relevant content

New staging records preserve raw source and reviewable candidates before canonical tables are mutated.

### Promotion Rules

Email-derived offers are only auto-promoted when all of the following are strong:

- deterministic extraction produced a clear commercial offer
- sender/source trust is sufficient
- product text is explicit
- price and currency are explicit
- supplier resolution is strong
- entity resolution confidence is high
- AI was not required for the extracted offer

Everything else remains staged or review-required. AI-generated candidates never write canonical business records directly.

### Offer Review Workflow

Review-required staged email-derived offers now enter a small internal workflow queue backed by `OfferWorkflowItem` and `OfferWorkflowEvent`.

Workflow statuses:

- `NEW`
- `IN_REVIEW`
- `NEEDS_INFO`
- `APPROVED_TO_BUY`
- `REJECTED`
- `ORDERED`
- `CLOSED`

Workflow actions are internal-ops only:

- assign
- start review
- mark needs info
- approve to buy
- reject
- mark ordered
- close
- add note

This workflow sits on top of staged offers. It does not auto-promote canonical supplier pricing, and it is not a generic BPM engine.

### Buy Decisions And Supplier Qualification

Approving a staged email-derived offer to buy now creates or reuses a durable `BuyDecision` snapshot. That record is the approved quote snapshot: the commercial facts that were approved internally, plus provenance back to the staged offer and workflow item.

Actual downstream execution now lives separately in `BuyExecution` and `BuyExecutionEvent`.

- `BuyDecision` = approved internal procurement intent snapshot
- `BuyExecution` = what was actually ordered, confirmed, received, and invoiced

This keeps the approval trail stable while still letting operators record operational reality.

Supplier qualification is now tracked separately through `SupplierQualification` and `SupplierQualificationEvent`. Missing qualification defaults to conservative handling. Blocked suppliers cannot follow the normal approval-to-buy path, while unknown or restricted suppliers require explicit operator intent and remain clearly flagged in the queue and buy decision snapshot.

`BuyExecution` supports bounded fulfilment and reconciliation states:

- fulfilment: `NOT_STARTED`, `ORDER_PLACED`, `ORDER_CONFIRMED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`
- reconciliation: `NOT_RECONCILED`, `MATCHED`, `PRICE_DRIFT`, `QUANTITY_DRIFT`, `CURRENCY_MISMATCH`, `REQUIRES_REVIEW`

Reconciliation is deterministic and compares the approved quote snapshot against actual order and invoice terms, including unit-price drift, currency mismatch, MOQ or quantity variance, and basic availability drift.

Supplier performance scorecards are computed from real `BuyDecision` and `BuyExecution` history. They expose simple operational metrics such as fulfilment rate, quote-to-order drift, quote-to-invoice drift, drift incidents, qualification risk burden, and a deterministic score with `STRONG`, `WATCH`, or `RISKY` tiering.

### Trade Opportunities And Blind Broker Drafts

The backend now also carries an internal `TradeOpportunity` layer for brokered deal work. This is the internal commercial opportunity record that sits above staged supplier offers and below any actual sell-side execution.

- `BuyDecision` = approved supplier-side buy snapshot
- `BuyExecution` = actual supplier-side order, receipt, and invoice outcome
- `TradeOpportunity` = internal brokered deal record spanning opportunity, buy linkage, sell intent, and controlled outreach

Trade opportunities can be opened from promising staged offers, workflow items, approved buy decisions, or explicit operator action. The system keeps one active deal per staged offer by default, computes simple viability signals such as estimated margin and qualification risk, and links the deal forward as buying progresses.

Blind broker messaging is draft-only in this pass. `TradeOpportunityMessagingPolicy` and `TradeMessageDraft` enforce conservative defaults:

- supplier identity is blocked from buyer-facing drafts
- buyer identity is blocked from supplier-facing drafts
- forwarded raw headers and obvious external contact details are flagged
- human approval is required before any send state

This is intentionally not a full CRM, negotiation engine, or autonomous outbound system yet. It does not live-send external broker messages automatically, manage counterparties as a full sales pipeline, ingest invoices or contracts, or expose suppliers and buyers directly to each other.

### Shadow Mode, Feedback, And Readiness Gating

The backend now also carries a shadow-mode proving layer for automation trust. This does not enable autonomous sending. It records operator judgment, computes bounded readiness metrics, and makes explicit eligibility decisions for tighter automation classes.

- `AutomationReadinessPolicy` stores the current operating mode and explicit thresholds
- `OperatorValidationFeedback` stores operator ground truth on extraction quality, supplier resolution, signal usefulness, deal quality, and draft safety
- evaluation metrics are computed on demand from recent offers, workflow items, drafts, and feedback

The readiness layer is intentionally conservative:

- live autonomous sending remains blocked in this pass
- human approval is still required before any send state
- internal operators can see whether readiness is blocked by low sample size, weak extraction precision, weak supplier resolution precision, weak signal usefulness, or draft policy cleanliness

The backend now also carries a deterministic correction and source-learning layer. This is not model retraining or unrestricted automation. It records exact operator-corrected offer values, keeps an audit trail, and turns repeated corrections into bounded future hints.

- `OfferCorrection` stores the corrected supplier, product, manufacturer, pricing, MOQ, and availability values for a staged offer
- `OfferCorrectionEvent` records correction lifecycle actions such as created, applied, superseded, and rejected
- `SourceReliabilityProfile` tracks whether a sender/domain/template pattern is trusted, watch, or risky based on accepted, rejected, and corrected samples
- template fingerprints are derived from sender, subject shape, segment kinds, attachment types, and normalized body structure
- corrections can improve future supplier suggestions, product alias matching, and manufacturer hints
- corrections only improve hints and ranking; they do not bypass qualification, review, promotion, or sending guardrails

This is a proving layer, not a generic analytics platform. It is meant to answer whether the current system is reliable enough for future tightening, not to replace the existing review-first workflow.

This is intentionally not a full procurement or compliance system yet. It does not create purchase orders, vendor contracts, ERP-grade multi-line receiving, invoice OCR, or external ERP integrations.

### AI Fallback Constraints

AI remains a last resort:

- deterministic extraction runs first
- AI is only used for unclear but commercially relevant body content
- AI outputs are staged as candidate offers
- AI does not write Product, Supplier, SupplierPriceItem, InventorySnapshot, or SalesRecord directly
- sparse/null-heavy extraction is preferred over guessing

### PDF/Image Handling

- CSV/XLSX attachments keep the existing import-first behavior
- PDF attachments now attempt embedded-text extraction and stay review-first even when usable text is found
- image attachments now attempt OCR text extraction and stay review-first even when usable text is found
- attachment metadata and extracted text/table previews are preserved for review and downstream extraction

### Email Triage Controls

Inbound email now applies a deterministic triage step before any AI body escalation. Useful env vars:

- `OPENAI_EMAIL_REVIEW_ENABLED`
- `OPENAI_EMAIL_REVIEW_DAILY_LIMIT`
- `OPENAI_EMAIL_REVIEW_PER_SUPPLIER_DAILY_LIMIT`
- `OPENAI_EMAIL_REVIEW_MIN_BUSINESS_SCORE`

The triage layer can mark inbound email as:

- auto-processed when it is already structured and clear
- ignored or rejected when it is weak or non-actionable
- AI-review-eligible only when it is commercially meaningful but structurally unclear
- manual-review-required when AI spend is blocked by limits or policy

### Endpoints

- `POST /api/imports/supplier-price-list`
- `POST /api/imports/inventory`
- `POST /api/imports/sales`
- `GET /api/inventory`
- `GET /api/inventory/stock-risk`
- `GET /api/customers`
- `GET /api/customers/:id`
- `GET /api/customers/contact-opportunities`

All upload endpoints expect `multipart/form-data` with a `file` field.
CSV and XLSX uploads are capped at 10 MB by the API upload middleware.
Template guidance is documented in [docs/import-templates.md](docs/import-templates.md).

The inventory and customer endpoints are read-only operator/dashboard
foundation APIs. They expose stock summaries, deterministic stock-risk reasons,
customer summaries, recent sales/opportunity/RFQ context, and read-only contact
candidate rows. They do not create outreach records, send external messages, or
publish customer-facing offers.

Supplier price list imports also accept:

- `supplierName`
- `sourceDate`
- `currencyCode`

### Usage Examples

From `apps/api`:

```bash
curl -X POST http://localhost:4000/api/imports/supplier-price-list ^
  -F "file=@fixtures/imports/supplier-price-list.csv" ^
  -F "supplierName=Ambe Pharma Sourcing" ^
  -F "sourceDate=2026-04-01" ^
  -F "currencyCode=USD"
```

```bash
curl -X POST http://localhost:4000/api/imports/inventory ^
  -F "file=@fixtures/imports/inventory.csv"
```

```bash
curl -X POST http://localhost:4000/api/imports/sales ^
  -F "file=@fixtures/imports/sales.csv"
```

Each import returns:

- `importBatchId`
- `summary.totalRows`
- `summary.validRows`
- `summary.invalidRows`
- `summary.warnings`
- `errors`

Import batch detail is available through:

- `GET /api/imports/batches`
- `GET /api/imports/batches/:id`

The detail response includes detected columns, warning categories, suggested fixes, duplicate product candidate groups, invalid-row counts, unresolved-product counts, and redacted row error samples for operator review.

### Import Behavior

- CSV and XLSX are both supported.
- Row validation is per-row, so bad rows are collected and reported without crashing the whole import.
- Import diagnostics are stored on the batch as safe metadata. Raw failed-row previews are redacted before the web dashboard displays them.
- Original file metadata is stored on the import batch and supplier price list records.
- Raw product text is preserved exactly as uploaded.
- Candidate product fields are generated for `normalizedName`, `strength`, `formulation`, and `packSize`.
- The importer does not attempt advanced product matching yet. It creates or reuses products on simple normalized name matching and stores raw names as `ProductAlias`.

### Fixture Files

Sample files for local testing live in:

- `apps/api/fixtures/imports/supplier-price-list.csv`
- `apps/api/fixtures/imports/supplier-price-list.xlsx`
- `apps/api/fixtures/imports/inventory.csv`
- `apps/api/fixtures/imports/sales.csv`

### Debugging Env Detection

Run the API and check:

```bash
GET /api/debug/env
```

Example response:

```json
{
  "databaseUrlDetected": true
}
```

### Troubleshooting

If Prisma says `Environment variable not found: DATABASE_URL`:

- Ensure `apps/api/.env` exists. This is the first file Prisma config checks.
- If `apps/api/.env` does not define `DATABASE_URL`, ensure the repo root `.env` exists.
- Ensure the file is named exactly `.env`, not `.env.txt`.
- Ensure the connection string looks like `postgresql://user:password@host.neon.tech/dbname?sslmode=require`.
- Run Prisma through the workspace script, for example `pnpm --filter @ambe/api db:generate`.
- If you run commands manually inside `apps/api`, make sure the current directory is `apps/api`.
- Prisma config resolves env paths from `process.cwd()`, so the working directory matters for where it looks first.
- Prisma logs the database host from `prisma.config.ts` on startup, which helps confirm the correct env file was loaded without exposing secrets.

## Product Normalization

Medicine names are normalized with a rule-based service in [apps/api/src/imports/normalization.ts](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/src/imports/normalization.ts:1). It preserves raw source text and produces:

- canonical `normalizedKey`
- extracted `strength`
- extracted `formulation`
- extracted `packSize`
- confidence label
- structured explanation of the rules applied

Normalization is cautious. It helps group obvious variants like `tabs` and `tablets`, but it does not aggressively auto-merge unlike products.

Detailed rules and limitations are documented in [docs/product-normalization.md](/d:/Users/User/Desktop/ambe-pharma-intelligence/docs/product-normalization.md:1).

### Normalization Preview

Use the debug endpoint to preview normalization without importing data:

```bash
curl "http://localhost:4000/api/debug/normalize?input=Amlodipine%205mg%20tabs%2028"
```

You can also pass multiple `input` query values:

```bash
curl "http://localhost:4000/api/debug/normalize?input=Amlodipine%205mg%20tabs%2028&input=Amlodipine%205%20mg%20tablets%20x%2028"
```

## Opportunity Scoring

The API includes an internal, deterministic opportunity scoring engine for imported supplier, inventory, and sales data.

### Opportunity Types

- `BUY`
- `PUSH`
- `DEAD_STOCK`
- `PRICE_ALERT`
- `LOW_MARGIN`
- `RESTOCK`

### How It Works

The scorer evaluates current product state using:

- latest supplier buy price
- previous supplier buy price when available
- current available stock
- recency of the latest inventory snapshot
- recent 30-day sales velocity
- average recent sale price
- estimated margin percentage

Thresholds and base scores live in [apps/api/src/opportunities/config.ts](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/src/opportunities/config.ts:1).

Each generated opportunity stores:

- `type`
- `score`
- explanation text in `description`
- structured score breakdown and metrics in `metadata`

### Opportunity Endpoints

- `GET /api/opportunities`
- `POST /api/opportunities/regenerate`

Optional filters for listing:

- `type`
- `status`

### Usage Examples

Regenerate opportunities:

```bash
curl -X POST http://localhost:4000/api/opportunities/regenerate
```

List all opportunities:

```bash
curl http://localhost:4000/api/opportunities
```

Filter by type and status:

```bash
curl "http://localhost:4000/api/opportunities?type=RESTOCK&status=OPEN"
```

### Explanation Examples

- `Low stock with positive recent sales velocity over last 30 days.`
- `High stock with no recent sales; potential dead stock risk.`
- `Supplier price lower than recent benchmark with acceptable demand.`

## Email Body Parsing

The API can now parse simple structured supplier email bodies where each line looks like a product offer with a price.

### Endpoint

- `POST /api/email/body/parse-preview`

Send JSON like:

```json
{
  "bodyText": "Amlodipine 5mg tabs 28 - £8.40\nParacetamol 500mg caplets 16 : £1.25"
}
```

### Parsing Rules

- Only line-based structured offers are parsed automatically.
- Supported patterns are simple forms such as:
  - `Amlodipine 5mg tabs 28 - £8.40`
  - `Paracetamol 500mg caplets 16 : £1.25`
  - `Metformin 500mg 28 £3.10`
- Each parsed row extracts:
  - raw product text
  - strength
  - formulation
  - pack size
  - price
  - currency when present
- Each row receives a confidence label:
  - `HIGH`
  - `MEDIUM`
  - `LOW`

### Review-First Behavior

- Only strongly structured email-body rows should be treated as trusted enough for follow-up workflow.
- If the overall body confidence is not `HIGH`, treat it as review-oriented.
- Raw body text is preserved in the preview response.
- Messy prose emails are intentionally not trusted aggressively.

## Telegram Publishing

Telegram publishing is internal-only and manual. Opportunity generation does not auto-publish anything.

### Required Env Vars

Set these in [apps/api/.env.example](/d:/Users/User/Desktop/ambe-pharma-intelligence/apps/api/.env.example:1) / `apps/api/.env`:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_INTERNAL_CHAT_ID=
TELEGRAM_DRY_RUN=true
```

- `TELEGRAM_BOT_TOKEN`: bot token for the internal ops bot
- `TELEGRAM_INTERNAL_CHAT_ID`: Telegram chat or channel ID for the internal ops channel
- `TELEGRAM_DRY_RUN`: when `true`, messages are rendered, logged, and stored as dry-run records without sending to Telegram

If Telegram is not configured, publish endpoints fail safely with a clear error.

### Telegram Routes

- `POST /api/telegram/opportunities/:id/preview`
- `POST /api/telegram/opportunities/:id/publish`
- `POST /api/telegram/opportunities/publish-open`
- `GET /api/telegram/daily-summary/preview`
- `POST /api/telegram/inbound/updates`
- `GET /api/telegram/inbound`

### Usage Examples

Preview a specific opportunity message:

```bash
curl -X POST http://localhost:4000/api/telegram/opportunities/OPPORTUNITY_ID/preview
```

Publish a specific opportunity:

```bash
curl -X POST http://localhost:4000/api/telegram/opportunities/OPPORTUNITY_ID/publish
```

Publish all open opportunities manually:

```bash
curl -X POST http://localhost:4000/api/telegram/opportunities/publish-open
```

Preview the daily summary:

```bash
curl http://localhost:4000/api/telegram/daily-summary/preview
```

### Publishing Behavior

- Plain-text Telegram messages only
- Human-in-the-loop only
- Duplicate unchanged opportunity messages are skipped when an identical open message was already sent
- Publish attempts and outcomes are stored in `TelegramPost`
- Dry-run mode stores a record with dry-run metadata but does not call the Telegram API
- Messages are intentionally short and action-oriented for non-technical operators

### Signal Style

Examples of the simplified internal signal format:

```text
✅ BUY THIS
Product: Amlodipine 5mg 28
Supplier: ABC Pharma
Price: 8.40
Why: Good price and worth buying
What to do: Check and buy if stock is needed
```

```text
📦 TRY TO SELL THIS
Product: Atorvastatin 20mg 28
Stock: 320
Why: We have a lot in stock
What to do: Offer this to customers
```

## Email Signal Forwarding

Internal opportunities can also be previewed and optionally forwarded by email.

### Email Routes

- `POST /api/email/body/parse-preview`
- `POST /api/email/opportunities/:id/preview`
- `POST /api/email/opportunities/:id/send`
- `GET /api/email/daily-summary/preview`
- `POST /api/email/daily-summary/send`

### Required Env Vars

Add these to `apps/api/.env` if you want outbound email enabled through Microsoft Graph:

```bash
EMAIL_ALERTS_ENABLED=false
MICROSOFT_MAIL_TENANT_ID=
MICROSOFT_MAIL_CLIENT_ID=
MICROSOFT_MAIL_CLIENT_SECRET=
MICROSOFT_GRAPH_REFRESH_TOKEN=
MICROSOFT_GRAPH_SENDER_MAILBOX=
INTERNAL_ALERT_EMAIL_RECIPIENTS=
```

- `EMAIL_ALERTS_ENABLED`: enables Microsoft Graph sending
- `MICROSOFT_MAIL_TENANT_ID`: Ambe Bot Mailer Microsoft Entra tenant ID, or `consumers` for a personal Outlook.com account
- `MICROSOFT_MAIL_CLIENT_ID`: Ambe Bot Mailer app registration client ID
- `MICROSOFT_MAIL_CLIENT_SECRET`: Ambe Bot Mailer app registration client secret for app-only business-tenant sending
- `MICROSOFT_GRAPH_REFRESH_TOKEN`: refresh token for delegated sending, useful for personal Outlook.com mailboxes
- `MICROSOFT_GRAPH_SENDER_MAILBOX`: mailbox address used in the Graph `sendMail` call
- `INTERNAL_ALERT_EMAIL_RECIPIENTS`: comma-separated internal recipient list

For backwards compatibility, mail still falls back to the existing `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_CLIENT_ID`, and `MICROSOFT_GRAPH_CLIENT_SECRET` variables if `MICROSOFT_MAIL_*` is not set.

If email alerts are not configured, preview routes still work and send routes fail safely with a clear error.

For a personal Outlook.com mailbox, register the Ambe Bot Mailer app for personal Microsoft accounts, enable public client flows, obtain a delegated refresh token, set `MICROSOFT_MAIL_TENANT_ID=consumers`, and leave `MICROSOFT_MAIL_CLIENT_SECRET` empty. A helper command is available:

```bash
pnpm --filter @ambe/api email:device-code
```

That command prints a device-code sign-in prompt and returns a `MICROSOFT_GRAPH_REFRESH_TOKEN` value you can paste into `apps/api/.env`.

The device-code helper requests delegated Microsoft Graph `Mail.ReadWrite` and `Mail.Send` so the same refresh token can support both inbox polling and the existing outbound email flow.

For direct inbox polling with a business mailbox, also grant Microsoft Graph `Application` permission `Mail.ReadWrite` and admin consent in the same tenant.

## Microsoft Drive Storage App

Account-opening archive and completed draft uploads use a separate Microsoft Graph app registration from email. Configure the Ambe Bot SharePoint Upload app for storage checks and uploads:

```bash
MICROSOFT_STORAGE_TENANT_ID=
MICROSOFT_STORAGE_CLIENT_ID=
MICROSOFT_STORAGE_CLIENT_SECRET=
```

The storage app needs Microsoft Graph `Application` permissions `Sites.ReadWrite.All` and `Files.ReadWrite.All`, and admin consent must be granted. Do not use the Ambe Bot Mailer client ID for SharePoint upload checks.

If the new `MICROSOFT_STORAGE_*` values are missing, storage code falls back to the legacy generic `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, and `MICROSOFT_CLIENT_SECRET` values. Email code does not use those generic storage fallback values.

### Email Behavior

- Plain text emails only
- Internal-only
- Uses the same simplified signal wording as Telegram
- Send attempts are logged
- Outbound email tracking is not persisted in the database yet; this was left out intentionally to keep the implementation small and avoid adding schema complexity before the workflow is proven

## Telegram Inbound File Intake

Internal users can send files to the Telegram bot for intake. The bot accepts Telegram updates through:

- `POST /api/telegram/inbound/updates`

You can inspect processed inbound items through:

- `GET /api/telegram/inbound`

### Required Env Vars

Add these to `apps/api/.env`:

```bash
TELEGRAM_ALLOWED_USER_IDS=123456789
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890
TELEGRAM_POLLING_ENABLED=false
TELEGRAM_POLLING_INTERVAL_MS=5000
```

- `TELEGRAM_ALLOWED_USER_IDS`: comma-separated Telegram user IDs allowed to submit files
- `TELEGRAM_ALLOWED_CHAT_IDS`: comma-separated Telegram chat IDs allowed to submit files
- `TELEGRAM_POLLING_ENABLED`: when `true`, the API polls Telegram `getUpdates` while running locally
- `TELEGRAM_POLLING_INTERVAL_MS`: polling interval in milliseconds for local/dev use

At least one allowlist must be populated. Unknown senders are ignored safely.

### Supported File Types

- CSV
- XLSX
- PDF
- images/photos

### Inbound Behavior

- CSV/XLSX files are downloaded from Telegram and routed into the existing import pipeline when the caption or filename clearly suggests:
  - `supplier` or `price` -> supplier price list
  - `inventory` or `stock` -> inventory
  - `sales` -> sales
- If the import type is unclear, the item is marked for manual review instead of guessed aggressively.
- PDF and image files are stored as inbound items and marked for review only.
- The bot replies in Telegram with a simple acknowledgment and import summary when applicable.

### Local Testing

1. Run the API.
2. Send a CSV/XLSX/PDF/image to the bot from an allowed Telegram user or allowed chat.
3. Configure Telegram to POST updates to:

```bash
POST /api/telegram/inbound/updates
```

4. Inspect stored inbound items:

```bash
curl "http://localhost:4000/api/telegram/inbound"
```

5. Filter by processing status if needed:

```bash
curl "http://localhost:4000/api/telegram/inbound?processingStatus=IMPORTED"
```

### Private Chat Polling For Local Dev

If you want approved internal users to message the bot privately from their phones while the local API is running, enable polling in `apps/api/.env`:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALLOWED_USER_IDS=123456789
TELEGRAM_POLLING_ENABLED=true
TELEGRAM_POLLING_INTERVAL_MS=5000
```

Then start the API:

```powershell
pnpm --filter @ambe/api dev
```

On startup the API logs whether Telegram polling is enabled and which interval it is using.

With polling enabled:

1. Open a private chat with the bot on your phone.
2. Send a CSV, XLSX, PDF, or photo from an allowed Telegram user.
3. Leave the local API running.
4. Inspect the results:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/telegram/inbound"
```

Polling is optional and local/dev-oriented. The webhook endpoint at `POST /api/telegram/inbound/updates` still works unchanged.

Runtime status is visible in `GET /api/system/workers` and included in the Telegram readiness details. Telegram polling processes each update independently and records safe failure counters. Because Telegram `getUpdates` uses a single monotonically increasing offset, the poller advances past a failed update after logging a safe error so one bad update cannot poison the whole intake loop. Durable inbound idempotency still comes from the `telegramChatId` and `telegramMessageId` unique key. Retry and dead-letter expectations are documented in [docs/operations-runbook.md](docs/operations-runbook.md).

### Local Fixture Replay

For local development, sample Telegram update payloads live in:

- `apps/api/fixtures/telegram-inbound/supplier-price-list-update.json`
- `apps/api/fixtures/telegram-inbound/inventory-update.json`
- `apps/api/fixtures/telegram-inbound/pdf-review-update.json`
- `apps/api/fixtures/telegram-inbound/photo-review-update.json`

These fixtures are dev-only helpers for replaying Telegram-style JSON into the existing inbound endpoint. They do not change webhook behavior in production.

From the repo root in PowerShell:

```powershell
pnpm --filter @ambe/api telegram:replay fixtures/telegram-inbound/supplier-price-list-update.json
```

```powershell
pnpm --filter @ambe/api telegram:replay fixtures/telegram-inbound/inventory-update.json
```

```powershell
pnpm --filter @ambe/api telegram:replay fixtures/telegram-inbound/pdf-review-update.json
```

```powershell
pnpm --filter @ambe/api telegram:replay fixtures/telegram-inbound/photo-review-update.json
```

If you prefer to post the fixtures directly from PowerShell:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/telegram/inbound/updates" `
  -ContentType "application/json" `
  -InFile "apps/api/fixtures/telegram-inbound/supplier-price-list-update.json"
```

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/telegram/inbound"
```

For import-oriented fixtures, keep the allowlist env vars aligned with the sample IDs unless you edit the JSON:

```bash
TELEGRAM_ALLOWED_USER_IDS=123456789
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890
```

The CSV/XLSX fixtures only verify routing and authorization until the referenced Telegram file IDs are replaced by real files from Telegram. PDF and photo fixtures are useful immediately for review-required flow testing because they do not need file download/import to exercise the routing behavior.

### Optional Legacy Local Postgres

`docker-compose.yml` is still in the repo as an optional legacy local Postgres setup, but Neon is now the default and recommended database workflow.
