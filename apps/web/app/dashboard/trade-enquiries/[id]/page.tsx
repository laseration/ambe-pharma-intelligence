import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  getBuyerTradeEnquiry,
  type BuyerTradeEnquiryListItem,
  type BuyerTradeEnquiryStatus,
} from '../../../../lib/tradeEnquiriesApi';
import { roleHasCapability } from '../../../../lib/authorisation';
import { InternalApiError } from '../../../../lib/internalApiRequest';
import { requireCurrentWebCapability } from '../../../../lib/serverWebAuth';
import { submitBuyerTradeEnquiryStatusAction } from '../actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    updated?: string;
  }>;
};

const STATUS_OPTIONS: BuyerTradeEnquiryStatus[] = [
  'REVIEWING',
  'MATCHED',
  'QUOTED',
  'CLOSED',
  'REJECTED',
  'DUPLICATE',
  'SPAM',
  'ARCHIVED',
];

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not provided';
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

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value?.trim() || 'Not provided'}</dd>
    </div>
  );
}

function StatusReviewForm({ item }: { item: BuyerTradeEnquiryListItem }) {
  return (
    <form action={submitBuyerTradeEnquiryStatusAction} className="action-form">
      <input name="enquiryId" type="hidden" value={item.id} />
      <label>
        <span>Next status</span>
        <select defaultValue={item.status} name="status">
          <option value={item.status}>{item.status.replace('_', ' ')}</option>
          {STATUS_OPTIONS.filter((status) => status !== item.status).map(
            (status) => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        <span>Internal review notes</span>
        <textarea
          defaultValue={item.reviewNotes ?? ''}
          name="reviewNotes"
          rows={5}
        />
      </label>
      <p className="form-helper">
        Status transitions are checked by the internal API. Mark spam,
        duplicate, rejected, or archived enquiries explicitly rather than
        deleting them.
      </p>
      <button className="button" type="submit">
        Update enquiry
      </button>
    </form>
  );
}

export default async function TradeEnquiryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const session = await requireCurrentWebCapability('trade-enquiries:view');
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const canManageTradeEnquiries = roleHasCapability(
    session.role,
    'trade-enquiries:manage',
  );

  let item: BuyerTradeEnquiryListItem;
  try {
    item = await getBuyerTradeEnquiry(id);
  } catch (error) {
    if (error instanceof InternalApiError && error.status === 404) {
      notFound();
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Trade enquiry detail could not load.';

    return (
      <section className="dashboard-layout">
        <section className="panel dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <p className="eyebrow">Trade enquiry</p>
              <h2 className="title">RFQ detail unavailable</h2>
              <p className="copy">
                The dashboard could not read this protected trade enquiry.
              </p>
            </div>
            <Link className="button" href="/dashboard/trade-enquiries">
              Back to enquiries
            </Link>
          </div>
          <p className="dashboard-inline-message dashboard-inline-message-error">
            {message}
          </p>
        </section>
      </section>
    );
  }

  if (!item) {
    notFound();
  }

  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Trade enquiry</p>
            <h2 className="title">{item.companyName}</h2>
            <p className="copy">
              Protected RFQ detail for manual review. This record does not
              represent a quote, availability confirmation, or order.
            </p>
          </div>
          <Link className="button" href="/dashboard/trade-enquiries">
            Back to enquiries
          </Link>
        </div>

        {query?.updated ? (
          <p className="dashboard-inline-message dashboard-inline-message-success">
            Status updated to {query.updated.replace('_', ' ')}.
          </p>
        ) : null}
        {query?.error ? (
          <p className="dashboard-inline-message dashboard-inline-message-error">
            {query.error}
          </p>
        ) : null}

        <div className="dashboard-summary-grid">
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-label">Status</p>
            <p className="dashboard-summary-value">{item.status}</p>
          </article>
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-label">Priority</p>
            <p className="dashboard-summary-value">{item.priority}</p>
          </article>
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-label">Received</p>
            <p className="dashboard-summary-note">
              {formatDateTime(item.createdAt)}
            </p>
          </article>
          <article className="dashboard-summary-card">
            <p className="dashboard-summary-label">Required by</p>
            <p className="dashboard-summary-note">
              {formatDateTime(item.requiredBy)}
            </p>
          </article>
        </div>

        <div className="dashboard-detail-grid">
          <section className="review-card">
            <h3 className="review-card-title">Buyer and contact</h3>
            <dl className="dashboard-detail-list">
              <DetailItem label="Company" value={item.companyName} />
              <DetailItem label="Business type" value={item.businessType} />
              <DetailItem label="Country" value={item.country} />
              <DetailItem label="Contact" value={item.contactName} />
              <DetailItem label="Email" value={item.contactEmail} />
              <DetailItem label="Phone" value={item.contactPhone} />
            </dl>
          </section>

          <section className="review-card">
            <h3 className="review-card-title">Requirement</h3>
            <dl className="dashboard-detail-list">
              <DetailItem label="Product" value={item.productName} />
              <DetailItem label="Strength" value={item.strength} />
              <DetailItem label="Pack size" value={item.packSize} />
              <DetailItem label="Quantity" value={item.quantityRequired} />
              <DetailItem label="Target market" value={item.targetMarket} />
              <DetailItem
                label="Documentation"
                value={item.documentationNotes}
              />
              <DetailItem
                label="Additional notes"
                value={item.additionalNotes}
              />
            </dl>
          </section>
        </div>

        <section className="review-card">
          <h3 className="review-card-title">Internal review</h3>
          {canManageTradeEnquiries ? (
            <StatusReviewForm item={item} />
          ) : (
            <p className="copy">
              This signed-in role can view the enquiry but cannot update its
              internal review status.
            </p>
          )}
        </section>
      </section>
    </section>
  );
}
