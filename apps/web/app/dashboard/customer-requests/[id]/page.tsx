import Link from 'next/link';

import {
  getCustomerRequest,
  type CustomerDemandConfidence,
  type CustomerDemandStatus,
  type CustomerRequestItem,
} from '../../../../lib/customerRequestsApi';
import { submitCustomerRequestAction } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
    returnTo?: string;
  }>;
};

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/customer-requests';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/customer-requests';
  }

  return trimmed;
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

function buildPlainEnglishMeaning(item: CustomerRequestItem): string {
  const product = item.product?.name ?? item.productText ?? 'the requested product';
  const customer = item.customer?.name ?? item.customerName ?? 'The customer';

  switch (item.requestType) {
    case 'SOURCE_PRODUCT':
      return `${customer} is asking Ambe to source ${product}.`;
    case 'CHECK_AVAILABILITY':
      return `${customer} is asking whether ${product} is available.`;
    case 'REQUEST_QUOTE':
      return `${customer} wants a quote for ${product}.`;
    case 'BUYER_INTEREST':
      return `${customer} may be interested in buying ${product}.`;
    case 'REPEAT_DEMAND':
      return `${customer} may have repeat demand for ${product}.`;
    default:
      return 'The bot found a customer demand signal that needs review.';
  }
}

function buildTechnicalDetails(item: CustomerRequestItem): Array<{ label: string; value: string }> {
  return [
    { label: 'Item ID', value: item.id },
    { label: 'Inbound email ID', value: item.inboundEmailId ?? 'Not linked' },
    { label: 'Source document ID', value: item.sourceDocumentId ?? 'Not linked' },
    { label: 'Product ID', value: item.productId ?? 'Not linked' },
    { label: 'Customer ID', value: item.customerId ?? 'Not linked' },
    { label: 'AI assisted', value: item.aiAssisted ? 'Yes' : 'No' },
    { label: 'Fingerprint', value: item.itemFingerprint },
    { label: 'Created', value: formatDateTime(item.createdAt) ?? item.createdAt },
    { label: 'Updated', value: formatDateTime(item.updatedAt) ?? item.updatedAt },
    { label: 'Approved by', value: item.approvedByIdentifier ?? 'Not approved' },
    { label: 'Approved at', value: formatDateTime(item.approvedAt) ?? 'Not approved' },
    { label: 'Rejected by', value: item.rejectedByIdentifier ?? 'Not rejected' },
    { label: 'Rejected at', value: formatDateTime(item.rejectedAt) ?? 'Not rejected' },
    { label: 'Review reason', value: item.reviewReason ?? 'None' },
  ];
}

function renderHiddenInput(name: string, value: string) {
  return <input name={name} type="hidden" value={value} />;
}

function ActionForm({
  action,
  buttonLabel,
  item,
  returnTo,
}: {
  action: 'APPROVE' | 'REJECT' | 'EXPIRE';
  buttonLabel: string;
  item: CustomerRequestItem;
  returnTo: string;
}) {
  return (
    <form action={submitCustomerRequestAction} className="action-form">
      {renderHiddenInput('itemId', item.id)}
      {renderHiddenInput('action', action)}
      {renderHiddenInput('returnTo', returnTo)}
      <label>
        Note
        <textarea name="note" placeholder="Add a short note if useful" rows={3} />
      </label>
      <button
        className={action === 'APPROVE' ? 'button button-primary button-large' : 'button button-large'}
        type="submit"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function renderActions(item: CustomerRequestItem, returnTo: string) {
  if (item.status === 'REJECTED' || item.status === 'EXPIRED' || item.status === 'MATCHED') {
    return (
      <p className="copy">
        This request is {humanizeValue(item.status).toLowerCase()} and is read-only.
      </p>
    );
  }

  if (item.status === 'APPROVED') {
    return (
      <div className="action-row">
        <ActionForm
          action="EXPIRE"
          buttonLabel="Expire this request"
          item={item}
          returnTo={returnTo}
        />
      </div>
    );
  }

  return (
    <div className="action-row">
      <ActionForm
        action="APPROVE"
        buttonLabel="Approve this request"
        item={item}
        returnTo={returnTo}
      />
      <ActionForm
        action="REJECT"
        buttonLabel="Reject as not useful"
        item={item}
        returnTo={returnTo}
      />
      <ActionForm
        action="EXPIRE"
        buttonLabel="Expire this request"
        item={item}
        returnTo={returnTo}
      />
    </div>
  );
}

function sourceLabel(item: CustomerRequestItem) {
  if (item.inboundEmail?.subject) {
    return item.inboundEmail.subject;
  }

  if (item.sourceDocument?.label) {
    return item.sourceDocument.label;
  }

  return 'Source email';
}

export default async function CustomerRequestDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const returnTo = sanitizeReturnTo(query?.returnTo);

  try {
    const item = await getCustomerRequest(id);
    const technicalDetails = buildTechnicalDetails(item);

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Customer Requests</p>
              <h2 className="title">{humanizeValue(item.requestType)}</h2>
              <p className="copy">
                Review this demand signal before using it as approved customer context.
              </p>
            </div>
            <Link className="button" href={returnTo}>
              Back
            </Link>
          </div>

          <p className="alert alert-success">
            Customer requests are demand signals only. This will not automatically contact the customer,
            buy stock, create a trade, or send any email.
          </p>

          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">What the customer is asking for</h3>
              <p className="copy">{buildPlainEnglishMeaning(item)}</p>
            </div>
            <div className="dashboard-opportunity-badges">
              <span className={`pill ${statusPillClassName(item.status)}`}>
                {humanizeValue(item.status)}
              </span>
              <span className={`pill ${confidencePillClassName(item.confidence)}`}>
                {humanizeValue(item.confidence)} confidence
              </span>
            </div>
          </div>

          <dl className="duplicate-product-details">
            <div>
              <dt>Request type</dt>
              <dd>{humanizeValue(item.requestType)}</dd>
            </div>
            <div>
              <dt>Customer/buyer</dt>
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
            <div>
              <dt>Valid until</dt>
              <dd>{formatDateTime(item.validUntil) ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(item.createdAt) ?? 'Recently'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Evidence from email</h3>
          <p className="copy">
            The bot used this exact wording as evidence. Check it before approving the request.
          </p>
          <div className="source-block">
            <pre>{item.evidenceText}</pre>
          </div>
        </section>

        <section className="panel dashboard-panel" id="decision">
          <h3 className="section-title">Decision</h3>
          <p className="copy review-summary-copy">
            Approving keeps this as reviewed demand context. It still will not contact the customer,
            buy stock, create a trade, or send any email.
          </p>
          {renderActions(item, returnTo)}
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Source</h3>
          <dl className="detail-list">
            <div>
              <dt>Email</dt>
              <dd>{sourceLabel(item)}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{item.inboundEmail?.fromEmail ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>{formatDateTime(item.inboundEmail?.receivedAt) ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Document</dt>
              <dd>
                {item.sourceDocument
                  ? `${item.sourceDocument.label ?? item.sourceDocument.kind} #${item.sourceDocument.documentIndex}`
                  : 'Not linked'}
              </dd>
            </div>
          </dl>

          {item.sourceDocument ? (
            <details className="document-card technical-details-card">
              <summary>Show source document text</summary>
              <pre>{item.sourceDocument.textContent}</pre>
            </details>
          ) : item.inboundEmail?.rawText ? (
            <details className="document-card technical-details-card">
              <summary>Show raw email text</summary>
              <pre>{item.inboundEmail.rawText}</pre>
            </details>
          ) : null}
        </section>

        <section className="panel dashboard-panel">
          <details className="document-card">
            <summary>Show technical details</summary>
            <dl className="duplicate-product-details technical-details-grid">
              {technicalDetails.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
            <div className="source-block">
              <h4 className="subsection-title">Metadata</h4>
              <pre>{JSON.stringify(item.metadata ?? {}, null, 2)}</pre>
            </div>
          </details>
        </section>
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Customer Requests</p>
        <h2 className="title">Customer request unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load customer request.'}
        </p>
        <div className="actions">
          <Link className="button" href={returnTo}>
            Back
          </Link>
        </div>
      </section>
    );
  }
}
