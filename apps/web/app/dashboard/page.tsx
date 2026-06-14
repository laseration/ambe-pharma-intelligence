import Link from 'next/link';

import {
  CockpitGrid,
  CommandRail,
  DashboardHero,
  DashboardPanel,
  FeatureCard,
  IntelligenceDeck,
  KpiCard,
  ReviewQueueRow,
  SectionHeader,
  StatusBadge,
  TrustSummary,
  TrustTower,
  type TrustSummaryRow,
} from '../components/dashboard';
import cockpit from '../components/dashboard/Cockpit.module.css';
import { getAutomationReadinessOverview } from '../../lib/automationApi';
import { listCustomerContactOpportunities } from '../../lib/customersApi';
import {
  buildCommercialValueMetrics,
  buildDataQualityIssues,
  buildNextActions,
  buildRecentlyTriagedOpportunities,
  countPendingReviewEmails,
  getBestBuyingSignals,
  getOpportunityFreshnessSummary,
  getOpportunityTriageTimestamp,
  sortReviewItemsForAction,
  summarizeReadiness,
} from '../../lib/dashboardCockpit';
import { listStockRisk } from '../../lib/inventoryApi';
import {
  listOpenOpportunities,
  listOpportunities,
  type OpportunityListItem,
  type OpportunityListType,
} from '../../lib/opportunitiesApi';
import { listLikelyDuplicateProductGroups } from '../../lib/productsApi';
import {
  listReviewWorkflowItems,
  type ReviewWorkflowListItem,
} from '../../lib/reviewApi';
import { roleHasCapability } from '../../lib/authorisation';
import { requireCurrentWebCapability } from '../../lib/serverWebAuth';
import {
  submitOpportunityRefreshAction,
  submitOpportunityTriageAction,
} from './actions';

export const dynamic = 'force-dynamic';

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    openType?: string;
    refreshed?: string;
    updated?: string;
  }>;
};

type SettledData<T> = {
  value: T;
  failed: boolean;
};

const OPEN_OPPORTUNITY_FILTER_OPTIONS: Array<{
  label: string;
  value: OpportunityListType | null;
}> = [
  { label: 'All', value: null },
  { label: 'BUY', value: 'BUY' },
  { label: 'PUSH', value: 'PUSH' },
  { label: 'PRICE ALERT', value: 'PRICE_ALERT' },
];

function settledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
): SettledData<T> {
  return result.status === 'fulfilled'
    ? { value: result.value, failed: false }
    : { value: fallback, failed: true };
}

function formatPrice(
  value: number | null | undefined,
  currencyCode?: string | null,
) {
  if (value === null || value === undefined) {
    return null;
  }

  return currencyCode?.trim()
    ? `${currencyCode.trim().toUpperCase()} ${value.toFixed(2)}`
    : value.toFixed(2);
}

function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
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

function normalizeOpenOpportunityFilterType(
  value: string | undefined,
): OpportunityListType | null {
  switch (value) {
    case 'BUY':
    case 'PUSH':
    case 'PRICE_ALERT':
      return value;
    default:
      return null;
  }
}

function actionPriorityVariant(
  priority: 'high' | 'medium' | 'normal',
): 'high' | 'medium' | 'neutral' {
  return priority === 'normal' ? 'neutral' : priority;
}

function reviewPriorityVariant(
  priority: ReviewWorkflowListItem['priority'],
): 'high' | 'medium' | 'neutral' {
  if (priority === 'HIGH') {
    return 'high';
  }

  if (priority === 'LOW') {
    return 'neutral';
  }

  return 'medium';
}

function buildOpportunitySignals(item: OpportunityListItem): string[] {
  const metrics = item.metadata?.metrics;
  const commercialContext = item.metadata?.commercialContext;
  const currencyCode = commercialContext?.supplierCurrencyCode ?? null;
  const latestSupplierBuyPrice =
    commercialContext?.latestSupplierBuyPrice ??
    metrics?.latestSupplierBuyPrice ??
    null;
  const averageSalePrice =
    commercialContext?.averageSalePrice ?? metrics?.averageSalePrice ?? null;
  const estimatedMarginPct =
    commercialContext?.estimatedMarginPct ??
    metrics?.estimatedMarginPct ??
    null;
  const priceDeltaVsMarketPct =
    commercialContext?.priceDeltaVsMarketPct ??
    metrics?.priceDeltaVsMarketPct ??
    null;
  const simulatedMarketPrice = commercialContext?.simulatedMarketPrice ?? null;
  const recentSalesUnits30d = metrics?.recentSalesUnits30d ?? null;
  const currentStockQty = metrics?.currentStockQty ?? null;

  return [
    latestSupplierBuyPrice !== null
      ? `Buy price ${formatPrice(latestSupplierBuyPrice, currencyCode)}`
      : null,
    simulatedMarketPrice !== null && priceDeltaVsMarketPct !== null
      ? `Market reference ${formatPrice(simulatedMarketPrice, currencyCode)} (${priceDeltaVsMarketPct < 0 ? `${formatPct(Math.abs(priceDeltaVsMarketPct))} below market` : `${formatPct(priceDeltaVsMarketPct)} above market`})`
      : null,
    averageSalePrice !== null
      ? `Average sale price ${formatPrice(averageSalePrice, currencyCode)}`
      : null,
    estimatedMarginPct !== null
      ? `Estimated margin ${formatPct(estimatedMarginPct)}`
      : null,
    recentSalesUnits30d !== null
      ? `Recent sales ${recentSalesUnits30d} units in 30d`
      : null,
    currentStockQty !== null ? `Current stock ${currentStockQty} units` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);
}

function describeReviewItem(item: ReviewWorkflowListItem): string {
  const offer = item.emailDerivedOffer;
  const product =
    offer?.rawProductText ??
    offer?.normalizedProductNameCandidate ??
    'Supplier offer';
  const supplier = offer?.supplierCandidate ?? item.inboundEmail?.fromEmail;
  const price =
    offer?.priceCandidate && offer.currencyCandidate
      ? `${offer.currencyCandidate} ${offer.priceCandidate}`
      : offer?.priceCandidate;

  return [product, supplier, price].filter(Boolean).join(' | ');
}

function filterOpportunitiesForFocus(
  opportunities: OpportunityListItem[],
  selectedType: OpportunityListType | null,
) {
  if (!selectedType) {
    return opportunities;
  }

  return opportunities.filter((item) => item.type === selectedType);
}

function canOpenDashboardHref(
  href: string,
  capabilities: {
    canViewCustomers: boolean;
    canViewImports: boolean;
    canViewInventory: boolean;
    canViewProducts: boolean;
    canViewReview: boolean;
    canViewSetup: boolean;
  },
) {
  if (href.startsWith('/dashboard/review')) {
    return capabilities.canViewReview;
  }

  if (href.startsWith('/dashboard/imports')) {
    return capabilities.canViewImports;
  }

  if (href.startsWith('/dashboard/setup')) {
    return capabilities.canViewSetup;
  }

  if (href.startsWith('/dashboard/inventory')) {
    return capabilities.canViewInventory;
  }

  if (href.startsWith('/dashboard/customers')) {
    return capabilities.canViewCustomers;
  }

  if (href.startsWith('/dashboard/products')) {
    return capabilities.canViewProducts;
  }

  return href.startsWith('/dashboard');
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await requireCurrentWebCapability('dashboard:view');
  const query = searchParams ? await searchParams : undefined;
  const selectedOpenOpportunityType = normalizeOpenOpportunityFilterType(
    query?.openType,
  );
  const canViewReview = roleHasCapability(session.role, 'review:view');
  const canViewInbox = roleHasCapability(session.role, 'inbox:view');
  const canViewImports = roleHasCapability(session.role, 'imports:view');
  const canViewInventory = roleHasCapability(session.role, 'inventory:view');
  const canViewCustomers = roleHasCapability(session.role, 'customers:view');
  const canViewProducts = roleHasCapability(session.role, 'products:view');
  const canViewSetup = roleHasCapability(session.role, 'system:admin');
  const canManageOpportunities = roleHasCapability(
    session.role,
    'opportunities:manage',
  );

  const [
    openOpportunitiesResult,
    reviewItemsResult,
    readinessResult,
    reviewedResult,
    actionedResult,
    dismissedResult,
    duplicateGroupsResult,
    approvedWorkflowResult,
    rejectedWorkflowResult,
    stockRiskResult,
    customerFollowUpsResult,
  ] = await Promise.allSettled([
    listOpenOpportunities(),
    canViewReview
      ? listReviewWorkflowItems({ staleFirst: true })
      : Promise.resolve([]),
    getAutomationReadinessOverview(),
    listOpportunities({ status: 'REVIEWED', sortBy: 'updatedAt', take: 4 }),
    listOpportunities({ status: 'ACTIONED', sortBy: 'updatedAt', take: 4 }),
    listOpportunities({ status: 'DISMISSED', sortBy: 'updatedAt', take: 4 }),
    listLikelyDuplicateProductGroups(),
    canViewReview
      ? listReviewWorkflowItems({
          onlyOpen: false,
          status: 'APPROVED_TO_BUY',
        })
      : Promise.resolve([]),
    canViewReview
      ? listReviewWorkflowItems({
          onlyOpen: false,
          status: 'REJECTED',
        })
      : Promise.resolve([]),
    listStockRisk({ limit: 8 }),
    listCustomerContactOpportunities({ limit: 8 }),
  ]);

  const openOpportunities = settledValue(openOpportunitiesResult, []);
  const reviewItems = settledValue(reviewItemsResult, []);
  const readiness = settledValue(readinessResult, null);
  const reviewedItems = settledValue(reviewedResult, []);
  const actionedItems = settledValue(actionedResult, []);
  const dismissedItems = settledValue(dismissedResult, []);
  const duplicateGroups = settledValue(duplicateGroupsResult, null);
  const approvedWorkflowItems = settledValue(approvedWorkflowResult, []);
  const rejectedWorkflowItems = settledValue(rejectedWorkflowResult, []);
  const stockRisk = settledValue(stockRiskResult, []);
  const customerFollowUps = settledValue(customerFollowUpsResult, []);
  const apiFailures = [
    openOpportunities.failed ? 'opportunities' : null,
    reviewItems.failed ? 'review queue' : null,
    readiness.failed ? 'automation readiness' : null,
    duplicateGroups.failed ? 'product duplicates' : null,
    stockRisk.failed ? 'stock risk' : null,
    customerFollowUps.failed ? 'customer follow-ups' : null,
  ].filter((value): value is string => Boolean(value));
  const focusedOpportunities = filterOpportunitiesForFocus(
    openOpportunities.value,
    selectedOpenOpportunityType,
  );
  const bestBuyingSignals = getBestBuyingSignals(focusedOpportunities).slice(
    0,
    5,
  );
  const topReviewItems = sortReviewItemsForAction(reviewItems.value).slice(
    0,
    5,
  );
  const recentlyTriaged = buildRecentlyTriagedOpportunities([
    ...reviewedItems.value,
    ...actionedItems.value,
    ...dismissedItems.value,
  ]);
  const nextActions = buildNextActions({
    reviewItems: reviewItems.value,
    opportunities: openOpportunities.value,
    duplicateGroups: duplicateGroups.value,
    readiness: readiness.value,
    stockRiskCount: stockRisk.failed ? null : stockRisk.value.length,
    customerFollowUpCount: customerFollowUps.failed
      ? null
      : customerFollowUps.value.length,
  }).filter((action) =>
    canOpenDashboardHref(action.href, {
      canViewCustomers,
      canViewImports,
      canViewInventory,
      canViewProducts,
      canViewReview,
      canViewSetup,
    }),
  );
  const valueMetrics = buildCommercialValueMetrics({
    openOpportunities: openOpportunities.value,
    reviewItems: reviewItems.value,
    readiness: readiness.value,
  });
  const readinessSummary = summarizeReadiness(readiness.value);
  const freshness = getOpportunityFreshnessSummary(openOpportunities.value);
  const dataQualityIssues = buildDataQualityIssues({
    duplicateGroups: duplicateGroups.value,
    readiness: readiness.value,
    apiFailures,
  }).filter((issue) =>
    canOpenDashboardHref(issue.href, {
      canViewCustomers,
      canViewImports,
      canViewInventory,
      canViewProducts,
      canViewReview,
      canViewSetup,
    }),
  );
  const pendingSupplierEmailCount = countPendingReviewEmails(reviewItems.value);
  const selectedOpenOpportunityFilterLabel =
    OPEN_OPPORTUNITY_FILTER_OPTIONS.find(
      (option) => option.value === selectedOpenOpportunityType,
    )?.label ?? 'All';
  const dataQualityCount = dataQualityIssues.length;
  const readinessMode = readiness.value
    ? readiness.value.policy.globalMode.replaceAll('_', ' ')
    : 'Unavailable';
  const trustRows: TrustSummaryRow[] = [
    {
      label: 'Freshness',
      hint: 'How recent the open signals are',
      badgeText: freshness.label,
      badgeTone: freshness.pillClassName,
    },
    {
      label: 'Automation readiness',
      hint: readinessSummary.blocked
        ? 'More evidence needed'
        : 'Eligible for pilot use',
      badgeText: readinessMode,
      badgeTone: readinessSummary.blocked ? 'pill-medium' : 'pill-high',
    },
    {
      label: 'Data quality',
      hint: 'Records that affect matching',
      badgeText:
        dataQualityCount === 0
          ? 'Clear'
          : `${dataQualityCount} issue${dataQualityCount === 1 ? '' : 's'}`,
      badgeTone: dataQualityCount === 0 ? 'pill-high' : 'pill-medium',
    },
  ];

  return (
    <section className="dashboard-layout">
      <DashboardHero
        eyebrow="Operations overview"
        title="What needs doing next"
        copy="Start with supplier decisions, act on the best commercial signals, then clear the data issues that weaken trust."
        statusLabel="Signal freshness"
        freshnessTone={freshness.pillClassName}
        freshnessLabel={freshness.label}
        freshnessDetail={freshness.detail}
      >
        {query?.updated ? (
          <p className="dashboard-inline-message dashboard-inline-message-success">
            Opportunity updated: {query.updated.replace(/_/g, ' ')}.
          </p>
        ) : null}
        {query?.refreshed ? (
          <p className="dashboard-inline-message dashboard-inline-message-success">
            Opportunities refreshed. {query.refreshed} signals were created or
            updated.
          </p>
        ) : null}
        {query?.error ? (
          <p className="dashboard-inline-message dashboard-inline-message-error">
            {query.error}
          </p>
        ) : null}
        {apiFailures.length > 0 ? (
          <p className="dashboard-inline-message dashboard-inline-message-error">
            Some cockpit data could not load: {apiFailures.join(', ')}.
          </p>
        ) : null}

        <div className="actions">
          {canViewReview ? (
            <Link className="button button-primary" href="/dashboard/review">
              Open reviews
            </Link>
          ) : null}
          {canViewInbox ? (
            <Link className="button" href="/dashboard/inbox">
              Open inbox
            </Link>
          ) : null}
          <Link className="button" href="/dashboard/opportunities">
            View opportunities
          </Link>
          {canViewSetup ? (
            <Link className="button" href="/dashboard/setup">
              Setup checklist
            </Link>
          ) : null}
          {canManageOpportunities ? (
            <form action={submitOpportunityRefreshAction}>
              <button className="button" type="submit">
                Refresh opportunities
              </button>
            </form>
          ) : null}
        </div>
      </DashboardHero>

      <CockpitGrid>
        <CommandRail>
          <DashboardPanel className={cockpit.compactPanel}>
            <SectionHeader
              eyebrow="Needs review"
              title="Supplier offers to decide"
              action={
                canViewReview ? (
                  <Link className="button" href="/dashboard/review">
                    Open queue
                  </Link>
                ) : null
              }
            />

            {topReviewItems.length === 0 ? (
              <div className="dashboard-proof-callout">
                <p className="dashboard-proof-title">No offers waiting</p>
                <p className="dashboard-proof-copy">
                  Supplier emails, Telegram files, and imports add staged offers
                  here when they need an operator decision.
                </p>
              </div>
            ) : (
              <>
                <p className={cockpit.queueCount}>
                  {pendingSupplierEmailCount} supplier email
                  {pendingSupplierEmailCount === 1 ? '' : 's'} awaiting a
                  decision.
                </p>
                <div className={cockpit.queue}>
                  {topReviewItems.map((item) => (
                    <ReviewQueueRow
                      decideHref={`/dashboard/review/${item.id}`}
                      key={item.id}
                      meta={item.inboundEmail?.subject ?? 'No subject'}
                      priorityLabel={item.priority}
                      priorityVariant={reviewPriorityVariant(item.priority)}
                      title={describeReviewItem(item)}
                    />
                  ))}
                </div>
              </>
            )}
          </DashboardPanel>

          <DashboardPanel className={cockpit.compactPanel}>
            <SectionHeader eyebrow="Priorities" title="Next actions" />
            <div className={cockpit.worklist}>
              {nextActions.map((action) => (
                <FeatureCard href={action.href} key={action.key}>
                  <div className="dashboard-opportunity-top">
                    <p className="dashboard-feature-title">{action.title}</p>
                    <StatusBadge
                      variant={actionPriorityVariant(action.priority)}
                    >
                      {action.value}
                    </StatusBadge>
                  </div>
                  <p className="dashboard-feature-copy">{action.meaning}</p>
                  <p className="dashboard-summary-note">{action.nextAction}</p>
                  <span className="dashboard-metric-link">{action.cta}</span>
                </FeatureCard>
              ))}
            </div>
          </DashboardPanel>
        </CommandRail>

        <IntelligenceDeck>
          <DashboardPanel>
            <SectionHeader
              eyebrow="Performance"
              title="Is automation adding value?"
              copy="Operational proof points from real review, opportunity, and readiness data."
            />

            <div className={cockpit.metricStrip}>
              {valueMetrics.map((metric) => (
                <KpiCard
                  key={metric.label}
                  value={metric.value}
                  label={metric.label}
                  note={metric.note}
                />
              ))}
            </div>
          </DashboardPanel>

          <DashboardPanel id="best-buying-signals">
            <SectionHeader
              eyebrow="Buying Signals"
              title="Best buying signals"
              copy="Focus on the highest-scoring BUY and PRICE ALERT opportunities first. Mark them actioned only after an operator has checked the source context."
              action={
                <Link className="button" href="/dashboard/opportunities">
                  Open all opportunities
                </Link>
              }
            />

            <div className="dashboard-filter-row">
              <span className="dashboard-filter-label">Focus:</span>
              {OPEN_OPPORTUNITY_FILTER_OPTIONS.map((option) => {
                const isActive = option.value === selectedOpenOpportunityType;
                const href = option.value
                  ? `/dashboard?openType=${option.value}#best-buying-signals`
                  : '/dashboard#best-buying-signals';

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
                Showing {selectedOpenOpportunityFilterLabel} opportunities in
                this cockpit section.
              </p>
            ) : null}

            {bestBuyingSignals.length === 0 ? (
              <div className="dashboard-proof-callout">
                <p className="dashboard-proof-title">
                  No buy-side signal to act on
                </p>
                <p className="dashboard-proof-copy">
                  Import supplier prices, stock, and sales data, then refresh
                  opportunities. If data is already loaded, there may simply be
                  no BUY or PRICE ALERT signal right now.
                </p>
                <div className="actions">
                  {canManageOpportunities ? (
                    <form action={submitOpportunityRefreshAction}>
                      <button className="button button-primary" type="submit">
                        Refresh opportunities
                      </button>
                    </form>
                  ) : null}
                  {canViewImports ? (
                    <Link className="button" href="/dashboard/imports">
                      Check imports
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="dashboard-opportunity-list">
                {bestBuyingSignals.map((item) => (
                  <article className="dashboard-opportunity-card" key={item.id}>
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          {item.title}
                        </p>
                        <p className="dashboard-opportunity-meta">
                          {item.product?.name ?? 'Product not found'}
                          {item.supplier?.name
                            ? ` | ${item.supplier.name}`
                            : ''}
                        </p>
                      </div>
                      <div className="dashboard-opportunity-badges">
                        <StatusBadge>{item.type.replace('_', ' ')}</StatusBadge>
                        <StatusBadge variant="high">
                          Score {item.score}
                        </StatusBadge>
                      </div>
                    </div>
                    <p className="dashboard-opportunity-copy">
                      {item.description}
                    </p>
                    <p className="dashboard-triage-meta">
                      Signal refreshed{' '}
                      {formatDateTime(item.updatedAt) ?? 'recently'}
                    </p>
                    <ul className="dashboard-signal-list">
                      {buildOpportunitySignals(item).map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                    {canManageOpportunities ? (
                      <form
                        action={submitOpportunityTriageAction}
                        className="dashboard-opportunity-actions"
                      >
                        <input
                          name="opportunityId"
                          type="hidden"
                          value={item.id}
                        />
                        <input
                          name="redirectTo"
                          type="hidden"
                          value="/dashboard#best-buying-signals"
                        />
                        <button
                          className="button"
                          name="status"
                          type="submit"
                          value="REVIEWED"
                        >
                          Mark reviewed
                        </button>
                        <button
                          className="button button-primary"
                          name="status"
                          type="submit"
                          value="ACTIONED"
                        >
                          Mark actioned
                        </button>
                        <button
                          className="button"
                          name="status"
                          type="submit"
                          value="DISMISSED"
                        >
                          Dismiss
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel id="recent-work">
            <SectionHeader
              eyebrow="Recent Decisions"
              title="Recently approved, rejected, or actioned"
              copy="A short audit-friendly view of work the team has already touched."
              action={
                <Link
                  className="button"
                  href="/dashboard/opportunities?status=ACTIONED"
                >
                  View actioned
                </Link>
              }
            />

            {approvedWorkflowItems.value.length === 0 &&
            rejectedWorkflowItems.value.length === 0 &&
            recentlyTriaged.length === 0 ? (
              <div className="dashboard-proof-callout">
                <p className="dashboard-proof-title">No recent decisions yet</p>
                <p className="dashboard-proof-copy">
                  Approved buys, rejected offers, reviewed signals, and actioned
                  opportunities will appear here after operators start
                  processing the queue.
                </p>
              </div>
            ) : (
              <div className="dashboard-opportunity-list">
                {approvedWorkflowItems.value.slice(0, 3).map((item) => (
                  <article className="dashboard-opportunity-card" key={item.id}>
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          Approved to buy
                        </p>
                        <p className="dashboard-opportunity-meta">
                          {describeReviewItem(item)}
                        </p>
                      </div>
                      <StatusBadge variant="high">APPROVED</StatusBadge>
                    </div>
                    <p className="dashboard-triage-meta">
                      Updated {formatDateTime(item.updatedAt) ?? 'recently'}
                    </p>
                  </article>
                ))}
                {rejectedWorkflowItems.value.slice(0, 3).map((item) => (
                  <article className="dashboard-opportunity-card" key={item.id}>
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          Rejected supplier offer
                        </p>
                        <p className="dashboard-opportunity-meta">
                          {describeReviewItem(item)}
                        </p>
                      </div>
                      <StatusBadge variant="low">REJECTED</StatusBadge>
                    </div>
                    <p className="dashboard-triage-meta">
                      Updated {formatDateTime(item.updatedAt) ?? 'recently'}
                    </p>
                  </article>
                ))}
                {recentlyTriaged.map((item) => (
                  <article className="dashboard-opportunity-card" key={item.id}>
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          {item.title}
                        </p>
                        <p className="dashboard-opportunity-meta">
                          {item.product?.name ?? 'Product not found'}
                          {item.supplier?.name
                            ? ` | ${item.supplier.name}`
                            : ''}
                        </p>
                      </div>
                      <div className="dashboard-opportunity-badges">
                        <StatusBadge>{item.type.replace('_', ' ')}</StatusBadge>
                        <StatusBadge>{item.status}</StatusBadge>
                      </div>
                    </div>
                    <p className="dashboard-triage-meta">
                      Triaged{' '}
                      {formatDateTime(getOpportunityTriageTimestamp(item)) ??
                        'recently'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </DashboardPanel>
        </IntelligenceDeck>

        <TrustTower>
          <DashboardPanel className={cockpit.compactPanel}>
            <SectionHeader eyebrow="Trust" title="Signal you can trust" />
            <TrustSummary note={readinessSummary.detail} rows={trustRows} />
          </DashboardPanel>

          <DashboardPanel className={cockpit.compactPanel}>
            <SectionHeader
              eyebrow="Data quality"
              title="Issues to clear"
              action={
                <Link className="button" href="/dashboard/products">
                  Product records
                </Link>
              }
            />

            {dataQualityIssues.length === 0 ? (
              <div className="dashboard-proof-callout">
                <p className="dashboard-proof-title">
                  No data-quality blockers shown
                </p>
                <p className="dashboard-proof-copy">
                  Keep reviewing imported aliases and source corrections as new
                  supplier files arrive.
                </p>
              </div>
            ) : (
              <div className={cockpit.dataQualityGrid}>
                {dataQualityIssues.map((issue) => (
                  <FeatureCard href={issue.href} key={issue.key}>
                    <p className="dashboard-feature-title">{issue.title}</p>
                    <p className="dashboard-feature-copy">{issue.detail}</p>
                    <span className="dashboard-metric-link">{issue.cta}</span>
                  </FeatureCard>
                ))}
              </div>
            )}
          </DashboardPanel>
        </TrustTower>
      </CockpitGrid>
    </section>
  );
}
