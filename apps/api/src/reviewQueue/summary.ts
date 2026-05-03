type ReviewSummaryInput = {
  processingStatus: string;
  fileType: string | null;
  fileName: string | null;
  inferredImportType: string | null;
  sourceType?: string | null;
  reason: string | null;
  sender: string | null;
  subjectOrCaption: string | null;
  parsedLineCount?: number | null;
  qualificationStatus?: string | null;
  qualificationRiskSummary?: string | null;
  hasBuyDecision?: boolean;
  hasUnresolvedSupplier?: boolean;
  hasConflictingSupplierCues?: boolean;
  hasManufacturerAmbiguity?: boolean;
};

export type ReviewSummary = {
  reviewReason: string;
  recognizedContent: string;
  missingOrUnclear: string;
  suggestedAction: string;
};

const REVIEW_STATUSES = new Set([
  'NEEDS_REVIEW',
  'REVIEW_REQUIRED',
  'FAILED',
  'NEW',
  'IN_REVIEW',
  'NEEDS_INFO',
  'APPROVED_TO_BUY',
  'ORDERED',
]);

type ReasonDetail = {
  reviewReason: string;
  missingOrUnclear: string;
  suggestedAction: string;
};

function normalizeReasonCode(reason: string | null): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function buildReasonDetail(input: ReviewSummaryInput): ReasonDetail | null {
  const reasonCode = normalizeReasonCode(input.reason);

  if (input.hasConflictingSupplierCues || reasonCode === 'conflicting_supplier_cues') {
    return {
      reviewReason: 'Conflicting supplier cues',
      missingOrUnclear:
        'The item contains more than one supplier signal, so the system could not choose one safely.',
      suggestedAction:
        'Check the sender, signature, forwarded text, and offer details, then confirm the correct supplier before proceeding.',
    };
  }

  if (input.hasUnresolvedSupplier || reasonCode === 'unresolved_supplier') {
    return {
      reviewReason: 'Unresolved supplier',
      missingOrUnclear:
        'A commercial offer was found, but the supplier could not be resolved safely.',
      suggestedAction:
        'Confirm which supplier sent the offer before approving, promoting, or importing anything.',
    };
  }

  if (input.hasManufacturerAmbiguity) {
    return {
      reviewReason: 'Manufacturer is unclear',
      missingOrUnclear:
        'There is more than one plausible manufacturer signal, so the manufacturer details are not safe yet.',
      suggestedAction: 'Confirm the manufacturer details before approving or promoting the offer.',
    };
  }

  switch (reasonCode) {
    case 'weak_product_match':
      return {
        reviewReason: 'Weak product match',
        missingOrUnclear:
          'The product text was found, but the system could not match it strongly enough to an existing product.',
        suggestedAction:
          'Review the product wording, strength, formulation, and pack size before accepting the match or creating a new product.',
      };
    case 'missing_price':
      return {
        reviewReason: 'Missing price',
        missingOrUnclear:
          'The system found a possible offer, but no safe price could be extracted.',
        suggestedAction: 'Open the item and confirm the unit price before proceeding.',
      };
    case 'missing_currency':
      return {
        reviewReason: 'Missing currency',
        missingOrUnclear:
          'A price was found, but the currency is missing or unclear.',
        suggestedAction: 'Confirm the currency before approving or promoting the offer.',
      };
    case 'ocr_text_too_weak':
      return {
        reviewReason: 'OCR text too weak',
        missingOrUnclear:
          'Text was extracted from the attachment, but it was too weak or incomplete for safe automatic promotion.',
        suggestedAction:
          'Open the attachment, verify the commercial details manually, and correct any OCR mistakes before continuing.',
      };
    case 'source_trust_too_low':
    case 'risky_source_profile_requires_review':
      return {
        reviewReason: 'Source trust too low',
        missingOrUnclear:
          'The source or sender is not trusted enough for automatic promotion.',
        suggestedAction:
          'Verify the sender and supplier identity first, then continue only if the offer is genuine and safe.',
      };
    case 'ai_candidate_review_only':
    case 'ai_extracted_candidate_requires_review':
      return {
        reviewReason: 'AI candidate kept review-only',
        missingOrUnclear:
          'AI found a possible commercial offer, but AI output is not allowed to promote this directly.',
        suggestedAction:
          'Check the extracted fields against the original message and approve only if the offer is clearly correct.',
      };
    case 'deterministic_row_low_confidence':
    case 'weak_structured_content':
      return {
        reviewReason: 'Structured text too weak',
        missingOrUnclear:
          'The item looks partly structured, but the extracted commercial line is too weak for safe automatic action.',
        suggestedAction:
          'Review the product, price, and pack details manually before accepting the row.',
      };
    case 'mixed_commercial_prose_requires_review':
      return {
        reviewReason: 'Mixed commercial prose',
        missingOrUnclear:
          'The message looks commercially relevant, but the offer details are embedded in messy prose.',
        suggestedAction:
          'Read the original message and confirm supplier, product, price, and MOQ manually.',
      };
    case 'promotion_threshold_missing_or_weak_fields':
      return {
        reviewReason: 'Missing or weak offer fields',
        missingOrUnclear:
          'Some commercial fields were found, but one or more required fields were still missing or too weak for safe promotion.',
        suggestedAction:
          'Check product, supplier, price, currency, and MOQ details, then decide whether the offer is complete enough to proceed.',
      };
    case 'no_viable_offer_candidates_extracted':
      return {
        reviewReason: 'No safe offer candidates found',
        missingOrUnclear:
          'The message looked commercially relevant, but no safe offer lines could be extracted for automatic handling.',
        suggestedAction:
          'Open the original message or attachment and confirm supplier, product, price, currency, and MOQ manually.',
      };
    case 'promotion_threshold_not_met':
      return {
        reviewReason: 'Promotion threshold not met',
        missingOrUnclear:
          'The offer looked commercially relevant, but one or more promotion checks were not strong enough.',
        suggestedAction:
          'Review the extracted fields, supplier resolution, and trust signals before deciding whether to continue manually.',
      };
    default:
      return null;
  }
}

export function describeReviewReason(input: {
  reason: string | null;
  hasUnresolvedSupplier?: boolean;
  hasConflictingSupplierCues?: boolean;
  hasManufacturerAmbiguity?: boolean;
}): string {
  const detail = buildReasonDetail({
    processingStatus: 'REVIEW_REQUIRED',
    fileType: null,
    fileName: null,
    inferredImportType: null,
    reason: input.reason,
    sender: null,
    subjectOrCaption: null,
    hasUnresolvedSupplier: input.hasUnresolvedSupplier,
    hasConflictingSupplierCues: input.hasConflictingSupplierCues,
    hasManufacturerAmbiguity: input.hasManufacturerAmbiguity,
  });

  if (detail) {
    return detail.reviewReason;
  }

  return input.reason?.trim() || 'Queued for internal review.';
}

function humanizeImportType(importType: string | null): string | null {
  switch (importType) {
    case 'supplier-price-list':
      return 'supplier price list';
    case 'inventory':
      return 'inventory file';
    case 'sales':
      return 'sales file';
    default:
      return null;
  }
}

function buildRecognizedContent(input: ReviewSummaryInput): string {
  if (input.parsedLineCount && input.parsedLineCount > 0) {
    return `Structured price text with ${input.parsedLineCount} parsed line${input.parsedLineCount === 1 ? '' : 's'}.`;
  }

  if (input.fileType === 'PDF') {
    return input.fileName ? `PDF file received: ${input.fileName}.` : 'PDF file received.';
  }

  if (input.fileType === 'IMAGE') {
    return input.fileName ? `Image file received: ${input.fileName}.` : 'Image file received.';
  }

  if (input.fileType === 'CSV' || input.fileType === 'XLSX') {
    const possibleType = humanizeImportType(input.inferredImportType);
    if (possibleType) {
      return input.fileName
        ? `Spreadsheet received: ${input.fileName}. Possible ${possibleType}.`
        : `Spreadsheet received. Possible ${possibleType}.`;
    }

    return input.fileName
      ? `Spreadsheet received: ${input.fileName}.`
      : 'Spreadsheet received.';
  }

  if (input.subjectOrCaption) {
    return `Message received: ${input.subjectOrCaption}.`;
  }

  return 'Inbound item received for review.';
}

export function buildReviewSummary(input: ReviewSummaryInput): ReviewSummary | null {
  if (!REVIEW_STATUSES.has(input.processingStatus)) {
    return null;
  }

  if (input.processingStatus === 'FAILED') {
    return {
      reviewReason: 'Automatic processing failed',
      recognizedContent: buildRecognizedContent(input),
      missingOrUnclear: 'The file could not be processed safely with the current import pipeline.',
      suggestedAction: 'Open the item, check the file format and contents, and retry or import it manually.',
    };
  }

  if (input.sourceType === 'REGULATORY_REVIEW') {
    return {
      reviewReason: 'Regulatory update needs review',
      recognizedContent: input.subjectOrCaption
        ? `Potentially relevant MHRA update: ${input.subjectOrCaption}.`
        : 'Potentially relevant MHRA update found.',
      missingOrUnclear:
        input.reason?.trim() || 'Product match or regulatory impact needs review.',
      suggestedAction:
        'Review the source update and confirm affected stock before acting.',
    };
  }

  const explicitReasonDetail = buildReasonDetail(input);
  if (explicitReasonDetail) {
    return {
      reviewReason: explicitReasonDetail.reviewReason,
      recognizedContent: buildRecognizedContent(input),
      missingOrUnclear: explicitReasonDetail.missingOrUnclear,
      suggestedAction: explicitReasonDetail.suggestedAction,
    };
  }

  if (input.fileType === 'PDF') {
    return {
      reviewReason: 'PDF file received and needs manual review',
      recognizedContent: buildRecognizedContent(input),
      missingOrUnclear: 'PDF content cannot be routed into CSV/XLSX imports automatically.',
      suggestedAction: 'Open the PDF and decide whether it should be entered manually or converted before import.',
    };
  }

  if (input.fileType === 'IMAGE') {
    return {
      reviewReason: 'Image file received and needs manual review',
      recognizedContent: buildRecognizedContent(input),
      missingOrUnclear: 'Image text cannot be imported automatically in the current workflow.',
      suggestedAction: 'Open the image and decide whether the details should be entered manually.',
    };
  }

  if (input.parsedLineCount && input.parsedLineCount > 0) {
    if (
      input.qualificationStatus ||
      input.hasBuyDecision ||
      input.hasUnresolvedSupplier ||
      input.hasConflictingSupplierCues ||
      input.hasManufacturerAmbiguity
    ) {
      const riskParts = [
        input.qualificationStatus ? `Supplier qualification: ${input.qualificationStatus}.` : null,
        input.qualificationRiskSummary ? input.qualificationRiskSummary : null,
        input.hasBuyDecision ? 'A buy decision already exists for this offer.' : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' ');
      const nextStep =
        input.hasConflictingSupplierCues || input.hasUnresolvedSupplier
          ? 'Review supplier identity before approving any buy action.'
          : input.qualificationStatus === 'BLOCKED'
            ? 'Do not approve. Resolve the blocked supplier status first.'
            : input.qualificationStatus === 'RESTRICTED' || input.qualificationStatus === 'UNKNOWN'
              ? 'Review supplier qualification, then approve to buy only with explicit operator intent.'
              : input.hasManufacturerAmbiguity
                ? 'Confirm the manufacturer details before approving the offer.'
                : input.hasBuyDecision
                  ? 'Review the existing buy decision and continue with order tracking or closure.'
                  : 'Review the staged offer and decide whether to approve to buy or reject.';

      return {
        reviewReason: 'Structured price text was recognized but still needs checking',
        recognizedContent: buildRecognizedContent(input),
        missingOrUnclear:
          riskParts || 'The text looks commercially relevant, but the extracted lines still need manual confirmation.',
        suggestedAction: nextStep,
      };
    }

    return {
      reviewReason: 'Structured price text was recognized but still needs checking',
      recognizedContent: buildRecognizedContent(input),
      missingOrUnclear: 'The text looks commercially relevant, but the extracted lines still need manual confirmation.',
      suggestedAction: 'Review the parsed lines and confirm the import type before importing anything.',
    };
  }

  if ((input.fileType === 'CSV' || input.fileType === 'XLSX') && !input.inferredImportType) {
    return {
      reviewReason: 'Import type is unclear',
      recognizedContent: buildRecognizedContent(input),
      missingOrUnclear: 'It is unclear whether this should be treated as a supplier price list, inventory file, or sales file.',
      suggestedAction:
        input.sender
          ? 'Review the spreadsheet and choose the correct import type manually.'
          : 'Review the spreadsheet and confirm the correct import type before importing.',
    };
  }

  return {
    reviewReason: 'Automatic routing was not safe enough',
    recognizedContent: buildRecognizedContent(input),
    missingOrUnclear:
      input.reason && input.reason.trim()
        ? input.reason.trim()
        : 'The item needs manual review before it can be processed safely.',
    suggestedAction: 'Open the item, confirm what it contains, and decide the next manual step.',
  };
}
