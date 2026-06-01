import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReviewProvenanceSummary,
  getExtractionMethod,
  truncateSourceText,
} from './reviewProvenance';
import type { ReviewWorkflowDetail } from './reviewApi';

function makeReviewDetail(
  overrides: Partial<ReviewWorkflowDetail> = {},
): ReviewWorkflowDetail {
  return {
    id: 'workflow-1',
    emailDerivedOfferId: 'offer-1',
    inboundEmailId: 'email-1',
    status: 'NEW',
    priority: 'HIGH',
    priorityReason: 'promotion_threshold_not_met',
    assigneeLabel: null,
    sourceKind: 'STRICT_ATTACHMENT_TABLE',
    sourceReviewReason: 'promotion_threshold_not_met',
    aiAssisted: false,
    latestNote: null,
    hasUnresolvedSupplier: false,
    hasConflictingSupplierCues: false,
    hasManufacturerAmbiguity: false,
    supplierQualificationStatus: 'UNKNOWN',
    hasUnknownSupplierQualification: true,
    hasRestrictedSupplier: false,
    hasBlockedSupplier: false,
    qualificationRiskNote: null,
    updatedAt: '2026-04-22T09:05:00.000Z',
    emailDerivedOffer: {
      id: 'offer-1',
      status: 'REVIEW_REQUIRED',
      reviewReason: 'promotion_threshold_not_met',
      sourceKind: 'STRICT_ATTACHMENT_TABLE',
      sourceBlockText: 'Amlodipine 5mg tabs 28 - GBP 8.40',
      rawProductText: 'Amlodipine 5mg tabs 28',
      normalizedProductNameCandidate: 'amlodipine|5mg|tablet|28',
      strengthCandidate: '5mg',
      dosageFormCandidate: 'tablet',
      packSizeCandidate: '28',
      manufacturerCandidate: 'Teva',
      supplierCandidate: 'Shortline',
      priceCandidate: '8.40',
      currencyCandidate: 'GBP',
      minimumOrderQuantityCandidate: 20,
      availabilityCandidate: 'In stock',
      sourceTrustScore: 55,
      structureConfidence: 75,
      fieldConfidence: 72,
      entityResolutionConfidence: 0,
      promotionConfidence: 54,
      metadata: {
        sender: 'pricing@supplier.co',
        subject: 'Offer',
      },
      resolutionCandidates: [
        {
          entityType: 'SUPPLIER',
          candidateId: 'supplier-1',
          candidateName: 'Shortline',
          confidence: 60,
          reason: 'trusted supplier mapping',
          selected: true,
        },
      ],
      sourceDocument: {
        id: 'doc-2',
        kind: 'ATTACHMENT_TABLE',
        documentIndex: 2,
        label: 'price-list.xlsx',
        textContent: 'productName: Amlodipine 5mg tabs 28 | unitPrice: 8.40',
        metadata: null,
      },
      offerCorrections: [],
    },
    ...overrides,
  };
}

test('marks AI fallback review items as review-required provenance', () => {
  const detail = makeReviewDetail({
    aiAssisted: true,
    sourceKind: 'AI_FALLBACK',
    sourceReviewReason: 'ai_candidate_review_only',
  });

  const method = getExtractionMethod(detail);

  assert.equal(method.label, 'AI fallback');
  assert.match(method.detail, /must stay review-required/i);
});

test('builds source and missing-field context from review detail', () => {
  const summary = buildReviewProvenanceSummary(
    makeReviewDetail({
      emailDerivedOffer: {
        ...makeReviewDetail().emailDerivedOffer!,
        supplierCandidate: null,
        currencyCandidate: null,
        resolutionCandidates: [],
      },
    }),
  );

  assert.equal(summary.sourceLabel, 'price-list.xlsx (ATTACHMENT_TABLE)');
  assert.equal(summary.sourceSnippet.text, 'Amlodipine 5mg tabs 28 - GBP 8.40');
  assert.deepEqual(summary.missingFields, [
    'supplier',
    'currency',
    'supplier/product match evidence',
  ]);
  assert.match(summary.blockedReason, /Promotion Threshold Not Met/);
});

test('truncates long source text honestly', () => {
  const summary = truncateSourceText('abcdef', 3);

  assert.equal(summary.text, 'abc\n...');
  assert.equal(summary.truncated, true);
  assert.match(summary.label, /truncated/i);
});
