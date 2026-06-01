# Operator Corrections

Operator corrections are append-only records for fixing extracted supplier-offer fields during review.

## What Operators Can Correct

The review detail page supports correction fields for:

- supplier name
- product text and normalized product name
- manufacturer
- unit price
- currency
- minimum order quantity
- availability
- correction note

The original `EmailDerivedOffer` row is preserved. Corrections are stored in `OfferCorrection` and linked back to the review workflow item, inbound email, and extracted offer.

## Review Flow

Operators can either save a correction or save a correction and approve the offer in one action.

When approving after a correction:

- the correction is saved first;
- operator validation feedback is recorded;
- approval remains an explicit operator action;
- the buy decision snapshot uses the latest applied correction for corrected commercial values;
- original extracted values remain available through the source offer and buy-decision metadata.

Corrections do not auto-approve AI fallback items, do not auto-promote staged offers, and do not mutate canonical `Supplier` or `Product` records unless a future explicit operator action is added for that purpose.

The review detail page shows corrections already saved on the current offer and recent applied corrections from the same sender or source template. These related corrections are context for the operator; they do not mutate the reviewed offer or bypass approval.

## Feedback and Learning

Correction submissions also create `OperatorValidationFeedback` rows:

- `EXTRACTION / PARTIALLY_CORRECT` for corrected extracted facts;
- `SUPPLIER_RESOLUTION / PARTIALLY_CORRECT` when supplier fields are corrected.

The existing corrections service refreshes source reliability profiles after corrections. Future matching can use those records as bounded hints, but promotion and buy decisions still require the existing review and qualification gates.

## Audit Boundaries

Each correction records actor, timestamp, note, corrected fields, and safe provenance metadata. Audit metadata avoids raw email bodies, raw HTML, credentials, connection strings, tokens, and API keys.

Current limitation: correction events are visible in correction history, while the combined workflow audit endpoint still focuses on workflow, buy-decision, and execution events.
