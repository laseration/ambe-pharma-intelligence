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
```

## Database

The API uses Neon PostgreSQL with Prisma. Prisma lives in `apps/api/prisma`.

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

Required Graph permission for this mode:

- `Mail.ReadWrite` as an `Application` permission

`Mail.ReadWrite` is needed because the poller reads inbox messages and marks them as read after ingestion. The existing outbound send flow still requires `Mail.Send`.

Recommended pilot path:

1. create a dedicated mailbox such as `supplier-intake@...`
2. point `MICROSOFT_GRAPH_SENDER_MAILBOX` at that mailbox
3. use app-only Graph auth with `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, and `MICROSOFT_GRAPH_TENANT_ID`
4. grant Microsoft Graph `Application` permission `Mail.ReadWrite` and admin consent
5. enable `EMAIL_INBOUND_POLLING_ENABLED=true`
6. restrict intake with `EMAIL_INBOUND_ALLOWED_SENDERS`
7. add `EMAIL_INBOUND_SUPPLIER_MAPPINGS` for direct supplier domains or addresses where deterministic mapping is safe

The poller reads unread inbox mail oldest-first, processes each message through the existing inbound email intake flow, marks successfully handled or safely skipped messages as read, and continues past one bad message instead of stopping the whole loop.

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
- product resolution selected an existing canonical product
- entity resolution confidence is high
- AI was not required for the extracted offer

Everything else remains staged or review-required. AI-generated candidates never write canonical business records directly before review. After an operator explicitly approves a reviewed offer to buy, the approved quote can be persisted as canonical supplier price intelligence when product, supplier, price, and currency are resolved.

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

This workflow sits on top of staged offers. AI-assisted offers remain review-first. Approval to buy creates or updates the approved quote snapshot and, when the required fields are resolved, creates or reuses the linked canonical supplier price intelligence. It is not a generic BPM engine.

### Commercial Intel From Email

Inbound email also has a separate commercial-intel extraction path for messy internal notes such as supplier reliability warnings, buyer demand, manual buy/sell triggers, market notes, expiry rules, product advice, and contact notes.

Commercial intel is stored as `CommercialIntelItem`, not `EmailDerivedOffer`. It is review-first and does not automatically buy stock, send emails, create products, create suppliers, change supplier trust, or write supplier price intelligence.

`OPENAI_PARSER_ENABLED` controls this commercial-intel extraction as well as supplier-offer parser fallback. Supplier-offer parsing remains separate: quote-like product+price rows still go through the existing offer parser and staging pipeline.

Internal API routes are available under `/api/commercial-intel` for listing, detail lookup, approve/reject/expire actions, and parse preview.

Current first pass stores and reviews approved intel. Approved, non-expired intel can appear as read-only opportunity context, but it does not change opportunity scores.

### Customer Requests From Email

Inbound email also has a separate customer-demand extraction path for buyer/customer requests such as product sourcing, quote requests, availability checks, buyer interest, and repeat demand.

Customer demand is stored as `CustomerDemandSignal`, not `EmailDerivedOffer` or `CommercialIntelItem`. Supplier offers remain supplier-side product+price quotes. Commercial intel remains business memory/context. Customer demand is review-first and does not automatically buy stock, send emails, create products, create customers, create supplier price records, or create trade opportunities in this pass.

`OPENAI_PARSER_ENABLED` controls customer-demand extraction. A cheap deterministic request-language gate runs before AI, so obvious admin messages and supplier offers do not spend parser calls.

Internal API routes are available under `/api/customer-requests` for listing, detail lookup, approve/reject/expire actions, and parse preview.

The internal dashboard for reviewing these demand signals is available at `/dashboard/customer-requests`.

### Demand/Supply Matches

Approved customer demand can be compared against existing supplier price intelligence to create review-first `DemandSupplyMatch` candidates.

This is a pre-trade layer, not a `TradeOpportunity`. It uses approved, non-expired `CustomerDemandSignal` rows with an existing `productId` and recent available `SupplierPriceItem` rows for the same product. Approved `CommercialIntelItem` records may appear as context or risk flags only.

Demand/supply matching does not automatically buy stock, sell stock, contact customers, contact suppliers, send outbound messages, create products, create customers, create suppliers, create supplier price items, create buy decisions, or create trade opportunities.

Internal API routes are available under `/api/demand-supply-matches` for listing candidates, previewing generation, generating idempotent candidates, and review/reject/expire actions. No promote-to-trade action is exposed in this pass.

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
- `OPENAI_PARSER_ENABLED` controls OpenAI fallback inside the supplier-offer parser, commercial-intel extraction, and customer-request extraction
- AI is only used for unclear but commercially relevant body content
- AI outputs are staged as candidate offers
- AI does not write Product, Supplier, SupplierPriceItem, InventorySnapshot, or SalesRecord before human approval
- sparse/null-heavy extraction is preferred over guessing

### PDF/Image Handling

- CSV/XLSX attachments keep the existing import-first behavior
- PDF attachments now attempt embedded-text extraction and stay review-first even when usable text is found
- image attachments now attempt OCR text extraction and stay review-first even when usable text is found
- attachment metadata and extracted text/table previews are preserved for review and downstream extraction

### Email Triage Controls

Inbound email now applies a deterministic triage step before review-budget decisions. These legacy/review-triage env vars do not control parser fallback:

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

All upload endpoints expect `multipart/form-data` with a `file` field.

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

### Import Behavior

- CSV and XLSX are both supported.
- Row validation is per-row, so bad rows are collected and reported without crashing the whole import.
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
MICROSOFT_GRAPH_TENANT_ID=
MICROSOFT_GRAPH_CLIENT_ID=
MICROSOFT_GRAPH_CLIENT_SECRET=
MICROSOFT_GRAPH_REFRESH_TOKEN=
MICROSOFT_GRAPH_SENDER_MAILBOX=
INTERNAL_ALERT_EMAIL_RECIPIENTS=
```

- `EMAIL_ALERTS_ENABLED`: enables Microsoft Graph sending
- `MICROSOFT_GRAPH_TENANT_ID`: Microsoft Entra tenant ID, or `consumers` for a personal Outlook.com account
- `MICROSOFT_GRAPH_CLIENT_ID`: app registration client ID
- `MICROSOFT_GRAPH_CLIENT_SECRET`: app registration client secret for app-only business-tenant sending
- `MICROSOFT_GRAPH_REFRESH_TOKEN`: refresh token for delegated sending, useful for personal Outlook.com mailboxes
- `MICROSOFT_GRAPH_SENDER_MAILBOX`: mailbox address used in the Graph `sendMail` call
- `INTERNAL_ALERT_EMAIL_RECIPIENTS`: comma-separated internal recipient list

If email alerts are not configured, preview routes still work and send routes fail safely with a clear error.

For a personal Outlook.com mailbox, register the app for personal Microsoft accounts, enable public client flows, obtain a delegated refresh token, set `MICROSOFT_GRAPH_TENANT_ID=consumers`, and leave `MICROSOFT_GRAPH_CLIENT_SECRET` empty. A helper command is available:

```bash
pnpm --filter @ambe/api email:device-code
```

That command prints a device-code sign-in prompt and returns a `MICROSOFT_GRAPH_REFRESH_TOKEN` value you can paste into `apps/api/.env`.

The device-code helper requests delegated Microsoft Graph `Mail.ReadWrite` and `Mail.Send` so the same refresh token can support both inbox polling and the existing outbound email flow.

For direct inbox polling with a business mailbox, also grant Microsoft Graph `Application` permission `Mail.ReadWrite` and admin consent in the same tenant.

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
