import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuyDecisionEvidenceSummary } from './buyDecisionEvidence';
import type { ReviewWorkflowDetail } from './reviewApi';

function makeReviewDetail(
  overrides: Partial<ReviewWorkflowDetail> = {},
): ReviewWorkflowDetail {
  const emailDerivedOffer: NonNullable<
    ReviewWorkflowDetail['emailDerivedOffer']
  > = {
    id: 'offer-1',
    status: 'REVIEW_REQUIRED',
    reviewReason: 'promotion_threshold_not_met',
    sourceKind: 'STRICT_ATTACHMENT_TABLE',
    sourceBlockText:
      'RAW_SOURCE_BODY_SHOULD_NOT_RENDER postgresql://user:pass@example.invalid/db',
    rawProductText: 'Demo product 5mg tablets 28',
    normalizedProductNameCandidate: 'demo product|5mg|tablet|28',
    strengthCandidate: '5mg',
    dosageFormCandidate: 'tablet',
    packSizeCandidate: '28',
    manufacturerCandidate: 'Demo Labs',
    supplierCandidate: 'Demo Supplier',
    priceCandidate: '8.40',
    currencyCandidate: 'GBP',
    minimumOrderQuantityCandidate: 10,
    availabilityCandidate: 'In stock',
    sourceTrustScore: 80,
    structureConfidence: 82,
    fieldConfidence: 79,
    entityResolutionConfidence: 70,
    promotionConfidence: 72,
    metadata: null,
    resolutionCandidates: [
      {
        entityType: 'SUPPLIER',
        candidateId: 'supplier-1',
        candidateName: 'Demo Supplier',
        confidence: 70,
        reason: 'safe fixture match',
        selected: true,
      },
    ],
    sourceDocument: null,
    offerCorrections: [],
    relatedOfferCorrections: [],
  };

  return {
    id: 'workflow-1',
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
    supplierQualificationStatus: 'APPROVED',
    hasUnknownSupplierQualification: false,
    hasRestrictedSupplier: false,
    hasBlockedSupplier: false,
    qualificationRiskNote: null,
    updatedAt: '2026-06-03T09:10:05.000Z',
    emailDerivedOffer,
    inboundEmail: null,
    supplierContact: null,
    buyDecision: null,
    ...overrides,
  };
}

test('buy-decision evidence labels present, missing, and blocked facts safely', () => {
  const summary = buildBuyDecisionEvidenceSummary(
    makeReviewDetail({
      status: 'APPROVED_TO_BUY',
      buyDecision: {
        id: 'buy-1',
        approvalStatus: 'APPROVED',
        orderStatus: 'PENDING',
      },
      emailDerivedOffer: {
        ...makeReviewDetail().emailDerivedOffer!,
        offerCorrections: [
          {
            id: 'correction-1',
            correctionStatus: 'APPLIED',
            correctedSupplierId: null,
            correctedSupplierName: 'Demo Supplier',
            correctedProductId: null,
            correctedRawProductText: null,
            correctedNormalizedProductName: null,
            correctedStrength: null,
            correctedDosageForm: null,
            correctedPackSize: null,
            correctedManufacturer: null,
            correctedUnitPrice: null,
            correctedCurrencyCode: null,
            correctedMinimumOrderQuantity: null,
            correctedAvailability: null,
            actorType: 'OPERATOR',
            actorIdentifier: 'pilot-operator',
            note: null,
            createdAt: '2026-06-03T09:15:00.000Z',
            updatedAt: '2026-06-03T09:15:00.000Z',
          },
        ],
      },
      buyDecisionEvidence: {
        estimatedMarginAmount: 3.2,
        estimatedMarginCurrencyCode: 'GBP',
        estimatedMarginPct: 0.28,
        recentUnitsSold: 42,
        recentDemandWindowDays: 30,
        stockOnHand: 6,
        stockPositionLabel: 'Low stock in fake demo data',
        stockRisk: 'Low stock supports review before ordering',
        priceConfidence: 79,
        missingEvidence: ['Customer outreach approval not reviewed'],
        nextRecommendedAction:
          'Review corrected supplier terms before execution.',
      },
    }),
  );

  assert.ok(
    summary.present.some(
      (item) =>
        item.label === 'Margin estimate' && item.value === 'GBP 3.20 | 28%',
    ),
  );
  assert.ok(
    summary.present.some(
      (item) =>
        item.label === 'Demand/sales velocity' &&
        item.value === '42 units in 30 days',
    ),
  );
  assert.ok(
    summary.missing.some(
      (item) =>
        item.label === 'Missing evidence' &&
        item.value === 'Customer outreach approval not reviewed',
    ),
  );
  assert.ok(
    summary.blocked.some(
      (item) =>
        item.label === 'Approval/execution blocker' &&
        item.value === 'Corrected after approval; review again',
    ),
  );
  assert.equal(
    summary.nextRecommendedAction,
    'Review corrected supplier terms before execution.',
  );
});

test('buy-decision evidence degrades to safe missing labels without raw source text', () => {
  const summary = buildBuyDecisionEvidenceSummary(
    makeReviewDetail({
      emailDerivedOffer: {
        ...makeReviewDetail().emailDerivedOffer!,
        priceCandidate: null,
        currencyCandidate: null,
        resolutionCandidates: [],
      },
      supplierQualificationStatus: 'UNKNOWN',
      hasUnknownSupplierQualification: true,
    }),
  );
  const serialized = JSON.stringify(summary);

  assert.ok(summary.missing.some((item) => item.label === 'Margin estimate'));
  assert.ok(summary.missing.some((item) => item.label === 'Price confidence'));
  assert.ok(
    summary.blocked.some(
      (item) => item.label === 'Supplier status' && item.value === 'UNKNOWN',
    ),
  );
  assert.doesNotMatch(serialized, /RAW_SOURCE_BODY_SHOULD_NOT_RENDER/);
  assert.doesNotMatch(serialized, /postgresql:\/\//);
});
