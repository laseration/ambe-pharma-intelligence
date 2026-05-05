import Link from 'next/link';

import {
  getCommercialIntelItem,
  type CommercialIntelConfidence,
  type CommercialIntelItem,
  type CommercialIntelStatus,
} from '../../../../lib/commercialIntelApi';
import { submitCommercialIntelAction } from './actions';

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
    return '/dashboard/commercial-intel';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/commercial-intel';
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

function buildPlainEnglishMeaning(item: CommercialIntelItem): string {
  const product = item.product?.name ?? item.productText;
  const supplier = item.supplier?.name ?? item.supplierName;
  const customer = item.customerName;

  switch (item.itemType) {
    case 'SUPPLIER_RELIABILITY_NOTE':
      return supplier
        ? `${supplier} may need extra caution before anyone relies on them.`
        : 'A supplier reliability warning was found.';
    case 'BUYER_DEMAND_SIGNAL':
      return customer
        ? `${customer} may want ${product ?? 'this product'}.`
        : `There may be buyer demand for ${product ?? 'this product'}.`;
    case 'MANUAL_BUY_TRIGGER':
      return `This is a buying trigger to remember when reviewing offers for ${product ?? 'this product'}.`;
    case 'MANUAL_SELL_TRIGGER':
      return `This is a selling trigger to remember when reviewing stock or demand for ${product ?? 'this product'}.`;
    case 'MARKET_PRICE_INTEL':
      return `This is market context that may matter when reviewing ${product ?? 'a product'}.`;
    case 'EXPIRY_RISK_RULE':
      return 'This is an expiry-risk rule to keep in mind before acting on stock.';
    case 'PRODUCT_NOTE':
      return `This is product-specific advice about ${product ?? 'a product'}.`;
    case 'CONTACT_NOTE':
      return item.contactName
        ? `${item.contactName} was mentioned as a useful contact.`
        : 'A contact note was found.';
    default:
      return 'The bot found a commercial note that may be useful context.';
  }
}

function buildTechnicalDetails(item: CommercialIntelItem): Array<{ label: string; value: string }> {
  return [
    { label: 'Item ID', value: item.id },
    { label: 'Inbound email ID', value: item.inboundEmailId ?? 'Not linked' },
    { label: 'Source document ID', value: item.sourceDocumentId ?? 'Not linked' },
    { label: 'Product ID', value: item.productId ?? 'Not linked' },
    { label: 'Supplier ID', value: item.supplierId ?? 'Not linked' },
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
  item: CommercialIntelItem;
  returnTo: string;
}) {
  return (
    <form action={submitCommercialIntelAction} className="action-form">
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

function renderActions(item: CommercialIntelItem, returnTo: string) {
  if (item.status === 'REJECTED' || item.status === 'EXPIRED') {
    return (
      <p className="copy">
        This note is {humanizeValue(item.status).toLowerCase()} and is read-only.
      </p>
    );
  }

  if (item.status === 'APPROVED') {
    return (
      <div className="action-row">
        <ActionForm
          action="EXPIRE"
          buttonLabel="Expire this note"
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
        buttonLabel="Approve this knowledge"
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
        buttonLabel="Expire this note"
        item={item}
        returnTo={returnTo}
      />
    </div>
  );
}

function sourceLabel(item: CommercialIntelItem) {
  if (item.inboundEmail?.subject) {
    return item.inboundEmail.subject;
  }

  if (item.sourceDocument?.label) {
    return item.sourceDocument.label;
  }

  return 'Source email';
}

export default async function CommercialIntelDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const returnTo = sanitizeReturnTo(query?.returnTo);

  try {
    const item = await getCommercialIntelItem(id);
    const technicalDetails = buildTechnicalDetails(item);

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Commercial Intel</p>
              <h2 className="title">{humanizeValue(item.itemType)}</h2>
              <p className="copy">
                Review this note before letting it become approved internal context.
              </p>
            </div>
            <Link className="button" href={returnTo}>
              Back
            </Link>
          </div>

          <p className="alert alert-success">
            This will not automatically buy stock or contact anyone. Commercial intel is
            memory/context only.
          </p>

          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">What the bot thinks this means</h3>
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
              <dt>Item type</dt>
              <dd>{humanizeValue(item.itemType)}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>{item.product?.name ?? item.productText ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Supplier</dt>
              <dd>{item.supplier?.name ?? item.supplierName ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Customer/buyer</dt>
              <dd>{item.customerName ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{item.contactName ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Price threshold</dt>
              <dd>{formatPrice(item.priceThreshold, item.currency)}</dd>
            </div>
            <div>
              <dt>Signal effect</dt>
              <dd>{humanizeValue(item.signalEffect)}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{item.availabilitySignal ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Urgency</dt>
              <dd>{humanizeValue(item.urgency)}</dd>
            </div>
            <div>
              <dt>Risk</dt>
              <dd>{humanizeValue(item.riskLevel)}</dd>
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
            The bot used this exact wording as evidence. Check it before approving the note.
          </p>
          <div className="source-block">
            <pre>{item.evidenceText}</pre>
          </div>
        </section>

        <section className="panel dashboard-panel" id="decision">
          <h3 className="section-title">Decision</h3>
          <p className="copy review-summary-copy">
            Approving keeps this as reviewed internal context. It still will not buy stock,
            send emails, change supplier trust, or create price records.
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
        <p className="eyebrow">Commercial Intel</p>
        <h2 className="title">Commercial note unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load commercial intel item.'}
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
