import { createHash } from 'node:crypto';

import { PDFDocument, PDFTextField, StandardFonts } from 'pdf-lib';

import type { AccountOpeningCaseDetail } from './service';

export const ACCOUNT_OPENING_BINARY_FILL_PREVIEW_FILE_NAMES = [
  'binary-fill-preview.pdf',
] as const;
export const MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES = 15 * 1024 * 1024;

export type AccountOpeningBinaryFillPreviewFileName =
  (typeof ACCOUNT_OPENING_BINARY_FILL_PREVIEW_FILE_NAMES)[number];

export type AccountOpeningBinaryFillPreviewStatus =
  | 'GENERATED_FOR_REVIEW'
  | 'UNSUPPORTED'
  | 'REQUIRES_MANUAL_COMPLETION'
  | 'FAILED';

export type AccountOpeningBinaryFillPreviewFile = {
  fileName: AccountOpeningBinaryFillPreviewFileName;
  contentType:
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  content: Uint8Array;
};

export type AccountOpeningBinaryFillPreviewResult = {
  status: AccountOpeningBinaryFillPreviewStatus;
  previewVersion: 'binary-fill-preview-v1';
  fileName: AccountOpeningBinaryFillPreviewFileName | null;
  contentType: AccountOpeningBinaryFillPreviewFile['contentType'] | null;
  content: Uint8Array | null;
  outputHash: string | null;
  filledFieldCount: number;
  blankFieldCount: number;
  unsupportedReason: string | null;
  warnings: string[];
  brandingPreservationCheck: {
    originalBrandingPreservationRequired: true;
    originalLayoutPreservationRequired: true;
    originalPageCount: number | null;
    outputPageCount: number | null;
    pageCountPreserved: boolean | null;
    originalAcroFieldCount: number | null;
    outputAcroFieldCount: number | null;
    acroFormPreserved: true;
    formFlattened: false;
    originalFormAlteredInPlace: false;
  };
  safetySummary: {
    internalPreviewOnly: true;
    binaryPreviewGenerated: boolean;
    rawExtractedTextIncluded: false;
    rawBankDetailsIncluded: false;
    blockedFieldsLeftBlank: true;
    reviewRequiredFieldsLeftBlank: true;
    signatureFieldsLeftBlank: true;
    directDebitBankAuthorityBankDetailsLeftBlank: true;
    signedFormsIncluded: false;
    supplierMessageIncluded: false;
    supplierSubmissionTriggered: false;
    sharePointCompletedFormFiled: false;
    purchaseWorkflowTriggered: false;
  };
};

export type AccountOpeningBinaryFillPreviewSizeLimits = {
  maxOriginalBytes?: number;
  maxGeneratedPreviewBytes?: number;
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;
const SENSITIVE_FIELD_PATTERN =
  /\b(direct\s*debit|dd\s*mandate|mandate|bank\s*(?:authority|mandate|account|acct|acc|details)|sort\s*code|account\s*(?:no\.?|number)|acct\s*(?:no\.?|number)|iban|swift|bic|guarantee|indemnity|director[-\s]*(?:only|signature)|signature|responsible\s*person|rp\b|gdp\b|wda\b|gphc|cqc|credit\s*(?:terms?|limit|account|application)|returns?\s*polic(?:y|ies)|returns?\s*terms?|return\s*obligations?)\b/i;
const SENSITIVE_DRAFT_FIELD_KEY_PATTERN =
  /^(directDebitOrBankAuthority|bankDetails|signature|guaranteeIndemnityDirectorOnly|gphcPremisesNumber|responsiblePerson|wholesaleDealerAuthorisation|cqcRegistration|standardPaymentPreference)$/i;

function sanitizeBinaryPreviewText(value: string): string {
  return value
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function normalizeFieldName(value: string | null | undefined): string {
  return (
    sanitizeBinaryPreviewText(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ') || ''
  );
}

function hashBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function emptyResult(
  status: Exclude<
    AccountOpeningBinaryFillPreviewStatus,
    'GENERATED_FOR_REVIEW'
  >,
  unsupportedReason: string,
  warnings: string[] = [],
  brandingPreservationCheck: Partial<
    AccountOpeningBinaryFillPreviewResult['brandingPreservationCheck']
  > = {},
): AccountOpeningBinaryFillPreviewResult {
  return {
    status,
    previewVersion: 'binary-fill-preview-v1',
    fileName: null,
    contentType: null,
    content: null,
    outputHash: null,
    filledFieldCount: 0,
    blankFieldCount: 0,
    unsupportedReason: sanitizeBinaryPreviewText(unsupportedReason),
    warnings: warnings.map(sanitizeBinaryPreviewText),
    brandingPreservationCheck: {
      originalBrandingPreservationRequired: true,
      originalLayoutPreservationRequired: true,
      originalPageCount: null,
      outputPageCount: null,
      pageCountPreserved: null,
      originalAcroFieldCount: null,
      outputAcroFieldCount: null,
      acroFormPreserved: true,
      formFlattened: false,
      originalFormAlteredInPlace: false,
      ...brandingPreservationCheck,
    },
    safetySummary: {
      internalPreviewOnly: true,
      binaryPreviewGenerated: false,
      rawExtractedTextIncluded: false,
      rawBankDetailsIncluded: false,
      blockedFieldsLeftBlank: true,
      reviewRequiredFieldsLeftBlank: true,
      signatureFieldsLeftBlank: true,
      directDebitBankAuthorityBankDetailsLeftBlank: true,
      signedFormsIncluded: false,
      supplierMessageIncluded: false,
      supplierSubmissionTriggered: false,
      sharePointCompletedFormFiled: false,
      purchaseWorkflowTriggered: false,
    },
  };
}

function isSavedReviewedMapping(
  mapping: AccountOpeningCaseDetail['fieldMappings']['mappings'][number],
): boolean {
  return !/^(draft|evidence):/.test(mapping.id);
}

function isMappingEligibleForBinaryFill(
  mapping: AccountOpeningCaseDetail['fieldMappings']['mappings'][number],
): boolean {
  const mappedDraftFieldKey = mapping.mappedDraftFieldKey ?? '';

  return (
    mapping.status === 'MAPPED_SAFE' &&
    Boolean(mappedDraftFieldKey.trim()) &&
    Boolean(mapping.proposedValue?.trim()) &&
    !mapping.requiresReview &&
    mapping.riskLevel === 'LOW' &&
    mapping.confidence !== 'LOW' &&
    mapping.confidence !== 'BLOCKED' &&
    !SENSITIVE_FIELD_PATTERN.test(mapping.supplierFieldLabel) &&
    !SENSITIVE_FIELD_PATTERN.test(mappedDraftFieldKey) &&
    !SENSITIVE_DRAFT_FIELD_KEY_PATTERN.test(mappedDraftFieldKey)
  );
}

function binaryFillFields(item: AccountOpeningCaseDetail) {
  return item.fieldMappings.mappings
    .filter(isSavedReviewedMapping)
    .filter(isMappingEligibleForBinaryFill)
    .map((mapping) => ({
      supplierFieldLabel: sanitizeBinaryPreviewText(mapping.supplierFieldLabel),
      mappedDraftFieldKey: mapping.mappedDraftFieldKey as string,
      proposedValue: sanitizeBinaryPreviewText(mapping.proposedValue ?? ''),
      normalizedSupplierFieldLabel: normalizeFieldName(
        mapping.supplierFieldLabel,
      ),
      normalizedMappedDraftFieldKey: normalizeFieldName(
        mapping.mappedDraftFieldKey,
      ),
    }))
    .filter((field) => field.proposedValue.trim().length > 0);
}

function findSafeFillField(
  pdfFieldName: string,
  fields: ReturnType<typeof binaryFillFields>,
) {
  const normalizedPdfFieldName = normalizeFieldName(pdfFieldName);

  return fields.find(
    (field) =>
      field.normalizedSupplierFieldLabel === normalizedPdfFieldName ||
      field.normalizedMappedDraftFieldKey === normalizedPdfFieldName,
  );
}

export async function buildAccountOpeningBinaryFillPreview(input: {
  item: AccountOpeningCaseDetail;
  originalForm: AccountOpeningCaseDetail['originalForms'][number];
  sourceBytes: Uint8Array;
  sizeLimits?: AccountOpeningBinaryFillPreviewSizeLimits;
}): Promise<AccountOpeningBinaryFillPreviewResult> {
  const maxOriginalBytes =
    input.sizeLimits?.maxOriginalBytes ??
    MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES;
  const maxGeneratedPreviewBytes =
    input.sizeLimits?.maxGeneratedPreviewBytes ??
    MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES;

  if (input.originalForm.formType === 'WORD') {
    return emptyResult(
      'UNSUPPORTED',
      'DOCX binary fill preview is not enabled because the current implementation cannot guarantee preservation of headers, footers, tables, logos, styles, and layout.',
    );
  }

  if (input.originalForm.formType !== 'PDF') {
    return emptyResult(
      'UNSUPPORTED',
      `${input.originalForm.formType} original forms are not supported for binary fill preview.`,
    );
  }

  if (input.sourceBytes.byteLength > maxOriginalBytes) {
    return emptyResult(
      'UNSUPPORTED',
      `Original form bytes exceed the binary fill preview size limit of ${maxOriginalBytes} bytes.`,
    );
  }

  const safeFields = binaryFillFields(input.item);
  const pdfDocument = await PDFDocument.load(input.sourceBytes);
  const originalPageCount = pdfDocument.getPageCount();
  const pdfForm = pdfDocument.getForm();
  const pdfFields = pdfForm.getFields();
  const originalAcroFieldCount = pdfFields.length;

  if (originalAcroFieldCount === 0) {
    return emptyResult(
      'REQUIRES_MANUAL_COMPLETION',
      'This PDF has no AcroForm fields. Flat or scanned PDFs require manual completion until a conservative reviewed approach is implemented.',
      [],
      {
        originalPageCount,
        outputPageCount: null,
        pageCountPreserved: null,
        originalAcroFieldCount,
        outputAcroFieldCount: null,
      },
    );
  }

  const warnings: string[] = [];
  let filledFieldCount = 0;
  let blankFieldCount = 0;

  for (const pdfField of pdfFields) {
    const pdfFieldName = pdfField.getName();
    const sensitivePdfField = SENSITIVE_FIELD_PATTERN.test(pdfFieldName);
    const safeField = sensitivePdfField
      ? null
      : findSafeFillField(pdfFieldName, safeFields);

    if (pdfField instanceof PDFTextField) {
      if (sensitivePdfField) {
        pdfField.setText('');
        blankFieldCount += 1;
        continue;
      }

      if (safeField) {
        pdfField.setText(safeField.proposedValue);
        filledFieldCount += 1;
      }
      continue;
    }

    if (sensitivePdfField) {
      blankFieldCount += 1;
      continue;
    }

    if (safeField) {
      warnings.push(
        `Reviewed field "${safeField.supplierFieldLabel}" matched a non-text PDF field and was left blank.`,
      );
      blankFieldCount += 1;
    }
  }

  if (filledFieldCount === 0) {
    return emptyResult(
      'REQUIRES_MANUAL_COMPLETION',
      'No fillable PDF text fields matched reviewed safe account-opening mappings.',
      warnings,
      {
        originalPageCount,
        outputPageCount: null,
        pageCountPreserved: null,
        originalAcroFieldCount,
        outputAcroFieldCount: null,
      },
    );
  }

  try {
    const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
    pdfForm.updateFieldAppearances(font);
  } catch {
    warnings.push(
      'PDF field appearances could not be refreshed; the binary preview remains unflattened for operator review.',
    );
  }

  const outputBytes = await pdfDocument.save();
  if (outputBytes.byteLength > maxGeneratedPreviewBytes) {
    return emptyResult(
      'FAILED',
      `Generated binary preview exceeds the storage size limit of ${maxGeneratedPreviewBytes} bytes and was not persisted.`,
      warnings,
      {
        originalPageCount,
        outputPageCount: null,
        pageCountPreserved: null,
        originalAcroFieldCount,
        outputAcroFieldCount: null,
      },
    );
  }

  const outputDocument = await PDFDocument.load(outputBytes);
  const outputPageCount = outputDocument.getPageCount();
  const outputAcroFieldCount = outputDocument.getForm().getFields().length;

  return {
    status: 'GENERATED_FOR_REVIEW',
    previewVersion: 'binary-fill-preview-v1',
    fileName: 'binary-fill-preview.pdf',
    contentType: 'application/pdf',
    content: outputBytes,
    outputHash: hashBytes(outputBytes),
    filledFieldCount,
    blankFieldCount,
    unsupportedReason: null,
    warnings: warnings.map(sanitizeBinaryPreviewText),
    brandingPreservationCheck: {
      originalBrandingPreservationRequired: true,
      originalLayoutPreservationRequired: true,
      originalPageCount,
      outputPageCount,
      pageCountPreserved: originalPageCount === outputPageCount,
      originalAcroFieldCount,
      outputAcroFieldCount,
      acroFormPreserved: true,
      formFlattened: false,
      originalFormAlteredInPlace: false,
    },
    safetySummary: {
      internalPreviewOnly: true,
      binaryPreviewGenerated: true,
      rawExtractedTextIncluded: false,
      rawBankDetailsIncluded: false,
      blockedFieldsLeftBlank: true,
      reviewRequiredFieldsLeftBlank: true,
      signatureFieldsLeftBlank: true,
      directDebitBankAuthorityBankDetailsLeftBlank: true,
      signedFormsIncluded: false,
      supplierMessageIncluded: false,
      supplierSubmissionTriggered: false,
      sharePointCompletedFormFiled: false,
      purchaseWorkflowTriggered: false,
    },
  };
}
