import Link from 'next/link';

import {
  getReviewWorkflowItem,
  listReviewWorkflowItems,
  type ReviewWorkflowDetail,
  type ReviewWorkflowListItem,
} from '../../../../lib/reviewApi';
import { runStagedOfferPolicyCheckAction, submitInboundEmailReviewAction } from './actions';
import { SubmitButton } from './submit-button';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    updated?: string;
    message?: string;
    dealId?: string;
    returnTo?: string;
  }>;
};

type OperatorSummary = {
  recognized: string;
  unclear: string;
  action: string;
  confidenceLimits: string[];
  technicalDetails: Array<{
    label: string;
    value: string;
  }>;
};

type ResolutionCandidate =
  NonNullable<NonNullable<ReviewWorkflowDetail['emailDerivedOffer']>['resolutionCandidates']>[number];

type SupplierEvidence = {
  displayName: string | null;
  needsSupplierCheck: boolean;
  sourceLabel: string | null;
  aliases: string[];
};

type SupplierContact = NonNullable<ReviewWorkflowDetail['supplierContact']>;

type PurchaseOrderPdfLine = {
  quantity: number | null;
  stockCode: string | null;
  productDescription: string;
  unitPrice: number | null;
  netAmount: number | null;
  vatCode: string | null;
};

type PurchaseOrderPdfDetails = {
  detected: true;
  supplierName: string | null;
  poNumber: string | null;
  orderDate: string | null;
  accountNo: string | null;
  orderTotal: number | null;
  lines: PurchaseOrderPdfLine[];
};

type ApprovalGuidance = {
  title: string;
  copy: string;
  tone: 'info' | 'warning';
};

type SupplierDetailsDefaults = {
  supplierName: string;
  contactName: string;
  email: string;
  phone: string;
};

function renderValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Not found' : String(value);
}

function renderMoney(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
    : 'Not found';
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
    .split('')
    .filter((char) => char.charCodeAt(0) <= 0x7f)
    .join('')
    .toLowerCase()
    .trim();
}

function looksLikeNonProductLabel(value: string): boolean {
  const normalized = normalizeForComparison(value).replace(/[:\s]+$/g, '');
  return NON_PRODUCT_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}:`) || normalized.startsWith(`${prefix} `),
  );
}

function looksLikeCodeHeavyValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return false;
  }

  const compact = trimmed.replace(/[\s()[\]-]+/g, '');
  const alphaCount = (compact.match(/[A-Za-z]/g) ?? []).length;
  const digitCount = (compact.match(/\d/g) ?? []).length;

  return compact.length <= 14 && alphaCount > 0 && digitCount > 0 && /^[A-Za-z0-9]+$/.test(compact);
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

  const priceText = item.emailDerivedOffer?.priceCandidate?.trim() ?? '';
  const hasCurrency = Boolean(item.emailDerivedOffer?.currencyCandidate);

  if (
    !hasStructuredProductSignal &&
    item.sourceReviewReason === 'deterministic_row_low_confidence' &&
    (looksLikeCodeHeavyValue(title) || (priceText !== '' && Number(priceText) <= 5 && !hasCurrency))
  ) {
    return false;
  }

  return true;
}

function renderDocumentTitle(document: NonNullable<ReviewWorkflowDetail['inboundEmail']>['documents'][number]) {
  return document.label || `${document.kind} #${document.documentIndex}`;
}

function summarizeReason(items: ReviewWorkflowListItem[]) {
  const rawReason =
    items.find((item) => item.sourceReviewReason)?.sourceReviewReason ??
    items.find((item) => item.qualificationRiskNote)?.qualificationRiskNote ??
    items.find((item) => item.latestNote)?.latestNote ??
    'Needs checking.';

  return formatOperatorReason(rawReason);
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

function formatOperatorReason(reason: string | null | undefined): string {
  switch ((reason ?? '').trim().toLowerCase()) {
    case 'deterministic_row_low_confidence':
      return 'Some details could not be read clearly';
    case 'unresolved_supplier':
      return 'Supplier needs checking';
    case 'weak_product_match':
      return 'Product match needs checking';
    case 'missing_price':
      return 'Price not found';
    case 'missing_currency':
      return 'Currency not found';
    case 'conflicting_supplier_cues':
      return 'Supplier details conflict';
    case 'source_trust_too_low':
      return 'Source needs checking';
    case 'ocr_text_too_weak':
      return 'Image text was unclear';
    case 'weak_structured_content':
      return 'Email layout was hard to read';
    case 'promotion_threshold_missing_or_weak_fields':
      return 'Price or pack size may need confirming';
    case 'ai_candidate_review_only':
    case 'ai_extracted_candidate_requires_review':
      return 'Some extracted details still need checking';
    case '':
      return 'Needs checking';
    default:
      return reason ?? 'Needs checking';
  }
}

function formatSupplierSourceLabel(reason: string | null | undefined): string | null {
  switch ((reason ?? '').trim().toLowerCase()) {
    case 'purchase_order_pdf_supplier':
      return 'Supplier found in PO PDF';
    case 'attachment_filename_company_cue':
      return 'Possible supplier found from attachment filename';
    case 'forwarded_sender_domain':
      return 'Found from supplier domain';
    case 'attachment_text_company_cue':
      return 'Found in attachment text';
    case 'forwarded_sender_header':
    case 'forwarded_company_cue':
    case 'body_company_cue':
    case 'signature_company_cue':
      return 'Found in forwarded email';
    default:
      return null;
  }
}

function sanitizeReturnTo(value: string | null | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed || !trimmed.startsWith('/dashboard')) {
    return '/dashboard/review';
  }

  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return '/dashboard/review';
  }

  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parsePurchaseOrderPdfDetails(value: unknown): PurchaseOrderPdfDetails | null {
  const record = asRecord(value);

  if (record?.detected !== true) {
    return null;
  }

  const rawLines = Array.isArray(record.lines) ? record.lines : [];
  const lines = rawLines
    .map((line): PurchaseOrderPdfLine | null => {
      const lineRecord = asRecord(line);
      if (!lineRecord || typeof lineRecord.productDescription !== 'string') {
        return null;
      }

      return {
        quantity: typeof lineRecord.quantity === 'number' ? lineRecord.quantity : null,
        stockCode: typeof lineRecord.stockCode === 'string' ? lineRecord.stockCode : null,
        productDescription: lineRecord.productDescription,
        unitPrice: typeof lineRecord.unitPrice === 'number' ? lineRecord.unitPrice : null,
        netAmount: typeof lineRecord.netAmount === 'number' ? lineRecord.netAmount : null,
        vatCode: typeof lineRecord.vatCode === 'string' ? lineRecord.vatCode : null,
      };
    })
    .filter((line): line is PurchaseOrderPdfLine => Boolean(line));

  return {
    detected: true,
    supplierName: typeof record.supplierName === 'string' ? record.supplierName : null,
    poNumber: typeof record.poNumber === 'string' ? record.poNumber : null,
    orderDate: typeof record.orderDate === 'string' ? record.orderDate : null,
    accountNo: typeof record.accountNo === 'string' ? record.accountNo : null,
    orderTotal: typeof record.orderTotal === 'number' ? record.orderTotal : null,
    lines,
  };
}

function getPurchaseOrderPdfDetails(item: ReviewWorkflowDetail): PurchaseOrderPdfDetails | null {
  const sourceMetadata = asRecord(item.emailDerivedOffer?.sourceDocument?.metadata);
  const sourcePurchaseOrder = parsePurchaseOrderPdfDetails(sourceMetadata?.purchaseOrderPdf);

  if (sourcePurchaseOrder) {
    return sourcePurchaseOrder;
  }

  for (const document of item.inboundEmail?.documents ?? []) {
    const metadata = asRecord(document.metadata);
    const purchaseOrderPdf = parsePurchaseOrderPdfDetails(metadata?.purchaseOrderPdf);
    if (purchaseOrderPdf) {
      return purchaseOrderPdf;
    }
  }

  const offerMetadata = asRecord(item.emailDerivedOffer?.metadata);
  return parsePurchaseOrderPdfDetails(offerMetadata?.purchaseOrderPdf);
}

function getSupplierEvidence(item: ReviewWorkflowDetail): SupplierEvidence {
  const purchaseOrderPdf = getPurchaseOrderPdfDetails(item);
  if (purchaseOrderPdf?.supplierName) {
    return {
      displayName: purchaseOrderPdf.supplierName,
      needsSupplierCheck: true,
      sourceLabel: 'Supplier found in PO PDF',
      aliases: [],
    };
  }

  const supplierCandidates = (item.emailDerivedOffer?.resolutionCandidates ?? [])
    .filter((candidate) => candidate.entityType === 'SUPPLIER')
    .sort(
      (left, right) =>
        Number(right.selected) - Number(left.selected) ||
        right.confidence - left.confidence ||
        left.candidateName.localeCompare(right.candidateName),
    );
  const selectedSupplier = supplierCandidates.find(
    (candidate) => candidate.selected && candidate.candidateId,
  );
  const topSupplierCandidate = selectedSupplier ?? supplierCandidates[0] ?? null;
  const displayName = item.emailDerivedOffer?.supplierCandidate ?? topSupplierCandidate?.candidateName ?? null;
  const aliases =
    topSupplierCandidate &&
    topSupplierCandidate.metadata &&
    typeof topSupplierCandidate.metadata === 'object' &&
    !Array.isArray(topSupplierCandidate.metadata) &&
    Array.isArray((topSupplierCandidate.metadata as { aliases?: unknown[] }).aliases)
      ? (topSupplierCandidate.metadata as { aliases: unknown[] }).aliases
          .filter((alias): alias is string => typeof alias === 'string' && alias.trim().length > 0)
          .filter((alias) => normalizeForComparison(alias) !== normalizeForComparison(displayName ?? ''))
      : [];

  return {
    displayName,
    needsSupplierCheck: Boolean(displayName) && !selectedSupplier,
    sourceLabel: formatSupplierSourceLabel(topSupplierCandidate?.reason),
    aliases,
  };
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
  const purchaseOrderPdf = getPurchaseOrderPdfDetails(item);
  if (purchaseOrderPdf) {
    return [
      'Purchase order PDF found.',
      purchaseOrderPdf.supplierName ? `Supplier: ${purchaseOrderPdf.supplierName}.` : null,
      purchaseOrderPdf.poNumber ? `Order no. ${purchaseOrderPdf.poNumber}.` : null,
      `${purchaseOrderPdf.lines.length} product line${purchaseOrderPdf.lines.length === 1 ? '' : 's'} found.`,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' ');
  }

  const supplierEvidence = getSupplierEvidence(item);
  const rawProductText = item.emailDerivedOffer?.rawProductText?.trim() ?? '';
  const isLikelyNoisyRow =
    item.emailDerivedOffer?.sourceKind?.includes('ATTACHMENT_TEXT') &&
    !item.emailDerivedOffer?.currencyCandidate &&
    looksLikeCodeHeavyValue(rawProductText);

  if (isLikelyNoisyRow || (item.sourceReviewReason ?? item.emailDerivedOffer?.reviewReason) === 'deterministic_row_low_confidence') {
    return 'Possible supplier offer found. Product details need checking.';
  }

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
  const supplierText = supplierEvidence.displayName
    ? `Supplier: ${supplierEvidence.displayName}.`
    : null;
  const manufacturerText = item.emailDerivedOffer?.manufacturerCandidate
    ? `Manufacturer: ${item.emailDerivedOffer.manufacturerCandidate}.`
    : null;

  return [
    parts.length > 0 ? `${parts.join(' ')}.` : 'A possible supplier offer was found.',
    priceText ? `Price found: ${priceText}.` : null,
    supplierText,
    manufacturerText,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

function buildSuggestedAction(item: ReviewWorkflowDetail): string {
  if (getPurchaseOrderPdfDetails(item)) {
    return 'Review the PO lines, supplier, prices, and totals before adding to purchase history.';
  }

  const reason = (item.sourceReviewReason ?? item.emailDerivedOffer?.reviewReason ?? '').trim().toLowerCase();

  if (item.hasBlockedSupplier) {
    return 'Do not approve this offer. Resolve the supplier issue first.';
  }

  if (item.hasRestrictedSupplier || item.hasUnknownSupplierQualification) {
    return 'Check the supplier and product details. Approve only if the offer looks correct.';
  }

  if (reason === 'missing_price') {
    return 'Check the original email and confirm the price before approving.';
  }

  if (reason === 'missing_currency') {
    return 'Check the original email and confirm the currency before approving.';
  }

  if (reason === 'weak_product_match') {
    return 'Check the product details. Approve only if the offer looks correct.';
  }

  if (reason === 'unresolved_supplier' || reason === 'conflicting_supplier_cues') {
    return 'Check the supplier and product details. Approve only if the offer looks correct.';
  }

  if (reason === 'ai_candidate_review_only' || reason === 'ai_extracted_candidate_requires_review') {
    return 'Check the offer against the original email before approving.';
  }

  return 'Check the supplier and product details. Approve only if the offer looks correct.';
}

function buildConfidenceLimits(item: ReviewWorkflowDetail): string[] {
  const limits: string[] = [];
  if (getPurchaseOrderPdfDetails(item)) {
    return ['PDF purchase order is review-first'];
  }

  const detail = item.emailDerivedOffer;
  const reason = (item.sourceReviewReason ?? detail?.reviewReason ?? '').trim().toLowerCase();
  const supplierEvidence = getSupplierEvidence(item);

  if (supplierEvidence.needsSupplierCheck) {
    limits.push('Supplier needs checking');
  }

  if (reason === 'weak_product_match') {
    limits.push('Product details may be incomplete');
  }

  if (reason === 'missing_price' || reason === 'missing_currency' || reason === 'promotion_threshold_missing_or_weak_fields') {
    limits.push('Price or pack size may need confirming');
  }

  if (reason === 'ocr_text_too_weak' || reason === 'weak_structured_content') {
    limits.push('Image or email text was hard to read');
  }

  if (reason === 'source_trust_too_low') {
    limits.push('Source needs checking');
  }

  if (item.hasBlockedSupplier || item.hasRestrictedSupplier || item.hasUnknownSupplierQualification) {
    limits.push(item.qualificationRiskNote ?? 'Supplier needs checking');
  }

  return Array.from(new Set(limits));
}

function buildTechnicalDetails(item: ReviewWorkflowDetail): Array<{ label: string; value: string }> {
  const detail = item.emailDerivedOffer;
  const metrics: Array<{ label: string; value: string | null }> = [
    {
      label: 'Source trust',
      value: formatPctFromScore(detail?.sourceTrustScore),
    },
    {
      label: 'Structure confidence',
      value: formatPctFromScore(detail?.structureConfidence),
    },
    {
      label: 'Field confidence',
      value: formatPctFromScore(detail?.fieldConfidence),
    },
    {
      label: 'Entity match confidence',
      value: formatPctFromScore(detail?.entityResolutionConfidence),
    },
    {
      label: 'Promotion confidence',
      value: formatPctFromScore(detail?.promotionConfidence),
    },
    {
      label: 'Overall confidence',
      value:
        typeof detail?.confidenceBreakdown?.overallConfidence === 'number'
          ? formatPctFromScore(detail.confidenceBreakdown.overallConfidence)
          : null,
    },
  ];

  return metrics
    .filter((metric): metric is { label: string; value: string } => Boolean(metric.value))
    .map((metric) => ({
      label: metric.label,
      value: metric.value,
    }));
}

function getPromotionBlockers(item: ReviewWorkflowDetail) {
  return item.promotionReadiness?.blockers ?? [];
}

function getPromotionWarnings(item: ReviewWorkflowDetail) {
  return item.promotionReadiness?.warnings ?? [];
}

function getPolicyFindings(item: ReviewWorkflowDetail) {
  return item.promotionReadiness?.policyCheck.findings ?? [];
}

function confidenceFactors(item: ReviewWorkflowDetail) {
  return item.emailDerivedOffer?.confidenceBreakdown?.factors ?? [];
}

function renderConfidenceBreakdown(item: ReviewWorkflowDetail) {
  const factors = confidenceFactors(item);
  const explanation = item.emailDerivedOffer?.confidenceExplanation ?? item.promotionReadiness?.confidenceExplanation;

  if (factors.length === 0 && !explanation) {
    return null;
  }

  return (
    <details className="document-card technical-details-card">
      <summary>Confidence breakdown</summary>
      <div className="resolution-candidate-list technical-details-grid">
        {explanation ? <p className="copy">{explanation}</p> : null}
        {factors.map((factor) => (
          <article className="resolution-candidate-card" key={`${item.id}-${factor.code}`}>
            <div className="resolution-candidate-top">
              <p className="resolution-candidate-title">{factor.label}</p>
              <span className="pill pill-neutral">{formatPctFromScore(factor.score) ?? 'Unknown'}</span>
            </div>
            <p className="resolution-candidate-copy">{factor.explanation}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function renderPromotionSafety(item: ReviewWorkflowDetail) {
  const blockers = getPromotionBlockers(item);
  const warnings = getPromotionWarnings(item);
  const readiness = item.promotionReadiness;

  if (!readiness && blockers.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <section className="resolution-evidence">
      <div className="resolution-evidence-header">
        <div>
          <h4 className="subsection-title">Promotion safety</h4>
          <p className="copy resolution-evidence-copy">
            {readiness?.reviewerExplanation ?? 'Promotion readiness was not available.'}
          </p>
        </div>
        <span className={`pill ${readiness?.canApproveToBuy ? 'pill-high' : 'pill-low'}`}>
          {readiness?.canApproveToBuy ? 'Ready after review' : 'Blocked'}
        </span>
      </div>
      {blockers.length > 0 ? (
        <div className="resolution-candidate-list">
          {blockers.map((blocker) => (
            <article className="resolution-candidate-card" key={`${item.id}-blocker-${blocker.code}-${blocker.field ?? ''}`}>
              <div className="resolution-candidate-top">
                <p className="resolution-candidate-title">{formatReasonLabel(blocker.code)}</p>
                <span className="pill pill-low">Blocking</span>
              </div>
              <p className="resolution-candidate-copy">{blocker.message}</p>
            </article>
          ))}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="resolution-candidate-list">
          {warnings.map((warning) => (
            <article className="resolution-candidate-card" key={`${item.id}-warning-${warning.code}-${warning.field ?? ''}`}>
              <div className="resolution-candidate-top">
                <p className="resolution-candidate-title">{formatReasonLabel(warning.code)}</p>
                <span className="pill pill-neutral">Warning</span>
              </div>
              <p className="resolution-candidate-copy">{warning.message}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function renderFieldEvidence(item: ReviewWorkflowDetail) {
  const evidences = item.emailDerivedOffer?.evidences ?? [];

  return (
    <section className="resolution-evidence">
      <div className="resolution-evidence-header">
        <div>
          <h4 className="subsection-title">Source evidence</h4>
          <p className="copy resolution-evidence-copy">
            Extracted values stay linked to the email text, document, extraction method, and confidence used.
          </p>
        </div>
      </div>
      {evidences.length > 0 ? (
        <div className="resolution-candidate-list">
          {evidences.map((evidence) => (
            <article className="resolution-candidate-card" key={evidence.id}>
              <div className="resolution-candidate-top">
                <p className="resolution-candidate-title">{formatReasonLabel(evidence.fieldName)}</p>
                <div className="resolution-candidate-pills">
                  <span className="pill pill-neutral">{evidence.evidenceType.replaceAll('_', ' ')}</span>
                  {typeof evidence.confidence === 'number' ? (
                    <span className="pill pill-neutral">{formatPctFromScore(evidence.confidence)}</span>
                  ) : null}
                </div>
              </div>
              <p className="resolution-candidate-copy">
                Value: {renderValue(evidence.fieldValue)}. Source: {evidence.sourceDocument?.label ?? evidence.sourceDocument?.kind ?? 'Stored source'}.
              </p>
              <p className="resolution-candidate-copy resolution-candidate-copy-secondary">
                Evidence: {evidence.rawText}
              </p>
              <p className="resolution-candidate-copy resolution-candidate-copy-secondary">
                Method: {renderValue(evidence.extractionMethod)}. Extractor: {renderValue(evidence.extractorVersion)}.
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="copy resolution-evidence-copy">
          No field-level evidence was stored for this row.
        </p>
      )}
    </section>
  );
}

function renderPolicyFindings(item: ReviewWorkflowDetail, returnTo: string) {
  const findings = getPolicyFindings(item);

  return (
    <section className="resolution-evidence">
      <div className="resolution-evidence-header">
        <div>
          <h4 className="subsection-title">Blind-broker policy check</h4>
          <p className="copy resolution-evidence-copy">
            {item.promotionReadiness?.policyCheck.summary ??
              'Run a policy check before using source text in outbound draft work.'}
          </p>
        </div>
        <form action={runStagedOfferPolicyCheckAction}>
          <input name="inboundEmailId" type="hidden" value={item.inboundEmailId ?? ''} />
          <input name="workflowItemId" type="hidden" value={item.id} />
          {renderReturnToInput(returnTo)}
          <SubmitButton
            className="button"
            idleLabel="Run policy check"
            pendingLabel="Checking..."
          />
        </form>
      </div>
      {findings.length > 0 ? (
        <div className="resolution-candidate-list">
          {findings.map((finding) => (
            <article className="resolution-candidate-card" key={`${item.id}-${finding.code}-${finding.sourceLabel}-${finding.evidence}`}>
              <div className="resolution-candidate-top">
                <p className="resolution-candidate-title">{finding.label}</p>
                <span className={`pill ${finding.blocking ? 'pill-low' : 'pill-neutral'}`}>
                  {finding.severity.toLowerCase()}
                </span>
              </div>
              <p className="resolution-candidate-copy">
                {finding.sourceLabel}: {finding.evidence}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="copy resolution-evidence-copy">No policy findings were detected.</p>
      )}
    </section>
  );
}

function buildOperatorSummary(item: ReviewWorkflowDetail): OperatorSummary {
  const reason = item.sourceReviewReason ?? item.qualificationRiskNote ?? item.latestNote ?? 'Needs review.';
  const confidenceLimits = buildConfidenceLimits(item);
  const purchaseOrderPdf = getPurchaseOrderPdfDetails(item);

  return {
    recognized: buildRecognizedOfferText(item),
    unclear: purchaseOrderPdf
      ? 'Purchase order needs review before importing into purchase history.'
      : formatOperatorReason(reason),
    action: buildSuggestedAction(item),
    confidenceLimits:
      confidenceLimits.length > 0 ? confidenceLimits : ['The row still needs operator confirmation before any buy action.'],
    technicalDetails: buildTechnicalDetails(item),
  };
}

function renderPurchaseOrderPdfPanel(purchaseOrderPdf: PurchaseOrderPdfDetails | null) {
  if (!purchaseOrderPdf) {
    return null;
  }

  return (
    <section className="panel review-section">
      <h3 className="section-title">Purchase order PDF</h3>
      <dl className="detail-list">
        <div>
          <dt>Supplier</dt>
          <dd>{renderValue(purchaseOrderPdf.supplierName)}</dd>
        </div>
        <div>
          <dt>PO number</dt>
          <dd>{renderValue(purchaseOrderPdf.poNumber)}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{renderValue(purchaseOrderPdf.orderDate)}</dd>
        </div>
        <div>
          <dt>Account number</dt>
          <dd>{renderValue(purchaseOrderPdf.accountNo)}</dd>
        </div>
        <div>
          <dt>Product lines</dt>
          <dd>{purchaseOrderPdf.lines.length}</dd>
        </div>
        <div>
          <dt>Order total</dt>
          <dd>{renderMoney(purchaseOrderPdf.orderTotal)}</dd>
        </div>
      </dl>
      <details className="document-card">
        <summary>Product lines</summary>
        {purchaseOrderPdf.lines.length > 0 ? (
          <div className="resolution-candidate-list">
            {purchaseOrderPdf.lines.map((line, index) => (
              <article className="resolution-candidate-card" key={`${line.stockCode ?? index}-${line.productDescription}`}>
                <div className="resolution-candidate-top">
                  <p className="resolution-candidate-title">{line.productDescription}</p>
                  <span className="pill pill-neutral">Qty {renderValue(line.quantity)}</span>
                </div>
                <p className="resolution-candidate-copy">
                  Stock code: {renderValue(line.stockCode)}. Unit price: {renderMoney(line.unitPrice)}. Net: {renderMoney(line.netAmount)}. VAT: {renderValue(line.vatCode)}.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="copy">No product lines were extracted safely.</p>
        )}
      </details>
    </section>
  );
}

function getSupplierContact(detail: ReviewWorkflowDetail): SupplierContact | null {
  const contact = detail.supplierContact;

  if (!contact) {
    return null;
  }

  return Object.values(contact).some((value) => Boolean(value)) ? contact : null;
}

function buildApprovalGuidance(items: Array<{ detail: ReviewWorkflowDetail }>): ApprovalGuidance | null {
  const hasBlockedSupplier = items.some(({ detail }) => detail.hasBlockedSupplier);

  if (hasBlockedSupplier) {
    return {
      title: 'Approval is blocked',
      copy: 'A blocked supplier is linked to this offer. Review the supplier before trying to approve it.',
      tone: 'warning',
    };
  }

  const firstRiskyItem = items.find(
    ({ detail }) =>
      detail.hasUnknownSupplierQualification ||
      detail.hasRestrictedSupplier ||
      getSupplierEvidence(detail).needsSupplierCheck,
  );

  if (!firstRiskyItem) {
    return null;
  }

  const supplierName = getSupplierEvidence(firstRiskyItem.detail).displayName;
  const supplierText = supplierName
    ? `${supplierName} was detected, but it has not been matched to an approved supplier record yet.`
    : 'The supplier has not been matched to an approved supplier record yet.';

  return {
    title: 'Approval needs confirmation',
    copy: `${supplierText} Confirm the supplier name, then approve only if the offer looks correct. Approving a single row counts as explicit operator intent for that row only.`,
    tone: 'info',
  };
}

function buildSupplierDetailsDefaults(
  detail: ReviewWorkflowDetail,
  supplierContact: SupplierContact | null,
): SupplierDetailsDefaults {
  const supplierEvidence = getSupplierEvidence(detail);

  return {
    supplierName: supplierContact?.companyName ?? supplierEvidence.displayName ?? '',
    contactName: supplierContact?.contactName ?? '',
    email: supplierContact?.email ?? '',
    phone: supplierContact?.phone ?? '',
  };
}

function renderSupplierDetailsFields(defaults: SupplierDetailsDefaults) {
  return (
    <fieldset className="supplier-review-fields">
      <legend>Supplier details</legend>
      <label>
        Supplier name
        <input name="supplierName" type="text" defaultValue={defaults.supplierName} />
      </label>
      <details className="supplier-review-more">
        <summary>More supplier details</summary>
        <div className="form-grid form-grid-two">
          <label>
            Contact name
            <input name="supplierContactName" type="text" defaultValue={defaults.contactName} />
          </label>
          <label>
            Email
            <input name="supplierEmail" type="email" defaultValue={defaults.email} />
          </label>
          <label>
            Phone
            <input name="supplierPhone" type="tel" defaultValue={defaults.phone} />
          </label>
        </div>
      </details>
      <p className="form-helper">
        Enter or confirm the supplier name before approving incomplete supplier checks.
      </p>
    </fieldset>
  );
}

function renderReturnToInput(returnTo: string) {
  return <input name="returnTo" type="hidden" value={returnTo} />;
}

function getApproveButtonLabel(
  approvalGuidance: ApprovalGuidance | null,
  supplierName: string,
  visibleItemCount: number,
): string {
  if (visibleItemCount === 0) {
    return 'No visible offers to approve';
  }

  if (!approvalGuidance) {
    return 'Approve visible offers';
  }

  return supplierName.trim() ? 'Save supplier name and approve' : 'Approve anyway';
}

export default async function ReviewInboundEmailPage({ params, searchParams }: PageProps) {
  const { id: inboundEmailId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const returnTo = sanitizeReturnTo(query?.returnTo);

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
    const supplierContact = getSupplierContact(firstDetailForSummary);
    const approvalGuidance = buildApprovalGuidance(detailedVisibleItems);
    const supplierDetailsDefaults = buildSupplierDetailsDefaults(firstDetailForSummary, supplierContact);
    const purchaseOrderPdf = getPurchaseOrderPdfDetails(firstDetailForSummary);

    return (
      <section className="review-layout">
        <div className="review-header review-header-inline">
            <div>
            <p className="eyebrow">Supplier Email</p>
            <h2 className="title">{inboundEmail?.subject ?? 'Supplier email'}</h2>
            <p className="copy">
              Check the offers found in this email and choose what to do next.
            </p>
          </div>
          <Link className="button" href={returnTo}>
            Back
          </Link>
        </div>

        {query?.error ? <p className="alert alert-error">{query.error}</p> : null}
        {query?.message ? (
          <p className="alert alert-success">
            {query.message}
            {query.dealId ? (
              <>
                {' '}
                <Link href={`/dashboard/deals`}>Open deal</Link>
              </>
            ) : null}
          </p>
        ) : query?.updated ? <p className="alert alert-success">Saved with {query.updated}.</p> : null}

        <section className="panel review-section">
          <h3 className="section-title">Quick summary</h3>
          <div className="operator-summary-grid">
            <div className="operator-summary-card">
              <dt>What the bot found</dt>
              <dd>{emailSummary.recognized}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Needs checking</dt>
              <dd>{emailSummary.unclear}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Recommended next step</dt>
              <dd>{emailSummary.action}</dd>
            </div>
            <div className="operator-summary-card">
              <dt>Why this needs review</dt>
              <dd>
                <ul className="simple-list compact-list">
                  {emailSummary.confidenceLimits.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
          {emailSummary.technicalDetails.length > 0 ? (
            <details className="document-card technical-details-card">
              <summary>Technical details</summary>
              <dl className="duplicate-product-details technical-details-grid">
                {emailSummary.technicalDetails.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}
        </section>

        {supplierContact ? (
          <section className="panel review-section">
            <h3 className="section-title">Supplier contact</h3>
            <dl className="detail-list">
              {supplierContact.companyName ? (
                <div>
                  <dt>Company</dt>
                  <dd>{supplierContact.companyName}</dd>
                </div>
              ) : null}
              {supplierContact.contactName ? (
                <div>
                  <dt>Contact</dt>
                  <dd>{supplierContact.contactName}</dd>
                </div>
              ) : null}
              {supplierContact.email ? (
                <div>
                  <dt>Email</dt>
                  <dd>{supplierContact.email}</dd>
                </div>
              ) : null}
              {supplierContact.phone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>{supplierContact.phone}</dd>
                </div>
              ) : null}
              {supplierContact.source ? (
                <div>
                  <dt>Source</dt>
                  <dd>{supplierContact.source}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {renderPurchaseOrderPdfPanel(purchaseOrderPdf)}

        <section className="panel review-section" id="decision">
          <h3 className="section-title">Decision</h3>
          <p className="copy review-summary-copy">
            {visibleItems.length} {visibleItems.length === 1 ? 'offer' : 'offers'} from {inboundEmail?.fromEmail ?? 'Not found'}.
            {' '}
            Why this needs checking: {summarizeReason(items)}
          </p>
          {approvalGuidance ? (
            <div
              className={`review-guidance-card${
                approvalGuidance.tone === 'warning'
                  ? ' review-guidance-card-warning'
                  : ' review-guidance-card-info'
              }`}
            >
              <p className="review-guidance-title">{approvalGuidance.title}</p>
              <p className="copy review-guidance-copy">{approvalGuidance.copy}</p>
            </div>
          ) : null}
          {hiddenItemCount > 0 ? (
            <p className="copy review-summary-copy review-summary-note">
              {hiddenItemCount} low-confidence rows were hidden because they looked like forwarded headers,
              phone numbers, or signature text rather than real offers.
            </p>
          ) : null}
          {visibleItems.length === 0 ? (
            <p className="alert alert-error review-inline-alert">
              No visible offer rows are available to approve on this page. Use reject or review the original email details.
            </p>
          ) : null}
          {query?.error ? <p className="alert alert-error review-inline-alert">{query.error}</p> : null}

          <div className="action-row action-row-stacked-mobile">
            <form action={submitInboundEmailReviewAction} className="action-form">
              <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
              <input name="action" type="hidden" value="APPROVE_TO_BUY" />
              {renderReturnToInput(returnTo)}
              {approvalGuidance ? renderSupplierDetailsFields(supplierDetailsDefaults) : null}
              <label>
                Note
                <textarea name="note" placeholder="Add a note if needed" rows={3} />
              </label>
              <label className="checkbox-row">
                <input name="allowQualificationRisk" type="checkbox" />
                Approve despite incomplete supplier checks
              </label>
              <p className="form-helper">
                Use this only if you intentionally want to continue even though the supplier still needs checking.
              </p>
              {visibleItems.length === 0 ? (
                <button className="button button-primary button-large" disabled type="button">
                  {getApproveButtonLabel(
                    approvalGuidance,
                    supplierDetailsDefaults.supplierName,
                    visibleItems.length,
                  )}
                </button>
              ) : (
                <SubmitButton
                  className="button button-primary button-large"
                  idleLabel={getApproveButtonLabel(
                    approvalGuidance,
                    supplierDetailsDefaults.supplierName,
                    visibleItems.length,
                  )}
                  pendingLabel="Approving..."
                />
              )}
            </form>

            <form action={submitInboundEmailReviewAction} className="action-form">
              <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
              <input name="action" type="hidden" value="REJECT" />
              {renderReturnToInput(returnTo)}
              <label>
                Reason
                <textarea name="note" placeholder="Add a short reason" rows={3} />
              </label>
              <SubmitButton
                className="button button-large"
                idleLabel="Reject all"
                pendingLabel="Rejecting..."
              />
            </form>
          </div>
        </section>

        <section className="panel review-section">
          <h3 className="section-title">Offers found</h3>
          <div className="offer-row-list">
            {detailedVisibleItems.map(({ item, detail, summary }) => {
              const resolutionEvidenceGroups = getResolutionEvidenceGroups(detail);
              const supplierEvidence = getSupplierEvidence(detail);

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
                    <dd className="offer-field-stack">
                      <span>{renderValue(supplierEvidence.displayName)}</span>
                      {supplierEvidence.needsSupplierCheck ? (
                        <span className="pill pill-neutral">Needs supplier check</span>
                      ) : null}
                      {supplierEvidence.sourceLabel ? (
                        <span className="offer-field-note">{supplierEvidence.sourceLabel}</span>
                      ) : null}
                      {supplierEvidence.aliases.length > 0 ? (
                        <span className="offer-field-note">
                          Also seen as: {supplierEvidence.aliases.join(', ')}
                        </span>
                      ) : null}
                    </dd>
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
                  Needs checking because {formatOperatorReason(
                    item.sourceReviewReason ?? item.qualificationRiskNote ?? item.latestNote ?? 'this offer still needs review.',
                  )}
                </p>
                <dl className="offer-row-summary">
                  <div>
                    <dt>What the bot found</dt>
                    <dd>{summary.recognized}</dd>
                  </div>
                  <div>
                    <dt>Needs checking</dt>
                    <dd>{summary.unclear}</dd>
                  </div>
                  <div>
                    <dt>Recommended next step</dt>
                    <dd>{summary.action}</dd>
                  </div>
                  <div>
                    <dt>Why this needs review</dt>
                    <dd>
                      <ul className="simple-list compact-list">
                        {summary.confidenceLimits.map((limit) => (
                          <li key={`${detail.id}-${limit}`}>{limit}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                </dl>
                {summary.technicalDetails.length > 0 ? (
                  <details className="document-card technical-details-card">
                    <summary>Technical details</summary>
                    <dl className="duplicate-product-details technical-details-grid">
                      {summary.technicalDetails.map((technicalDetail) => (
                        <div key={`${detail.id}-${technicalDetail.label}`}>
                          <dt>{technicalDetail.label}</dt>
                          <dd>{technicalDetail.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
                {renderConfidenceBreakdown(detail)}
                {renderPromotionSafety(detail)}
                {renderFieldEvidence(detail)}
                {renderPolicyFindings(detail, returnTo)}
                <section className="resolution-evidence">
                  <div className="resolution-evidence-header">
                    <div>
                      <h4 className="subsection-title">Resolution Evidence</h4>
                      <p className="copy resolution-evidence-copy">
                        Candidate matches stored for this offer&apos;s supplier, product, and manufacturer checks.
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
                                  Why this looks like a match: {formatReasonLabel(candidate.reason)}.
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
                    {renderReturnToInput(returnTo)}
                    <SubmitButton
                      className="button button-primary"
                      idleLabel="Approve"
                      pendingLabel="Approving..."
                    />
                  </form>
                  <form action={submitInboundEmailReviewAction}>
                    <input name="inboundEmailId" type="hidden" value={inboundEmailId} />
                    <input name="workflowItemId" type="hidden" value={item.id} />
                    <input name="action" type="hidden" value="REJECT" />
                    {renderReturnToInput(returnTo)}
                    <SubmitButton
                      className="button"
                      idleLabel="Reject"
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
          <h3 className="section-title">Original email</h3>
          <dl className="detail-list">
            <div>
              <dt>From</dt>
              <dd>{inboundEmail?.fromEmail ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{inboundEmail?.subject ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Email status</dt>
              <dd>{inboundEmail?.processingStatus ?? 'Not found'}</dd>
            </div>
            <div>
              <dt>Why this needs checking</dt>
              <dd>{inboundEmail?.reviewReason ?? summarizeReason(items)}</dd>
            </div>
          </dl>

          <details className="document-card">
            <summary>Show email details</summary>
            <div className="review-context">
              <div className="source-block">
                <h4 className="subsection-title">Raw email text</h4>
                <pre>{inboundEmail?.rawText ?? 'No raw body text stored.'}</pre>
              </div>

              <div className="source-block">
                <h4 className="subsection-title">Parsed attachments and documents</h4>
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
        <p className="eyebrow">Supplier Email</p>
        <h2 className="title">Couldn&apos;t load this review</h2>
        <p className="copy">{error instanceof Error ? error.message : 'Failed to load review email.'}</p>
        <div className="actions">
          <Link className="button" href={sanitizeReturnTo(query?.returnTo)}>
            Back
          </Link>
        </div>
      </section>
    );
  }
}
