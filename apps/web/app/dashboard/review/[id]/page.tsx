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

type OperatorSummary = {
  recognized: string;
  unclear: string;
  action: string;
  confidenceLimits: string[];
};

type ResolutionCandidate =
  NonNullable<NonNullable<ReviewWorkflowDetail['emailDerivedOffer']>['resolutionCandidates']>[number];

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

function formatPctFromScore(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return null;
  }

  return `${Math.round(score)}%`;
}

function formatReasonLabel(reason: string): string {
  const normalized = reason.replace(/[_-]+/g, ' ').trim();

  if (!normalized) {
    return 'No rationale stored.';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getResolutionEvidenceGroups(
  item: ReviewWorkflowDetail,
): Array<{
  entityType: ResolutionCandidate['entityType'];
  label: string;
  selectedCandidate: ResolutionCandidate | null;
  candidates: ResolutionCandidate[];
}> {
  const candidates = item.emailDerivedOffer?.resolutionCandidates ?? [];
  const entityOrder: ResolutionCandidate['entityType'][] = ['PRODUCT', 'SUPPLIER', 'MANUFACTURER'];

  return entityOrder
    .map((entityType) => {
      const entityCandidates = candidates
        .filter((candidate) => candidate.entityType === entityType)
        .sort(
          (left, right) =>
            Number(right.selected) - Number(left.selected) ||
            right.confidence - left.confidence ||
            left.candidateName.localeCompare(right.candidateName),
        );

      if (entityCandidates.length === 0) {
        return null;
      }

      return {
        entityType,
        label: titleCase(entityType.toLowerCase()),
        selectedCandidate: entityCandidates.find((candidate) => candidate.selected) ?? null,
        candidates: entityCandidates,
      };
    })
    .filter(
      (
        group,
      ): group is {
        entityType: ResolutionCandidate['entityType'];
        label: string;
        selectedCandidate: ResolutionCandidate | null;
        candidates: ResolutionCandidate[];
      } => Boolean(group),
    );
}

function buildRecognizedOfferText(item: ReviewWorkflowDetail): string {
  const parts = [
    extractDisplayProductName(item),
    item.emailDerivedOffer?.strengthCandidate,
    item.emailDerivedOffer?.dosageFormCandidate,
    item.emailDerivedOffer?.packSizeCandidate
      ? `pack ${item.emailDerivedOffer.packSizeCandidate}`
      : null,
  ].filter((part): part is string => Boolean(part) && part !== 'Unknown product');
  const priceText = item.emailDerivedOffer?.priceCandidate
    ? `${item.emailDerivedOffer.priceCandidate}${item.emailDerivedOffer.currencyCandidate ? ` ${item.emailDerivedOffer.currencyCandidate}` : ''}`
    : null;
  const supplierText = item.emailDerivedOffer?.supplierCandidate
    ? `Supplier: ${item.emailDerivedOffer.supplierCandidate}.`
    : null;
  const manufacturerText = item.emailDerivedOffer?.manufacturerCandidate
    ? `Manufacturer: ${item.emailDerivedOffer.manufacturerCandidate}.`
    : null;

  return [
    parts.length > 0 ? `Recognized offer row for ${parts.join(' ')}.` : 'Recognized a possible commercial offer row.',
    priceText ? `Price seen: ${priceText}.` : null,
    supplierText,
    manufacturerText,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

function buildSuggestedAction(item: ReviewWorkflowDetail): string {
  const reason = (item.sourceReviewReason ?? item.emailDerivedOffer?.reviewReason ?? '').trim().toLowerCase();

  if (item.hasBlockedSupplier) {
    return 'Do not approve this row. Resolve the blocked supplier status before any buy action.';
  }

  if (item.hasRestrictedSupplier || item.hasUnknownSupplierQualification) {
    return 'Confirm supplier qualification first, then approve only with explicit operator intent if the offer is commercially valid.';
  }

  if (reason === 'missing_price') {
    return 'Open the source text and confirm the unit price before approving or rejecting.';
  }

  if (reason === 'missing_currency') {
    return 'Confirm the currency from the source before making a buy decision.';
  }

  if (reason === 'weak_product_match') {
    return 'Check the product wording, strength, form, and pack size before accepting the match.';
  }

  if (reason === 'unresolved_supplier' || reason === 'conflicting_supplier_cues') {
    return 'Confirm the correct supplier from the sender, signature, and source text before approving.';
  }

  if (reason === 'ai_candidate_review_only' || reason === 'ai_extracted_candidate_requires_review') {
    return 'Verify every extracted field against the source text before approving anything.';
  }

  return 'Review the extracted commercial facts against the source email, then approve to buy or reject this row.';
}

function buildConfidenceLimits(item: ReviewWorkflowDetail): string[] {
  const limits: string[] = [];
  const detail = item.emailDerivedOffer;
  const reason = (item.sourceReviewReason ?? detail?.reviewReason ?? '').trim().toLowerCase();

  if (detail?.sourceTrustScore !== null && detail?.sourceTrustScore !== undefined && detail.sourceTrustScore < 80) {
    limits.push(`Source trust is only ${formatPctFromScore(detail.sourceTrustScore)}.`);
  }

  if (detail?.structureConfidence !== null && detail?.structureConfidence !== undefined && detail.structureConfidence < 80) {
    limits.push(`Structure confidence is only ${formatPctFromScore(detail.structureConfidence)}.`);
  }

  if (detail?.fieldConfidence !== null && detail?.fieldConfidence !== undefined && detail.fieldConfidence < 80) {
    limits.push(`Field confidence is only ${formatPctFromScore(detail.fieldConfidence)}.`);
  }

  if (
    detail?.entityResolutionConfidence !== null &&
    detail?.entityResolutionConfidence !== undefined &&
    detail.entityResolutionConfidence < 80
  ) {
    limits.push(
      `Entity resolution confidence is only ${formatPctFromScore(detail.entityResolutionConfidence)}.`,
    );
  }

  if (
    detail?.promotionConfidence !== null &&
    detail?.promotionConfidence !== undefined &&
    detail.promotionConfidence < 80
  ) {
    limits.push(`Promotion confidence is only ${formatPctFromScore(detail.promotionConfidence)}.`);
  }

  if (item.hasBlockedSupplier || item.hasRestrictedSupplier || item.hasUnknownSupplierQualification) {
    limits.push(item.qualificationRiskNote ?? 'Supplier qualification is limiting confidence.');
  }

  if (reason === 'missing_price') {
    limits.push('No safe price was extracted.');
  }

  if (reason === 'missing_currency') {
    limits.push('Currency is missing or unclear.');
  }

  if (reason === 'weak_product_match') {
    limits.push('Product matching was not strong enough for safe automatic handling.');
  }

  if (reason === 'unresolved_supplier') {
    limits.push('Supplier identity was not resolved safely.');
  }

  if (reason === 'conflicting_supplier_cues') {
    limits.push('More than one supplier signal was found.');
  }

  if (reason === 'promotion_threshold_missing_or_weak_fields') {
    limits.push('One or more required commercial fields stayed weak or incomplete.');
  }

  if (reason === 'ai_candidate_review_only' || reason === 'ai_extracted_candidate_requires_review') {
    limits.push('AI assistance was used, so the row remains review-only by design.');
  }

  return Array.from(new Set(limits));
}

function buildOperatorSummary(item: ReviewWorkflowDetail): OperatorSummary {
  const reason = item.sourceReviewReason ?? item.qualificationRiskNote ?? item.latestNote ?? 'Needs review.';
  const confidenceLimits = buildConfidenceLimits(item);

  return {
    recognized: buildRecognizedOfferText(item),
    unclear: reason,
    action: buildSuggestedAction(item),
    confidenceLimits:
      confidenceLimits.length > 0 ? confidenceLimits : ['The row still needs operator confirmation before any buy action.'],
  };
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

    const detailedVisibleItems = await Promise.all(
      visibleItems.map(async (item) => {
        const detail = await getReviewWorkflowItem(item.id);
        return {
          item,
          detail,
          summary: buildOperatorSummary(detail),
        };
      }),
    );
    const firstDetailForSummary = detailedVisibleItems[0]?.detail ?? (await getReviewWorkflowItem(items[0]!.id));
    const emailSummary = buildOperatorSummary(firstDetailForSummary);
    const inboundEmail = firstDetailForSummary.inboundEmail;

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
          <h3 className="section-title">Operator Summary</h3>
          <div className="operator-summary-grid">
            <div className="operator-summary-card">
              <dt>Recognized</dt>
              <dd>{emailSummary.recognized}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Unclear</dt>
              <dd>{emailSummary.unclear}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Suggested Action</dt>
              <dd>{emailSummary.action}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Why Confidence Is Limited</dt>
              <dd>
                <ul className="simple-list compact-list">
                  {emailSummary.confidenceLimits.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        </section>

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
            {detailedVisibleItems.map(({ item, detail, summary }) => {
              const resolutionEvidenceGroups = getResolutionEvidenceGroups(detail);

              return (
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
                <dl className="offer-row-summary">
                  <div>
                    <dt>Recognized</dt>
                    <dd>{summary.recognized}</dd>
                  </div>
                  <div>
                    <dt>Unclear</dt>
                    <dd>{summary.unclear}</dd>
                  </div>
                  <div>
                    <dt>Suggested action</dt>
                    <dd>{summary.action}</dd>
                  </div>
                  <div>
                    <dt>Why confidence is limited</dt>
                    <dd>
                      <ul className="simple-list compact-list">
                        {summary.confidenceLimits.map((limit) => (
                          <li key={`${detail.id}-${limit}`}>{limit}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                </dl>
                <section className="resolution-evidence">
                  <div className="resolution-evidence-header">
                    <div>
                      <h4 className="subsection-title">Resolution Evidence</h4>
                      <p className="copy resolution-evidence-copy">
                        Candidate matches stored for this row&apos;s supplier, product, and manufacturer resolution.
                      </p>
                    </div>
                  </div>
                  {resolutionEvidenceGroups.length > 0 ? (
                    <div className="resolution-evidence-groups">
                      {resolutionEvidenceGroups.map((group) => (
                        <section className="resolution-evidence-group" key={`${detail.id}-${group.entityType}`}>
                          <div className="resolution-evidence-group-header">
                            <p className="resolution-evidence-group-title">{group.label}</p>
                            <p className="resolution-evidence-group-copy">
                              {group.selectedCandidate
                                ? `Selected candidate: ${group.selectedCandidate.candidateName}`
                                : 'No candidate was selected automatically.'}
                            </p>
                          </div>
                          <div className="resolution-candidate-list">
                            {group.candidates.map((candidate) => (
                              <article
                                className={`resolution-candidate-card${candidate.selected ? ' resolution-candidate-card-selected' : ''}`}
                                key={`${detail.id}-${group.entityType}-${candidate.candidateId ?? candidate.candidateName}-${candidate.reason}`}
                              >
                                <div className="resolution-candidate-top">
                                  <p className="resolution-candidate-title">{candidate.candidateName}</p>
                                  <div className="resolution-candidate-pills">
                                    {candidate.selected ? <span className="pill pill-high">Selected</span> : null}
                                    <span className="pill pill-neutral">
                                      {formatPctFromScore(candidate.confidence) ?? 'Unknown confidence'}
                                    </span>
                                  </div>
                                </div>
                                <p className="resolution-candidate-copy">
                                  Why this candidate looks related: {formatReasonLabel(candidate.reason)}.
                                </p>
                                <p className="resolution-candidate-copy resolution-candidate-copy-secondary">
                                  {candidate.candidateId
                                    ? 'Linked to an existing canonical record.'
                                    : 'Stored as a text cue only, without a canonical record link.'}
                                </p>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className="copy resolution-evidence-copy">
                      No candidate supplier, product, or manufacturer evidence was stored for this row.
                    </p>
                  )}
                </section>
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
              );
            })}
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
