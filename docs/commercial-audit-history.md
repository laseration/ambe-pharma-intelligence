# Commercial Audit History

Ambe Pharma Intelligence uses existing domain event tables for commercial audit history rather than a separate append-only audit table.

## Current Coverage

The Prisma schema already has event/history models for:

- review workflow items: `OfferWorkflowEvent`
- buy decisions: `BuyDecisionEvent`
- buy execution/order status: `BuyExecutionEvent`
- offer corrections: `OfferCorrectionEvent`
- automation readiness policy decisions: `AutomationReadinessEvent`
- trade opportunities: `TradeOpportunityEvent`
- supplier qualification: `SupplierQualificationEvent`
- account-opening cases: `AccountOpeningCaseEvent`

New commercial decision events now add a `metadata.commercialAudit` block where available. It captures:

- `entityType`
- `entityId`
- `action`
- status transitions
- changed fields where known
- safe source/provenance references such as inbound email ID, staged offer ID, source kind, and review reason
- confidence scores where available

The audit metadata intentionally avoids raw email bodies, raw HTML, connection strings, tokens, secrets, API keys, and source block text.

## Review Workflow Audit Endpoint

The review queue exposes a combined audit-history endpoint:

```text
GET /api/review-queue/workflows/:id/audit-history
```

It returns chronological events for:

- the review workflow item
- the linked buy decision, when present
- the linked buy execution, when present

The review detail page displays this history in the “Audit History” section for each visible offer row.

## Known Limitations

- The audit log is domain-event based, not a global append-only ledger.
- Existing older events may not have `metadata.commercialAudit`.
- Event metadata stores safe provenance references, not full raw source text.
- Read requests are not logged to avoid noisy and low-value audit rows.
- Field-level before/after is currently limited to status transitions, changed field names, and safe action metadata.

## Recommended Next Steps

- Add a buy-decision detail audit endpoint if operators need history outside the review screen.
- Add correction-entry UI that writes explicit `OfferCorrectionEvent` rows from the review page.
- Add observability dashboards for audit event volume and failed commercial mutations.
- Consider a dedicated immutable audit ledger only if compliance requirements exceed the current domain-event model.
