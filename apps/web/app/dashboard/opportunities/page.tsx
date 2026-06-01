import Link from 'next/link';

import {
  listOpportunities,
  type OpportunityListItem,
  type OpportunityListType,
} from '../../../lib/opportunitiesApi';
import { submitOpportunityTriageAction } from '../actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    error?: string;
    status?: string;
    type?: string;
    updated?: string;
  }>;
};

type OpportunityStatusFilter = 'OPEN' | 'REVIEWED' | 'ACTIONED' | 'DISMISSED';

const STATUS_FILTER_OPTIONS: OpportunityStatusFilter[] = [
  'OPEN',
  'REVIEWED',
  'ACTIONED',
  'DISMISSED',
];
const TYPE_FILTER_OPTIONS: Array<{
  label: string;
  value: OpportunityListType | null;
}> = [
  { label: 'All', value: null },
  { label: 'BUY', value: 'BUY' },
  { label: 'PUSH', value: 'PUSH' },
  { label: 'PRICE_ALERT', value: 'PRICE_ALERT' },
];

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

  const signals = [
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
  ];

  return signals.filter((value): value is string => Boolean(value)).slice(0, 4);
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

function normalizeStatusFilter(
  value: string | undefined,
): OpportunityStatusFilter {
  switch (value) {
    case 'REVIEWED':
    case 'ACTIONED':
    case 'DISMISSED':
      return value;
    default:
      return 'OPEN';
  }
}

function normalizeTypeFilter(
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

function buildOpportunitiesHref(
  status: OpportunityStatusFilter,
  type: OpportunityListType | null,
) {
  const searchParams = new URLSearchParams();
  if (status !== 'OPEN') {
    searchParams.set('status', status);
  }
  if (type) {
    searchParams.set('type', type);
  }

  const query = searchParams.toString();
  return `/dashboard/opportunities${query ? `?${query}` : ''}`;
}

function canShowTriageActions(status: OpportunityStatusFilter): boolean {
  return status === 'OPEN' || status === 'REVIEWED';
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const query = searchParams ? await searchParams : undefined;
  const selectedStatus = normalizeStatusFilter(query?.status);
  const selectedType = normalizeTypeFilter(query?.type);

  try {
    const opportunities = await listOpportunities({
      status: selectedStatus,
      ...(selectedType ? { type: selectedType } : {}),
      sortBy: selectedStatus === 'OPEN' ? 'score' : 'updatedAt',
    });

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Opportunities</p>
              <h2 className="title">Opportunity Workflow</h2>
              <p className="copy">
                A bounded operational view of open and triaged signals using the
                same opportunity engine and status flow as the dashboard.
              </p>
            </div>
            <Link className="button" href="/dashboard">
              Back to dashboard
            </Link>
          </div>

          {query?.updated ? (
            <p className="dashboard-inline-message dashboard-inline-message-success">
              Opportunity marked {query.updated.replace(/_/g, ' ')}.
            </p>
          ) : null}
          {query?.error ? (
            <p className="dashboard-inline-message dashboard-inline-message-error">
              {query.error}
            </p>
          ) : null}

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Status:</span>
            {STATUS_FILTER_OPTIONS.map((status) => {
              const isActive = status === selectedStatus;

              return (
                <Link
                  className={`pill ${isActive ? 'pill-high' : 'pill-neutral'}`}
                  href={buildOpportunitiesHref(status, selectedType)}
                  key={status}
                >
                  {status.replace('_', ' ')}
                </Link>
              );
            })}
          </div>

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Type:</span>
            {TYPE_FILTER_OPTIONS.map((option) => {
              const isActive = option.value === selectedType;

              return (
                <Link
                  className={`pill ${isActive ? 'pill-high' : 'pill-neutral'}`}
                  href={buildOpportunitiesHref(selectedStatus, option.value)}
                  key={option.label}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </section>

        {opportunities.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No Matching Opportunities</h3>
            <p className="copy">
              There are no {selectedStatus.toLowerCase().replace('_', ' ')}{' '}
              opportunities
              {selectedType
                ? ` for ${selectedType.replace('_', ' ')}`
                : ''}{' '}
              right now.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">
                  {selectedStatus.replace('_', ' ')} opportunities
                  {selectedType ? ` | ${selectedType.replace('_', ' ')}` : ''}
                </h3>
                <p className="copy">
                  {opportunities.length} opportunity
                  {opportunities.length === 1 ? '' : 'ies'} in the current
                  filter.
                </p>
              </div>
              <span className="pill pill-neutral">
                {opportunities.length} items
              </span>
            </div>

            <div className="dashboard-opportunity-list">
              {opportunities.map((item) => (
                <article className="dashboard-opportunity-card" key={item.id}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">
                        {item.title}
                      </p>
                      <p className="dashboard-opportunity-meta">
                        {item.product?.name ?? 'Unknown product'}
                        {item.supplier?.name ? ` | ${item.supplier.name}` : ''}
                      </p>
                    </div>
                    <div className="dashboard-opportunity-badges">
                      <span className="pill pill-neutral">
                        {item.type.replace('_', ' ')}
                      </span>
                      <span className="pill pill-neutral">{item.status}</span>
                      <span className="pill pill-high">Score {item.score}</span>
                    </div>
                  </div>

                  <p className="dashboard-opportunity-copy">
                    {item.description}
                  </p>
                  <p className="dashboard-triage-meta">
                    Updated {formatDateTime(item.updatedAt) ?? 'recently'}
                  </p>

                  <ul className="dashboard-signal-list">
                    {buildOpportunitySignals(item).map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>

                  {canShowTriageActions(selectedStatus) ? (
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
                        value={buildOpportunitiesHref(
                          selectedStatus,
                          selectedType,
                        )}
                      />
                      {selectedStatus === 'OPEN' ? (
                        <button
                          className="button"
                          name="status"
                          type="submit"
                          value="REVIEWED"
                        >
                          Mark reviewed
                        </button>
                      ) : null}
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
          </section>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Opportunities</p>
        <h2 className="title">Opportunity View Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load opportunities.'}
        </p>
        <div className="actions">
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </section>
    );
  }
}
