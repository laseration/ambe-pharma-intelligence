import type { AccountOpeningCaseDetail } from './service';

export const ACCOUNT_OPENING_REVIEW_EXPORT_FILE_NAMES = [
  'review-pack.json',
  'review-pack.md',
  'completion-draft.json',
  'field-mapping-summary.json',
  'unresolved-fields.json',
  'blocked-fields.json',
  'signing-notes.json',
  'risk-summary.json',
  'source-evidence.json',
  'source-evidence.md',
] as const;

export type AccountOpeningReviewExportFileName =
  (typeof ACCOUNT_OPENING_REVIEW_EXPORT_FILE_NAMES)[number];

export type AccountOpeningReviewExportFile = {
  fileName: AccountOpeningReviewExportFileName;
  contentType: 'application/json' | 'text/markdown; charset=utf-8';
  content: string;
};

export type AccountOpeningReviewExportPack = {
  caseId: string;
  generatedAt: string;
  metadata: {
    caseId: string;
    sourceFingerprint: string;
    fileNames: AccountOpeningReviewExportFileName[];
    reviewExportOnly: true;
    rawExtractedTextIncluded: false;
    rawBankDetailsIncluded: false;
    signedFormsIncluded: false;
    completedSupplierFormsIncluded: false;
    pdfWordFormsFilled: false;
    supplierMessageIncluded: false;
    purchaseWorkflowTriggered: false;
    note: string;
  };
  files: AccountOpeningReviewExportFile[];
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;

function sanitizeExportText(value: string): string {
  return value
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function sanitizeExportValue<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeExportText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExportValue(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeExportValue(item),
      ]),
    ) as T;
  }

  return value;
}

function stringifySafeJson(value: unknown): string {
  return `${JSON.stringify(sanitizeExportValue(value), null, 2)}\n`;
}

function bulletList(values: string[]): string {
  if (values.length === 0) {
    return '- None recorded\n';
  }

  return values.map((value) => `- ${sanitizeExportText(value)}`).join('\n');
}

function fieldLine(
  field: AccountOpeningCaseDetail['completionDraft']['fields'][number],
): string {
  const value = field.proposedValue
    ? sanitizeExportText(field.proposedValue)
    : 'Not provided';
  const review = field.requiresReview ? 'requires review' : 'no review flag';
  return `- ${field.supplierLabel} (${field.key}): ${value} | ${field.valueSource} | confidence ${field.confidence} | risk ${field.riskLevel} | ${review}${field.reviewReason ? ` | ${sanitizeExportText(field.reviewReason)}` : ''}`;
}

function safeFieldMappingSummary(item: AccountOpeningCaseDetail) {
  if (item.fieldMappings.mappings.length > 0) {
    return item.fieldMappings.mappings.map((mapping, index) => ({
      order: index + 1,
      supplierFieldLabel: mapping.supplierFieldLabel,
      supplierSectionLabel: mapping.supplierSectionLabel,
      sourceType: mapping.sourceType,
      suggestedDraftFieldKey: mapping.suggestedDraftFieldKey,
      mappedDraftFieldKey: mapping.mappedDraftFieldKey,
      proposedValue: mapping.proposedValue,
      valueSource: mapping.valueSource,
      confidence: mapping.confidence,
      riskLevel: mapping.riskLevel,
      status: mapping.status,
      requiresReview: mapping.requiresReview,
      blockedReason: mapping.blockedReason,
      reviewReason: mapping.reviewReason,
      evidenceSnippet: mapping.evidenceSnippet,
      operatorNote: mapping.operatorNote,
    }));
  }

  return item.completionDraft.fields.map((field, index) => ({
    order: index + 1,
    key: field.key,
    supplierLabel: field.supplierLabel,
    proposedValue: field.proposedValue,
    valueSource: field.valueSource,
    confidence: field.confidence,
    riskLevel: field.riskLevel,
    requiresReview: field.requiresReview,
    reviewReason: field.reviewReason,
    evidenceCount: field.evidence.length,
  }));
}

function unresolvedFields(item: AccountOpeningCaseDetail) {
  return item.completionDraft.fields.filter(
    (field) => field.requiresReview && field.riskLevel !== 'BLOCKED',
  );
}

function blockedFields(item: AccountOpeningCaseDetail) {
  return item.completionDraft.fields.filter(
    (field) => field.riskLevel === 'BLOCKED' || field.confidence === 'BLOCKED',
  );
}

function riskSummary(item: AccountOpeningCaseDetail) {
  return {
    caseId: item.id,
    status: item.status,
    draftStatus: item.completionDraft.status,
    fieldMappingStatus: item.fieldMappings.status,
    fieldMappingSummary: item.fieldMappings.summary,
    overallConfidence: item.completionDraft.overallConfidence,
    riskFlags: item.riskFlags,
    reviewerChecks: item.reviewerChecks,
    detectedNames: item.detectedNames,
    detectedRoles: item.detectedRoles,
    escalationNotes: item.escalationNotes,
    signatureInstruction: item.signingNotes.signatureInstruction,
    safety: {
      noPdfWordFormFilling: true,
      noSigning: true,
      noSupplierSending: true,
      noSupplierSubmission: true,
      noPurchaseWorkflow: true,
      rawBankDetailsIncluded: false,
    },
  };
}

function caseSummary(item: AccountOpeningCaseDetail) {
  return {
    caseId: item.id,
    sourceFingerprint: item.sourceFingerprint,
    senderEmail: item.senderEmail,
    senderDomain: item.senderDomain,
    subject: item.subject,
    receivedAt: item.receivedAt,
    companyName: item.companyName,
    detectedFormType: item.detectedFormType,
    status: item.status,
    draftStatus: item.completionDraft.status,
    draftGeneratedAt: item.draftGeneratedAt ?? item.completionDraft.generatedAt,
    sourceAttachmentNames: item.sourceAttachmentNames,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    signedFormsIncluded: false,
    completedSupplierFormsIncluded: false,
    pdfWordFormsFilled: false,
    supplierMessageIncluded: false,
    purchaseWorkflowTriggered: false,
  };
}

function sourceEvidencePayload(item: AccountOpeningCaseDetail) {
  return {
    metadataOnly: true,
    rawFileBytesIncluded: false,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    sourceEvidence: item.sourceEvidence,
    note: 'Safe evidence metadata and snippets only. Original file bytes and raw extracted text are not included.',
  };
}

function reviewPackPayload(
  item: AccountOpeningCaseDetail,
  generatedAt: string,
) {
  return {
    generatedAt,
    note: 'Internal review export only. This does not fill PDF/Word supplier forms, sign forms, send anything to suppliers, submit forms, or trigger purchase/order/buy workflows.',
    caseSummary: caseSummary(item),
    completionDraft: item.completionDraft,
    fieldMappingControls: item.fieldMappings,
    fieldMappingSummary: safeFieldMappingSummary(item),
    unresolvedFields: unresolvedFields(item),
    blockedFields: blockedFields(item),
    signingNotes: item.signingNotes,
    riskSummary: riskSummary(item),
    sourceEvidence: sourceEvidencePayload(item),
  };
}

function buildReviewMarkdown(
  item: AccountOpeningCaseDetail,
  generatedAt: string,
): string {
  const unresolved = unresolvedFields(item);
  const blocked = blockedFields(item);
  const mappingLines = item.fieldMappings.mappings.length
    ? item.fieldMappings.mappings
        .map((mapping) => {
          const value = mapping.proposedValue
            ? sanitizeExportText(mapping.proposedValue)
            : 'Not provided';
          return `- ${sanitizeExportText(mapping.supplierFieldLabel)} -> ${mapping.mappedDraftFieldKey ?? 'unmapped'} | ${mapping.status} | confidence ${mapping.confidence} | risk ${mapping.riskLevel} | ${value}${mapping.reviewReason ? ` | ${sanitizeExportText(mapping.reviewReason)}` : ''}${mapping.blockedReason ? ` | ${sanitizeExportText(mapping.blockedReason)}` : ''}`;
        })
        .join('\n')
    : '';
  const lines = [
    `# Account-opening review export`,
    '',
    `Generated: ${generatedAt}`,
    `Case ID: ${item.id}`,
    `Status: ${item.status}`,
    `Draft status: ${item.completionDraft.status}`,
    `Field mapping status: ${item.fieldMappings.status}`,
    `Overall confidence: ${item.completionDraft.overallConfidence}`,
    '',
    'Internal review export only.',
    'This does not sign the form.',
    'This does not send anything to the supplier.',
    'This does not submit the form.',
    'This does not fill PDF/Word supplier forms.',
    'Signature fields remain blank until human approval.',
    '',
    '## Risk Summary',
    bulletList(item.riskFlags),
    '',
    '## Reviewer Checks',
    bulletList(item.reviewerChecks),
    '',
    '## Signing Notes',
    sanitizeExportText(item.signingNotes.summary),
    '',
    '## Field Mapping Summary',
    mappingLines ||
      (item.completionDraft.fields.length
        ? item.completionDraft.fields.map(fieldLine).join('\n')
        : '- No draft fields recorded'),
    '',
    '## Unresolved Fields',
    unresolved.length
      ? unresolved.map(fieldLine).join('\n')
      : '- No unresolved review fields recorded',
    '',
    '## Blocked Fields',
    blocked.length
      ? blocked.map(fieldLine).join('\n')
      : '- No blocked fields recorded',
    '',
    '## Source Evidence Metadata',
    item.sourceEvidence.length
      ? item.sourceEvidence
          .map(
            (evidence) =>
              `- ${sanitizeExportText(evidence.sourceLabel ?? evidence.fileName ?? evidence.sourceType)} | ${evidence.sourceType} | ${evidence.extractionMethod ?? 'no extraction method'} | hash ${evidence.extractedTextHash ?? 'not available'} | snippet ${sanitizeExportText(evidence.safeSnippet ?? 'not available')}`,
          )
          .join('\n')
      : '- No source evidence metadata recorded',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function buildEvidenceMarkdown(
  item: AccountOpeningCaseDetail,
  generatedAt: string,
): string {
  const lines = [
    '# Account-opening source evidence metadata',
    '',
    `Generated: ${generatedAt}`,
    `Case ID: ${item.id}`,
    '',
    'Metadata and safe snippets only. Raw file bytes and raw extracted text are not included.',
    '',
    item.sourceEvidence.length
      ? item.sourceEvidence
          .map(
            (evidence) =>
              `- ${sanitizeExportText(evidence.sourceLabel ?? evidence.fileName ?? evidence.sourceType)} | ${evidence.sourceType} | ${evidence.mimeType ?? 'unknown MIME'} | ${evidence.sizeBytes ?? 'unknown'} bytes | ${evidence.extractionMethod ?? 'no extraction method'} | hash ${evidence.extractedTextHash ?? 'not available'} | raw file available: ${evidence.rawFileAvailable ? 'yes' : 'no'} | snippet ${sanitizeExportText(evidence.safeSnippet ?? 'not available')}`,
          )
          .join('\n')
      : '- No source evidence metadata recorded',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

export function buildAccountOpeningReviewExportPack(
  item: AccountOpeningCaseDetail,
  now = new Date(),
): AccountOpeningReviewExportPack {
  const generatedAt = now.toISOString();
  const reviewPack = reviewPackPayload(item, generatedAt);
  const files: AccountOpeningReviewExportFile[] = [
    {
      fileName: 'review-pack.json',
      contentType: 'application/json',
      content: stringifySafeJson(reviewPack),
    },
    {
      fileName: 'review-pack.md',
      contentType: 'text/markdown; charset=utf-8',
      content: sanitizeExportText(buildReviewMarkdown(item, generatedAt)),
    },
    {
      fileName: 'completion-draft.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        ...item.completionDraft,
        note: 'Structured completion draft only. This does not fill supplier PDF/Word forms, sign forms, send forms, or submit forms.',
      }),
    },
    {
      fileName: 'field-mapping-summary.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        fieldMappings: safeFieldMappingSummary(item),
        summary: item.fieldMappings.summary,
        safetyNotes: item.fieldMappings.safetyNotes,
        note: 'Field mapping summary for internal review only.',
      }),
    },
    {
      fileName: 'unresolved-fields.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        fields: unresolvedFields(item),
        note: 'Fields still requiring human review before any completion work.',
      }),
    },
    {
      fileName: 'blocked-fields.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        fields: blockedFields(item),
        note: 'Blocked fields must not be completed, signed, sent, or submitted automatically.',
      }),
    },
    {
      fileName: 'signing-notes.json',
      contentType: 'application/json',
      content: stringifySafeJson({
        ...item.signingNotes,
        note: 'Signature fields remain blank until human approval.',
      }),
    },
    {
      fileName: 'risk-summary.json',
      contentType: 'application/json',
      content: stringifySafeJson(riskSummary(item)),
    },
    {
      fileName: 'source-evidence.json',
      contentType: 'application/json',
      content: stringifySafeJson(sourceEvidencePayload(item)),
    },
    {
      fileName: 'source-evidence.md',
      contentType: 'text/markdown; charset=utf-8',
      content: sanitizeExportText(buildEvidenceMarkdown(item, generatedAt)),
    },
  ];

  return {
    caseId: item.id,
    generatedAt,
    metadata: {
      caseId: item.id,
      sourceFingerprint: item.sourceFingerprint,
      fileNames: files.map((file) => file.fileName),
      reviewExportOnly: true,
      rawExtractedTextIncluded: false,
      rawBankDetailsIncluded: false,
      signedFormsIncluded: false,
      completedSupplierFormsIncluded: false,
      pdfWordFormsFilled: false,
      supplierMessageIncluded: false,
      purchaseWorkflowTriggered: false,
      note: 'Safe internal review export only. No raw extracted text, raw bank details, signed forms, completed supplier forms, supplier-facing messages, or purchase workflow actions are included.',
    },
    files,
  };
}

export function getAccountOpeningReviewExportFile(
  pack: AccountOpeningReviewExportPack,
  fileName: string,
): AccountOpeningReviewExportFile | null {
  return pack.files.find((file) => file.fileName === fileName) ?? null;
}
