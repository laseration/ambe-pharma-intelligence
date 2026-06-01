import type { AutomationReadinessOverview } from './automationApi';
import type { OpportunityListItem } from './opportunitiesApi';
import type { ProductDuplicateGroup } from './productsApi';
import type { ReviewWorkflowListItem } from './reviewApi';

export type DashboardAction = {
  key: string;
  title: string;
  value: string;
  meaning: string;
  nextAction: string;
  href: string;
  cta: string;
  priority: 'high' | 'medium' | 'normal';
};

export type DashboardValueMetric = {
  label: string;
  value: string;
  note: string;
};

export type DashboardFreshnessSummary = {
  label: string;
  pillClassName: string;
  detail: string;
};

export type DashboardReadinessSummary = {
  title: string;
  detail: string;
  blocked: boolean;
};

export type DashboardIssue = {
  key: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
};

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function countPendingReviewEmails(
  reviewItems: ReviewWorkflowListItem[],
) {
  return new Set(
    reviewItems.map(
      (item) => item.inboundEmailId ?? item.inboundEmail?.id ?? item.id,
    ),
  ).size;
}

export function sortReviewItemsForAction(
  reviewItems: ReviewWorkflowListItem[],
): ReviewWorkflowListItem[] {
  const priorityRank: Record<string, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return [...reviewItems].sort((left, right) => {
    const leftPriority = priorityRank[left.priority] ?? 3;
    const rightPriority = priorityRank[right.priority] ?? 3;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return (parseTime(right.updatedAt) ?? 0) - (parseTime(left.updatedAt) ?? 0);
  });
}

export function getBestBuyingSignals(
  opportunities: OpportunityListItem[],
): OpportunityListItem[] {
  return [...opportunities]
    .filter((item) => item.type === 'BUY' || item.type === 'PRICE_ALERT')
    .sort((left, right) => right.score - left.score);
}

export function buildNextActions(input: {
  reviewItems: ReviewWorkflowListItem[];
  opportunities: OpportunityListItem[];
  duplicateGroups: ProductDuplicateGroup[] | null;
  readiness: AutomationReadinessOverview | null;
}): DashboardAction[] {
  const pendingEmailCount = countPendingReviewEmails(input.reviewItems);
  const bestBuyingSignals = getBestBuyingSignals(input.opportunities);
  const duplicateCount = input.duplicateGroups?.length ?? null;
  const readinessBlocked =
    input.readiness?.decisions.internalSignals.eligible === false;

  return [
    {
      key: 'review-now',
      title: 'Needs review now',
      value: String(input.reviewItems.length),
      meaning:
        input.reviewItems.length > 0
          ? `${pendingEmailCount} supplier email${pendingEmailCount === 1 ? '' : 's'} need an operator decision before the system can act.`
          : 'No supplier offers are waiting in the review queue.',
      nextAction:
        input.reviewItems.length > 0
          ? 'Open the review queue and approve, reject, or request more information.'
          : 'Import or ingest new supplier offers when fresh data arrives.',
      href: '/dashboard/review',
      cta: input.reviewItems.length > 0 ? 'Review offers' : 'Open queue',
      priority: input.reviewItems.length > 0 ? 'high' : 'normal',
    },
    {
      key: 'buying-signals',
      title: 'Best buying signals',
      value: String(bestBuyingSignals.length),
      meaning:
        bestBuyingSignals.length > 0
          ? 'The opportunity engine has BUY or PRICE ALERT signals worth checking today.'
          : 'No current BUY or PRICE ALERT opportunities are open.',
      nextAction:
        bestBuyingSignals.length > 0
          ? 'Check the top signals, then mark them reviewed, actioned, or dismissed.'
          : 'Refresh opportunities after supplier, inventory, or sales data changes.',
      href: '/dashboard/opportunities?type=BUY',
      cta:
        bestBuyingSignals.length > 0 ? 'Check signals' : 'View opportunities',
      priority: bestBuyingSignals.length > 0 ? 'high' : 'normal',
    },
    {
      key: 'data-quality',
      title: 'Data quality issues',
      value: duplicateCount === null ? 'n/a' : String(duplicateCount),
      meaning:
        duplicateCount === null
          ? 'Duplicate product checks are unavailable right now.'
          : duplicateCount > 0
            ? 'Likely duplicate product records may weaken matching and scoring.'
            : 'No likely duplicate product groups are currently reported.',
      nextAction:
        duplicateCount && duplicateCount > 0
          ? 'Open product records and clean the highest-confidence duplicate groups.'
          : 'Keep product records clean as imports add aliases.',
      href: '/dashboard/products',
      cta: 'Open products',
      priority: duplicateCount && duplicateCount > 0 ? 'medium' : 'normal',
    },
    {
      key: 'automation-trust',
      title: 'Automation readiness',
      value: input.readiness
        ? input.readiness.policy.globalMode.replaceAll('_', ' ')
        : 'unavailable',
      meaning: input.readiness
        ? input.readiness.recommendedAction
        : 'Pilot trust metrics could not be loaded.',
      nextAction: readinessBlocked
        ? 'Review more samples and capture operator feedback before tightening automation.'
        : 'Keep monitoring usefulness and supplier-resolution feedback.',
      href: '/dashboard/setup',
      cta: 'Open setup',
      priority: readinessBlocked ? 'medium' : 'normal',
    },
  ];
}

export function buildCommercialValueMetrics(input: {
  openOpportunities: OpportunityListItem[];
  reviewItems: ReviewWorkflowListItem[];
  readiness: AutomationReadinessOverview | null;
}): DashboardValueMetric[] {
  const buyingSignals = getBestBuyingSignals(input.openOpportunities).length;
  const pushSignals = input.openOpportunities.filter(
    (item) => item.type === 'PUSH',
  ).length;

  return [
    {
      label: 'Open commercial signals',
      value: String(input.openOpportunities.length),
      note: `${buyingSignals} buy-side and ${pushSignals} sell-side signals are currently open.`,
    },
    {
      label: 'Supplier emails awaiting decision',
      value: String(countPendingReviewEmails(input.reviewItems)),
      note: 'Unique inbound supplier emails represented in the current offer review queue.',
    },
    {
      label: 'Offers staged in 30d',
      value: input.readiness
        ? String(input.readiness.evaluation.totalStagedOffers)
        : 'n/a',
      note: 'Commercial rows captured into the review pipeline during the readiness window.',
    },
    {
      label: 'Review-to-buy conversion',
      value:
        formatPct(
          input.readiness?.evaluation.workflowToBuyApprovalConversionPct,
        ) ?? 'n/a',
      note: 'How often reviewed workflow items have become approved buy decisions.',
    },
  ];
}

export function summarizeReadiness(
  readiness: AutomationReadinessOverview | null,
): DashboardReadinessSummary {
  if (!readiness) {
    return {
      title: 'Automation metrics are unavailable.',
      detail:
        'The dashboard can still show review and opportunity work, but pilot trust metrics need the automation endpoint.',
      blocked: true,
    };
  }

  const unresolvedSupplierText =
    readiness.evaluation.unresolvedSupplierRatePct !== null
      ? `Unresolved supplier rate is ${formatPct(readiness.evaluation.unresolvedSupplierRatePct)}.`
      : 'Unresolved supplier rate has not been measured yet.';

  if (readiness.decisions.internalSignals.eligible) {
    return {
      title: 'Internal signals are eligible for pilot use.',
      detail: `${unresolvedSupplierText} ${readiness.recommendedAction}`,
      blocked: false,
    };
  }

  return {
    title: 'Trust boundaries still need evidence.',
    detail: `${readiness.decisions.internalSignals.blockedReasons[0] ?? 'More operator feedback is needed.'} ${unresolvedSupplierText}`,
    blocked: true,
  };
}

export function getOpportunityFreshnessSummary(
  items: OpportunityListItem[],
  now = Date.now(),
): DashboardFreshnessSummary {
  if (items.length === 0) {
    return {
      label: 'No open signals',
      pillClassName: 'pill-neutral',
      detail:
        'No open opportunities are stored right now. Import supplier, inventory, and sales data, then refresh opportunities.',
    };
  }

  const validUpdatedAt = items
    .map((item) => ({ item, parsed: parseTime(item.updatedAt) }))
    .filter(
      (entry): entry is { item: OpportunityListItem; parsed: number } =>
        entry.parsed !== null,
    );

  if (validUpdatedAt.length === 0) {
    return {
      label: 'Unknown freshness',
      pillClassName: 'pill-neutral',
      detail:
        'Open opportunities exist, but no valid refresh timestamp is available.',
    };
  }

  const newest = validUpdatedAt.reduce((latest, current) =>
    current.parsed > latest.parsed ? current : latest,
  );
  const oldest = validUpdatedAt.reduce((earliest, current) =>
    current.parsed < earliest.parsed ? current : earliest,
  );
  const newestAgeHours = (now - newest.parsed) / (1000 * 60 * 60);
  const oldestAgeHours = (now - oldest.parsed) / (1000 * 60 * 60);

  if (newestAgeHours > 72) {
    return {
      label: 'Stale',
      pillClassName: 'pill-low',
      detail:
        'Open opportunity signals have not been refreshed in more than 72 hours. Refresh before acting.',
    };
  }

  if (newestAgeHours > 24) {
    return {
      label: 'Aging',
      pillClassName: 'pill-medium',
      detail:
        'Open opportunity signals are more than 24 hours old. Check source data before committing action.',
    };
  }

  return {
    label: 'Fresh',
    pillClassName: 'pill-high',
    detail:
      oldestAgeHours > 24
        ? 'Newest signals are fresh, but some older open items may need a quick sanity check.'
        : 'Open opportunity signals were refreshed recently.',
  };
}

export function buildDataQualityIssues(input: {
  duplicateGroups: ProductDuplicateGroup[] | null;
  readiness: AutomationReadinessOverview | null;
  apiFailures: string[];
}): DashboardIssue[] {
  const issues: DashboardIssue[] = [];

  if (input.duplicateGroups === null) {
    issues.push({
      key: 'duplicate-check-unavailable',
      title: 'Duplicate product check unavailable',
      detail:
        'The dashboard could not load duplicate product groups, so matching quality is unknown.',
      href: '/dashboard/products',
      cta: 'Open products',
    });
  } else if (input.duplicateGroups.length > 0) {
    issues.push({
      key: 'duplicate-products',
      title: `${input.duplicateGroups.length} likely duplicate product group${input.duplicateGroups.length === 1 ? '' : 's'}`,
      detail:
        'Clean these records to improve product matching, opportunity scoring, and supplier-offer review.',
      href: '/dashboard/products',
      cta: 'Review duplicates',
    });
  }

  const blockedReasons =
    input.readiness?.decisions.internalSignals.blockedReasons ?? [];
  if (blockedReasons.length > 0) {
    issues.push({
      key: 'automation-blocked',
      title: 'Automation readiness blocked',
      detail: blockedReasons[0] ?? 'More pilot evidence is needed.',
      href: '/dashboard/setup',
      cta: 'Open setup',
    });
  }

  for (const failure of input.apiFailures) {
    issues.push({
      key: `api-${failure}`,
      title: `${failure} unavailable`,
      detail:
        'This part of the cockpit could not load. Existing actions remain available where their cards are visible.',
      href: '/dashboard/setup',
      cta: 'Check setup',
    });
  }

  return issues;
}

export function getOpportunityTriageTimestamp(
  item: OpportunityListItem,
): string {
  return item.metadata?.triage?.latest?.updatedAt ?? item.updatedAt;
}

export function buildRecentlyTriagedOpportunities(
  items: OpportunityListItem[],
) {
  return [...items]
    .sort(
      (left, right) =>
        (parseTime(getOpportunityTriageTimestamp(right)) ?? 0) -
        (parseTime(getOpportunityTriageTimestamp(left)) ?? 0),
    )
    .slice(0, 6);
}
