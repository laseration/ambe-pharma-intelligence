import Link from 'next/link';

import {
  listTradeOpportunities,
  type TradeOpportunityListItem,
} from '../../../lib/dealsApi';

export const dynamic = 'force-dynamic';

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

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(
  value: number | string | null | undefined,
  currencyCode?: string | null,
) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return 'Not set';
  }

  return currencyCode?.trim()
    ? `${currencyCode.trim().toUpperCase()} ${numericValue.toFixed(2)}`
    : numericValue.toFixed(2);
}

function formatMarginPct(value: number | string | null | undefined) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return null;
  }

  return `${Math.round(numericValue * 100)}%`;
}

function humanizeValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatAuditAction(actionType: string): string {
  return actionType
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stageLabel(stage: TradeOpportunityListItem['stage']) {
  switch (stage) {
    case 'REVIEW':
      return 'Needs review';
    case 'READY_FOR_BUY':
      return 'Ready for buy';
    case 'BUY_APPROVED':
      return 'Buy approved';
    case 'BUY_ORDERED':
      return 'Buy ordered';
    case 'READY_FOR_BUYER_OUTREACH':
      return 'Ready for buyer outreach';
    case 'BUYER_CONTACTED':
      return 'Buyer contacted';
    case 'DEAL_CONFIRMED':
      return 'Deal confirmed';
    default:
      return humanizeValue(stage) ?? 'Unknown';
  }
}

function stagePillClassName(stage: TradeOpportunityListItem['stage']) {
  switch (stage) {
    case 'REVIEW':
      return 'pill-medium';
    case 'DEAL_CONFIRMED':
    case 'BUY_APPROVED':
    case 'BUY_ORDERED':
      return 'pill-high';
    case 'CLOSED':
      return 'pill-neutral';
    default:
      return 'pill-neutral';
  }
}

function statusPillClassName(status: TradeOpportunityListItem['status']) {
  switch (status) {
    case 'OPEN':
      return 'pill-high';
    case 'ON_HOLD':
      return 'pill-medium';
    case 'WON':
      return 'pill-high';
    case 'LOST':
    case 'DROPPED':
      return 'pill-low';
    default:
      return 'pill-neutral';
  }
}

function getLikelyBuyers(item: TradeOpportunityListItem) {
  return Array.isArray(item.metadata?.likelyBuyers)
    ? item.metadata.likelyBuyers.slice(0, 3)
    : [];
}

function buildDealSignals(item: TradeOpportunityListItem): string[] {
  const likelyBuyers = getLikelyBuyers(item);
  const recentUnitsSold = item.metadata?.recentUnitsSold ?? null;
  const recentDemandWindowDays = item.metadata?.recentDemandWindowDays ?? null;
  const quantityTarget = item.quantityTarget;
  const topBuyer = likelyBuyers[0];

  const signals = [
    recentUnitsSold !== null && recentDemandWindowDays !== null
      ? `Recent demand ${recentUnitsSold} units in the last ${recentDemandWindowDays} days`
      : null,
    quantityTarget !== null ? `Target quantity ${quantityTarget} units` : null,
    topBuyer ? `Top buyer ${topBuyer.name} (${topBuyer.units} units)` : null,
    item.sourceType === 'BUY_DECISION' ||
    item.metadata?.createdFrom === 'approved_buy_decision_demand_match'
      ? 'Created from approved supplier offer'
      : null,
  ];

  return signals.filter((value): value is string => Boolean(value));
}

function resolveProductLabel(item: TradeOpportunityListItem) {
  return (
    item.product?.name ??
    item.normalizedProductNameCandidate?.trim() ??
    item.rawProductText?.trim() ??
    'Unknown product'
  );
}

function resolveSupplierLabel(item: TradeOpportunityListItem) {
  return (
    item.supplier?.name ??
    item.sourceSupplierNameSnapshot?.trim() ??
    'Supplier to confirm'
  );
}

export default async function DealsPage() {
  try {
    const deals = await listTradeOpportunities();

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Deals</p>
              <h2 className="title">Trade opportunities</h2>
              <p className="copy">
                Supplier offers matched with recent demand and possible margin.
              </p>
            </div>
            <Link className="button" href="/dashboard/opportunities">
              Open signals
            </Link>
          </div>
        </section>

        {deals.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No trade opportunities yet</h3>
            <p className="copy">
              Approved supplier offers with recent demand and positive margin
              will appear here.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Recent trade opportunities</h3>
                <p className="copy">
                  Review demand, likely buyers, and possible margin before
                  taking any next step.
                </p>
              </div>
              <span className="pill pill-neutral">{deals.length} items</span>
            </div>

            <div className="dashboard-opportunity-list">
              {deals.map((deal) => {
                const likelyBuyers = getLikelyBuyers(deal);
                const estimatedMarginAmount = formatMoney(
                  deal.estimatedMarginAmount,
                  deal.targetSellCurrencyCode ?? deal.quotedBuyCurrencyCode,
                );
                const estimatedMarginPct = formatMarginPct(
                  deal.estimatedMarginPct,
                );

                return (
                  <article className="dashboard-opportunity-card" key={deal.id}>
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">
                          {resolveProductLabel(deal)}
                        </p>
                        <p className="dashboard-opportunity-meta">
                          {resolveSupplierLabel(deal)}
                        </p>
                      </div>
                      <div className="dashboard-opportunity-badges">
                        <span
                          className={`pill ${stagePillClassName(deal.stage)}`}
                        >
                          {stageLabel(deal.stage)}
                        </span>
                        <span
                          className={`pill ${statusPillClassName(deal.status)}`}
                        >
                          {humanizeValue(deal.status) ?? deal.status}
                        </span>
                      </div>
                    </div>

                    {deal.rationale ? (
                      <p className="dashboard-opportunity-copy">
                        {deal.rationale}
                      </p>
                    ) : null}

                    <dl className="duplicate-product-details">
                      <div>
                        <dt>Buy price</dt>
                        <dd>
                          {formatMoney(
                            deal.quotedBuyUnitPrice,
                            deal.quotedBuyCurrencyCode,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Expected sell price</dt>
                        <dd>
                          {formatMoney(
                            deal.targetSellUnitPrice,
                            deal.targetSellCurrencyCode,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Estimated margin</dt>
                        <dd>
                          {estimatedMarginAmount}
                          {estimatedMarginPct ? ` | ${estimatedMarginPct}` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Recent demand</dt>
                        <dd>
                          {deal.metadata?.recentUnitsSold ?? 0}
                          {deal.metadata?.recentDemandWindowDays
                            ? ` units in ${deal.metadata.recentDemandWindowDays} days`
                            : ' units'}
                        </dd>
                      </div>
                    </dl>

                    <ul className="dashboard-signal-list">
                      {buildDealSignals(deal).map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>

                    <div>
                      <p className="dashboard-opportunity-meta">
                        Likely buyers
                      </p>
                      {likelyBuyers.length === 0 ? (
                        <p className="dashboard-triage-meta">
                          No recent buyer pattern recorded yet.
                        </p>
                      ) : (
                        <ul className="dashboard-signal-list">
                          {likelyBuyers.map((buyer) => (
                            <li key={`${deal.id}-${buyer.customerId}`}>
                              {buyer.name} | {buyer.units} units |{' '}
                              {buyer.orderCount} orders
                              {buyer.lastSaleAt
                                ? ` | last sale ${formatDateTime(buyer.lastSaleAt) ?? buyer.lastSaleAt}`
                                : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <p className="dashboard-triage-meta">
                      Updated {formatDateTime(deal.updatedAt) ?? 'recently'}
                      {deal.buyDecision?.id
                        ? ' | Linked to approved supplier offer'
                        : ''}
                    </p>

                    {deal.events?.length ? (
                      <details className="document-card technical-details-card">
                        <summary>Audit history</summary>
                        <ol className="audit-history-list">
                          {deal.events.slice(-6).map((event) => (
                            <li className="audit-history-item" key={event.id}>
                              <div className="audit-history-topline">
                                <span>
                                  {formatAuditAction(event.actionType)}
                                </span>
                                <span className="pill pill-neutral">Deal</span>
                              </div>
                              <p className="copy audit-history-meta">
                                {formatDateTime(event.createdAt) ??
                                  event.createdAt}{' '}
                                by{' '}
                                {event.actorIdentifier ??
                                  event.actorType ??
                                  'Unknown actor'}
                              </p>
                              {event.previousStatus ||
                              event.newStatus ||
                              event.previousStage ||
                              event.newStage ? (
                                <p className="copy audit-history-meta">
                                  {[event.previousStatus, event.previousStage]
                                    .filter(Boolean)
                                    .join(' / ') || 'No previous status'}{' '}
                                  {'->'}{' '}
                                  {[event.newStatus, event.newStage]
                                    .filter(Boolean)
                                    .join(' / ') || 'No new status'}
                                </p>
                              ) : null}
                              {event.note ? (
                                <p className="copy audit-history-note">
                                  {event.note}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : (
                      <p className="dashboard-triage-meta">
                        No deal audit events recorded yet.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Deals</p>
        <h2 className="title">Deal view unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load trade opportunities.'}
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
