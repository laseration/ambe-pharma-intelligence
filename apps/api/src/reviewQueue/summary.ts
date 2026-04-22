type ReviewSummaryInput = {
  processingStatus: string;
  fileType: string | null;
  fileName: string | null;
  inferredImportType: string | null;
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
