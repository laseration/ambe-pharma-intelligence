import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countReviewQueueFilters,
  filterReviewWorkflowItems,
  normalizeReviewQueueFilter,
} from './reviewQueueFilters';
import type { ReviewWorkflowListItem } from './reviewApi';

function item(
  overrides: Partial<ReviewWorkflowListItem>,
): ReviewWorkflowListItem {
  return {
    id: 'workflow-ready',
    status: 'NEW',
    priority: 'MEDIUM',
    priorityReason: null,
    assigneeLabel: null,
    sourceKind: 'BODY_MAIN',
    sourceReviewReason: null,
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
    updatedAt: '2026-06-04T10:00:00.000Z',
    inboundEmailId: 'email-1',
    inboundEmail: {
      id: 'email-1',
      fromEmail: 'safe-supplier.example.test',
      subject: 'Sanitized supplier offer',
      receivedAt: '2026-06-04T09:00:00.000Z',
    },
    emailDerivedOffer: {
      rawProductText: 'Demo Amlodipine 5mg tablets 28',
      normalizedProductNameCandidate: 'demo amlodipine 5mg tablets 28',
      strengthCandidate: '5mg',
      dosageFormCandidate: 'tablet',
      packSizeCandidate: '28',
      supplierCandidate: 'Demo Supplier',
      manufacturerCandidate: 'Demo Generics',
      priceCandidate: '7.90',
      currencyCandidate: 'GBP',
      availabilityCandidate: 'Available now',
      minimumOrderQuantityCandidate: 100,
    },
    ...overrides,
  };
}

test('review queue filters count safe operational buckets', () => {
  const items: ReviewWorkflowListItem[] = [
    item({ id: 'ready' }),
    item({
      id: 'unresolved',
      hasUnresolvedSupplier: true,
      sourceReviewReason: 'unresolved_supplier',
      supplierQualificationStatus: 'UNKNOWN',
      hasUnknownSupplierQualification: true,
    }),
    item({
      id: 'missing-price',
      sourceReviewReason: 'missing_price',
      emailDerivedOffer: {
        ...item({}).emailDerivedOffer!,
        priceCandidate: null,
      },
    }),
    item({
      id: 'missing-currency',
      sourceReviewReason: 'missing_currency',
      emailDerivedOffer: {
        ...item({}).emailDerivedOffer!,
        currencyCandidate: null,
      },
    }),
    item({
      id: 'weak-product',
      sourceReviewReason: 'weak_product_match',
    }),
    item({
      id: 'ai',
      aiAssisted: true,
      sourceKind: 'AI_FALLBACK',
      sourceReviewReason: 'ai_candidate_review_only',
    }),
    item({
      id: 'stale',
      updatedAt: '2026-06-02T10:00:00.000Z',
    }),
    item({
      id: 'approved',
      status: 'APPROVED_TO_BUY',
      buyDecision: {
        id: 'buy-1',
        approvalStatus: 'APPROVED',
        orderStatus: 'NOT_ORDERED',
      },
    } as Partial<ReviewWorkflowListItem>),
  ];

  const counts = countReviewQueueFilters(items, {
    nowMs: Date.parse('2026-06-04T12:00:00.000Z'),
  });

  assert.equal(counts.all, 7);
  assert.equal(counts['ready-to-approve'], 2);
  assert.equal(counts['unresolved-supplier'], 1);
  assert.equal(counts['supplier-risk'], 1);
  assert.equal(counts['missing-price'], 1);
  assert.equal(counts['missing-currency'], 1);
  assert.equal(counts['weak-product-match'], 1);
  assert.equal(counts['ai-assisted'], 1);
  assert.equal(counts.stale, 1);
  assert.equal(counts['correction-required'], 4);
  assert.equal(counts['approval-blocked'], 1);
});

test('review queue filters return matching sanitized workflow items', () => {
  const ready = item({ id: 'ready' });
  const blocked = item({
    id: 'ordered',
    status: 'ORDERED',
    buyDecision: {
      id: 'buy-ordered',
      approvalStatus: 'APPROVED',
      orderStatus: 'ORDERED',
    },
  } as Partial<ReviewWorkflowListItem>);
  const weakMatch = item({
    id: 'weak',
    sourceReviewReason: 'weak_product_match',
  });

  assert.deepEqual(
    filterReviewWorkflowItems([ready, blocked, weakMatch], 'all').map(
      (workflowItem) => workflowItem.id,
    ),
    ['ready', 'weak'],
  );
  assert.deepEqual(
    filterReviewWorkflowItems(
      [ready, blocked, weakMatch],
      'approval-blocked',
    ).map((workflowItem) => workflowItem.id),
    ['ordered'],
  );
  assert.deepEqual(
    filterReviewWorkflowItems(
      [ready, blocked, weakMatch],
      'weak-product-match',
    ).map((workflowItem) => workflowItem.id),
    ['weak'],
  );
});

test('review queue filter normalization falls back safely', () => {
  assert.equal(normalizeReviewQueueFilter('supplier-risk'), 'supplier-risk');
  assert.equal(normalizeReviewQueueFilter('unexpected-filter'), 'all');
  assert.equal(normalizeReviewQueueFilter(undefined), 'all');
});
