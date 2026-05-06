import Link from 'next/link';

import {
  getDemandSupplyMatch,
  type DemandSupplyMatchConfidence,
  type DemandSupplyMatchItem,
  type DemandSupplyMatchStatus,
} from '../../../../lib/demandSupplyMatchesApi';
import { submitDemandSupplyMatchAction } from './actions';

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

type JsonRecord = Record<string, unknown>;

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/demand-supply-matches';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/demand-supply-matches';
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

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function textField(record: JsonRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function extractRiskFlags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function riskFlagCopy(flag: string) {
  switch (flag) {
    case 'currency_mismatch':
      return 'Currency mismatch. Check target price and supplier price before acting.';
    case 'no_target_price':
      return 'Customer did not give a target price.';
    case 'no_quantity':
      return 'Customer did not give a clear quantity.';
    case 'supplier_unknown':
      return 'Supplier is not linked clearly.';
    case 'customer_unknown':
      return 'Customer is not linked clearly.';
    case 'supplier_qualification_unknown':
      return 'Supplier qualification is unknown.';
    case 'supplier_reliability_warning':
      return 'Approved commercial intel includes a supplier reliability warning.';
    case 'weak_customer_demand_confidence':
      return 'Customer demand confidence is low.';
    case 'weak_supplier_offer_context':
      return 'Supplier price context is limited.';
    case 'negative_estimated_margin':
      return 'Estimated margin is negative.';
    default:
      return humanizeValue(flag);
  }
}

function commercialIntelItems(value: unknown): JsonRecord[] {
  const record = asRecord(value);
  const items = record?.items;
  return Array.isArray(items)
    ? items.filter((item): item is JsonRecord => Boolean(asRecord(item)))
    : [];
}

function buildTechnicalDetails(item: DemandSupplyMatchItem): Array<{ label: string; value: string }> {
  return [
    { label: 'Match ID', value: item.id },
    { label: 'Customer demand ID', value: item.customerDemandSignalId },
    { label: 'Supplier price item ID', value: item.supplierPriceItemId },
    { label: 'Product ID', value: item.productId },
    { label: 'Customer ID', value: item.customerId ?? 'Not linked' },
    { label: 'Supplier ID', value: item.supplierId ?? 'Not linked' },
    { label: 'Reason', value: humanizeValue(item.reason) },
    { label: 'Match score', value: item.matchScore === null ? 'Not scored' : String(item.matchScore) },
    { label: 'Fingerprint', value: item.matchFingerprint },
    { label: 'Created', value: formatDateTime(item.createdAt) ?? item.createdAt },
    { label: 'Updated', value: formatDateTime(item.updatedAt) ?? item.updatedAt },
    { label: 'Reviewed by', value: item.reviewedByIdentifier ?? 'Not reviewed' },
    { label: 'Reviewed at', value: formatDateTime(item.reviewedAt) ?? 'Not reviewed' },
    { label: 'Rejected by', value: item.rejectedByIdentifier ?? 'Not rejected' },
    { label: 'Rejected at', value: formatDateTime(item.rejectedAt) ?? 'Not rejected' },
    { label: 'Expires at', value: formatDateTime(item.expiresAt) ?? 'Not set' },
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
  action: 'REVIEW' | 'REJECT' | 'EXPIRE';
  buttonLabel: string;
  item: DemandSupplyMatchItem;
  returnTo: string;
}) {
  return (
    <form action={submitDemandSupplyMatchAction} className="action-form">
      {renderHiddenInput('itemId', item.id)}
      {renderHiddenInput('action', action)}
      {renderHiddenInput('returnTo', returnTo)}
      <label>
        Note
        <textarea name="note" placeholder="Add a short note if useful" rows={3} />
      </label>
      <button
        className={action === 'REVIEW' ? 'button button-primary button-large' : 'button button-large'}
        type="submit"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function renderActions(item: DemandSupplyMatchItem, returnTo: string) {
  if (item.status === 'REJECTED' || item.status === 'EXPIRED' || item.status === 'PROMOTED') {
    return (
      <p className="copy">
        This match is {humanizeValue(item.status).toLowerCase()} and is read-only.
      </p>
    );
  }

  if (item.status === 'REVIEWED') {
    return (
      <div className="action-row">
        <ActionForm action="REJECT" buttonLabel="Reject" item={item} returnTo={returnTo} />
        <ActionForm action="EXPIRE" buttonLabel="Expire" item={item} returnTo={returnTo} />
      </div>
    );
  }

  return (
    <div className="action-row">
      <ActionForm action="REVIEW" buttonLabel="Mark reviewed" item={item} returnTo={returnTo} />
      <ActionForm action="REJECT" buttonLabel="Reject" item={item} returnTo={returnTo} />
      <ActionForm action="EXPIRE" buttonLabel="Expire" item={item} returnTo={returnTo} />
    </div>
  );
}

export default async function DemandSupplyMatchDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const returnTo = sanitizeReturnTo(query?.returnTo);

  try {
    const item = await getDemandSupplyMatch(id);
    const riskFlags = extractRiskFlags(item.riskFlags);
    const intelItems = commercialIntelItems(item.commercialIntelContext);
    const supplierContext = asRecord(item.supplierOfferContext);
    const demandContext = asRecord(item.customerDemandContext);
    const technicalDetails = buildTechnicalDetails(item);

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Demand Matches</p>
              <h2 className="title">Possible trade match to review</h2>
              <p className="copy">
                Review the customer request, supplier price, margin estimate, and risk flags.
              </p>
            </div>
            <Link className="button" href={returnTo}>
              Back
            </Link>
          </div>

          <p className="alert alert-success">
            This does not automatically buy, sell, contact customers, contact suppliers,
            create a trade, or send messages.
          </p>

          {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
          {query?.message ? <p className="alert alert-success">{query.message}</p> : null}
        </section>

        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <h3 className="section-title">Rationale</h3>
              <p className="copy">{item.rationale}</p>
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
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Customer demand</h3>
          <dl className="duplicate-product-details">
            <div>
              <dt>Customer</dt>
              <dd>{item.customer?.name ?? item.customerDemandSignal?.customerName ?? textField(demandContext, 'customerName') ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Product requested</dt>
              <dd>{item.product?.name ?? item.customerDemandSignal?.productText ?? item.rawCustomerProductText ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{formatQuantity(item.quantityRequested ?? item.customerDemandSignal?.quantityRequested)}</dd>
            </div>
            <div>
              <dt>Target price</dt>
              <dd>{formatMoney(item.requestedTargetPrice ?? item.customerDemandSignal?.targetPrice, item.requestedCurrency ?? item.customerDemandSignal?.currency)}</dd>
            </div>
            <div>
              <dt>Needed by</dt>
              <dd>{formatDateTime(item.customerDemandSignal?.neededByDate ?? textField(demandContext, 'neededByDate')) ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Urgency</dt>
              <dd>{humanizeValue(item.urgency ?? item.customerDemandSignal?.urgency)}</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>{item.customerDemandSignal?.evidenceText ?? textField(demandContext, 'evidenceText') ?? 'Not found'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Supplier price</h3>
          <dl className="duplicate-product-details">
            <div>
              <dt>Supplier</dt>
              <dd>{item.supplier?.name ?? item.supplierPriceItem?.supplier?.name ?? textField(supplierContext, 'supplierName') ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>{item.supplierPriceItem?.product?.name ?? item.rawSupplierProductText ?? item.supplierPriceItem?.rawProductName ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Unit price</dt>
              <dd>{formatMoney(item.supplierUnitPrice ?? item.supplierPriceItem?.unitPrice, item.supplierCurrency ?? item.supplierPriceItem?.currencyCode)}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{item.supplierPriceItem?.isAvailable === false ? 'Unavailable' : 'Available'}</dd>
            </div>
            <div>
              <dt>MOQ</dt>
              <dd>{formatQuantity(item.supplierPriceItem?.minimumOrderQuantity)}</dd>
            </div>
            <div>
              <dt>Price date</dt>
              <dd>{formatDateTime(item.supplierPriceItem?.createdAt) ?? 'Not found'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Margin estimate</h3>
          <dl className="duplicate-product-details">
            <div>
              <dt>Estimated per-unit margin</dt>
              <dd>{formatMoney(item.estimatedMarginAmount, item.requestedCurrency)}</dd>
            </div>
            <div>
              <dt>Estimated margin percent</dt>
              <dd>{formatPercent(item.estimatedMarginPct)}</dd>
            </div>
          </dl>
          {item.marginExplanation ? <p className="copy">{item.marginExplanation}</p> : null}
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Commercial intel context</h3>
          {intelItems.length === 0 ? (
            <p className="copy">No approved commercial intel context is linked to this match.</p>
          ) : (
            <div className="dashboard-opportunity-list">
              {intelItems.map((intel, index) => (
                <article className="dashboard-opportunity-card" key={textField(intel, 'id') ?? index}>
                  <div className="dashboard-opportunity-top">
                    <div>
                      <p className="dashboard-opportunity-title">{humanizeValue(textField(intel, 'itemType'))}</p>
                      <p className="dashboard-opportunity-meta">
                        {[textField(intel, 'productText'), textField(intel, 'supplierName'), textField(intel, 'customerName')]
                          .filter(Boolean)
                          .join(' | ') || 'No linked entity'}
                      </p>
                    </div>
                    <span className="pill pill-neutral">{humanizeValue(textField(intel, 'confidence'))}</span>
                  </div>
                  <p className="dashboard-opportunity-copy">{textField(intel, 'evidenceText') ?? 'No evidence text'}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel dashboard-panel">
          <h3 className="section-title">Risk flags</h3>
          {riskFlags.length === 0 ? (
            <p className="copy">No risk flags were added to this match.</p>
          ) : (
            <ul className="dashboard-signal-list">
              {riskFlags.map((flag) => (
                <li key={flag}>
                  <strong>{humanizeValue(flag)}:</strong> {riskFlagCopy(flag)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel dashboard-panel" id="decision">
          <h3 className="section-title">Decision</h3>
          <p className="copy review-summary-copy">
            Marking reviewed only records that an operator has checked this candidate. It does not
            promote it to a trade or contact anyone.
          </p>
          {renderActions(item, returnTo)}
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
              <h4 className="subsection-title">Evidence</h4>
              <pre>{JSON.stringify(item.evidence ?? {}, null, 2)}</pre>
            </div>
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
        <p className="eyebrow">Demand Matches</p>
        <h2 className="title">Demand match unavailable</h2>
        <p className="copy">
          {error instanceof Error ? error.message : 'Failed to load demand match.'}
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
