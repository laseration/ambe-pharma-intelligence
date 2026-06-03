import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSafeSenderLabel,
  redactDashboardText,
  summarizeCommercialActionState,
  summarizeWorkerFreshness,
} from './operatorTrust';
import type { ReviewWorkflowDetail } from './reviewApi';
import type { PollingWorkerStatus } from './systemApi';

function makeWorker(
  overrides: Partial<PollingWorkerStatus> = {},
): PollingWorkerStatus {
  return {
    name: 'email-inbound',
    enabled: true,
    configured: true,
    active: true,
    running: true,
    inFlight: false,
    intervalMs: 60_000,
    startedAt: '2026-06-03T09:00:00.000Z',
    stoppedAt: null,
    lastRunStartedAt: '2026-06-03T09:10:00.000Z',
    lastRunFinishedAt: '2026-06-03T09:10:05.000Z',
    lastSuccessAt: '2026-06-03T09:10:05.000Z',
    lastErrorAt: null,
    lastError: null,
    consecutiveFailures: 0,
    totalRuns: 1,
    totalItemsSeen: 1,
    totalItemsProcessed: 1,
    totalItemsSkipped: 0,
    totalItemsFailed: 0,
    duplicateItemsSkipped: 0,
    ...overrides,
  };
}

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
    sourceBlockText: 'Product row preview',
    rawProductText: 'Amlodipine 5mg tablets 28',
    normalizedProductNameCandidate: 'amlodipine|5mg|tablet|28',
    strengthCandidate: '5mg',
    dosageFormCandidate: 'tablet',
    packSizeCandidate: '28',
    manufacturerCandidate: 'Example Labs',
    supplierCandidate: 'Example Supplier',
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
    resolutionCandidates: [],
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
    supplierQualificationStatus: 'UNKNOWN',
    hasUnknownSupplierQualification: true,
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

test('dashboard redaction removes secrets, credentials, and raw contact addresses', () => {
  const redacted = redactDashboardText(
    'postgresql://user:pass@db.example.com/app failed for token=abc123 and user supplier@example.com with Bearer live-token',
  );

  assert.equal(
    redacted,
    '[redacted] failed for [redacted] and user [redacted] with [redacted]',
  );
  assert.equal(redactDashboardText(null), 'none');
});

test('safe sender labels expose domains without raw contact addresses', () => {
  assert.equal(
    formatSafeSenderLabel('Supplier Person <pilot-supplier@example.test>'),
    'sender domain example.test',
  );
  assert.equal(formatSafeSenderLabel(null), 'Unknown sender');
  assert.equal(
    formatSafeSenderLabel('token=abc123 supplier@example.test'),
    'sender domain example.test',
  );
  assert.equal(
    formatSafeSenderLabel('token=abc123 without an email'),
    '[redacted] without an email',
  );
});

test('worker freshness reports fresh, stale, and setup-blocked states safely', () => {
  const now = Date.parse('2026-06-03T09:20:00.000Z');

  assert.deepEqual(summarizeWorkerFreshness(makeWorker(), now), {
    label: 'Fresh',
    tone: 'ready',
    detail: 'The worker has completed a successful polling run recently.',
    blockedReason: null,
  });

  assert.equal(
    summarizeWorkerFreshness(
      makeWorker({ lastSuccessAt: '2026-06-03T08:00:00.000Z' }),
      now,
    ).blockedReason,
    'Worker stale; refresh diagnostics before relying on latest inbox state.',
  );

  assert.equal(
    summarizeWorkerFreshness(makeWorker({ configured: false }), now)
      .blockedReason,
    'Worker not configured; finish setup before relying on inbox state.',
  );
});

test('commercial action state shows approval required before execution', () => {
  const summary = summarizeCommercialActionState(makeReviewDetail());

  assert.equal(summary.label, 'Approval required');
  assert.equal(summary.canApprove, true);
  assert.equal(summary.blockedReason, 'Approval required');
});

test('commercial action state blocks stale approval after applied corrections', () => {
  const summary = summarizeCommercialActionState(
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
            correctedSupplierName: 'Corrected Supplier',
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
            actorIdentifier: 'operator',
            note: null,
            createdAt: '2026-06-03T09:15:00.000Z',
            updatedAt: '2026-06-03T09:15:00.000Z',
          },
        ],
      },
    }),
  );

  assert.equal(summary.label, 'Review again');
  assert.equal(summary.canApprove, false);
  assert.equal(summary.blockedReason, 'Corrected after approval; review again');
});

test('commercial action state blocks repeated approval or execution', () => {
  assert.equal(
    summarizeCommercialActionState(
      makeReviewDetail({
        status: 'ORDERED',
        buyDecision: {
          id: 'buy-1',
          approvalStatus: 'APPROVED',
          orderStatus: 'ORDERED',
        },
      }),
    ).blockedReason,
    'Already executed',
  );

  assert.equal(
    summarizeCommercialActionState(
      makeReviewDetail({
        status: 'APPROVED_TO_BUY',
        buyDecision: {
          id: 'buy-1',
          approvalStatus: 'APPROVED',
          orderStatus: 'PENDING',
        },
      }),
    ).blockedReason,
    'Already approved',
  );
});
