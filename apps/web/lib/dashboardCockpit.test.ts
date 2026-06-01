import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCommercialValueMetrics,
  buildDataQualityIssues,
  buildNextActions,
  countPendingReviewEmails,
  getBestBuyingSignals,
  getOpportunityFreshnessSummary,
  sortReviewItemsForAction,
  summarizeReadiness,
} from './dashboardCockpit';
import type { AutomationReadinessOverview } from './automationApi';
import type { OpportunityListItem } from './opportunitiesApi';
import type { ReviewWorkflowListItem } from './reviewApi';

function reviewItem(
  overrides: Partial<ReviewWorkflowListItem>,
): ReviewWorkflowListItem {
  return {
    id: 'review-1',
    status: 'NEW',
    priority: 'MEDIUM',
    assigneeLabel: null,
    sourceKind: null,
    sourceReviewReason: null,
    latestNote: null,
    supplierQualificationStatus: 'UNKNOWN',
    hasUnknownSupplierQualification: true,
    hasRestrictedSupplier: false,
    hasBlockedSupplier: false,
    qualificationRiskNote: null,
    updatedAt: '2026-05-31T09:00:00.000Z',
    inboundEmailId: null,
    inboundEmail: null,
    emailDerivedOffer: null,
    ...overrides,
  };
}

function opportunity(
  overrides: Partial<OpportunityListItem>,
): OpportunityListItem {
  return {
    id: 'opportunity-1',
    type: 'BUY',
    status: 'OPEN',
    title: 'Buy signal',
    description: 'Worth checking.',
    score: 80,
    createdAt: '2026-05-31T08:00:00.000Z',
    updatedAt: '2026-05-31T09:00:00.000Z',
    product: null,
    supplier: null,
    metadata: null,
    ...overrides,
  };
}

const readiness: AutomationReadinessOverview = {
  policy: {
    globalMode: 'INTERNAL_SIGNALS_ONLY',
  },
  evaluation: {
    windowStart: '2026-05-01T00:00:00.000Z',
    windowEnd: '2026-05-31T00:00:00.000Z',
    totalStagedOffers: 12,
    totalReviewedOffers: 6,
    signalAcceptancePct: 0.75,
    supplierResolutionPrecisionPct: 0.8,
    workflowToBuyApprovalConversionPct: 0.5,
    unresolvedSupplierRatePct: 0.2,
  },
  decisions: {
    internalSignals: {
      eligible: false,
      blockedReasons: ['Minimum sample size has not been reached.'],
    },
  },
  recommendedAction: 'Review more samples.',
};

test('dashboard cockpit counts unique supplier emails awaiting decision', () => {
  assert.equal(
    countPendingReviewEmails([
      reviewItem({ id: 'a', inboundEmailId: 'email-1' }),
      reviewItem({ id: 'b', inboundEmailId: 'email-1' }),
      reviewItem({ id: 'c', inboundEmailId: 'email-2' }),
    ]),
    2,
  );
});

test('dashboard cockpit sorts review items by priority then recency', () => {
  const sorted = sortReviewItemsForAction([
    reviewItem({
      id: 'medium-new',
      priority: 'MEDIUM',
      updatedAt: '2026-05-31T12:00:00.000Z',
    }),
    reviewItem({
      id: 'high-old',
      priority: 'HIGH',
      updatedAt: '2026-05-30T12:00:00.000Z',
    }),
    reviewItem({
      id: 'high-new',
      priority: 'HIGH',
      updatedAt: '2026-05-31T13:00:00.000Z',
    }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ['high-new', 'high-old', 'medium-new'],
  );
});

test('dashboard cockpit picks buy-side signals by score', () => {
  const signals = getBestBuyingSignals([
    opportunity({ id: 'push', type: 'PUSH', score: 100 }),
    opportunity({ id: 'buy-low', type: 'BUY', score: 70 }),
    opportunity({ id: 'price-high', type: 'PRICE_ALERT', score: 95 }),
  ]);

  assert.deepEqual(
    signals.map((item) => item.id),
    ['price-high', 'buy-low'],
  );
});

test('dashboard cockpit builds next action cards from real inputs', () => {
  const actions = buildNextActions({
    reviewItems: [reviewItem({ inboundEmailId: 'email-1' })],
    opportunities: [opportunity({ type: 'BUY' })],
    duplicateGroups: [],
    readiness,
  });

  assert.equal(actions[0]?.key, 'review-now');
  assert.equal(actions[0]?.priority, 'high');
  assert.equal(actions[1]?.key, 'buying-signals');
  assert.equal(actions[3]?.priority, 'medium');
});

test('dashboard cockpit produces plain value metrics and readiness summary', () => {
  const metrics = buildCommercialValueMetrics({
    openOpportunities: [
      opportunity({ type: 'BUY' }),
      opportunity({ type: 'PUSH' }),
    ],
    reviewItems: [reviewItem({ inboundEmailId: 'email-1' })],
    readiness,
  });
  const summary = summarizeReadiness(readiness);

  assert.equal(metrics[0]?.value, '2');
  assert.match(metrics[0]?.note ?? '', /1 buy-side and 1 sell-side/);
  assert.equal(metrics[3]?.value, '50%');
  assert.equal(summary.blocked, true);
  assert.match(summary.detail, /Minimum sample size/);
});

test('dashboard cockpit freshness handles empty, fresh, and stale states', () => {
  assert.equal(getOpportunityFreshnessSummary([]).label, 'No open signals');
  assert.equal(
    getOpportunityFreshnessSummary(
      [opportunity({ updatedAt: '2026-05-31T11:00:00.000Z' })],
      Date.parse('2026-05-31T12:00:00.000Z'),
    ).label,
    'Fresh',
  );
  assert.equal(
    getOpportunityFreshnessSummary(
      [opportunity({ updatedAt: '2026-05-27T11:00:00.000Z' })],
      Date.parse('2026-05-31T12:00:00.000Z'),
    ).label,
    'Stale',
  );
});

test('dashboard cockpit surfaces data quality and partial API failures', () => {
  const issues = buildDataQualityIssues({
    duplicateGroups: null,
    readiness,
    apiFailures: ['review queue'],
  });

  assert.deepEqual(
    issues.map((issue) => issue.key),
    ['duplicate-check-unavailable', 'automation-blocked', 'api-review queue'],
  );
});
