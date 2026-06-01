# Audit History

Ambe Pharma Intelligence uses the existing workflow-specific event tables for
commercial audit history. There is no separate generic audit table in this
pass.

## Event Sources

The main commercial decision trail is composed from:

- `OfferWorkflowEvent` for review queue actions such as review start, approve,
  reject, needs-info, mark ordered, close, assign, and notes.
- `BuyDecisionEvent` for buy approval, rejection, cancellation, order status,
  and order reference changes.
- `BuyExecutionEvent` for order placement, confirmation, receipt, invoice, and
  reconciliation state changes.
- `OfferCorrectionEvent` for operator corrections, superseded corrections,
  rejected corrections, and correction notes.
- `TradeOpportunityEvent` for deal creation, status/stage changes, draft
  generation, draft approval/rejection, buyer/supplier outreach progression, and
  deal closure.

## Visible Surfaces

Review detail pages call:

```text
GET /api/review-queue/workflows/:id/audit-history
```

That endpoint returns one chronological stream for the review item and linked
commercial entities: review workflow, buy decision, execution, corrections, and
trade opportunities.

The deals dashboard shows recent `TradeOpportunityEvent` entries for each trade
opportunity so operators can see how a deal moved through status and stage
changes.

## Actor And Source Rules

Operator routes resolve actor identity from internal API auth and store:

- `actorType`
- `actorIdentifier`
- event timestamp
- previous and new status/stage fields where the model supports them
- note
- safe metadata

Commercial metadata is normalized under `metadata.commercialAudit` where
available. It stores safe source references such as:

- `inboundEmailId`
- `emailDerivedOfferId`
- `offerWorkflowItemId`
- `buyDecisionId`
- `buyExecutionId`
- `sourceKind`
- `sourceReviewReason`

It can also store confidence fields and changed field names.

## Safety Limits

Audit history must not copy raw email bodies, raw HTML, attachment bytes, Graph
tokens, API keys, database URLs, cookies, or authorization headers. The
commercial audit metadata helper redacts sensitive-looking metadata keys before
events are stored.

Corrections preserve original extracted values on the source offer and append
operator corrections as separate `OfferCorrection` records. Correction events
can improve future matching hints, but they do not bypass review or directly
mutate canonical supplier/product records.

## Current Limitations

- Audit history is append-only per workflow-specific event table, not a global
  immutable ledger table.
- The review audit endpoint is the most complete consolidated view. Other API
  endpoints may still expose only their local event stream.
- Telegram failed-update retry is operationally documented rather than stored as
  a commercial decision event unless it creates or changes a business record.
