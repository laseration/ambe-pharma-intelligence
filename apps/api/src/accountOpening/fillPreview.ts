import type { AccountOpeningCaseDetail } from './service';

export const ACCOUNT_OPENING_FILL_PREVIEW_FILE_NAMES = [
  'fill-preview.json',
  'fill-preview.md',
  'fill-values.json',
  'blank-fields.json',
  'original-form-reference.json',
] as const;

export type AccountOpeningFillPreviewFileName =
  (typeof ACCOUNT_OPENING_FILL_PREVIEW_FILE_NAMES)[number];

export type AccountOpeningFillPreviewFile = {
  fileName: AccountOpeningFillPreviewFileName;
  contentType: 'application/json' | 'text/markdown; charset=utf-8';
  content: string;
};

export type AccountOpeningFillPreviewPayload = {
  previewVersion: 'fill-preview-v1';
  generatedAt: string;
  caseId: string;
  status: 'GENERATED_FOR_REVIEW';
  originalForm: {
    id: string;
    fileName: string;
    mimeType: string | null;
    formType: string;
    fillSupportStatus: string;
    storageProvider: string | null;
    storageFileUrl: string | null;
    storageDriveItemId: string | null;
    localBlobAvailable: boolean;
  } | null;
  originalForms: AccountOpeningCaseDetail['originalForms'];
  layoutPreservation: {
    preserveOriginalBrandingAndLayout: true;
    generatedFromOriginalFormReference: boolean;
    note: string;
  };
  summary: {
    originalFormCount: number;
    filledFieldCount: number;
    blankFieldCount: number;
    blockedFieldCount: number;
    reviewRequiredFieldCount: number;
    ignoredFieldCount: number;
    safeMappedFieldCount: number;
  };
  filledFields: Array<{
    supplierFieldLabel: string;
    supplierSectionLabel: string | null;
    mappedDraftFieldKey: string;
    proposedValue: string;
    valueSource: string | null;
    confidence: string;
    riskLevel: string;
    status: 'MAPPED_SAFE';
    reviewStatus: 'REVIEWED_SAFE';
  }>;
  blankFields: Array<{
    supplierFieldLabel: string;
    supplierSectionLabel: string | null;
    mappedDraftFieldKey: string | null;
    confidence: string;
    riskLevel: string;
    status: string;
    requiresReview: boolean;
    blankValue: '';
    reason: string;
  }>;
  ignoredFields: Array<{
    supplierFieldLabel: string;
    supplierSectionLabel: string | null;
    mappedDraftFieldKey: string | null;
    reason: string;
  }>;
  safety: {
    internalPreviewOnly: true;
    rawExtractedTextIncluded: false;
    rawAttachmentBytesIncluded: false;
    rawBankDetailsIncluded: false;
    blockedFieldsLeftBlank: true;
    signatureFieldsLeftBlank: true;
    directDebitBankAuthorityBankDetailsLeftBlank: true;
    supplierMessageIncluded: false;
    supplierSubmissionTriggered: false;
    sharePointCompletedFormFiled: false;
    purchaseWorkflowTriggered: false;
  };
  notes: string[];
};

export type AccountOpeningFillPreviewPack = {
  caseId: string;
  generatedAt: string;
  metadata: {
    caseId: string;
    fileNames: AccountOpeningFillPreviewFileName[];
    internalPreviewOnly: true;
    rawExtractedTextIncluded: false;
    rawAttachmentBytesIncluded: false;
    rawBankDetailsIncluded: false;
    signedFormsIncluded: false;
    supplierMessageIncluded: false;
    supplierSubmissionTriggered: false;
    sharePointCompletedFormFiled: false;
    purchaseWorkflowTriggered: false;
    note: string;
  };
  payload: AccountOpeningFillPreviewPayload;
  files: AccountOpeningFillPreviewFile[];
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;
const SENSITIVE_FIELD_PATTERN =
  /\b(direct\s*debit|dd\s*mandate|bank\s*(?:authority|mandate|account|details)|sort\s*code|account\s*(?:no\.?|number)|guarantee|indemnity|director[-\s]*(?:only|signature)|signature)\b/i;

function sanitizePreviewText(value: string): string {
  return value
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function sanitizePreviewValue<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizePreviewText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePreviewValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizePreviewValue(item),
      ]),
    ) as T;
  }

  return value;
}

function stringifySafeJson(value: unknown): string {
  return `${JSON.stringify(sanitizePreviewValue(value), null, 2)}\n`;
}

function primaryOriginalForm(
  item: AccountOpeningCaseDetail,
): AccountOpeningCaseDetail['originalForms'][number] | null {
  return (
    item.originalForms.find(
      (form) => form.fillSupportStatus !== 'UNSUPPORTED',
    ) ??
    item.originalForms[0] ??
    null
  );
}

function canFillMapping(
  mapping: AccountOpeningCaseDetail['fieldMappings']['mappings'][number],
): boolean {
  return (
    mapping.status === 'MAPPED_SAFE' &&
    Boolean(mapping.mappedDraftFieldKey) &&
    Boolean(mapping.proposedValue?.trim()) &&
    !mapping.requiresReview &&
    mapping.confidence !== 'LOW' &&
    mapping.confidence !== 'BLOCKED' &&
    mapping.riskLevel === 'LOW' &&
    !SENSITIVE_FIELD_PATTERN.test(mapping.supplierFieldLabel)
  );
}

function isSavedReviewedMapping(
  mapping: AccountOpeningCaseDetail['fieldMappings']['mappings'][number],
): boolean {
  return !/^(draft|evidence):/.test(mapping.id);
}

function blankReason(
  mapping: AccountOpeningCaseDetail['fieldMappings']['mappings'][number],
): string {
  if (
    mapping.status === 'BLOCKED' ||
    mapping.riskLevel === 'BLOCKED' ||
    mapping.confidence === 'BLOCKED'
  ) {
    return (
      mapping.blockedReason ??
      'Blocked field. Leave blank in the completed-form preview.'
    );
  }

  if (mapping.requiresReview || mapping.status === 'MAPPED_REVIEW_REQUIRED') {
    return (
      mapping.reviewReason ??
      'Review-required field. Leave blank until an operator explicitly clears it.'
    );
  }

  if (!mapping.mappedDraftFieldKey) {
    return 'No reviewed AMBE draft field is mapped. Leave blank.';
  }

  if (!mapping.proposedValue?.trim()) {
    return 'No reviewed proposed value is available. Leave blank.';
  }

  return 'Not eligible for safe fill preview. Leave blank.';
}

function fieldMarkdown(
  field: AccountOpeningFillPreviewPayload['filledFields'][number],
): string {
  return `- ${sanitizePreviewText(field.supplierFieldLabel)} -> ${field.mappedDraftFieldKey}: ${sanitizePreviewText(field.proposedValue)} | confidence ${field.confidence} | risk ${field.riskLevel}`;
}

function blankFieldMarkdown(
  field: AccountOpeningFillPreviewPayload['blankFields'][number],
): string {
  return `- ${sanitizePreviewText(field.supplierFieldLabel)} -> ${field.mappedDraftFieldKey ?? 'unmapped'}: blank | ${field.status} | confidence ${field.confidence} | risk ${field.riskLevel} | ${sanitizePreviewText(field.reason)}`;
}

function buildMarkdown(payload: AccountOpeningFillPreviewPayload): string {
  const lines = [
    '# Account-opening completed-form fill preview',
    '',
    `Generated: ${payload.generatedAt}`,
    `Case ID: ${payload.caseId}`,
    `Original form: ${payload.originalForm?.fileName ?? 'No original form reference'}`,
    '',
    'Internal preview only.',
    'This does not sign the form.',
    'This does not send anything to the supplier.',
    'This does not submit the form.',
    'This does not file the completed preview in SharePoint.',
    'Signature fields remain blank until human approval.',
    'Direct Debit, bank authority, bank details, guarantee, indemnity, and director-only fields remain blank.',
    '',
    '## Filled Fields',
    payload.filledFields.length
      ? payload.filledFields.map(fieldMarkdown).join('\n')
      : '- No fields are eligible for safe fill preview.',
    '',
    '## Blank Fields',
    payload.blankFields.length
      ? payload.blankFields.map(blankFieldMarkdown).join('\n')
      : '- No blank fields recorded.',
    '',
    '## Layout Preservation',
    payload.layoutPreservation.note,
    '',
  ];

  return `${lines.join('\n')}\n`;
}

export function buildAccountOpeningFillPreviewPayload(
  item: AccountOpeningCaseDetail,
  now = new Date(),
): AccountOpeningFillPreviewPayload {
  const originalForm = primaryOriginalForm(item);
  const reviewedMappings = item.fieldMappings.mappings.filter(
    isSavedReviewedMapping,
  );
  const filledFields = reviewedMappings
    .filter(canFillMapping)
    .map((mapping) => ({
      supplierFieldLabel: mapping.supplierFieldLabel,
      supplierSectionLabel: mapping.supplierSectionLabel,
      mappedDraftFieldKey: mapping.mappedDraftFieldKey as string,
      proposedValue: mapping.proposedValue as string,
      valueSource: mapping.valueSource,
      confidence: mapping.confidence,
      riskLevel: mapping.riskLevel,
      status: 'MAPPED_SAFE' as const,
      reviewStatus: 'REVIEWED_SAFE' as const,
    }));
  const blankFields = reviewedMappings
    .filter(
      (mapping) => mapping.status !== 'IGNORED' && !canFillMapping(mapping),
    )
    .map((mapping) => ({
      supplierFieldLabel: mapping.supplierFieldLabel,
      supplierSectionLabel: mapping.supplierSectionLabel,
      mappedDraftFieldKey: mapping.mappedDraftFieldKey,
      confidence: mapping.confidence,
      riskLevel: mapping.riskLevel,
      status: mapping.status,
      requiresReview: mapping.requiresReview,
      blankValue: '' as const,
      reason: blankReason(mapping),
    }));
  const ignoredFields = reviewedMappings
    .filter((mapping) => mapping.status === 'IGNORED')
    .map((mapping) => ({
      supplierFieldLabel: mapping.supplierFieldLabel,
      supplierSectionLabel: mapping.supplierSectionLabel,
      mappedDraftFieldKey: mapping.mappedDraftFieldKey,
      reason: 'Operator marked this supplier field as ignored.',
    }));
  const payload: AccountOpeningFillPreviewPayload = {
    previewVersion: 'fill-preview-v1',
    generatedAt: now.toISOString(),
    caseId: item.id,
    status: 'GENERATED_FOR_REVIEW',
    originalForm: originalForm
      ? {
          id: originalForm.id,
          fileName: originalForm.fileName,
          mimeType: originalForm.mimeType,
          formType: originalForm.formType,
          fillSupportStatus: originalForm.fillSupportStatus,
          storageProvider: originalForm.storageProvider,
          storageFileUrl: originalForm.storageFileUrl,
          storageDriveItemId: originalForm.storageDriveItemId,
          localBlobAvailable: originalForm.localBlobAvailable,
        }
      : null,
    originalForms: item.originalForms,
    layoutPreservation: {
      preserveOriginalBrandingAndLayout: true,
      generatedFromOriginalFormReference: Boolean(originalForm),
      note: 'The preview is a safe field-value overlay for the original supplier/client form reference. It must preserve the supplier/client branding and layout and must not create a rebranded AMBE form.',
    },
    summary: {
      originalFormCount: item.originalForms.length,
      filledFieldCount: filledFields.length,
      blankFieldCount: blankFields.length,
      blockedFieldCount: blankFields.filter(
        (field) =>
          field.status === 'BLOCKED' ||
          field.riskLevel === 'BLOCKED' ||
          field.confidence === 'BLOCKED',
      ).length,
      reviewRequiredFieldCount: blankFields.filter(
        (field) =>
          field.requiresReview || field.status === 'MAPPED_REVIEW_REQUIRED',
      ).length,
      ignoredFieldCount: ignoredFields.length,
      safeMappedFieldCount: reviewedMappings.filter(
        (mapping) => mapping.status === 'MAPPED_SAFE',
      ).length,
    },
    filledFields,
    blankFields,
    ignoredFields,
    safety: {
      internalPreviewOnly: true,
      rawExtractedTextIncluded: false,
      rawAttachmentBytesIncluded: false,
      rawBankDetailsIncluded: false,
      blockedFieldsLeftBlank: true,
      signatureFieldsLeftBlank: true,
      directDebitBankAuthorityBankDetailsLeftBlank: true,
      supplierMessageIncluded: false,
      supplierSubmissionTriggered: false,
      sharePointCompletedFormFiled: false,
      purchaseWorkflowTriggered: false,
    },
    notes: [
      'Internal completed-form preview only.',
      'Only saved MAPPED_SAFE fields are included with values.',
      'Blocked and review-required fields are left blank.',
      'Signature fields remain blank until human approval.',
      'No completed supplier PDF/Word form is filed in SharePoint in this slice.',
    ],
  };

  return sanitizePreviewValue(payload);
}

export function buildAccountOpeningFillPreviewPackFromPayload(
  payload: AccountOpeningFillPreviewPayload,
): AccountOpeningFillPreviewPack {
  const files: AccountOpeningFillPreviewFile[] = [
    {
      fileName: 'fill-preview.json',
      contentType: 'application/json',
      content: stringifySafeJson(payload),
    },
    {
      fileName: 'fill-preview.md',
      contentType: 'text/markdown; charset=utf-8',
      content: sanitizePreviewText(buildMarkdown(payload)),
    },
    {
      fileName: 'fill-values.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        fields: payload.filledFields,
        note: 'Reviewed safe values only. Blocked, review-required, Direct Debit, bank authority, bank details, and signature fields are excluded.',
      }),
    },
    {
      fileName: 'blank-fields.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        fields: payload.blankFields,
        ignoredFields: payload.ignoredFields,
        note: 'These supplier fields must remain blank in the internal preview unless a future approved secure process explicitly handles them.',
      }),
    },
    {
      fileName: 'original-form-reference.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        originalForm: payload.originalForm,
        originalForms: payload.originalForms,
        layoutPreservation: payload.layoutPreservation,
        note: 'Reference metadata only. Raw original file bytes are not included in this preview pack.',
      }),
    },
  ];

  return {
    caseId: payload.caseId,
    generatedAt: payload.generatedAt,
    metadata: {
      caseId: payload.caseId,
      fileNames: files.map((file) => file.fileName),
      internalPreviewOnly: true,
      rawExtractedTextIncluded: false,
      rawAttachmentBytesIncluded: false,
      rawBankDetailsIncluded: false,
      signedFormsIncluded: false,
      supplierMessageIncluded: false,
      supplierSubmissionTriggered: false,
      sharePointCompletedFormFiled: false,
      purchaseWorkflowTriggered: false,
      note: 'Safe internal completed-form preview only. No raw document bytes, raw extracted text, raw bank details, signatures, supplier messages, SharePoint filing, or purchase workflow actions are included.',
    },
    payload,
    files,
  };
}

export function buildAccountOpeningFillPreviewPack(
  item: AccountOpeningCaseDetail,
  now = new Date(),
): AccountOpeningFillPreviewPack {
  return buildAccountOpeningFillPreviewPackFromPayload(
    buildAccountOpeningFillPreviewPayload(item, now),
  );
}

export function getAccountOpeningFillPreviewFile(
  pack: AccountOpeningFillPreviewPack,
  fileName: string,
): AccountOpeningFillPreviewFile | null {
  return pack.files.find((file) => file.fileName === fileName) ?? null;
}
