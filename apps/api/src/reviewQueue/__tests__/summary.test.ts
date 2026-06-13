import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReviewSummary, describeReviewReason } from '../summary';

test('buildReviewSummary maps explicit review reason codes into operator-friendly text', () => {
  const cases = [
    {
      reason: 'unresolved_supplier',
      expectedReviewReason: 'Unresolved supplier',
      missingOrUnclear: /could not be resolved safely/i,
      suggestedAction: /confirm which supplier sent the offer/i,
    },
    {
      reason: 'weak_product_match',
      expectedReviewReason: 'Weak product match',
      missingOrUnclear: /could not match it strongly enough/i,
      suggestedAction: /strength, formulation, and pack size/i,
    },
    {
      reason: 'missing_price',
      expectedReviewReason: 'Missing price',
      missingOrUnclear: /no safe price could be extracted/i,
      suggestedAction: /confirm the unit price/i,
    },
    {
      reason: 'missing_currency',
      expectedReviewReason: 'Missing currency',
      missingOrUnclear: /currency is missing or unclear/i,
      suggestedAction: /confirm the currency/i,
    },
    {
      reason: 'ocr_text_too_weak',
      expectedReviewReason: 'OCR text too weak',
      missingOrUnclear: /too weak or incomplete/i,
      suggestedAction: /correct any OCR mistakes/i,
    },
    {
      reason: 'source_trust_too_low',
      expectedReviewReason: 'Source trust too low',
      missingOrUnclear: /not trusted enough/i,
      suggestedAction: /verify the sender and supplier identity/i,
    },
    {
      reason: 'ai_candidate_review_only',
      expectedReviewReason: 'AI candidate kept review-only',
      missingOrUnclear: /ai found a possible commercial offer/i,
      suggestedAction:
        /check the extracted fields against the original message/i,
    },
    {
      reason: 'promotion_threshold_missing_or_weak_fields',
      expectedReviewReason: 'Missing or weak offer fields',
      missingOrUnclear: /required fields were still missing or too weak/i,
      suggestedAction: /check product, supplier, price, currency, and moq/i,
    },
    {
      reason: 'no_viable_offer_candidates_extracted',
      expectedReviewReason: 'No safe offer candidates found',
      missingOrUnclear: /no safe offer lines could be extracted/i,
      suggestedAction:
        /confirm supplier, product, price, currency, and moq manually/i,
    },
  ];

  for (const entry of cases) {
    const summary = buildReviewSummary({
      processingStatus: 'REVIEW_REQUIRED',
      fileType: 'UNKNOWN',
      fileName: null,
      inferredImportType: null,
      reason: entry.reason,
      sender: 'pricing@supplier.co',
      subjectOrCaption: 'Offer',
    });

    assert.ok(summary);
    assert.equal(summary.reviewReason, entry.expectedReviewReason);
    assert.match(summary.missingOrUnclear, entry.missingOrUnclear);
    assert.match(summary.suggestedAction, entry.suggestedAction);
  }
});

test('describeReviewReason humanizes known reason codes and leaves unknown reasons safe', () => {
  assert.equal(
    describeReviewReason({ reason: 'weak_product_match' }),
    'Weak product match',
  );
  assert.equal(
    describeReviewReason({ reason: ' custom review note ' }),
    'custom review note',
  );
  assert.equal(
    describeReviewReason({ reason: null }),
    'Queued for internal review.',
  );
});

test('buildReviewSummary falls back safely for unknown review reasons', () => {
  const summary = buildReviewSummary({
    processingStatus: 'REVIEW_REQUIRED',
    fileType: 'UNKNOWN',
    fileName: null,
    inferredImportType: null,
    reason: 'Custom review note',
    sender: null,
    subjectOrCaption: null,
  });

  assert.ok(summary);
  assert.equal(summary.reviewReason, 'Automatic routing was not safe enough');
  assert.equal(summary.recognizedContent, 'Inbound item received for review.');
  assert.equal(summary.missingOrUnclear, 'Custom review note');
  assert.equal(
    summary.suggestedAction,
    'Open the item, confirm what it contains, and decide the next manual step.',
  );
});

test('buildReviewSummary maps triage gate codes into specific operator text', () => {
  const cases = [
    {
      triageBlockedReason: 'email_ai_review_disabled',
      expectedReviewReason: 'Commercial email needs manual extraction',
      suggestedAction: /confirm the supplier, products, and prices manually/i,
    },
    {
      triageBlockedReason:
        'unknown_sender_without_attachment_or_supplier_subject',
      expectedReviewReason: 'Unconfirmed sender',
      suggestedAction: /confirm who sent this/i,
    },
    {
      triageBlockedReason: 'business_score_below_ai_threshold',
      expectedReviewReason: 'Weak commercial signals',
      suggestedAction: /confirm the products and prices/i,
    },
    {
      triageBlockedReason: 'duplicate_recent_body_detected',
      expectedReviewReason: 'Possible duplicate email',
      suggestedAction: /repeats an earlier offer/i,
    },
    {
      triageBlockedReason: 'daily_ai_review_limit_exceeded',
      expectedReviewReason: 'Extraction limit reached for today',
      suggestedAction: /daily limit to reset/i,
    },
    {
      triageBlockedReason: 'per_supplier_ai_review_limit_exceeded',
      expectedReviewReason: 'Extraction limit reached for this supplier',
      suggestedAction: /limit to reset/i,
    },
  ];

  for (const entry of cases) {
    // A body-text email carries a triage sentence as its reason (not a code),
    // so the specific explanation must come from the triage gate code.
    const summary = buildReviewSummary({
      processingStatus: 'NEEDS_REVIEW',
      fileType: 'UNKNOWN',
      fileName: null,
      inferredImportType: null,
      reason: 'subject matched supplier-like terms',
      sender: 'pricing@supplier.co',
      subjectOrCaption: 'Offer this week',
      triageBlockedReason: entry.triageBlockedReason,
    });

    assert.ok(summary);
    assert.equal(summary.reviewReason, entry.expectedReviewReason);
    assert.match(summary.suggestedAction, entry.suggestedAction);
  }
});

test('explicit offer reason codes still win over the triage gate code', () => {
  const summary = buildReviewSummary({
    processingStatus: 'NEEDS_REVIEW',
    fileType: 'UNKNOWN',
    fileName: null,
    inferredImportType: null,
    reason: 'missing_price',
    sender: 'pricing@supplier.co',
    subjectOrCaption: 'Offer',
    triageBlockedReason: 'email_ai_review_disabled',
  });

  assert.ok(summary);
  assert.equal(summary.reviewReason, 'Missing price');
});

test('buildReviewSummary prioritizes supplier cue flags over raw reason text', () => {
  const summary = buildReviewSummary({
    processingStatus: 'REVIEW_REQUIRED',
    fileType: 'UNKNOWN',
    fileName: null,
    inferredImportType: null,
    reason: 'promotion_threshold_not_met',
    sender: 'pricing@supplier.co',
    subjectOrCaption: 'Offer',
    hasConflictingSupplierCues: true,
  });

  assert.ok(summary);
  assert.equal(summary.reviewReason, 'Conflicting supplier cues');
  assert.match(summary.missingOrUnclear, /more than one supplier signal/i);
  assert.match(summary.suggestedAction, /confirm the correct supplier/i);
});
