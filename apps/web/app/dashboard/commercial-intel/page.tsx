import Link from 'next/link';

import {
  listCommercialIntelItems,
  type CommercialIntelConfidence,
  type CommercialIntelItem,
  type CommercialIntelItemType,
  type CommercialIntelStatus,
} from '../../../lib/commercialIntelApi';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    itemType?: string;
    confidence?: string;
    message?: string;
    error?: string;
  }>;
};

const STATUS_FILTERS: Array<{ label: string; value: CommercialIntelStatus | null }> = [
  { label: 'All', value: null },
  { label: 'Needs review', value: 'NEW' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Expired', value: 'EXPIRED' },
];

const CONFIDENCE_FILTERS: Array<{ label: string; value: CommercialIntelConfidence | null }> = [
  { label: 'All', value: null },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

const ITEM_TYPE_FILTERS: Array<{ label: string; value: CommercialIntelItemType | null }> = [
  { label: 'All', value: null },
  { label: 'Supplier risk', value: 'SUPPLIER_RELIABILITY_NOTE' },
  { label: 'Buyer demand', value: 'BUYER_DEMAND_SIGNAL' },
  { label: 'Buy trigger', value: 'MANUAL_BUY_TRIGGER' },
  { label: 'Sell trigger', value: 'MANUAL_SELL_TRIGGER' },
  { label: 'Market price', value: 'MARKET_PRICE_INTEL' },
  { label: 'Expiry rule', value: 'EXPIRY_RISK_RULE' },
  { label: 'Product note', value: 'PRODUCT_NOTE' },
  { label: 'Contact note', value: 'CONTACT_NOTE' },
  { label: 'Other', value: 'OTHER' },
];

function normalizeStatus(value: string | undefined): CommercialIntelStatus | undefined {
  return value === 'NEW' || value === 'APPROVED' || value === 'REJECTED' || value === 'EXPIRED'
    ? value
    : undefined;
}

function normalizeConfidence(value: string | undefined): CommercialIntelConfidence | undefined {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : undefined;
}

function normalizeItemType(value: string | undefined): CommercialIntelItemType | undefined {
  return ITEM_TYPE_FILTERS.some((option) => option.value === value)
    ? value as CommercialIntelItemType
    : undefined;
}

function buildFilterHref(input: {
  status?: CommercialIntelStatus;
  itemType?: CommercialIntelItemType;
  confidence?: CommercialIntelConfidence;
}) {
  const params = new URLSearchParams();

  if (input.status) {
    params.set('status', input.status);
  }

  if (input.itemType) {
    params.set('itemType', input.itemType);
  }

  if (input.confidence) {
    params.set('confidence', input.confidence);
  }

  return params.size > 0 ? `/dashboard/commercial-intel?${params.toString()}` : '/dashboard/commercial-intel';
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

function formatPrice(value: number | string | null | undefined, currency: string | null | undefined) {
  const numericValue = toNumber(value);
  if (numericValue === null) {
    return 'Not found';
  }

  return currency?.trim()
    ? `${currency.trim().toUpperCase()} ${numericValue.toFixed(2)}`
    : numericValue.toFixed(2);
}

function truncateText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function statusPillClassName(status: CommercialIntelStatus) {
  if (status === 'APPROVED') {
    return 'pill-high';
  }

  if (status === 'REJECTED' || status === 'EXPIRED') {
    return 'pill-low';
  }

  return 'pill-medium';
}

function confidencePillClassName(confidence: CommercialIntelConfidence) {
  if (confidence === 'HIGH') {
    return 'pill-high';
  }

  if (confidence === 'LOW') {
    return 'pill-low';
  }

  return 'pill-medium';
}

function itemTitle(item: CommercialIntelItem) {
  return [
    humanizeValue(item.itemType),
    item.productText ?? item.product?.name ?? null,
    item.supplierName ?? item.supplier?.name ?? null,
    item.customerName,
  ]
    .filter((part): part is string => Boolean(part) && part !== 'Not found')
    .slice(0, 3)
    .join(' | ');
}

export default async function CommercialIntelPage({ searchParams }: PageProps) {
  const query = searchParams ? await searchParams : undefined;
  const status = normalizeStatus(query?.status);
  const itemType = normalizeItemType(query?.itemType);
  const confidence = normalizeConfidence(query?.confidence);

  try {
    const items = await listCommercialIntelItems({
      status,
      itemType,
      confidence,
      take: 100,
    });

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Commercial Intel</p>
              <h2 className="title">Dad&apos;s market notes</h2>
              <p className="copy">
                Review useful knowledge extracted from emails, then approve, reject, or expire it.
              </p>
            </div>
            <Link className="button" href="/dashboard/inbox">
              Open inbox
            </Link>
          </div>

          <p className="alert alert-success">
            Commercial intel is memory/context only. It does not automatically buy, send emails,
            change supplier trust, or create price records.
          </p>

          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Status:</span>
            {STATUS_FILTERS.map((option) => (
              <Link
                className={`pill ${status === option.value ? 'pill-high' : 'pill-neutral'}`}
                href={buildFilterHref({ status: option.value ?? undefined, itemType, confidence })}
                key={option.label}
              >
                {option.label}
              </Link>
            ))}
          </div>

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Type:</span>
            {ITEM_TYPE_FILTERS.map((option) => (
              <Link
                className={`pill ${itemType === option.value ? 'pill-high' : 'pill-neutral'}`}
                href={buildFilterHref({ status, itemType: option.value ?? undefined, confidence })}
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
                href={buildFilterHref({ status, itemType, confidence: option.value ?? undefined })}
                key={option.label}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </section>

        {items.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No commercial notes found</h3>
            <p className="copy">
              Forward a market note to the bot, and extracted commercial knowledge will appear here.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Notes to review</h3>
                <p className="copy">
                  {items.length} {items.length === 1 ? 'item' : 'items'} shown.
                </p>
              </div>
              <span className="pill pill-neutral">{items.length} shown</span>
            </div>

            <div className="dashboard-opportunity-list">
              {items.map((item) => (
                <article className="dashboard-opportunity-card" key={item.id}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">{itemTitle(item)}</p>
                      <p className="dashboard-opportunity-meta">
                        Created {formatDateTime(item.createdAt) ?? 'recently'}
                        {item.inboundEmail?.fromEmail ? ` | ${item.inboundEmail.fromEmail}` : ''}
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

                  <p className="dashboard-opportunity-copy">{truncateText(item.evidenceText)}</p>

                  <dl className="duplicate-product-details">
                    <div>
                      <dt>Product</dt>
                      <dd>{item.product?.name ?? item.productText ?? 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Supplier</dt>
                      <dd>{item.supplier?.name ?? item.supplierName ?? 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Buyer/customer</dt>
                      <dd>{item.customerName ?? 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Price threshold</dt>
                      <dd>{formatPrice(item.priceThreshold, item.currency)}</dd>
                    </div>
                    <div>
                      <dt>Urgency</dt>
                      <dd>{humanizeValue(item.urgency)}</dd>
                    </div>
                    <div>
                      <dt>Risk</dt>
                      <dd>{humanizeValue(item.riskLevel)}</dd>
                    </div>
                  </dl>

                  <div className="actions">
                    <Link className="button button-primary" href={`/dashboard/commercial-intel/${item.id}`}>
                      Review note
                    </Link>
                  </div>
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
        <p className="eyebrow">Commercial Intel</p>
        <h2 className="title">Commercial notes unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load commercial intel.'}
        </p>
      </section>
    );
  }
}
