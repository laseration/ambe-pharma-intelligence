import Link from 'next/link';

import {
  listCustomerRequests,
  type CustomerDemandConfidence,
  type CustomerDemandRequestType,
  type CustomerDemandStatus,
  type CustomerRequestItem,
} from '../../../lib/customerRequestsApi';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    requestType?: string;
    confidence?: string;
    message?: string;
    error?: string;
  }>;
};

const STATUS_FILTERS: Array<{ label: string; value: CustomerDemandStatus | null }> = [
  { label: 'All', value: null },
  { label: 'Needs review', value: 'NEW' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Matched', value: 'MATCHED' },
];

const CONFIDENCE_FILTERS: Array<{ label: string; value: CustomerDemandConfidence | null }> = [
  { label: 'All', value: null },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

const REQUEST_TYPE_FILTERS: Array<{ label: string; value: CustomerDemandRequestType | null }> = [
  { label: 'All', value: null },
  { label: 'Source product', value: 'SOURCE_PRODUCT' },
  { label: 'Check availability', value: 'CHECK_AVAILABILITY' },
  { label: 'Request quote', value: 'REQUEST_QUOTE' },
  { label: 'Buyer interest', value: 'BUYER_INTEREST' },
  { label: 'Repeat demand', value: 'REPEAT_DEMAND' },
  { label: 'Other', value: 'OTHER' },
];

function normalizeStatus(value: string | undefined): CustomerDemandStatus | undefined {
  return value === 'NEW' ||
    value === 'APPROVED' ||
    value === 'REJECTED' ||
    value === 'EXPIRED' ||
    value === 'MATCHED'
    ? value
    : undefined;
}

function normalizeConfidence(value: string | undefined): CustomerDemandConfidence | undefined {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' ? value : undefined;
}

function normalizeRequestType(value: string | undefined): CustomerDemandRequestType | undefined {
  return REQUEST_TYPE_FILTERS.some((option) => option.value === value)
    ? value as CustomerDemandRequestType
    : undefined;
}

function buildFilterHref(input: {
  status?: CustomerDemandStatus;
  requestType?: CustomerDemandRequestType;
  confidence?: CustomerDemandConfidence;
}) {
  const params = new URLSearchParams();

  if (input.status) {
    params.set('status', input.status);
  }

  if (input.requestType) {
    params.set('requestType', input.requestType);
  }

  if (input.confidence) {
    params.set('confidence', input.confidence);
  }

  return params.size > 0 ? `/dashboard/customer-requests?${params.toString()}` : '/dashboard/customer-requests';
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

function formatQuantity(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('en-GB')} packs` : 'Not found';
}

function truncateText(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function statusPillClassName(status: CustomerDemandStatus) {
  if (status === 'APPROVED') {
    return 'pill-high';
  }

  if (status === 'REJECTED' || status === 'EXPIRED') {
    return 'pill-low';
  }

  if (status === 'MATCHED') {
    return 'pill-neutral';
  }

  return 'pill-medium';
}

function confidencePillClassName(confidence: CustomerDemandConfidence) {
  if (confidence === 'HIGH') {
    return 'pill-high';
  }

  if (confidence === 'LOW') {
    return 'pill-low';
  }

  return 'pill-medium';
}

function requestTitle(item: CustomerRequestItem) {
  return [
    humanizeValue(item.requestType),
    item.productText ?? item.product?.name ?? null,
    item.customerName ?? item.customer?.name ?? null,
  ]
    .filter((part): part is string => Boolean(part) && part !== 'Not found')
    .slice(0, 3)
    .join(' | ');
}

export default async function CustomerRequestsPage({ searchParams }: PageProps) {
  const query = searchParams ? await searchParams : undefined;
  const status = normalizeStatus(query?.status);
  const requestType = normalizeRequestType(query?.requestType);
  const confidence = normalizeConfidence(query?.confidence);

  try {
    const items = await listCustomerRequests({
      status,
      requestType,
      confidence,
      take: 100,
    });

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Customer Requests</p>
              <h2 className="title">Buyer demand emails</h2>
              <p className="copy">
                Review product, quote, availability, and sourcing requests extracted from emails.
              </p>
            </div>
            <Link className="button" href="/dashboard/inbox">
              Open inbox
            </Link>
          </div>

          <p className="alert alert-success">
            Customer requests are demand signals only. This will not automatically contact the customer,
            buy stock, create a trade, or send any email.
          </p>

          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Status:</span>
            {STATUS_FILTERS.map((option) => (
              <Link
                className={`pill ${status === option.value ? 'pill-high' : 'pill-neutral'}`}
                href={buildFilterHref({ status: option.value ?? undefined, requestType, confidence })}
                key={option.label}
              >
                {option.label}
              </Link>
            ))}
          </div>

          <div className="dashboard-filter-row">
            <span className="dashboard-filter-label">Type:</span>
            {REQUEST_TYPE_FILTERS.map((option) => (
              <Link
                className={`pill ${requestType === option.value ? 'pill-high' : 'pill-neutral'}`}
                href={buildFilterHref({ status, requestType: option.value ?? undefined, confidence })}
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
                href={buildFilterHref({ status, requestType, confidence: option.value ?? undefined })}
                key={option.label}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </section>

        {items.length === 0 ? (
          <section className="panel dashboard-panel">
            <h3 className="section-title">No customer requests found</h3>
            <p className="copy">
              Forward a customer sourcing, quote, or availability request to the bot, and extracted
              demand signals will appear here.
            </p>
          </section>
        ) : (
          <section className="panel dashboard-panel">
            <div className="dashboard-section-header">
              <div>
                <h3 className="section-title">Requests to review</h3>
                <p className="copy">
                  {items.length} {items.length === 1 ? 'request' : 'requests'} shown.
                </p>
              </div>
              <span className="pill pill-neutral">{items.length} shown</span>
            </div>

            <div className="dashboard-opportunity-list">
              {items.map((item) => (
                <article className="dashboard-opportunity-card" key={item.id}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">{requestTitle(item)}</p>
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
                      <dt>Customer</dt>
                      <dd>{item.customer?.name ?? item.customerName ?? 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{[item.contactName, item.contactEmail].filter(Boolean).join(' | ') || 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Product</dt>
                      <dd>{item.product?.name ?? item.productText ?? 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Quantity</dt>
                      <dd>{formatQuantity(item.quantityRequested)}</dd>
                    </div>
                    <div>
                      <dt>Target price</dt>
                      <dd>{formatPrice(item.targetPrice, item.currency)}</dd>
                    </div>
                    <div>
                      <dt>Needed by</dt>
                      <dd>{formatDateTime(item.neededByDate) ?? 'Not found'}</dd>
                    </div>
                    <div>
                      <dt>Urgency</dt>
                      <dd>{humanizeValue(item.urgency)}</dd>
                    </div>
                  </dl>

                  <div className="actions">
                    <Link className="button button-primary" href={`/dashboard/customer-requests/${item.id}`}>
                      Review request
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
        <p className="eyebrow">Customer Requests</p>
        <h2 className="title">Customer requests unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load customer requests.'}
        </p>
      </section>
    );
  }
}
