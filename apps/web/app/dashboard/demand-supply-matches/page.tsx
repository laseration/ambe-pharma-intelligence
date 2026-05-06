import Link from 'next/link';

import {
  listDemandSupplyMatches,
  type DemandSupplyMatchConfidence,
  type DemandSupplyMatchItem,
  type DemandSupplyMatchStatus,
} from '../../../lib/demandSupplyMatchesApi';
import { submitGenerateDemandSupplyMatches } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    confidence?: string;
    productId?: string;
    customerId?: string;
    supplierId?: string;
    message?: string;
    error?: string;
  }>;
};

const STATUS_FILTERS: Array<{ label: string; value: DemandSupplyMatchStatus | null }> = [
  { label: 'All', value: null },
  { label: 'Needs review', value: 'NEW' },
  { label: 'Reviewed', value: 'REVIEWED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Promoted', value: 'PROMOTED' },
];

const CONFIDENCE_FILTERS: Array<{ label: string; value: DemandSupplyMatchConfidence | null }> = [
  { label: 'All', value: null },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

function normalizeStatus(value: string | undefined): DemandSupplyMatchStatus | undefined {
  return value === 'NEW' ||
    value === 'REVIEWED' ||
    value === 'REJECTED' ||
    value === 'PROMOTED' ||
    value === 'EXPIRED'
    ? value
    : undefined;
}

function normalizeConfidence(value: string | undefined): DemandSupplyMatchConfidence | undefined {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : undefined;
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function buildFilterHref(input: {
  status?: DemandSupplyMatchStatus;
  confidence?: DemandSupplyMatchConfidence;
  productId?: string;
  customerId?: string;
  supplierId?: string;
}) {
  const params = new URLSearchParams();

  if (input.status) {
    params.set('status', input.status);
  }

  if (input.confidence) {
    params.set('confidence', input.confidence);
  }

  if (input.productId) {
    params.set('productId', input.productId);
  }

  if (input.customerId) {
    params.set('customerId', input.customerId);
  }

  if (input.supplierId) {
    params.set('supplierId', input.supplierId);
  }

  return params.size > 0
    ? `/dashboard/demand-supply-matches?${params.toString()}`
    : '/dashboard/demand-supply-matches';
}

function humanizeValue(value: string | null | undefined) {
  if (!value) {
    return 'Not found';
  }

  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatMoney(value: number | string | null | undefined, currency: string | null | undefined) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return 'Not found';
  }

  return currency?.trim()
    ? `${currency.trim().toUpperCase()} ${numericValue.toFixed(2)}`
    : numericValue.toFixed(2);
}

function formatPercent(value: number | string | null | undefined) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return 'Not found';
  }

  return `${(numericValue * 100).toFixed(1)}%`;
}

function formatQuantity(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString('en-GB')} packs`
    : 'Not found';
}

function truncateText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function statusPillClassName(status: DemandSupplyMatchStatus) {
  if (status === 'REVIEWED') {
    return 'pill-high';
  }

  if (status === 'REJECTED' || status === 'EXPIRED') {
    return 'pill-low';
  }

  if (status === 'PROMOTED') {
    return 'pill-neutral';
  }

  return 'pill-medium';
}

function confidencePillClassName(confidence: DemandSupplyMatchConfidence) {
  if (confidence === 'HIGH') {
    return 'pill-high';
  }

  if (confidence === 'LOW') {
    return 'pill-low';
  }

  return 'pill-medium';
}

function extractRiskFlags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function matchTitle(item: DemandSupplyMatchItem) {
  return [
    item.product?.name ?? item.rawCustomerProductText ?? item.rawSupplierProductText,
    item.customer?.name ?? item.customerDemandSignal?.customerName,
    item.supplier?.name ?? item.supplierPriceItem?.supplier?.name,
  ]
    .filter((part): part is string => Boolean(part))
    .slice(0, 3)
    .join(' | ');
}

function currentReturnTo(input: {
  status?: DemandSupplyMatchStatus;
  confidence?: DemandSupplyMatchConfidence;
  productId?: string;
  customerId?: string;
  supplierId?: string;
}) {
  return buildFilterHref(input);
}

export default async function DemandSupplyMatchesPage({ searchParams }: PageProps) {
  const query = searchParams ? await searchParams : undefined;
  const status = normalizeStatus(query?.status);
  const confidence = normalizeConfidence(query?.confidence);
  const productId = normalizeOptionalId(query?.productId);
  const customerId = normalizeOptionalId(query?.customerId);
  const supplierId = normalizeOptionalId(query?.supplierId);
  const returnTo = currentReturnTo({ status, confidence, productId, customerId, supplierId });

  try {
    const items = await listDemandSupplyMatches({
      status,
      confidence,
      productId,
      customerId,
      supplierId,
      take: 100,
    });

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Demand Matches</p>
              <h2 className="title">Possible trade matches</h2>
              <p className="copy">
                Review customer demand matched to existing supplier price intelligence.
              </p>
            </div>
            <form action={submitGenerateDemandSupplyMatches}>
              <input name="returnTo" type="hidden" value={returnTo} />
              <button className="button button-primary" type="submit">
                Generate latest matches
              </button>
            </form>
          </div>

          <p className="alert alert-success">
            This only creates review candidates. It will not contact anyone, create a trade,
            buy stock, sell stock, or send messages.
          </p>

          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Status:</span>
            {STATUS_FILTERS.map((option) => (
              <Link
                className={`pill ${status === option.value ? 'pill-high' : 'pill-neutral'}`}
                href={buildFilterHref({
                  status: option.value ?? undefined,
                  confidence,
                  productId,
                  customerId,
                  supplierId,
                })}
                key={option.label}
              >
                {option.label}
              </Link>
            ))}
          </div>

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Confidence:</span>
            {CONFIDENCE_FILTERS.map((option) => (
              <Link
                className={`pill ${confidence === option.value ? 'pill-high' : 'pill-neutral'}`}
                href={buildFilterHref({
                  status,
                  confidence: option.value ?? undefined,
                  productId,
                  customerId,
                  supplierId,
                })}
                key={option.label}
              >
                {option.label}
              </Link>
            ))}
          </div>

          <form action="/dashboard/demand-supply-matches" className="action-form" method="get">
            {status ? <input name="status" type="hidden" value={status} /> : null}
            {confidence ? <input name="confidence" type="hidden" value={confidence} /> : null}
            <label>
              Product ID
              <input defaultValue={productId ?? ''} name="productId" placeholder="Optional product ID" />
            </label>
            <label>
              Customer ID
              <input defaultValue={customerId ?? ''} name="customerId" placeholder="Optional customer ID" />
            </label>
            <label>
              Supplier ID
              <input defaultValue={supplierId ?? ''} name="supplierId" placeholder="Optional supplier ID" />
            </label>
            <div className="actions">
              <button className="button" type="submit">
                Apply filters
              </button>
              <Link className="button" href="/dashboard/demand-supply-matches">
                Clear filters
              </Link>
            </div>
          </form>
        </section>

        {items.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No demand matches found</h3>
            <p className="copy">
              Generate matches after customer requests are approved and supplier price intelligence exists.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Candidates to review</h3>
                <p className="copy">
                  {items.length} {items.length === 1 ? 'match' : 'matches'} shown.
                </p>
              </div>
              <span className="pill pill-neutral">{items.length} shown</span>
            </div>

            <div className="dashboard-opportunity-list">
              {items.map((item) => {
                const riskFlags = extractRiskFlags(item.riskFlags);

                return (
                  <article className="dashboard-opportunity-card" key={item.id}>
                    <div className="dashboard-opportunity-top">
                      <div>
                        <p className="dashboard-opportunity-title">{matchTitle(item) || 'Demand match'}</p>
                        <p className="dashboard-opportunity-meta">
                          Created {formatDateTime(item.createdAt) ?? 'recently'}
                          {item.matchScore !== null ? ` | Match score ${item.matchScore}` : ''}
                        </p>
                      </div>
                      <div className="dashboard-opportunity-badges">
                        <span className={`pill ${statusPillClassName(item.status)}`}>
                          {humanizeValue(item.status)}
                        </span>
                        <span className={`pill ${confidencePillClassName(item.confidence)}`}>
                          {humanizeValue(item.confidence)}
                        </span>
                      </div>
                    </div>

                    <p className="dashboard-opportunity-copy">{truncateText(item.rationale)}</p>

                    <dl className="duplicate-product-details">
                      <div>
                        <dt>Product</dt>
                        <dd>{item.product?.name ?? item.rawCustomerProductText ?? item.rawSupplierProductText ?? 'Not found'}</dd>
                      </div>
                      <div>
                        <dt>Customer</dt>
                        <dd>{item.customer?.name ?? item.customerDemandSignal?.customerName ?? 'Not found'}</dd>
                      </div>
                      <div>
                        <dt>Supplier</dt>
                        <dd>{item.supplier?.name ?? item.supplierPriceItem?.supplier?.name ?? 'Not found'}</dd>
                      </div>
                      <div>
                        <dt>Requested quantity</dt>
                        <dd>{formatQuantity(item.quantityRequested)}</dd>
                      </div>
                      <div>
                        <dt>Target price</dt>
                        <dd>{formatMoney(item.requestedTargetPrice, item.requestedCurrency)}</dd>
                      </div>
                      <div>
                        <dt>Supplier price</dt>
                        <dd>{formatMoney(item.supplierUnitPrice, item.supplierCurrency)}</dd>
                      </div>
                      <div>
                        <dt>Estimated margin</dt>
                        <dd>
                          {formatMoney(item.estimatedMarginAmount, item.requestedCurrency)}
                          {item.estimatedMarginPct !== null ? ` | ${formatPercent(item.estimatedMarginPct)}` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Urgency</dt>
                        <dd>{humanizeValue(item.urgency)}</dd>
                      </div>
                    </dl>

                    {riskFlags.length > 0 ? (
                      <div className="dashboard-filter-row">
                        <span className="dashboard-filter-label">Risk flags:</span>
                        {riskFlags.slice(0, 5).map((flag) => (
                          <span className="pill pill-low" key={flag}>
                            {humanizeValue(flag)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="actions">
                      <Link
                        className="button button-primary"
                        href={`/dashboard/demand-supply-matches/${item.id}?returnTo=${encodeURIComponent(returnTo)}`}
                      >
                        Review match
                      </Link>
                    </div>
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
        <p className="eyebrow">Demand Matches</p>
        <h2 className="title">Demand matches unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load demand matches.'}
        </p>
      </section>
    );
  }
}
