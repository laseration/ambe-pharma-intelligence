import type { ReviewWorkflowDetail } from './reviewApi';

const DEFAULT_SNIPPET_LIMIT = 1200;

type SourceSnippet = {
  text: string | null;
  truncated: boolean;
  label: string;
};

export type ReviewProvenanceSummary = {
  extractionMethodLabel: string;
  extractionMethodDetail: string;
  sourceLabel: string;
  sourceSnippet: SourceSnippet;
  blockedReason: string;
  missingFields: string[];
  warnings: string[];
  correctionSummaries: string[];
  relatedCorrectionSummaries: string[];
};

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function titleCaseReason(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function truncateSourceText(
  value: string | null | undefined,
  limit = DEFAULT_SNIPPET_LIMIT,
): SourceSnippet {
  const text = compact(value);
  if (!text) {
    return {
      text: null,
      truncated: false,
      label: 'No source text stored for this row.',
    };
  }

  if (text.length <= limit) {
    return {
      text,
      truncated: false,
      label: 'Stored source text for this row.',
    };
  }

  return {
    text: `${text.slice(0, limit).trimEnd()}\n...`,
    truncated: true,
    label: 'Stored source text for this row, truncated for display.',
  };
}

function summarizeHiddenSourceText(
  value: string | null | undefined,
): SourceSnippet {
  const text = compact(value);

  if (!text) {
    return {
      text: null,
      truncated: false,
      label: 'No row-level source text was stored for this offer.',
    };
  }

  return {
    text: null,
    truncated: text.length > DEFAULT_SNIPPET_LIMIT,
    label:
      'Row-level source text is stored for traceability but hidden from the dashboard.',
  };
}

export function getExtractionMethod(item: ReviewWorkflowDetail): {
  label: string;
  detail: string;
} {
  const detail = item.emailDerivedOffer;
  const reason =
    `${item.sourceReviewReason ?? ''} ${detail?.reviewReason ?? ''}`
      .trim()
      .toLowerCase();
  const sourceKind = (
    item.sourceKind ??
    detail?.sourceKind ??
    ''
  ).toLowerCase();
  const aiAssisted =
    item.aiAssisted || reason.includes('ai_') || sourceKind.includes('ai');

  if (aiAssisted) {
    return {
      label: 'AI fallback',
      detail:
        'This candidate used AI assistance and must stay review-required until an operator approves it.',
    };
  }

  return {
    label: 'Deterministic extraction',
    detail:
      'This candidate came from deterministic parsing, table extraction, or stored rules and still needs operator confirmation.',
  };
}

export function getSourceLabel(item: ReviewWorkflowDetail): string {
  const detail = item.emailDerivedOffer;
  const document = detail?.sourceDocument;
  const metadata = detail?.metadata;
  const metadataLabel = compact(metadata?.sourceDocumentLabel);
  const metadataKind = compact(metadata?.sourceDocumentKind);
  const sourceKind = compact(item.sourceKind ?? detail?.sourceKind);

  if (document?.label) {
    return `${document.label} (${document.kind})`;
  }

  if (metadataLabel) {
    return metadataKind ? `${metadataLabel} (${metadataKind})` : metadataLabel;
  }

  if (document?.kind) {
    return document.kind;
  }

  return sourceKind ? titleCaseReason(sourceKind) : 'Source not recorded';
}

export function getPromotionBlockedReason(item: ReviewWorkflowDetail): string {
  const detail = item.emailDerivedOffer;
  const reason =
    compact(item.qualificationRiskNote) ??
    compact(item.sourceReviewReason) ??
    compact(detail?.reviewReason) ??
    compact(item.priorityReason) ??
    compact(item.latestNote);

  return reason
    ? titleCaseReason(reason)
    : 'The system did not record a specific promotion-blocking reason.';
}

export function getMissingReviewFields(item: ReviewWorkflowDetail): string[] {
  const detail = item.emailDerivedOffer;
  const missing: string[] = [];

  if (!compact(detail?.rawProductText)) {
    missing.push('raw product text');
  }
  if (!compact(detail?.supplierCandidate)) {
    missing.push('supplier');
  }
  if (detail?.priceCandidate === null || detail?.priceCandidate === undefined) {
    missing.push('price');
  }
  if (!compact(detail?.currencyCandidate)) {
    missing.push('currency');
  }
  if (!detail?.resolutionCandidates?.length) {
    missing.push('supplier/product match evidence');
  }
  if (
    !compact(detail?.sourceBlockText) &&
    !compact(detail?.sourceDocument?.textContent)
  ) {
    missing.push('source snippet');
  }

  return missing;
}

export function getReviewWarnings(item: ReviewWorkflowDetail): string[] {
  const warnings: string[] = [];

  if (item.aiAssisted) {
    warnings.push(
      'AI-assisted extraction: review is required before approval.',
    );
  }
  if (item.hasUnresolvedSupplier) {
    warnings.push('Supplier was not resolved to a canonical record.');
  }
  if (item.hasConflictingSupplierCues) {
    warnings.push(
      'Supplier evidence conflicts across the email or attachment.',
    );
  }
  if (item.hasManufacturerAmbiguity) {
    warnings.push('Manufacturer evidence is ambiguous.');
  }
  if (item.hasBlockedSupplier) {
    warnings.push('Supplier is blocked; approval should remain blocked.');
  } else if (item.hasRestrictedSupplier) {
    warnings.push(
      'Supplier is restricted and needs explicit operator judgement.',
    );
  } else if (item.hasUnknownSupplierQualification) {
    warnings.push('Supplier qualification is unknown.');
  }

  return warnings;
}

export function summarizeOfferCorrections(
  item: ReviewWorkflowDetail,
): string[] {
  const corrections = item.emailDerivedOffer?.offerCorrections ?? [];

  return summarizeCorrections(corrections);
}

export function summarizeRelatedOfferCorrections(
  item: ReviewWorkflowDetail,
): string[] {
  const corrections = item.emailDerivedOffer?.relatedOfferCorrections ?? [];

  return summarizeCorrections(corrections);
}

function summarizeCorrections(
  corrections: NonNullable<
    NonNullable<ReviewWorkflowDetail['emailDerivedOffer']>['offerCorrections']
  >,
): string[] {
  return corrections.slice(0, 3).map((correction) => {
    const parts = [
      correction.correctedSupplierName
        ? `supplier ${correction.correctedSupplierName}`
        : null,
      correction.correctedNormalizedProductName
        ? `product ${correction.correctedNormalizedProductName}`
        : null,
      correction.correctedRawProductText ? 'raw product text corrected' : null,
      correction.correctedUnitPrice !== null &&
      correction.correctedUnitPrice !== undefined
        ? `price ${correction.correctedUnitPrice}`
        : null,
      correction.note ? 'operator note recorded' : null,
    ].filter(Boolean);

    const actor = correction.actorIdentifier ?? correction.actorType;
    const changeSummary =
      parts.length > 0 ? parts.join(', ') : 'no field-level correction summary';

    return `${titleCaseReason(correction.correctionStatus)} by ${actor}: ${changeSummary}`;
  });
}

export function buildReviewProvenanceSummary(
  item: ReviewWorkflowDetail,
): ReviewProvenanceSummary {
  const extractionMethod = getExtractionMethod(item);
  const detail = item.emailDerivedOffer;
  const sourceText =
    compact(detail?.sourceBlockText) ??
    compact(detail?.sourceDocument?.textContent) ??
    null;

  return {
    extractionMethodLabel: extractionMethod.label,
    extractionMethodDetail: extractionMethod.detail,
    sourceLabel: getSourceLabel(item),
    sourceSnippet: summarizeHiddenSourceText(sourceText),
    blockedReason: getPromotionBlockedReason(item),
    missingFields: getMissingReviewFields(item),
    warnings: getReviewWarnings(item),
    correctionSummaries: summarizeOfferCorrections(item),
    relatedCorrectionSummaries: summarizeRelatedOfferCorrections(item),
  };
}
