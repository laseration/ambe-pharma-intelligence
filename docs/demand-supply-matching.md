# Demand/Supply Matching

`DemandSupplyMatch` is a review-first pre-trade candidate.

It connects:

- approved, non-expired `CustomerDemandSignal` rows with an existing `productId`
- recent, available `SupplierPriceItem` rows for the same product
- approved `CommercialIntelItem` context where relevant

It is not a `TradeOpportunity` and it does not create one automatically.

## Safety

Demand/supply matching does not:

- buy or sell stock
- contact customers or suppliers
- send email, Telegram, Microsoft Graph, or OpenAI requests
- create `Product`, `Customer`, `Supplier`, `SupplierPriceItem`, `BuyDecision`, or `TradeOpportunity`
- change supplier trust
- change opportunity scores

## API

Internal routes:

```text
GET /api/demand-supply-matches
GET /api/demand-supply-matches/:id
POST /api/demand-supply-matches/generate-preview
POST /api/demand-supply-matches/generate
PATCH /api/demand-supply-matches/:id
```

Patch actions are limited to:

- `REVIEW`
- `REJECT`
- `EXPIRE`

There is no promote-to-trade route in this pass.

## Matching Rules V0

A candidate is generated only when:

- customer demand is `APPROVED`
- customer demand is not expired
- customer demand has an existing `productId`
- supplier price item has the same `productId`
- supplier price item has `unitPrice` and `currencyCode`
- supplier price item is available
- supplier price item is recent according to the opportunity lookback window

Currency mismatches create a low-confidence candidate with a `currency_mismatch` risk flag and no margin calculation.

When customer target price and supplier price share a currency, the per-unit estimated margin is:

```text
targetPrice - supplierUnitPrice
```

Negative estimated margin is flagged for review.

## Future Work

A later phase may add an operator-approved promotion from a reviewed match to a `TradeOpportunity`. That should remain explicitly review-gated and should reuse the existing trade workflow safely.
