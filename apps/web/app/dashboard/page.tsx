import Link from 'next/link';

import { getAutomationReadinessOverview } from '../../lib/automationApi';
import {
  listOpenOpportunities,
  listOpportunities,
  type OpportunityListItem,
  type OpportunityListType,
} from '../../lib/opportunitiesApi';
import { listLikelyDuplicateProductGroups } from '../../lib/productsApi';
import { listReviewWorkflowItems } from '../../lib/reviewApi';
import { submitOpportunityRefreshAction, submitOpportunityTriageAction } from './actions';

export const dynamic = 'force-dynamic';

type OpportunityBucket = {
  key: string;
  title: string;
  description: string;
  items: OpportunityListItem[];
};

type PilotSnapshotMetric = {
  label: string;
  value: string;
  note: string;
};

type OperationalSnapshotMetric = {
  label: string;
  value: string;
  note: string;
  actionHref?: string;
  actionLabel?: string;
};

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    openType?: string;
    refreshed?: string;
    updated?: string;
  }>;
};

type OpportunityFreshnessSummary = {
  label: string;
  pillClassName: string;
  detail: string;
};

const OPEN_OPPORTUNITY_FILTER_OPTIONS: Array<{
  label: string;
  value: OpportunityListType | null;
}> = [
  { label: 'All', value: null },
  { label: 'BUY', value: 'BUY' },
  { label: 'PUSH', value: 'PUSH' },
  { label: 'Price alert', value: 'PRICE_ALERT' },
];

function formatPrice(value: number | null | undefined, currencyCode?: string | null) {
  if (value === null || value === undefined) {
    return null;
  }

  return currencyCode?.trim() ? `${currencyCode.trim().toUpperCase()} ${value.toFixed(2)}` : value.toFixed(2);
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

function formatOpportunityType(value: string): string {
  if (value === 'PRICE_ALERT') {
    return 'Price alert';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function countPendingReviewEmails(reviewItems: Awaited<ReturnType<typeof listReviewWorkflowItems>>) {
  return new Set(
    reviewItems.map((item) => item.inboundEmailId ?? item.inboundEmail?.id ?? item.id),
  ).size;
}

function buildPilotSnapshotMetrics(input: {
  openSignalCount: number;
  pendingReviewEmailCount: number;
  stagedOfferCount: number;
  reviewToBuyConversionPct: number | null;
  signalAcceptancePct: number | null;
  supplierResolutionPrecisionPct: number | null;
}): PilotSnapshotMetric[] {
  return [
    {
      label: 'Open signals',
      value: String(input.openSignalCount),
      note: 'Current BUY, PUSH, and other open trading signals.',
    },
    {
      label: 'Emails awaiting review',
      value: String(input.pendingReviewEmailCount),
      note: 'Inbound supplier emails still needing operator judgment.',
    },
    {
      label: 'Offers staged in 30d',
      value: String(input.stagedOfferCount),
      note: 'Commercial rows captured into the pipeline during the current evaluation window.',
    },
    {
      label: 'Review-to-buy conversion',
      value: formatPct(input.reviewToBuyConversionPct) ?? 'Not enough data',
      note:
        input.signalAcceptancePct !== null
          ? `Operator signal usefulness ${formatPct(input.signalAcceptancePct) ?? 'Not enough data'}.`
          : 'More operator feedback is needed before usefulness can be measured.',
    },
    {
      label: 'Supplier match accuracy',
      value: formatPct(input.supplierResolutionPrecisionPct) ?? 'Not enough data',
      note: 'How often supplier resolution feedback says the match was correct.',
    },
  ];
}

function buildOperationalSnapshotMetrics(input: {
  openSignalCount: number;
  reviewQueueCount: number;
  pendingReviewEmailCount: number;
  recentReviewedCount: number;
  recentActionedCount: number;
  recentDismissedCount: number;
  duplicateGroupCount: number | null;
  hasRecentTriagedSection: boolean;
}): OperationalSnapshotMetric[] {
  const recentTriagedCount =
    input.recentReviewedCount + input.recentActionedCount + input.recentDismissedCount;

  return [
    {
      label: 'Open opportunities',
      value: String(input.openSignalCount),
      note: 'Current open BUY, PUSH, and secondary signals on the dashboard.',
      actionHref: '#open-opportunities',
      actionLabel: 'Open buying opportunities',
    },
    {
      label: 'Review queue',
      value: String(input.reviewQueueCount),
      note: `${input.pendingReviewEmailCount} supplier emails still need operator review.`,
      actionHref: '/dashboard/review',
      actionLabel: 'Open review queue',
    },
    {
      label: 'Recent triage activity',
      value: String(recentTriagedCount),
      note: `${input.recentReviewedCount} reviewed, ${input.recentActionedCount} actioned, ${input.recentDismissedCount} dismissed in the recent activity sample.`,
      actionHref: input.hasRecentTriagedSection ? '#recently-triaged' : undefined,
      actionLabel: input.hasRecentTriagedSection ? 'View recent triage' : undefined,
    },
    {
      label: 'Duplicate product groups',
      value: input.duplicateGroupCount === null ? 'Not available' : String(input.duplicateGroupCount),
      note:
        input.duplicateGroupCount === null
          ? 'Duplicate catalog cleanup count is temporarily unavailable.'
          : 'Likely duplicate internal product groups that may weaken matching and signal quality.',
      actionHref: '/dashboard/products',
      actionLabel: 'Open product records',
    },
  ];
}

function summarizeReadiness(input: {
  eligible: boolean;
  recommendedAction: string;
  blockedReasons: string[];
  unresolvedSupplierRatePct: number | null;
}) {
  const unresolvedSupplierText =
    input.unresolvedSupplierRatePct !== null
      ? `Unresolved supplier rate is ${formatPct(input.unresolvedSupplierRatePct)}.`
      : 'Unresolved supplier rate has not been measured yet.';

  if (input.eligible) {
    return {
      title: 'Internal signals are ready to show in a pilot.',
      detail: `${unresolvedSupplierText} Current recommendation: ${input.recommendedAction}.`,
    };
  }

  const firstBlockedReason = input.blockedReasons[0] ?? 'More operator evidence is needed.';
  return {
    title: 'Checks still need operator evidence.',
    detail: `${firstBlockedReason} ${unresolvedSupplierText}`,
  };
}

function buildOpportunitySignals(item: OpportunityListItem): string[] {
  const metrics = item.metadata?.metrics;
  const commercialContext = item.metadata?.commercialContext;
  const currencyCode = commercialContext?.supplierCurrencyCode ?? null;
  const latestSupplierBuyPrice =
    commercialContext?.latestSupplierBuyPrice ?? metrics?.latestSupplierBuyPrice ?? null;
  const averageSalePrice = commercialContext?.averageSalePrice ?? metrics?.averageSalePrice ?? null;
  const estimatedMarginPct =
    commercialContext?.estimatedMarginPct ?? metrics?.estimatedMarginPct ?? null;
  const priceDeltaVsMarketPct =
    commercialContext?.priceDeltaVsMarketPct ?? metrics?.priceDeltaVsMarketPct ?? null;
  const simulatedMarketPrice = commercialContext?.simulatedMarketPrice ?? null;
  const recentSalesUnits30d = metrics?.recentSalesUnits30d ?? null;
  const currentStockQty = metrics?.currentStockQty ?? null;

  const signals = [
    latestSupplierBuyPrice !== null
      ? `Buy price ${formatPrice(latestSupplierBuyPrice, currencyCode)}`
      : null,
    simulatedMarketPrice !== null && priceDeltaVsMarketPct !== null
      ? `Market reference ${formatPrice(simulatedMarketPrice, currencyCode)} (${priceDeltaVsMarketPct < 0 ? formatPct(Math.abs(priceDeltaVsMarketPct)) + ' below market' : formatPct(priceDeltaVsMarketPct) + ' above market'})`
      : null,
    averageSalePrice !== null
      ? `Average sale price ${formatPrice(averageSalePrice, currencyCode)}`
      : null,
    estimatedMarginPct !== null ? `Estimated margin ${formatPct(estimatedMarginPct)}` : null,
    recentSalesUnits30d !== null ? `Recent sales ${recentSalesUnits30d} units in 30d` : null,
    currentStockQty !== null ? `Current stock ${currentStockQty} units` : null,
  ];

  return signals.filter((value): value is string => Boolean(value)).slice(0, 4);
}

function bucketOpportunities(items: OpportunityListItem[]): OpportunityBucket[] {
  return [
    {
      key: 'buy',
      title: 'Buying signals',
      description: 'Products that look commercially worth checking now based on current pricing and market position.',
      items: items.filter((item) => item.type === 'BUY' || item.type === 'PRICE_ALERT'),
    },
    {
      key: 'push',
      title: 'Products to push',
      description: 'Items where demand or margin suggests it may be worth following up quickly.',
      items: items.filter((item) => item.type === 'PUSH'),
    },
    {
      key: 'watch',
      title: 'Watchlist',
      description: 'Secondary signals to keep in view once the main buying and selling work is covered.',
      items: items.filter((item) => item.type !== 'BUY' && item.type !== 'PRICE_ALERT' && item.type !== 'PUSH'),
    },
  ];
}

function summaryCount(items: OpportunityListItem[], types: string[]) {
  return items.filter((item) => types.includes(item.type)).length;
}

function getOpportunityTriageTimestamp(item: OpportunityListItem): string {
  return item.metadata?.triage?.latest?.updatedAt ?? item.updatedAt;
}

function buildRecentlyTriagedOpportunities(items: OpportunityListItem[]) {
  return [...items]
    .sort(
      (left, right) =>
        new Date(getOpportunityTriageTimestamp(right)).getTime() -
        new Date(getOpportunityTriageTimestamp(left)).getTime(),
    )
    .slice(0, 6);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function normalizeOpenOpportunityFilterType(value: string | undefined): OpportunityListType | null {
  switch (value) {
    case 'BUY':
    case 'PUSH':
    case 'PRICE_ALERT':
      return value;
    default:
      return null;
  }
}

function getOpportunityFreshnessSummary(items: OpportunityListItem[]): OpportunityFreshnessSummary {
  if (items.length === 0) {
    return {
      label: 'No open signals',
      pillClassName: 'pill-neutral',
      detail: 'No open opportunities are stored right now, so freshness cannot be assessed yet.',
    };
  }

  const validUpdatedAt = items
    .map((item) => ({ item, parsed: new Date(item.updatedAt) }))
    .filter((entry) => !Number.isNaN(entry.parsed.getTime()));

  if (validUpdatedAt.length === 0) {
    return {
      label: 'Unknown freshness',
      pillClassName: 'pill-neutral',
      detail: 'Open opportunities exist, but no valid refresh timestamp is available.',
    };
  }

  const newest = validUpdatedAt.reduce((latest, current) =>
    current.parsed.getTime() > latest.parsed.getTime() ? current : latest,
  );
  const oldest = validUpdatedAt.reduce((earliest, current) =>
    current.parsed.getTime() < earliest.parsed.getTime() ? current : earliest,
  );
  const newestAgeHours = (Date.now() - newest.parsed.getTime()) / (1000 * 60 * 60);
  const oldestAgeHours = (Date.now() - oldest.parsed.getTime()) / (1000 * 60 * 60);

  let label = 'Fresh';
  let pillClassName = 'pill-high';

  if (newestAgeHours > 72) {
    label = 'Stale';
    pillClassName = 'pill-low';
  } else if (newestAgeHours > 24) {
    label = 'Aging';
    pillClassName = 'pill-medium';
  }

  const newestText = formatDateTime(newest.item.updatedAt) ?? 'recently';
  const oldestText = formatDateTime(oldest.item.updatedAt) ?? 'recently';
  const staleTail =
    oldest.item.id !== newest.item.id && oldestAgeHours > 24
      ? ` Oldest open signal was last refreshed ${oldestText}, so some items may need manual review before acting.`
      : '';

  return {
    label,
    pillClassName,
    detail: `Last refreshed ${newestText}.${staleTail}`,
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const query = searchParams ? await searchParams : undefined;
  const selectedOpenOpportunityType = normalizeOpenOpportunityFilterType(query?.openType);

  try {
    const [opportunities, filteredOpenOpportunities] = await Promise.all([
      listOpenOpportunities(),
      selectedOpenOpportunityType
        ? listOpportunities({ status: 'OPEN', type: selectedOpenOpportunityType })
        : listOpenOpportunities(),
    ]);
    const [reviewItemsResult, readinessResult, reviewedResult, actionedResult, dismissedResult, duplicateGroupsResult] = await Promise.allSettled([
      listReviewWorkflowItems(),
      getAutomationReadinessOverview(),
      listOpportunities({ status: 'REVIEWED', sortBy: 'updatedAt', take: 4 }),
      listOpportunities({ status: 'ACTIONED', sortBy: 'updatedAt', take: 4 }),
      listOpportunities({ status: 'DISMISSED', sortBy: 'updatedAt', take: 4 }),
      listLikelyDuplicateProductGroups(),
    ]);
    const reviewItems = reviewItemsResult.status === 'fulfilled' ? reviewItemsResult.value : [];
    const reviewedItems = reviewedResult.status === 'fulfilled' ? reviewedResult.value : [];
    const actionedItems = actionedResult.status === 'fulfilled' ? actionedResult.value : [];
    const dismissedItems = dismissedResult.status === 'fulfilled' ? dismissedResult.value : [];
    const duplicateGroups =
      duplicateGroupsResult.status === 'fulfilled' ? duplicateGroupsResult.value : null;
    const readiness = readinessResult.status === 'fulfilled' ? readinessResult.value : null;
    const recentlyTriaged = buildRecentlyTriagedOpportunities([
      ...reviewedItems,
      ...actionedItems,
      ...dismissedItems,
    ]);
    const buckets = bucketOpportunities(filteredOpenOpportunities);
    const buyCount = summaryCount(opportunities, ['BUY', 'PRICE_ALERT']);
    const pushCount = summaryCount(opportunities, ['PUSH']);
    const otherCount = opportunities.length - buyCount - pushCount;
    const operationalSnapshotMetrics = buildOperationalSnapshotMetrics({
      openSignalCount: opportunities.length,
      reviewQueueCount: reviewItems.length,
      pendingReviewEmailCount: countPendingReviewEmails(reviewItems),
      recentReviewedCount: reviewedItems.length,
      recentActionedCount: actionedItems.length,
      recentDismissedCount: dismissedItems.length,
      duplicateGroupCount: duplicateGroups?.length ?? null,
      hasRecentTriagedSection: recentlyTriaged.length > 0,
    });
    const pilotSnapshotMetrics = readiness
      ? buildPilotSnapshotMetrics({
          openSignalCount: opportunities.length,
          pendingReviewEmailCount: countPendingReviewEmails(reviewItems),
          stagedOfferCount: readiness.evaluation.totalStagedOffers,
          reviewToBuyConversionPct: readiness.evaluation.workflowToBuyApprovalConversionPct,
          signalAcceptancePct: readiness.evaluation.signalAcceptancePct,
          supplierResolutionPrecisionPct: readiness.evaluation.supplierResolutionPrecisionPct,
        })
      : [];
    const readinessSummary = readiness
      ? summarizeReadiness({
          eligible: readiness.decisions.internalSignals.eligible,
          recommendedAction: readiness.recommendedAction,
          blockedReasons: readiness.decisions.internalSignals.blockedReasons,
          unresolvedSupplierRatePct: readiness.evaluation.unresolvedSupplierRatePct,
        })
      : null;
    const opportunityFreshness = getOpportunityFreshnessSummary(opportunities);
    const selectedOpenOpportunityFilterLabel =
      OPEN_OPPORTUNITY_FILTER_OPTIONS.find((option) => option.value === selectedOpenOpportunityType)?.label ??
      'All';

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel dashboard-hero-panel">
          <div className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <p className="eyebrow">Ambe Intelligence</p>
              <h2 className="title">Your trading desk, simplified</h2>
              <p className="copy">
                Review supplier offers, check opportunities, and keep buying decisions clear.
              </p>
            </div>
            <div className="dashboard-hero-status">
              <p className="dashboard-summary-label">Signal freshness</p>
              <div className="dashboard-hero-pill-row">
                <span className={`pill ${opportunityFreshness.pillClassName}`}>{opportunityFreshness.label}</span>
                <p className="dashboard-summary-note">{opportunityFreshness.detail}</p>
              </div>
            </div>
          </div>
          {query?.updated ? (
            <p className="dashboard-inline-message dashboard-inline-message-success">
              Opportunity updated: {query.updated.replace(/_/g, ' ')}.
            </p>
          ) : null}
          {query?.refreshed ? (
            <p className="dashboard-inline-message dashboard-inline-message-success">
              Opportunities refreshed. {query.refreshed} signals were created or updated.
            </p>
          ) : null}
          {query?.error ? (
            <p className="dashboard-inline-message dashboard-inline-message-error">
              {query.error}
            </p>
          ) : null}
          <div className="actions">
            <Link className="button button-primary" href="/dashboard/review">
              Open review queue
            </Link>
            <Link className="button" href="/dashboard/opportunities">
              Open buying opportunities
            </Link>
            <form action={submitOpportunityRefreshAction} className="refresh-opportunities-form">
              <button className="button" type="submit">
                Refresh opportunities
              </button>
              <p className="form-helper refresh-opportunities-helper">
                Rechecks current data and updates opportunity signals. It does not send emails or contact suppliers.
              </p>
            </form>
          </div>
          <div className="dashboard-feature-grid">
            <Link className="dashboard-feature-card" href="/dashboard/review">
              <p className="dashboard-feature-title">Supplier offers</p>
              <p className="dashboard-feature-copy">
                Check new prices before they enter the system.
              </p>
            </Link>
            <Link className="dashboard-feature-card" href="/dashboard/opportunities">
              <p className="dashboard-feature-title">Buying signals</p>
              <p className="dashboard-feature-copy">
                See which products may be worth acting on.
              </p>
            </Link>
            <Link className="dashboard-feature-card" href="/dashboard/products">
              <p className="dashboard-feature-title">Clean records</p>
              <p className="dashboard-feature-copy">
                Keep supplier, product, and email data organised.
              </p>
            </Link>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Business Overview</p>
              <h3 className="section-title">Today at a glance</h3>
              <p className="copy">
                A quick view of the work waiting for the team and the records that may need cleanup.
              </p>
            </div>
          </div>
          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Focus open opportunities:</span>
            {OPEN_OPPORTUNITY_FILTER_OPTIONS.map((option) => {
              const isActive = option.value === selectedOpenOpportunityType;
              const href = option.value ? `/dashboard?openType=${option.value}#open-opportunities` : '/dashboard#open-opportunities';

              return (
                <Link
                  className={`pill ${isActive ? 'pill-high' : 'pill-neutral'}`}
                  href={href}
                  key={option.label}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
          {selectedOpenOpportunityType ? (
            <p className="dashboard-summary-note">
              Showing only {selectedOpenOpportunityFilterLabel} opportunities.
            </p>
          ) : null}
          <div className="dashboard-summary-grid">
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">{buyCount}</p>
              <p className="dashboard-summary-label">Buying signals</p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">{pushCount}</p>
              <p className="dashboard-summary-label">Products to push</p>
            </article>
            <article className="dashboard-summary-card">
              <p className="dashboard-summary-value">{otherCount}</p>
              <p className="dashboard-summary-label">Watchlist items</p>
            </article>
          </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Operational Snapshot</p>
              <h3 className="section-title">What the system is doing</h3>
              <p className="copy">
                A compact view of whether work is being created, reviewed, and kept clean enough to trust.
              </p>
            </div>
            <Link className="button" href="/dashboard/products">
              Open product records
            </Link>
          </div>

            <div className="dashboard-summary-grid">
              {operationalSnapshotMetrics.map((metric) => (
                <article className="dashboard-summary-card" key={metric.label}>
                  <p className="dashboard-summary-value">{metric.value}</p>
                  <p className="dashboard-summary-label">{metric.label}</p>
                  <p className="dashboard-summary-note">{metric.note}</p>
                  {metric.actionHref && metric.actionLabel ? (
                    <Link className="dashboard-metric-link" href={metric.actionHref}>
                      {metric.actionLabel}
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Readiness Check</p>
              <h3 className="section-title">Value and trust at a glance</h3>
              <p className="copy">
                A compact readout of signal volume, operator workload, and trust signals from the last 30 days.
              </p>
            </div>
            <span className="pill pill-neutral">
              {readiness ? readiness.policy.globalMode.replaceAll('_', ' ') : 'Snapshot unavailable'}
            </span>
          </div>

          {readiness ? (
            <>
              <div className="dashboard-proof-grid">
                {pilotSnapshotMetrics.map((metric) => (
                  <article className="dashboard-summary-card" key={metric.label}>
                    <p className="dashboard-summary-value">{metric.value}</p>
                    <p className="dashboard-summary-label">{metric.label}</p>
                    <p className="dashboard-summary-note">{metric.note}</p>
                  </article>
                ))}
              </div>

              {readinessSummary ? (
                <div className="dashboard-proof-callout">
                  <p className="dashboard-proof-title">{readinessSummary.title}</p>
                  <p className="dashboard-proof-copy">{readinessSummary.detail}</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="copy">
              Pilot trust metrics are temporarily unavailable. Your open opportunities are still shown below.
            </p>
          )}
        </section>

        {opportunities.length === 0 ? (
          <section className="panel dashboard-panel" id="open-opportunities">
            <h3 className="section-title">No open opportunities</h3>
            <p className="copy">
              Everything is up to date. New opportunities will appear here when fresh supplier, sales,
              or pricing data creates a signal worth reviewing.
            </p>
          </section>
        ) : filteredOpenOpportunities.length === 0 ? (
          <section className="panel dashboard-panel" id="open-opportunities">
            <h3 className="section-title">No matching opportunities</h3>
            <p className="copy">
              There are no open {selectedOpenOpportunityFilterLabel} opportunities right now.
              {' '}
              <Link href="/dashboard#open-opportunities">Show all opportunities</Link>.
            </p>
          </section>
        ) : (
          buckets
            .filter((bucket) => bucket.items.length > 0)
            .map((bucket) => (
              <section
                className="panel dashboard-panel"
                id={bucket.key === 'buy' ? 'open-opportunities' : undefined}
                key={bucket.key}
              >
                <div className="dashboard-section-header">
                  <div>
                    <h3 className="section-title">{bucket.title}</h3>
                    <p className="copy">{bucket.description}</p>
                  </div>
                  <span className="pill pill-neutral">{bucket.items.length} open</span>
                </div>

                <div className="dashboard-opportunity-list">
                  {bucket.items.slice(0, 5).map((item) => (
                    <article className="dashboard-opportunity-card" key={item.id}>
                      <div className="dashboard-opportunity-top">
                        <div>
                          <p className="dashboard-opportunity-title">{item.title}</p>
                          <p className="dashboard-opportunity-meta">
                            {item.product?.name ?? 'Product not found'}
                            {item.supplier?.name ? ` | ${item.supplier.name}` : ''}
                          </p>
                        </div>
                        <div className="dashboard-opportunity-badges">
                          <span className="pill pill-neutral">{formatOpportunityType(item.type)}</span>
                          <span className="pill pill-neutral">{item.status}</span>
                          <span className="pill pill-high">Score {item.score}</span>
                        </div>
                      </div>

                      <p className="dashboard-opportunity-copy">{item.description}</p>

                      <p className="dashboard-triage-meta">
                        Signal refreshed {formatDateTime(item.updatedAt) ?? 'recently'}
                      </p>

                      <ul className="dashboard-signal-list">
                        {buildOpportunitySignals(item).map((signal) => (
                          <li key={signal}>{signal}</li>
                        ))}
                      </ul>

                      <form action={submitOpportunityTriageAction} className="dashboard-opportunity-actions">
                        <input name="opportunityId" type="hidden" value={item.id} />
                        <button className="button" name="status" type="submit" value="REVIEWED">
                          Mark reviewed
                        </button>
                        <button className="button button-primary" name="status" type="submit" value="ACTIONED">
                          Mark actioned
                        </button>
                        <button className="button" name="status" type="submit" value="DISMISSED">
                          Dismiss
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              </section>
            ))
        )}

        {recentlyTriaged.length > 0 ? (
          <section className="panel dashboard-panel" id="recently-triaged">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Recently updated opportunities</h3>
                <p className="copy">
                  A short record of what was recently reviewed, actioned, or dismissed.
                </p>
              </div>
              <span className="pill pill-neutral">{recentlyTriaged.length} recent</span>
            </div>

            <div className="dashboard-opportunity-list">
              {recentlyTriaged.map((item) => (
                <article className="dashboard-opportunity-card" key={item.id}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">{item.title}</p>
                      <p className="dashboard-opportunity-meta">
                        {item.product?.name ?? 'Product not found'}
                        {item.supplier?.name ? ` | ${item.supplier.name}` : ''}
                      </p>
                    </div>
                    <div className="dashboard-opportunity-badges">
                      <span className="pill pill-neutral">{formatOpportunityType(item.type)}</span>
                      <span className="pill pill-neutral">{item.status}</span>
                    </div>
                  </div>

                  <p className="dashboard-opportunity-copy">{item.description}</p>

                  <p className="dashboard-triage-meta">
                    Triaged {formatDateTime(getOpportunityTriageTimestamp(item)) ?? 'recently'}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Ambe Intelligence</p>
        <h2 className="title">Dashboard unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load open opportunities.'}
        </p>
        <div className="actions">
          <Link className="button" href="/dashboard/review">
            Open review queue
          </Link>
        </div>
      </section>
    );
  }
}
