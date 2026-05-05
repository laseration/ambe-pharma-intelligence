# Email Intelligence Acceptance Demo

This demo suite proves the current internal email intelligence pipeline with realistic sample emails. It is test-only: no Microsoft Graph calls, no real OpenAI calls, no outbound email, and no canonical mutations outside the in-memory test harnesses.

## Covered Scenarios

1. Clean supplier offer
   - `Paracetamol 500mg caplets 16 - £1.25`
   - Expected: inbound email stored, deterministic EmailDerivedOffer created, non-AI path used, existing product/supplier allows auto-promotion to SupplierPriceItem.

2. Messy AI-assisted supplier offer
   - `Hi, can do Amlodipine 5mg tabs 28 at £8.40, MOQ 20, limited stock.`
   - Expected: OpenAI output is mocked, AI-assisted EmailDerivedOffer is review-first, no SupplierPriceItem before approval, approval creates one idempotent SupplierPriceItem.

3. Dad supplier reliability note
   - `Don’t trust Medline on insulin, they quote but never deliver.`
   - Expected: CommercialIntelItem with `SUPPLIER_RELIABILITY_NOTE`, status `NEW`, no Product/Supplier/SupplierPriceItem creation, approval can make it eligible for read-only opportunity context.

4. Manual buy trigger
   - `If anyone offers Pregabalin 150mg below £3.20 buy quickly, I know two buyers looking.`
   - Expected: CommercialIntelItem with `MANUAL_BUY_TRIGGER` and/or `BUYER_DEMAND_SIGNAL`, price threshold `3.20`, currency `GBP`, approval makes it read-only context only.

5. Mixed supplier offer plus intel
   - `Zenith can do Ozempic 0.5mg at £87. Also Amit says stock is tight and price likely rises next week.`
   - Expected: supplier-offer staging and commercial-intel extraction are independent; one path failing must not block the other.

6. Non-actionable admin email
   - `Thanks, see attached invoice / meeting notes / regards`
   - Expected: no commercial-intel parser spend, no CommercialIntelItem, no EmailDerivedOffer unless a real offer exists.

## Where The Fixtures Live

Shared fixture text lives in:

`apps/api/src/acceptance/emailIntelligenceFixtures.ts`

The tests consume those fixtures from the existing harnesses:

- `apps/api/src/email/inbound/__tests__/staging-idempotency.test.ts`
- `apps/api/src/commercialIntel/__tests__/service.test.ts`
- `apps/api/src/reviewQueue/__tests__/workflowService.test.ts`
- `apps/api/src/opportunities/__tests__/scoring.test.ts`

## OpenAI Mocking

The suite does not call OpenAI.

Supplier-offer AI fallback is represented by a mocked `textParsing` result with:

- `parsingSource: "OPENAI_FALLBACK"`
- `aiFallbackUsed: true`
- structured parsed rows

Commercial-intel extraction uses `createCommercialIntelService` with a mocked parser response.

## Run

```bash
pnpm --filter @ambe/api test
```

For full validation:

```bash
pnpm --filter @ambe/api build
pnpm --filter @ambe/api test
pnpm --filter @ambe/web build
pnpm --filter @ambe/web lint
git diff --check
```

## Manual Local Demo Notes

Use the sample bodies above in the email intake API or by forwarding from an allowlisted sender in a local environment. Keep `OPENAI_PARSER_ENABLED=false` unless you intentionally want to exercise a real parser call. The acceptance tests are the safer repeatable demo because they mock parser output and do not contact Graph or OpenAI.
