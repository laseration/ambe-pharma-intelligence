# Full Email Intelligence Demo

This guide walks through the current local email-intelligence workflow end to end.

It covers:

1. clean supplier offer
2. AI-assisted supplier offer
3. Dad commercial intel note
4. customer request
5. demand/supply match generation
6. demand/supply match review
7. diagnostics

## Safety Boundary

The demo should never automatically:

- contact customers
- contact suppliers
- send email
- send Telegram messages
- place orders
- buy or sell stock
- create products, customers, or suppliers from AI output
- promote a `DemandSupplyMatch` into a `TradeOpportunity`
- expose a `PROMOTE_TO_TRADE` or customer-demand `MATCHED` action

The only canonical supplier price mutation in this workflow is the existing reviewed supplier-offer path:

`EmailDerivedOffer -> OfferWorkflowItem approval -> SupplierPriceList / SupplierPriceItem`

`CommercialIntelItem`, `CustomerDemandSignal`, and `DemandSupplyMatch` are review-first records.

## Prerequisites

From the repo root:

```bash
pnpm install
```

Create `apps/api/.env` from `apps/api/.env.example`.

Minimum useful local env:

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
INTERNAL_API_KEY=dev-internal-key
INTERNAL_ADMIN_API_KEY=dev-admin-key
EMAIL_INBOUND_ALLOWED_SENDERS=demo@ambe.test,dad@ambe.test,buyer@customer.test,supplier.test
EMAIL_INBOUND_SUPPLIER_MAPPINGS=supplier.test=Ambe Pharma Sourcing,demo@ambe.test=Ambe Pharma Sourcing
OPENAI_PARSER_ENABLED=false
OPENAI_API_KEY=
```

For live AI extraction demos, also set:

```bash
OPENAI_PARSER_ENABLED=true
OPENAI_API_KEY=your-local-key
```

`OPENAI_PARSER_ENABLED` controls supplier-offer fallback, commercial-intel extraction, and customer-request extraction. `OPENAI_EMAIL_REVIEW_*` variables are legacy/review-triage budget controls and do not enable parser fallback.

For the web app to reach the API:

```bash
INTERNAL_API_BASE_URL=http://127.0.0.1:4000/api
INTERNAL_API_KEY=dev-internal-key
INTERNAL_ADMIN_API_KEY=dev-admin-key
```

## Database Setup

Apply migrations and generate Prisma client:

```bash
pnpm --filter @ambe/api db:migrate
pnpm --filter @ambe/api db:generate
```

Do not run `prisma migrate reset` on a shared or valued Neon database.

Optional seed for a disposable local/dev database:

```bash
pnpm --filter @ambe/api db:seed
```

The seed creates sample product/supplier/customer data around `Paracetamol 500mg Tablets`, `Ambe Pharma Sourcing`, and `City Care Pharmacy`. It resets seed-owned core data, so do not run it against a database where you need to preserve imported demo records.

## Start Apps

In separate terminals:

```bash
pnpm --filter @ambe/api dev
```

```bash
pnpm --filter @ambe/web dev
```

Open:

- Web dashboard: `http://localhost:3000/dashboard`
- API base: `http://localhost:4000/api`

## Helper: Ingest A Demo Email

The direct local ingest endpoint is:

```text
POST /api/email/inbound/messages
```

It requires the admin internal API key.

PowerShell helper shape:

```powershell
$headers = @{
  "x-internal-api-key" = "dev-admin-key"
  "x-internal-caller-name" = "manual-demo"
  "content-type" = "application/json"
}

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/email/inbound/messages" `
  -Headers $headers `
  -Body ($payload | ConvertTo-Json -Depth 10)
```

Inspect raw/staged emails:

- UI: `/dashboard/inbox`
- API: `GET /api/email/inbound/messages?take=20`

## 1. Clean Supplier Offer

Goal: deterministic supplier-offer parsing and, if product/supplier resolution is strong, supplier price intelligence.

Use a sender that is allowed and mapped to an existing supplier.

```powershell
$payload = @{
  sourceSystem = "MANUAL_DEMO"
  externalMessageId = "demo-clean-offer-001"
  from = "pricing@supplier.test"
  fromName = "Demo Supplier"
  subject = "Clean price"
  bodyText = "Paracetamol 500mg Tablets - USD 1.25"
  receivedAt = (Get-Date).ToString("o")
  attachments = @()
}
```

Expected:

- `InboundEmail` appears in `/dashboard/inbox`.
- `EmailDerivedOffer` is created.
- Deterministic parsing is used.
- If the selected product and supplier resolve strongly, a `SupplierPriceItem` can be created without review.
- If product/supplier resolution is not strong, the item appears in `/dashboard/review`.

Inspect:

- UI: `/dashboard/inbox`
- UI: `/dashboard/review`
- UI: `/dashboard/diagnostics`
- API: `GET /api/review-queue/workflows?onlyOpen=true`

What should not happen:

- No customer is contacted.
- No Telegram or email is sent.
- No demand/supply match is created until demand exists and generation is run.

## 2. AI-Assisted Supplier Offer

Goal: messy supplier offer becomes a review-first `EmailDerivedOffer`, then operator approval can create supplier price intelligence.

Live parser path requires:

```bash
OPENAI_PARSER_ENABLED=true
OPENAI_API_KEY=...
```

Demo email:

```powershell
$payload = @{
  sourceSystem = "MANUAL_DEMO"
  externalMessageId = "demo-ai-offer-001"
  from = "pricing@supplier.test"
  fromName = "Demo Supplier"
  subject = "Messy supplier offer"
  bodyText = "Hi, can do Amlodipine 5mg tabs 28 at GBP 8.40, MOQ 20, limited stock."
  receivedAt = (Get-Date).ToString("o")
  attachments = @()
}
```

Expected:

- A staged offer is created if the parser extracts useful fields.
- AI-assisted rows stay review-first.
- No `SupplierPriceItem` is created before approval.
- The review item appears in `/dashboard/review`.

Review path:

1. Open `/dashboard/review`.
2. Open the matching review item.
3. Check extracted product, supplier, price, currency, MOQ, evidence, and supplier qualification.
4. Use `Approve to buy` only if the fields are correct.

After approval:

- `BuyDecision` is created or updated.
- `SupplierPriceList` / `SupplierPriceItem` is created or reused when required fields are resolved.
- The action is idempotent; approving again should not duplicate supplier price rows.

Mocked/stubbed parser alternative:

- The acceptance tests prove this without real OpenAI calls.
- Run:

```bash
pnpm --filter @ambe/api test
```

Relevant fixtures:

- `apps/api/src/acceptance/emailIntelligenceFixtures.ts`
- `apps/api/src/email/inbound/__tests__/staging-idempotency.test.ts`
- `apps/api/src/reviewQueue/__tests__/workflowService.test.ts`

## 3. Dad Commercial Intel Note

Goal: Dad-style business memory becomes a review-first `CommercialIntelItem`.

Live parser path requires OpenAI parser enabled.

Demo email:

```powershell
$payload = @{
  sourceSystem = "MANUAL_DEMO"
  externalMessageId = "demo-commercial-intel-001"
  from = "dad@ambe.test"
  fromName = "Dad"
  subject = "Medline insulin warning"
  bodyText = "Don't trust Medline on insulin, they quote but never deliver."
  receivedAt = (Get-Date).ToString("o")
  attachments = @()
}
```

Expected:

- `CommercialIntelItem` is created.
- Likely item type: `SUPPLIER_RELIABILITY_NOTE`.
- Status starts as `NEW`.
- Raw evidence text is preserved.
- Product/supplier IDs may remain null if not safely resolved.

Inspect:

- UI: `/dashboard/commercial-intel`
- API: `GET /api/commercial-intel`
- Detail UI: `/dashboard/commercial-intel/:id`

Review:

- Approve, reject, or expire from the detail page.

What should not happen:

- No product is created.
- No supplier is created.
- Supplier trust is not mutated.
- No supplier price record is created.
- No trade or message is created.

## 4. Customer Request

Goal: buyer demand becomes a review-first `CustomerDemandSignal`.

Live parser path requires OpenAI parser enabled.

Use product wording that can match an existing product if you want to generate demand/supply matches later. With seed data, use `Paracetamol 500mg Tablets`.

Demo email:

```powershell
$payload = @{
  sourceSystem = "MANUAL_DEMO"
  externalMessageId = "demo-customer-request-001"
  from = "buyer@customer.test"
  fromName = "City Care Buyer"
  subject = "Need Paracetamol"
  bodyText = "City Care Pharmacy wants Paracetamol 500mg Tablets. Need 200 packs if price is around USD 3.20."
  receivedAt = (Get-Date).ToString("o")
  attachments = @()
}
```

Expected:

- `CustomerDemandSignal` is created.
- Status starts as `NEW`.
- Request type is likely `SOURCE_PRODUCT`, `REQUEST_QUOTE`, or `BUYER_INTEREST`.
- `quantityRequested` should be `200` if extracted.
- `targetPrice` should be `3.20` and currency `USD` if extracted.
- Product/customer IDs are linked only if existing safe matches are found.

Inspect:

- UI: `/dashboard/customer-requests`
- API: `GET /api/customer-requests`
- Detail UI: `/dashboard/customer-requests/:id`

Review:

- Approve the request from the detail page before generating matches.

What should not happen:

- No customer is created.
- No product is created.
- No supplier price is created.
- No trade is created.
- No email is sent to the customer.

## 5. Generate Demand/Supply Matches

Goal: approved customer demand plus existing supplier price intelligence becomes a `DemandSupplyMatch`.

Prerequisites:

- A `CustomerDemandSignal` is `APPROVED`.
- It has a non-null `productId`.
- It is not expired.
- A recent available `SupplierPriceItem` exists for the same `productId`.
- The supplier price has `unitPrice` and `currencyCode`.

UI path:

1. Open `/dashboard/demand-supply-matches`.
2. Click `Generate latest matches`.

API path:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/demand-supply-matches/generate" `
  -Headers $headers `
  -Body (@{} | ConvertTo-Json)
```

Preview-only API:

```text
POST /api/demand-supply-matches/generate-preview
```

Expected:

- `DemandSupplyMatch` candidates appear in `/dashboard/demand-supply-matches`.
- Generation is idempotent. Running it again refreshes/reuses candidates instead of duplicating the same demand+supplier-price pair.
- Currency mismatch creates a low-confidence candidate with a risk flag and no margin calculation.
- Approved commercial intel may appear as context/risk only.

What should not happen:

- No `TradeOpportunity` is created from generating matches.
- No buy/order action occurs.
- No customer or supplier is contacted.
- No outbound message is sent.

## 6. Review Demand/Supply Match

Open:

- UI: `/dashboard/demand-supply-matches`
- Detail UI: `/dashboard/demand-supply-matches/:id`
- API: `GET /api/demand-supply-matches/:id`

Review the sections:

- customer demand
- supplier price
- margin estimate
- commercial intel context
- risk flags
- rationale
- technical details

Actions:

- `Mark reviewed`
- `Reject`
- `Expire`

API action:

```powershell
$body = @{
  action = "REVIEW"
  note = "Checked in manual demo."
  actorType = "OPERATOR"
  actorIdentifier = "manual-demo"
}

Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/demand-supply-matches/MATCH_ID" `
  -Headers $headers `
  -Body ($body | ConvertTo-Json)
```

Expected:

- `NEW -> REVIEWED` works.
- `NEW/REVIEWED -> REJECTED` works.
- `NEW/REVIEWED -> EXPIRED` works.
- Invalid transitions fail safely.

What should not happen:

- Reviewing a demand/supply match does not create a trade.
- No promote-to-trade action exists in this pass.
- No customer demand `MATCHED` action is exposed.

## 7. Check Diagnostics

Open:

- UI: `/dashboard/diagnostics`
- API: `GET /api/diagnostics/pipeline-summary`

Look for:

- Emails read
- Offers found
- Customer requests found
- Commercial notes found
- Demand matches
- Waiting for review
- Approved into price intelligence
- Latest demand matches
- Things stuck

Diagnostics is read-only. It does not call OpenAI, poll email, send messages, or mutate business records.

## Troubleshooting: No Matches Appear

Check these in order:

1. Customer request is approved.
   - UI: `/dashboard/customer-requests`
   - API: `GET /api/customer-requests?status=APPROVED`

2. Customer request has `productId`.
   - Open the customer request detail page.
   - If product ID is missing, the parser stored raw text but did not safely match an existing product.
   - Use product wording that matches an existing product, for example `Paracetamol 500mg Tablets` with seed data.

3. Supplier price exists for the same product.
   - UI: `/dashboard/diagnostics`
   - Check `Latest supplier price records`.
   - The clean supplier offer or approved supplier offer must create/reuse `SupplierPriceItem`.

4. Supplier price is recent.
   - Matching uses the configured opportunity lookback window.
   - Very old supplier prices are skipped in v0.

5. Supplier price is available.
   - `SupplierPriceItem.isAvailable` must be true.

6. Supplier price has unit price and currency.
   - Missing price/currency prevents matching.

7. Currency mismatch.
   - A mismatch should still create a low-confidence match, but margin is not calculated.

8. OpenAI parser disabled.
   - Commercial intel and customer requests need `OPENAI_PARSER_ENABLED=true` and `OPENAI_API_KEY` for the live manual demo.
   - Use the acceptance tests for a no-network mocked demo.

9. Sender not allowed.
   - Confirm `EMAIL_INBOUND_ALLOWED_SENDERS` contains the exact demo sender or domain.
   - Disallowed senders are ignored safely.

10. Backend not reachable from web.
    - Confirm `INTERNAL_API_BASE_URL=http://127.0.0.1:4000/api` in the web environment.
    - Confirm internal API key env vars match the API.

## Quick Route Reference

Email intake:

- `POST /api/email/inbound/messages`
- `GET /api/email/inbound/messages?take=20`
- `/dashboard/inbox`

Supplier-offer review:

- `GET /api/review-queue`
- `GET /api/review-queue/workflows?onlyOpen=true`
- `GET /api/review-queue/workflows/:id`
- `PATCH /api/review-queue/workflows/:id`
- `/dashboard/review`

Commercial intel:

- `GET /api/commercial-intel`
- `GET /api/commercial-intel/:id`
- `PATCH /api/commercial-intel/:id`
- `/dashboard/commercial-intel`

Customer requests:

- `GET /api/customer-requests`
- `GET /api/customer-requests/:id`
- `PATCH /api/customer-requests/:id`
- `/dashboard/customer-requests`

Demand matches:

- `GET /api/demand-supply-matches`
- `GET /api/demand-supply-matches/:id`
- `POST /api/demand-supply-matches/generate-preview`
- `POST /api/demand-supply-matches/generate`
- `PATCH /api/demand-supply-matches/:id`
- `/dashboard/demand-supply-matches`

Diagnostics:

- `GET /api/diagnostics/pipeline-summary`
- `/dashboard/diagnostics`

## No-Network Acceptance Demo

For repeatable proof without Microsoft Graph or OpenAI:

```bash
pnpm --filter @ambe/api test
```

The acceptance scenarios use mocked parser output and local harnesses. They do not send email, Telegram messages, Microsoft Graph requests, or OpenAI requests.
