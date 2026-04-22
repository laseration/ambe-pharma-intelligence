import Link from 'next/link';

import {
  getReviewWorkflowItem,
  listReviewWorkflowItems,
  type ReviewWorkflowDetail,
  type ReviewWorkflowListItem,
} from '../../../../lib/reviewApi';
import { submitInboundEmailReviewAction } from './actions';
import { SubmitButton } from './submit-button';

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

function renderValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Unknown' : String(value);
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const NON_PRODUCT_PREFIXES = [
  'tel',
  'telephone',
  'mobile',
  'mobile whatsapp',
  'whatsapp',
  'sent',
  'from',
  'to',
  'subject',
  'e-mail',
  'email',
  'kimden',
  'gonderildi',
  'gönderildi',
];

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .trim();
}

function looksLikeNonProductLabel(value: string): boolean {
  const normalized = normalizeForComparison(value).replace(/[:\s]+$/g, '');
  return NON_PRODUCT_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}:`) || normalized.startsWith(`${prefix} `),
  );
}

function extractDisplayProductName(item: ReviewWorkflowListItem): string {
  const rawProductText = item.emailDerivedOffer?.rawProductText?.trim();
  const normalizedName = item.emailDerivedOffer?.normalizedProductNameCandidate?.split('|')[0]?.trim();

  if (rawProductText) {
    const productNameMatch = rawProductText.match(/productname:\s*([^|]+)/i);
    if (productNameMatch?.[1]?.trim()) {
      return productNameMatch[1].trim();
    }

    const descriptionMatch = rawProductText.match(/description:\s*([^|]+)/i);
    if (descriptionMatch?.[1]?.trim()) {
      return descriptionMatch[1].trim();
    }

    const firstSegment = rawProductText.split('|')[0]?.trim();
    if (firstSegment) {
      return firstSegment.replace(/^description:\s*/i, '').trim();
    }
  }

  if (normalizedName) {
    return titleCase(normalizedName.replace(/^description:\s*/i, '').replace(/productname:\s*/i, ''));
  }

  return 'Unknown product';
}

function isLikelyDisplayableOffer(item: ReviewWorkflowListItem): boolean {
  const title = extractDisplayProductName(item);
  const hasStructuredProductSignal = Boolean(
    item.emailDerivedOffer?.strengthCandidate ||
    item.emailDerivedOffer?.dosageFormCandidate ||
    item.emailDerivedOffer?.currencyCandidate,
  );

  if (title === 'Unknown product') {
    return false;
  }

  if (looksLikeNonProductLabel(title) && !hasStructuredProductSignal) {
    return false;
  }

  return true;
}

function renderDocumentTitle(document: NonNullable<ReviewWorkflowDetail['inboundEmail']>['documents'][number]) {
  return document.label || `${document.kind} #${document.documentIndex}`;
}

function summarizeReason(items: ReviewWorkflowListItem[]) {
  return (
    items.find((item) => item.sourceReviewReason)?.sourceReviewReason ??
    items.find((item) => item.qualificationRiskNote)?.qualificationRiskNote ??
    items.find((item) => item.latestNote)?.latestNote ??
    'Needs review.'
  );
}

export default async function ReviewInboundEmailPage({ params, searchParams }: PageProps) {
  const { id: inboundEmailId } = await params;
  const query = searchParams ? await searchParams : undefined;

  try {
    const items = await listReviewWorkflowItems({ inboundEmailId });
    const visibleItems = items.filter(isLikelyDisplayableOffer);
    const hiddenItemCount = items.length - visibleItems.length;

    if (items.length === 0) {
      throw new Error('No open review items were found for this email.');
    }

    const [firstItemDetail] = await Promise.all([getReviewWorkflowItem(items[0]!.id)]);
    const inboundEmail = firstItemDetail.inboundEmail;

    return (
      <section className="review-layout">
        <div className="review-header review-header-inline">
          <div>
            <p className="eyebrow">Email Review</p>
            <h2 className="title">{inboundEmail?.subject ?? 'Pending supplier email'}</h2>
            <p className="copy">
              Review this supplier email once, then approve or reject all extracted offer rows in
              one action.
            </p>
          </div>
          <Link className="button" href="/dashboard/review">
            Back to queue
          </Link>
        </div>

        {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
        {query?.updated ? <p className="alert alert-success">Updated with {query.updated}.</p> : null}

        <section className="panel review-section">
          <h3 className="section-title">Approve Or Reject</h3>
          <p className="copy review-summary-copy">
            {visibleItems.length} extracted rows from {inboundEmail?.fromEmail ?? 'Unknown sender'}.
            {' '}
            Review reason: {summarizeReason(items)}
          </p>
          {hiddenItemCount > 0 ? (
            <p className="copy review-summary-copy review-summary-note">
              {hiddenItemCount} noisy low-confidence rows were hidden from this view because they
              looked like forwarded headers, phone numbers, or signature text instead of products.
            </p>
          ) : null}

          <div className="action-row action-row-stacked-mobile">
            <form action={submitInboundEmailReviewAction} className="action-form">
              <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
              <input name="action" type="hidden" value="APPROVE_TO_BUY" />
              <label>
                Approval note
                <textarea name="note" placeholder="Optional approval note" rows={3} />
              </label>
              <label className="checkbox-row">
                <input name="allowQualificationRisk" type="checkbox" />
                Allow approval despite unknown or restricted supplier qualification
              </label>
              <SubmitButton
                className="button button-primary button-large"
                idleLabel="Approve All Rows"
                pendingLabel="Approving All Rows..."
              />
            </form>

            <form action={submitInboundEmailReviewAction} className="action-form">
              <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
              <input name="action" type="hidden" value="REJECT" />
              <label>
                Rejection note
                <textarea name="note" placeholder="Why this email should be rejected" rows={3} />
              </label>
              <SubmitButton
                className="button button-large"
                idleLabel="Reject All Rows"
                pendingLabel="Rejecting All Rows..."
              />
            </form>
          </div>
        </section>

        <section className="panel review-section">
          <h3 className="section-title">Extracted Rows</h3>
          <div className="offer-row-list">
            {visibleItems.map((item) => (
              <article className="offer-row-card" key={item.id}>
                <div className="offer-row-header">
                  <p className="offer-row-title">{extractDisplayProductName(item)}</p>
                  <p className="offer-row-price">
                    {renderValue(item.emailDerivedOffer?.priceCandidate)}{' '}
                    {item.emailDerivedOffer?.currencyCandidate ?? ''}
                  </p>
                </div>

                <dl className="offer-row-fields">
                  <div>
                    <dt>Strength</dt>
                    <dd>{renderValue(item.emailDerivedOffer?.strengthCandidate)}</dd>
                  </div>
                  <div>
                    <dt>Form</dt>
                    <dd>{renderValue(item.emailDerivedOffer?.dosageFormCandidate)}</dd>
                  </div>
                  <div>
                    <dt>Pack</dt>
                    <dd>{renderValue(item.emailDerivedOffer?.packSizeCandidate)}</dd>
                  </div>
                  <div>
                    <dt>Supplier</dt>
                    <dd>{renderValue(item.emailDerivedOffer?.supplierCandidate)}</dd>
                  </div>
                  <div>
                    <dt>Manufacturer</dt>
                    <dd>{renderValue(item.emailDerivedOffer?.manufacturerCandidate)}</dd>
                  </div>
                  <div>
                    <dt>MOQ</dt>
                    <dd>{renderValue(item.emailDerivedOffer?.minimumOrderQuantityCandidate)}</dd>
                  </div>
                </dl>

                <p className="offer-row-copy">
                  Review reason: {item.sourceReviewReason ?? item.qualificationRiskNote ?? item.latestNote ?? 'Needs review.'}
                </p>
                <div className="offer-row-actions">
                  <form action={submitInboundEmailReviewAction}>
                    <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
                    <input name="workflowItemId" type="hidden" value={item.id} />
                    <input name="action" type="hidden" value="APPROVE_TO_BUY" />
                    <SubmitButton
                      className="button button-primary"
                      idleLabel="Approve Row"
                      pendingLabel="Approving..."
                    />
                  </form>
                  <form action={submitInboundEmailReviewAction}>
                    <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
                    <input name="workflowItemId" type="hidden" value={item.id} />
                    <input name="action" type="hidden" value="REJECT" />
                    <SubmitButton
                      className="button"
                      idleLabel="Reject Row"
                      pendingLabel="Rejecting..."
                    />
                  </form>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel review-section">
          <h3 className="section-title">Source Email</h3>
          <dl className="detail-list">
            <div>
              <dt>From</dt>
              <dd>{inboundEmail?.fromEmail ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{inboundEmail?.subject ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Inbound status</dt>
              <dd>{inboundEmail?.processingStatus ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Email review reason</dt>
              <dd>{inboundEmail?.reviewReason ?? summarizeReason(items)}</dd>
            </div>
          </dl>

          <details className="document-card">
            <summary>Show source context</summary>
            <div className="review-context">
              <div className="source-block">
                <h4 className="subsection-title">Raw body text</h4>
                <pre>{inboundEmail?.rawText ?? 'No raw body text stored.'}</pre>
              </div>

              <div className="source-block">
                <h4 className="subsection-title">Parsed email documents</h4>
                {inboundEmail?.documents.length ? (
                  <div className="document-list">
                    {inboundEmail.documents.map((document) => (
                      <details className="document-card" key={document.id}>
                        <summary>
                          {renderDocumentTitle(document)} <span>{document.kind}</span>
                        </summary>
                        <pre>{document.textContent}</pre>
                      </details>
                    ))}
                  </div>
                ) : (
                  <p className="copy">No parsed documents were stored for this email.</p>
                )}
              </div>
            </div>
          </details>
        </section>
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Email Review</p>
        <h2 className="title">Review Unavailable</h2>
        <p className="copy">{error instanceof Error ? error.message : 'Failed to load review email.'}</p>
        <div className="actions">
          <Link className="button" href="/dashboard/review">
            Back to queue
          </Link>
        </div>
      </section>
    );
  }
}
