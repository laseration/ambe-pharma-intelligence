import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { db } from '../lib/db';
import {
  getAccountOpeningDriveArchiveConfig,
  uploadAccountOpeningArchivePack,
  uploadAccountOpeningCompletedFormFiling,
  getMicrosoftStorageGraphAccessToken,
  type AccountOpeningDriveArchiveConfig,
  type AccountOpeningDriveArchiveUploader,
  type AccountOpeningCompletedFormFilingUploader,
} from './driveArchive';
import {
  buildAccountOpeningCompletionDraft,
  type AccountOpeningCompletionDraft,
  type AccountOpeningDraftSourceEvidenceInput,
} from './draft';
import {
  buildAccountOpeningFieldMappingCandidateForSave,
  buildAccountOpeningFieldMappingReview,
  type AccountOpeningFieldMappingCandidate,
  type AccountOpeningFieldMappingReview,
  type AccountOpeningFieldMappingSaveInput,
  type PersistedAccountOpeningFieldMapping,
} from './fieldMapping';
import {
  buildAccountOpeningReviewExportPack,
  getAccountOpeningReviewExportFile,
  type AccountOpeningReviewExportFile,
  type AccountOpeningReviewExportPack,
} from './reviewExport';
import {
  buildAccountOpeningFillPreviewPack,
  buildAccountOpeningFillPreviewPackFromPayload,
  getAccountOpeningFillPreviewFile,
  type AccountOpeningFillPreviewFile,
  type AccountOpeningFillPreviewPack,
  type AccountOpeningFillPreviewPayload,
} from './fillPreview';
import {
  buildAccountOpeningBinaryFillPreview,
  MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES,
  MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES,
  type AccountOpeningBinaryFillPreviewFile,
  type AccountOpeningBinaryFillPreviewFileName,
  type AccountOpeningBinaryFillPreviewResult,
  type AccountOpeningBinaryFillPreviewSizeLimits,
} from './binaryFillPreview';

export type AccountOpeningStructuredFields = {
  companyName: string;
  tradingName: string;
  companyNumber: string;
  vatNumber: string;
  registeredAddress: string;
  tradingAddress: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  accountsContact: string;
  paymentMethodRequested: string;
  directDebitRequested: boolean;
  guaranteeDetected: boolean;
  regulatoryDeclarationDetected: boolean;
  riskyTerms: string[];
  missingOrUnclear: string[];
  recommendedSigner: string;
};

export type AccountOpeningSigningSummary = {
  defaultSigner: 'Aman Dhillon';
  detectedNames: string[];
  detectedSignatureRoles: string[];
  canAmanSign: true;
  signingExplanation: string;
  escalationNotes: string[];
};

export type AccountOpeningSigningNotes = {
  title: 'Account opening signing notes';
  recommendedSigner: 'Aman Dhillon';
  defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.';
  detectedNames: string[];
  detectedRolesOrSections: string[];
  reviewerChecks: string[];
  riskFlags: string[];
  missingOrUnclear: string[];
  signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.';
  summary: string;
};

export type AccountOpeningMissingInfoResponses = {
  website?: string | null;
  numberOfEmployees?: string | null;
  businessHours?: string | null;
  estimatedMonthlyPurchases?: string | null;
  webOrdering?: string | null;
  directDebitRequested?: string | null;
  cdLicenceApplies?: string | null;
  gphcPremisesNumber?: string | null;
  cqcRegistration?: string | null;
  reviewerNotes?: string | null;
};

export type AccountOpeningStatusAction =
  | 'MARKED_NEEDS_INFO'
  | 'APPROVED_FOR_COMPLETION'
  | 'REJECTED';

export type AccountOpeningCaseDetail = {
  id: string;
  sourceFingerprint: string;
  messageId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  receivedAt: string | null;
  companyName: string | null;
  detectedFormType: string | null;
  status: string;
  recommendedSigner: string;
  signingStatement: string;
  signingExplanation: string | null;
  detectedNames: string[];
  detectedRoles: string[];
  escalationNotes: string[];
  riskFlags: string[];
  missingFields: string[];
  reviewerChecks: string[];
  signingNotes: AccountOpeningSigningNotes;
  missingInfoResponses: AccountOpeningMissingInfoResponses;
  extractedTextSummary: string | null;
  storageStatus: string | null;
  storageNote: string | null;
  storageSkippedReason: string | null;
  storageLastAttemptAt: string | null;
  storageFolderUrl: string | null;
  sourceAttachmentNames: string[];
  draftStatus: string | null;
  draftVersion: string | null;
  draftGeneratedAt: string | null;
  sourceEvidence: AccountOpeningSourceEvidenceDetail[];
  originalForms: AccountOpeningOriginalFormDetail[];
  completionDraft: AccountOpeningCompletionDraft;
  fieldMappings: AccountOpeningFieldMappingReview;
  latestFillPreview: AccountOpeningFillPreviewDetail | null;
  latestBinaryFillPreview: AccountOpeningBinaryFillPreviewDetail | null;
  latestCompletedFormFiling: AccountOpeningCompletedFormFilingDetail | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningSourceEvidenceDetail = {
  id: string | null;
  sourceType: string;
  sourceLabel: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  contentId: string | null;
  disposition: string | null;
  extractionMethod: string | null;
  extractedTextHash: string | null;
  extractedTextChars: number | null;
  safeSnippet: string | null;
  rawFileAvailable: boolean;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AccountOpeningOriginalFormDetail = {
  id: string;
  sourceEvidenceId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  fileHash: string | null;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  localBlobAvailable: boolean;
  formType: string;
  fillSupportStatus: string;
  detectedFieldCount: number | null;
  detectionSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningFillPreviewDetail = {
  id: string;
  originalFormId: string | null;
  status: string;
  previewVersion: string;
  fileNames: string[];
  summary: Record<string, unknown>;
  safetySummary: Record<string, unknown>;
  generatedAt: string;
  createdByType: string | null;
  createdByIdentifier: string | null;
};

export type AccountOpeningBinaryFillPreviewDetail = {
  id: string;
  originalFormId: string | null;
  status: string;
  previewVersion: string;
  binaryPreviewFileName: string | null;
  binaryPreviewContentType: string | null;
  binaryPreviewHash: string | null;
  binaryPreviewBytesAvailable: boolean;
  filledFieldCount: number;
  blankFieldCount: number;
  unsupportedReason: string | null;
  warnings: string[];
  brandingPreservationCheck: Record<string, unknown>;
  safetySummary: Record<string, unknown>;
  generatedAt: string;
  createdByType: string | null;
  createdByIdentifier: string | null;
};

export type AccountOpeningCompletedFormFilingDetail = {
  id: string;
  binaryFillPreviewId: string;
  status: string;
  fileName: string;
  contentType: string;
  fileHash: string | null;
  fileSizeBytes: number | null;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  approvedByType: string | null;
  approvedByIdentifier: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  filedByType: string | null;
  filedByIdentifier: string | null;
  filedAt: string | null;
  filingNote: string | null;
  skippedReason: string | null;
  safetySummary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AccountOpeningCase = {
  sourceFingerprint: string;
  status: 'pending_review' | 'approved' | 'rejected';
  senderEmail: string;
  senderDomain: string | null;
  subject: string | null;
  receivedDate: string | null;
  detectedCompanyOrSupplierName: string | null;
  originalAttachmentNames: string[];
  extractedTextSummary: string;
  riskFlags: string[];
  missingFields: string[];
  structuredFields: AccountOpeningStructuredFields;
  signingSummary: AccountOpeningSigningSummary;
  signingNotes: AccountOpeningSigningNotes;
  sourceEvidence: AccountOpeningSourceEvidenceInput[];
};

export type AccountOpeningCasePersistenceInput = {
  accountCase: AccountOpeningCase;
  messageId?: string | null;
  inboundEmailId?: string | null;
  detectedFormType?: string | null;
};

export type PersistedAccountOpeningReviewCase = {
  id: string;
  sourceFingerprint: string;
  messageId: string | null;
  senderEmail: string | null;
  senderDomain: string | null;
  subject: string | null;
  receivedAt: Date | null;
  companyName: string | null;
  detectedFormType: string | null;
  status: string;
  recommendedSigner: string;
  signingStatement: string;
  signingExplanation: string | null;
  detectedNames: unknown;
  detectedRoles: unknown;
  escalationNotes: unknown;
  riskFlags: unknown;
  missingFields: unknown;
  reviewerChecks: unknown;
  signingNotes: unknown;
  missingInfoResponses: unknown;
  extractedTextSummary: string | null;
  storageStatus: string | null;
  storageNote: string | null;
  storageSkippedReason: string | null;
  storageLastAttemptAt: Date | null;
  storageFolderUrl: string | null;
  sourceAttachmentNames: unknown;
  draftStatus: string | null;
  draftVersion: string | null;
  draftGeneratedAt: Date | null;
  draftJson: unknown;
  draftSummary: unknown;
  sourceEvidence?: PersistedAccountOpeningSourceEvidence[];
  fieldMappings?: PersistedAccountOpeningFieldMapping[];
  originalForms?: PersistedAccountOpeningOriginalForm[];
  fillPreviews?: PersistedAccountOpeningFillPreview[];
  binaryFillPreviews?: PersistedAccountOpeningBinaryFillPreview[];
  completedFormFilings?: PersistedAccountOpeningCompletedFormFiling[];
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedAccountOpeningSourceEvidence = {
  id: string;
  accountOpeningCaseId?: string;
  sourceType: string;
  sourceLabel: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  contentId: string | null;
  disposition: string | null;
  extractionMethod: string | null;
  extractedTextHash: string | null;
  extractedTextChars: number | null;
  safeSnippet: string | null;
  rawFileAvailable: boolean;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedAccountOpeningOriginalForm = {
  id: string;
  accountOpeningCaseId?: string;
  sourceEvidenceId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  fileHash: string | null;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  localBlobAvailable: boolean;
  formType: string;
  fillSupportStatus: string;
  detectedFieldCount: number | null;
  detectionSummary: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistedAccountOpeningFillPreview = {
  id: string;
  accountOpeningCaseId?: string;
  originalFormId: string | null;
  status: string;
  previewVersion: string;
  fileNames: unknown;
  previewJson: unknown;
  fieldSummary: unknown;
  safetySummary: unknown;
  createdByType: string | null;
  createdByIdentifier: string | null;
  createdAt: Date;
};

export type PersistedAccountOpeningBinaryFillPreview = {
  id: string;
  accountOpeningCaseId?: string;
  originalFormId: string | null;
  status: string;
  previewVersion: string;
  binaryPreviewFileName: string | null;
  binaryPreviewContentType: string | null;
  binaryPreviewHash: string | null;
  binaryPreviewBytes: Uint8Array | Buffer | null;
  filledFieldCount: number;
  blankFieldCount: number;
  unsupportedReason: string | null;
  warnings: unknown;
  brandingPreservationCheck: unknown;
  safetySummary: unknown;
  createdByType: string | null;
  createdByIdentifier: string | null;
  createdAt: Date;
};

export type PersistedAccountOpeningCompletedFormFiling = {
  id: string;
  accountOpeningCaseId?: string;
  binaryFillPreviewId: string;
  status: string;
  fileName: string;
  contentType: string;
  fileHash: string | null;
  fileSizeBytes: number | null;
  storageProvider: string | null;
  storageFolderUrl: string | null;
  storageFileUrl: string | null;
  storageDriveItemId: string | null;
  approvedByType: string | null;
  approvedByIdentifier: string | null;
  approvedAt: Date | null;
  approvalNote: string | null;
  filedByType: string | null;
  filedByIdentifier: string | null;
  filedAt: Date | null;
  filingNote: string | null;
  skippedReason: string | null;
  safetySummary: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountOpeningDetection = {
  detected: boolean;
  matchedTerms: string[];
  matchedAttachmentNames: string[];
};

type AccountOpeningAttachmentInput = {
  fileName: string | null;
  extractedText?: string | null;
};

type BuildAccountOpeningCaseInput = {
  senderEmail: string;
  senderDomain: string | null;
  subject: string | null;
  bodyText: string | null;
  receivedAt?: Date | null;
  detectedCompanyOrSupplierName?: string | null;
  attachments: AccountOpeningAttachmentInput[];
  sourceFingerprint?: string;
  sourceEvidence?: AccountOpeningSourceEvidenceInput[];
};

export type AccountOpeningSourceEvidenceInput = {
  sourceType: 'EMAIL_BODY' | 'ATTACHMENT';
  sourceLabel?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  contentId?: string | null;
  disposition?: string | null;
  extractionMethod?: 'PDF_TEXT' | 'IMAGE_OCR' | null;
  text?: string | null;
  rawFileAvailable?: boolean;
  storageProvider?: string | null;
  storageFolderUrl?: string | null;
  storageFileUrl?: string | null;
  storageDriveItemId?: string | null;
  metadata?: Record<string, unknown>;
};

const TO_BE_CONFIRMED = 'To be confirmed';
const DEFAULT_SIGNER = 'Aman Dhillon';
const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;
const MISSING_INFO_KEYS: Array<keyof AccountOpeningMissingInfoResponses> = [
  'website',
  'numberOfEmployees',
  'businessHours',
  'estimatedMonthlyPurchases',
  'webOrdering',
  'directDebitRequested',
  'cdLicenceApplies',
  'gphcPremisesNumber',
  'cqcRegistration',
  'reviewerNotes',
];

const STATUS_ACTIONS: Record<AccountOpeningStatusAction, string> = {
  MARKED_NEEDS_INFO: 'NEEDS_INFO',
  APPROVED_FOR_COMPLETION: 'APPROVED_FOR_COMPLETION',
  REJECTED: 'REJECTED',
};

const ACCOUNT_OPENING_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'account opening form', pattern: /\baccount\s+opening\s+forms?\b/i },
  { label: 'new account form', pattern: /\bnew\s+account\s+forms?\b/i },
  { label: 'customer application', pattern: /\bcustomer\s+applications?\b/i },
  { label: 'supplier onboarding', pattern: /\bsupplier\s+onboarding\b/i },
  {
    label: 'trade account application',
    pattern: /\btrade\s+account\s+applications?\b/i,
  },
  {
    label: 'credit account application',
    pattern: /\bcredit\s+account\s+applications?\b/i,
  },
  { label: 'direct debit mandate', pattern: /\bdirect\s+debit\s+mandates?\b/i },
  { label: 'personal guarantee', pattern: /\bpersonal\s+guarantees?\b/i },
  {
    label: 'director guarantee',
    pattern: /\bdirector(?:s?'?)?\s+guarantees?\b/i,
  },
  {
    label: 'wholesale account',
    pattern:
      /\bwholesale\s+account\s+(?:applications?|forms?|opening|onboarding)\b|\b(?:applications?|forms?|opening|onboarding)\s+(?:for\s+)?(?:a\s+)?wholesale\s+account\b/i,
  },
  {
    label: 'onboarding questionnaire',
    pattern: /\bonboarding\s+questionnaires?\b/i,
  },
];

const RISK_TERMS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'Director guarantee',
    pattern: /\bdirector(?:s?'?)?\s+guarantees?\b/i,
  },
  { label: 'Personal guarantee', pattern: /\bpersonal\s+guarantees?\b/i },
  { label: 'Guarantee', pattern: /\bguarantees?\b/i },
  {
    label: 'Direct Debit mandate',
    pattern: /\bdirect\s+debit\s+mandates?\b|\bdd\s+mandates?\b/i,
  },
  {
    label: 'bank authority signature',
    pattern: /\bbank\s+authority\b|\bbank\s+mandates?\b/i,
  },
  {
    label: 'indemnity',
    pattern: /\bindemnit(?:y|ies|ies?)\b|\bindemnif(?:y|ication)\b/i,
  },
  {
    label: 'credit terms',
    pattern: /\bcredit\s+terms?\b|\bcredit\s+account\b/i,
  },
  {
    label: 'RP/GDP/WDA regulatory declaration',
    pattern:
      /\bresponsible\s+person\b|\bRP\b|\bGDP\b|\bWDA\b|\bwholesale\s+dealer/i,
  },
  {
    label: 'returns policy obligations',
    pattern: /\breturns?\s+polic(?:y|ies)\b|\breturn\s+obligations?\b/i,
  },
];

const SIGNING_SIGNALS: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'Director-only signature',
    pattern: /\bdirector[-\s]+only\b|\bdirector\s+signature\b/i,
  },
  { label: 'Director', pattern: /\bdirector\b/i },
  { label: 'Responsible Person', pattern: /\bresponsible\s+person\b/i },
  { label: 'RP', pattern: /\bRP\b/i },
  { label: 'GDP', pattern: /\bGDP\b/i },
  { label: 'WDA', pattern: /\bWDA\b/i },
  {
    label: 'bank authority',
    pattern: /\bbank\s+authority\b|\bbank\s+mandates?\b/i,
  },
  { label: 'Direct Debit', pattern: /\bdirect\s+debit\b|\bdd\s+mandate\b/i },
  { label: 'guarantee', pattern: /\bguarantees?\b/i },
  { label: 'personal guarantee', pattern: /\bpersonal\s+guarantees?\b/i },
  {
    label: 'indemnity',
    pattern: /\bindemnit(?:y|ies|ies?)\b|\bindemnif(?:y|ication)\b/i,
  },
];

const SIGNING_NAMES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Aman Dhillon', pattern: /\baman\s+dhillon\b/i },
  { label: 'Sandeep Patel', pattern: /\bsandeep\s+patel\b/i },
  { label: 'Dilshad Moulana', pattern: /\bdilshad\s+moulana\b/i },
];

const REQUIRED_FIELD_LABELS: Array<keyof AccountOpeningStructuredFields> = [
  'companyNumber',
  'vatNumber',
  'registeredAddress',
  'tradingAddress',
  'contactName',
  'contactEmail',
  'contactPhone',
  'accountsContact',
  'paymentMethodRequested',
];
const REJECTED_ACCOUNT_OPENING_COMPLETED_FORM_FILING_MESSAGE =
  'Rejected account-opening cases cannot be approved or filed.';

function compactUnique(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function textFromParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n\n');
}

function matchLabels(
  text: string,
  terms: Array<{ label: string; pattern: RegExp }>,
): string[] {
  return terms
    .filter((term) => term.pattern.test(text))
    .map((term) => term.label);
}

function jsonArray(values: string[]): Prisma.InputJsonValue {
  return values as Prisma.InputJsonValue;
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
    : [];
}

function sanitizeDashboardText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function hashText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? createHash('sha256').update(trimmed).digest('hex') : null;
}

function safeEvidenceSnippet(value: string | null | undefined): string | null {
  const sanitized = sanitizeDashboardText(value);
  if (!sanitized) {
    return null;
  }

  return sanitized.length > 360 ? `${sanitized.slice(0, 357)}...` : sanitized;
}

function normalizeSourceEvidenceInput(
  evidence: AccountOpeningSourceEvidenceInput,
): Omit<AccountOpeningSourceEvidenceDetail, 'id' | 'createdAt' | 'updatedAt'> {
  const text = evidence.text?.trim() || '';

  return {
    sourceType: evidence.sourceType,
    sourceLabel: sanitizeDashboardText(evidence.sourceLabel) ?? null,
    fileName: sanitizeDashboardText(evidence.fileName) ?? null,
    mimeType: sanitizeDashboardText(evidence.mimeType) ?? null,
    sizeBytes: evidence.sizeBytes ?? null,
    contentId: sanitizeDashboardText(evidence.contentId) ?? null,
    disposition: sanitizeDashboardText(evidence.disposition) ?? null,
    extractionMethod: evidence.extractionMethod ?? null,
    extractedTextHash: hashText(text),
    extractedTextChars: text.length || null,
    safeSnippet: safeEvidenceSnippet(text),
    rawFileAvailable: Boolean(evidence.rawFileAvailable),
    storageProvider: sanitizeDashboardText(evidence.storageProvider) ?? null,
    storageFolderUrl: sanitizeDashboardText(evidence.storageFolderUrl) ?? null,
    storageFileUrl: sanitizeDashboardText(evidence.storageFileUrl) ?? null,
    storageDriveItemId:
      sanitizeDashboardText(evidence.storageDriveItemId) ?? null,
  };
}

function buildSourceEvidenceDetailFromInput(
  evidence: AccountOpeningSourceEvidenceInput,
): AccountOpeningSourceEvidenceDetail {
  return {
    id: null,
    createdAt: null,
    updatedAt: null,
    ...normalizeSourceEvidenceInput(evidence),
  };
}

function buildSourceEvidenceDetailFromPersisted(
  evidence: PersistedAccountOpeningSourceEvidence,
): AccountOpeningSourceEvidenceDetail {
  return {
    id: evidence.id,
    sourceType: evidence.sourceType,
    sourceLabel: sanitizeDashboardText(evidence.sourceLabel) ?? null,
    fileName: sanitizeDashboardText(evidence.fileName) ?? null,
    mimeType: sanitizeDashboardText(evidence.mimeType) ?? null,
    sizeBytes: evidence.sizeBytes,
    contentId: sanitizeDashboardText(evidence.contentId) ?? null,
    disposition: sanitizeDashboardText(evidence.disposition) ?? null,
    extractionMethod: evidence.extractionMethod,
    extractedTextHash: evidence.extractedTextHash,
    extractedTextChars: evidence.extractedTextChars,
    safeSnippet: safeEvidenceSnippet(evidence.safeSnippet),
    rawFileAvailable: evidence.rawFileAvailable,
    storageProvider: sanitizeDashboardText(evidence.storageProvider) ?? null,
    storageFolderUrl: sanitizeDashboardText(evidence.storageFolderUrl) ?? null,
    storageFileUrl: sanitizeDashboardText(evidence.storageFileUrl) ?? null,
    storageDriveItemId:
      sanitizeDashboardText(evidence.storageDriveItemId) ?? null,
    createdAt: evidence.createdAt.toISOString(),
    updatedAt: evidence.updatedAt.toISOString(),
  };
}

function formTypeFromFile(input: {
  fileName: string | null | undefined;
  mimeType: string | null | undefined;
}): string {
  const value = `${input.fileName ?? ''} ${input.mimeType ?? ''}`.toLowerCase();

  if (/\bpdf\b|\.pdf\b/.test(value)) {
    return 'PDF';
  }

  if (/wordprocessingml|msword|\.docx?\b/.test(value)) {
    return 'WORD';
  }

  if (/image\/|\.png\b|\.jpe?g\b|\.tiff?\b/.test(value)) {
    return 'IMAGE';
  }

  return 'UNKNOWN';
}

function fillSupportStatusForFormType(formType: string): string {
  if (formType === 'PDF' || formType === 'WORD') {
    return 'PREVIEW_SUPPORTED';
  }

  if (formType === 'IMAGE') {
    return 'REFERENCE_ONLY';
  }

  return 'UNSUPPORTED';
}

function originalFormRowsFromEvidence(input: {
  accountOpeningCaseId: string;
  sourceEvidence: PersistedAccountOpeningSourceEvidence[];
}): Array<
  Omit<PersistedAccountOpeningOriginalForm, 'id' | 'createdAt' | 'updatedAt'>
> {
  return input.sourceEvidence
    .filter((evidence) => evidence.sourceType === 'ATTACHMENT')
    .filter((evidence) => Boolean(evidence.fileName?.trim()))
    .map((evidence) => {
      const fileName =
        sanitizeDashboardText(evidence.fileName) ?? 'account-opening-form';
      const mimeType = sanitizeDashboardText(evidence.mimeType) ?? null;
      const formType = formTypeFromFile({ fileName, mimeType });
      const fileHash =
        evidence.extractedTextHash ??
        hashText(
          [
            fileName,
            mimeType,
            evidence.sizeBytes ? String(evidence.sizeBytes) : null,
            evidence.storageDriveItemId,
            evidence.storageFileUrl,
          ]
            .filter((item): item is string => Boolean(item))
            .join('|'),
        );

      return {
        accountOpeningCaseId: input.accountOpeningCaseId,
        sourceEvidenceId: evidence.id,
        fileName,
        mimeType,
        sizeBytes: evidence.sizeBytes,
        fileHash,
        storageProvider:
          sanitizeDashboardText(evidence.storageProvider) ?? null,
        storageFolderUrl:
          sanitizeDashboardText(evidence.storageFolderUrl) ?? null,
        storageFileUrl: sanitizeDashboardText(evidence.storageFileUrl) ?? null,
        storageDriveItemId:
          sanitizeDashboardText(evidence.storageDriveItemId) ?? null,
        localBlobAvailable: false,
        formType,
        fillSupportStatus: fillSupportStatusForFormType(formType),
        detectedFieldCount: null,
        detectionSummary: jsonObject({
          capturedFrom: 'SOURCE_EVIDENCE',
          metadataOnly: true,
          rawFileBytesStored: false,
          rawExtractedTextStored: false,
          extractedTextHash: evidence.extractedTextHash,
          note: 'Original supplier/client form reference only. Raw file bytes are not stored in this database row.',
        }),
      };
    });
}

function buildOriginalFormDetailFromPersisted(
  form: PersistedAccountOpeningOriginalForm,
): AccountOpeningOriginalFormDetail {
  return {
    id: form.id,
    sourceEvidenceId: form.sourceEvidenceId,
    fileName: sanitizeDashboardText(form.fileName) ?? 'account-opening-form',
    mimeType: sanitizeDashboardText(form.mimeType) ?? null,
    sizeBytes: form.sizeBytes,
    fileHash: form.fileHash,
    storageProvider: sanitizeDashboardText(form.storageProvider) ?? null,
    storageFolderUrl: sanitizeDashboardText(form.storageFolderUrl) ?? null,
    storageFileUrl: sanitizeDashboardText(form.storageFileUrl) ?? null,
    storageDriveItemId: sanitizeDashboardText(form.storageDriveItemId) ?? null,
    localBlobAvailable: Boolean(form.localBlobAvailable),
    formType: form.formType,
    fillSupportStatus: form.fillSupportStatus,
    detectedFieldCount: form.detectedFieldCount,
    detectionSummary: jsonRecordFromUnknown(form.detectionSummary),
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  };
}

function isAccountOpeningFillPreviewPayload(
  value: unknown,
): value is AccountOpeningFillPreviewPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const preview = value as Partial<AccountOpeningFillPreviewPayload>;
  return (
    preview.previewVersion === 'fill-preview-v1' &&
    typeof preview.generatedAt === 'string' &&
    typeof preview.caseId === 'string' &&
    Array.isArray(preview.filledFields) &&
    Array.isArray(preview.blankFields) &&
    Boolean(
      preview.futureBinaryFormRequirements &&
      typeof preview.futureBinaryFormRequirements === 'object',
    ) &&
    Boolean(preview.safety && typeof preview.safety === 'object')
  );
}

function buildFillPreviewDetailFromPersisted(
  preview: PersistedAccountOpeningFillPreview,
): AccountOpeningFillPreviewDetail {
  const payload = isAccountOpeningFillPreviewPayload(preview.previewJson)
    ? preview.previewJson
    : null;

  return {
    id: preview.id,
    originalFormId: preview.originalFormId,
    status: preview.status,
    previewVersion: preview.previewVersion,
    fileNames: safeStringArrayFromJson(preview.fileNames),
    summary: payload?.summary ?? jsonRecordFromUnknown(preview.fieldSummary),
    safetySummary:
      payload?.safety ?? jsonRecordFromUnknown(preview.safetySummary),
    generatedAt: preview.createdAt.toISOString(),
    createdByType: preview.createdByType,
    createdByIdentifier: sanitizeDashboardText(preview.createdByIdentifier),
  };
}

function buildBinaryFillPreviewDetailFromPersisted(
  preview: PersistedAccountOpeningBinaryFillPreview,
): AccountOpeningBinaryFillPreviewDetail {
  return {
    id: preview.id,
    originalFormId: preview.originalFormId,
    status: preview.status,
    previewVersion: preview.previewVersion,
    binaryPreviewFileName:
      sanitizeDashboardText(preview.binaryPreviewFileName) ?? null,
    binaryPreviewContentType:
      sanitizeDashboardText(preview.binaryPreviewContentType) ?? null,
    binaryPreviewHash: sanitizeDashboardText(preview.binaryPreviewHash) ?? null,
    binaryPreviewBytesAvailable: Boolean(preview.binaryPreviewBytes),
    filledFieldCount: preview.filledFieldCount,
    blankFieldCount: preview.blankFieldCount,
    unsupportedReason: sanitizeDashboardText(preview.unsupportedReason) ?? null,
    warnings: safeStringArrayFromJson(preview.warnings),
    brandingPreservationCheck: jsonRecordFromUnknown(
      preview.brandingPreservationCheck,
    ),
    safetySummary: jsonRecordFromUnknown(preview.safetySummary),
    generatedAt: preview.createdAt.toISOString(),
    createdByType: preview.createdByType,
    createdByIdentifier: sanitizeDashboardText(preview.createdByIdentifier),
  };
}

function buildCompletedFormFilingDetailFromPersisted(
  filing: PersistedAccountOpeningCompletedFormFiling,
): AccountOpeningCompletedFormFilingDetail {
  return {
    id: filing.id,
    binaryFillPreviewId: filing.binaryFillPreviewId,
    status: filing.status,
    fileName: sanitizeDashboardText(filing.fileName) ?? 'completed-form.pdf',
    contentType: sanitizeDashboardText(filing.contentType) ?? 'application/pdf',
    fileHash: sanitizeDashboardText(filing.fileHash) ?? null,
    fileSizeBytes: filing.fileSizeBytes,
    storageProvider: sanitizeDashboardText(filing.storageProvider) ?? null,
    storageFolderUrl: sanitizeDashboardText(filing.storageFolderUrl) ?? null,
    storageFileUrl: sanitizeDashboardText(filing.storageFileUrl) ?? null,
    storageDriveItemId:
      sanitizeDashboardText(filing.storageDriveItemId) ?? null,
    approvedByType: sanitizeDashboardText(filing.approvedByType) ?? null,
    approvedByIdentifier:
      sanitizeDashboardText(filing.approvedByIdentifier) ?? null,
    approvedAt: filing.approvedAt?.toISOString() ?? null,
    approvalNote: sanitizeDashboardText(filing.approvalNote) ?? null,
    filedByType: sanitizeDashboardText(filing.filedByType) ?? null,
    filedByIdentifier: sanitizeDashboardText(filing.filedByIdentifier) ?? null,
    filedAt: filing.filedAt?.toISOString() ?? null,
    filingNote: sanitizeDashboardText(filing.filingNote) ?? null,
    skippedReason: sanitizeDashboardText(filing.skippedReason) ?? null,
    safetySummary: jsonRecordFromUnknown(filing.safetySummary),
    metadata: jsonRecordFromUnknown(filing.metadata),
    createdAt: filing.createdAt.toISOString(),
    updatedAt: filing.updatedAt.toISOString(),
  };
}

function draftEvidenceFromDetails(
  evidence: AccountOpeningSourceEvidenceDetail[],
): AccountOpeningDraftSourceEvidenceInput[] {
  return evidence.map((item) => ({
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel ?? item.fileName,
    safeSnippet: item.safeSnippet,
    extractionMethod: item.extractionMethod,
  }));
}

function isAccountOpeningCompletionDraft(
  value: unknown,
): value is AccountOpeningCompletionDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const draft = value as Partial<AccountOpeningCompletionDraft>;
  return (
    typeof draft.profileId === 'string' &&
    typeof draft.profileVersion === 'string' &&
    typeof draft.generatedAt === 'string' &&
    typeof draft.status === 'string' &&
    typeof draft.overallConfidence === 'string' &&
    typeof draft.isStored === 'boolean' &&
    Array.isArray(draft.fields) &&
    Boolean(draft.summary && typeof draft.summary === 'object')
  );
}

function buildCompletionDraftForCase(input: {
  accountCase: PersistedAccountOpeningReviewCase;
  sourceEvidence: AccountOpeningSourceEvidenceDetail[];
  now?: Date;
  stored?: boolean;
}): AccountOpeningCompletionDraft {
  const riskFlags = stringArrayFromJson(input.accountCase.riskFlags);
  const detectedRoles = stringArrayFromJson(input.accountCase.detectedRoles);
  const detectedNames = stringArrayFromJson(input.accountCase.detectedNames);
  const missingFields = stringArrayFromJson(input.accountCase.missingFields);
  const missingInfoResponses = missingInfoResponsesFromJson(
    input.accountCase.missingInfoResponses,
  );
  const draft = buildAccountOpeningCompletionDraft({
    missingInfoResponses,
    riskFlags,
    detectedRoles,
    detectedNames,
    missingFields,
    sourceEvidence: draftEvidenceFromDetails(input.sourceEvidence),
    now: input.now,
  });

  return {
    ...draft,
    isStored: Boolean(input.stored),
  };
}

function draftAuditMetadata(
  draft: AccountOpeningCompletionDraft,
): Prisma.InputJsonValue {
  return jsonObject({
    profileId: draft.profileId,
    profileVersion: draft.profileVersion,
    status: draft.status,
    overallConfidence: draft.overallConfidence,
    summary: draft.summary,
  });
}

function evidenceComparable(
  evidence:
    | ReturnType<typeof normalizeSourceEvidenceInput>
    | AccountOpeningSourceEvidenceDetail
    | PersistedAccountOpeningSourceEvidence,
) {
  return {
    sourceType: evidence.sourceType,
    sourceLabel: evidence.sourceLabel ?? null,
    fileName: evidence.fileName ?? null,
    mimeType: evidence.mimeType ?? null,
    sizeBytes: evidence.sizeBytes ?? null,
    contentId: evidence.contentId ?? null,
    disposition: evidence.disposition ?? null,
    extractionMethod: evidence.extractionMethod ?? null,
    extractedTextHash: evidence.extractedTextHash ?? null,
    extractedTextChars: evidence.extractedTextChars ?? null,
    safeSnippet: evidence.safeSnippet ?? null,
    rawFileAvailable: Boolean(evidence.rawFileAvailable),
    storageProvider: evidence.storageProvider ?? null,
    storageFolderUrl: evidence.storageFolderUrl ?? null,
    storageFileUrl: evidence.storageFileUrl ?? null,
    storageDriveItemId: evidence.storageDriveItemId ?? null,
  };
}

function evidenceFingerprint(
  evidence: Array<
    | ReturnType<typeof normalizeSourceEvidenceInput>
    | AccountOpeningSourceEvidenceDetail
    | PersistedAccountOpeningSourceEvidence
  >,
): string {
  return JSON.stringify(evidence.map(evidenceComparable));
}

function originalFormComparable(
  form:
    | Omit<
        PersistedAccountOpeningOriginalForm,
        'id' | 'createdAt' | 'updatedAt'
      >
    | PersistedAccountOpeningOriginalForm,
) {
  return {
    sourceEvidenceId: form.sourceEvidenceId ?? null,
    fileName: form.fileName,
    mimeType: form.mimeType ?? null,
    sizeBytes: form.sizeBytes ?? null,
    fileHash: form.fileHash ?? null,
    storageProvider: form.storageProvider ?? null,
    storageFolderUrl: form.storageFolderUrl ?? null,
    storageFileUrl: form.storageFileUrl ?? null,
    storageDriveItemId: form.storageDriveItemId ?? null,
    localBlobAvailable: Boolean(form.localBlobAvailable),
    formType: form.formType,
    fillSupportStatus: form.fillSupportStatus,
    detectedFieldCount: form.detectedFieldCount ?? null,
    detectionSummary: jsonRecordFromUnknown(form.detectionSummary),
  };
}

function originalFormFingerprint(
  forms: Array<
    | Omit<
        PersistedAccountOpeningOriginalForm,
        'id' | 'createdAt' | 'updatedAt'
      >
    | PersistedAccountOpeningOriginalForm
  >,
): string {
  return JSON.stringify(forms.map(originalFormComparable));
}

function draftRoutingEventType(
  draft: AccountOpeningCompletionDraft,
): 'DRAFT_READY_FOR_REVIEW' | 'DRAFT_REVIEW_REQUIRED' | 'DRAFT_BLOCKED' {
  if (draft.status === 'READY_FOR_REVIEW') {
    return 'DRAFT_READY_FOR_REVIEW';
  }

  if (draft.status === 'REVIEW_REQUIRED') {
    return 'DRAFT_REVIEW_REQUIRED';
  }

  return 'DRAFT_BLOCKED';
}

function draftComparable(draft: AccountOpeningCompletionDraft) {
  return {
    status: draft.status,
    overallConfidence: draft.overallConfidence,
    profileId: draft.profileId,
    profileVersion: draft.profileVersion,
    fields: draft.fields,
    summary: draft.summary,
    safetyNotes: draft.safetyNotes,
  };
}

function draftFingerprint(draft: AccountOpeningCompletionDraft): string {
  return JSON.stringify(draftComparable(draft));
}

function jsonRecordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sanitizeAccountOpeningMissingInfoResponses(
  input: AccountOpeningMissingInfoResponses,
): AccountOpeningMissingInfoResponses {
  return MISSING_INFO_KEYS.reduce<AccountOpeningMissingInfoResponses>(
    (responses, key) => {
      const sanitized = sanitizeDashboardText(input[key]);
      if (sanitized !== null) {
        responses[key] = sanitized;
      }
      return responses;
    },
    {},
  );
}

function missingInfoResponsesFromJson(
  value: unknown,
): AccountOpeningMissingInfoResponses {
  const record = jsonRecordFromUnknown(value);

  return sanitizeAccountOpeningMissingInfoResponses(
    MISSING_INFO_KEYS.reduce<AccountOpeningMissingInfoResponses>(
      (responses, key) => {
        const rawValue = record[key];
        if (typeof rawValue === 'string') {
          responses[key] = rawValue;
        }
        return responses;
      },
      {},
    ),
  );
}

function safeStringArrayFromJson(value: unknown): string[] {
  return compactUnique(
    stringArrayFromJson(value).map((item) => sanitizeDashboardText(item)),
  );
}

function normalizeFingerprintPart(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function extractSenderDomain(senderEmail: string): string | null {
  const domain = senderEmail.includes('@')
    ? senderEmail.split('@').pop()?.trim().toLowerCase()
    : null;
  return domain || null;
}

function summarizeExtractedText(
  bodyText: string | null,
  attachments: AccountOpeningAttachmentInput[],
): string {
  const bodyChars = bodyText?.trim().length ?? 0;
  const attachmentTextChars = attachments.reduce(
    (total, attachment) =>
      total + (attachment.extractedText?.trim().length ?? 0),
    0,
  );
  const textSources = [
    bodyChars > 0 ? `email body (${bodyChars} chars)` : null,
    attachmentTextChars > 0
      ? `attachments (${attachmentTextChars} extracted chars)`
      : null,
  ].filter((part): part is string => Boolean(part));

  return textSources.length > 0
    ? `Extracted account-opening text from ${textSources.join(' and ')}.`
    : 'No readable form text was extracted; reviewer should open the original attachments.';
}

export function buildAccountOpeningSourceFingerprint(input: {
  messageId?: string | null;
  externalMessageId?: string | null;
  senderEmail: string;
  subject?: string | null;
  attachmentFileNames?: Array<string | null | undefined>;
  matchedTerms?: string[];
}): string {
  const attachmentNames = compactUnique(input.attachmentFileNames ?? [])
    .map(normalizeFingerprintPart)
    .sort();
  const matchedTerms = compactUnique(input.matchedTerms ?? [])
    .map(normalizeFingerprintPart)
    .sort();
  const fingerprintSource = JSON.stringify({
    messageId: normalizeFingerprintPart(
      input.messageId ?? input.externalMessageId,
    ),
    senderEmail: normalizeFingerprintPart(input.senderEmail),
    subject: normalizeFingerprintPart(input.subject),
    attachmentNames,
    matchedTerms,
  });

  return createHash('sha256').update(fingerprintSource).digest('hex');
}

export function detectAccountOpeningEmail(input: {
  subject?: string | null;
  bodyText?: string | null;
  attachmentFileNames?: Array<string | null | undefined>;
  attachmentTexts?: Array<string | null | undefined>;
}): AccountOpeningDetection {
  const fileNameText = (input.attachmentFileNames ?? []).join('\n');
  const contentText = textFromParts([
    input.subject,
    input.bodyText,
    fileNameText,
    ...(input.attachmentTexts ?? []),
  ]);
  const matchedTerms = matchLabels(contentText, ACCOUNT_OPENING_TERMS);
  const matchedAttachmentNames = compactUnique(
    (input.attachmentFileNames ?? []).filter(
      (fileName) =>
        matchLabels(fileName ?? '', ACCOUNT_OPENING_TERMS).length > 0,
    ),
  );

  return {
    detected: matchedTerms.length > 0,
    matchedTerms: compactUnique(matchedTerms),
    matchedAttachmentNames,
  };
}

export function buildAccountOpeningSigningSummary(
  text: string,
): AccountOpeningSigningSummary {
  const detectedNames = matchLabels(text, SIGNING_NAMES);
  const detectedSignatureRoles = matchLabels(text, SIGNING_SIGNALS);
  const escalationNotes: string[] = [];

  if (/\bdirector\b/i.test(text) || /\bsandeep\s+patel\b/i.test(text)) {
    escalationNotes.push(
      'The form mentions Director/Sandeep Patel. Reviewer should confirm the supplier does not specifically require a director-only signature.',
    );
  }

  if (
    /\bresponsible\s+person\b|\bRP\b|\bGDP\b|\bWDA\b|\bdilshad\s+moulana\b/i.test(
      text,
    )
  ) {
    escalationNotes.push(
      'The form contains regulatory/RP wording. Reviewer should confirm whether this is only company information or whether an RP declaration is being requested.',
    );
  }

  if (
    /\bdirect\s+debit\b|\bbank\s+authority\b|\bbank\s+mandates?\b|\bpersonal\s+guarantees?\b|\bdirector(?:s?'?)?\s+guarantees?\b|\bindemnit(?:y|ies|ies?)\b|\bcredit\s+guarantees?\b/i.test(
      text,
    )
  ) {
    escalationNotes.push(
      'High-risk section detected. Aman can sign account-opening forms by default, but this section should be reviewed before approval.',
    );
  }

  const signingExplanation = [
    'Aman Dhillon can sign this account-opening form by default.',
    ...escalationNotes,
  ].join(' ');

  return {
    defaultSigner: DEFAULT_SIGNER,
    detectedNames,
    detectedSignatureRoles,
    canAmanSign: true,
    signingExplanation,
    escalationNotes,
  };
}

export function buildAccountOpeningSigningNotes(input: {
  signingSummary: AccountOpeningSigningSummary;
  riskFlags: string[];
  missingOrUnclear: string[];
}): AccountOpeningSigningNotes {
  const reviewerChecks = compactUnique([
    'Confirm the form is an account-opening or onboarding document for AMBE LTD t/a AMBE MEDICAL GROUP.',
    input.signingSummary.detectedSignatureRoles.includes('Director') ||
    input.signingSummary.detectedSignatureRoles.includes(
      'Director-only signature',
    )
      ? 'Check whether the supplier specifically requires a director-only signature.'
      : null,
    input.signingSummary.detectedSignatureRoles.some((role) =>
      ['Responsible Person', 'RP', 'GDP', 'WDA'].includes(role),
    )
      ? 'Check whether regulatory/RP wording is only company information or an RP declaration request.'
      : null,
    input.riskFlags.length > 0
      ? 'Review high-risk sections before approval, especially payment authority, guarantee, indemnity, credit, regulatory, and returns obligations.'
      : null,
    input.missingOrUnclear.length > 0
      ? 'Resolve missing or unclear fields before approving completion or signing.'
      : null,
    'Leave all signature fields blank unless a human reviewer approves signing.',
  ]);
  const detectedNamesText =
    input.signingSummary.detectedNames.length > 0
      ? `Detected names: ${input.signingSummary.detectedNames.join(', ')}.`
      : 'No named signer was detected in the form text.';
  const detectedRolesText =
    input.signingSummary.detectedSignatureRoles.length > 0
      ? `Detected roles/sections: ${input.signingSummary.detectedSignatureRoles.join(', ')}.`
      : 'No signature roles or high-risk signing sections were detected.';
  const riskText =
    input.riskFlags.length > 0
      ? `Risk flags: ${input.riskFlags.join(', ')}.`
      : 'No high-risk signing clauses were detected.';

  return {
    title: 'Account opening signing notes',
    recommendedSigner: DEFAULT_SIGNER,
    defaultSigningStatement:
      'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: input.signingSummary.detectedNames,
    detectedRolesOrSections: input.signingSummary.detectedSignatureRoles,
    reviewerChecks,
    riskFlags: input.riskFlags,
    missingOrUnclear: input.missingOrUnclear,
    signatureInstruction:
      'Leave signature fields blank until approved by a human reviewer.',
    summary: [
      'Recommended signer: Aman Dhillon.',
      'Aman Dhillon can sign this account-opening form by default.',
      detectedNamesText,
      detectedRolesText,
      riskText,
      'Leave signature fields blank until approved by a human reviewer.',
    ].join(' '),
  };
}

export function buildAccountOpeningCasePersistenceData(
  input: AccountOpeningCasePersistenceInput,
) {
  const accountCase = input.accountCase;
  const signingNotes = accountCase.signingNotes;

  return {
    where: {
      sourceFingerprint: accountCase.sourceFingerprint,
    },
    create: {
      inboundEmailId: input.inboundEmailId ?? null,
      messageId: input.messageId ?? null,
      senderEmail: accountCase.senderEmail,
      senderDomain: accountCase.senderDomain,
      subject: accountCase.subject,
      receivedAt: accountCase.receivedDate
        ? new Date(accountCase.receivedDate)
        : null,
      companyName: accountCase.structuredFields.companyName,
      detectedFormType: input.detectedFormType ?? null,
      status: 'PENDING_REVIEW',
      recommendedSigner: signingNotes.recommendedSigner,
      signingStatement: signingNotes.defaultSigningStatement,
      signingExplanation: accountCase.signingSummary.signingExplanation,
      detectedNames: jsonArray(signingNotes.detectedNames),
      detectedRoles: jsonArray(signingNotes.detectedRolesOrSections),
      escalationNotes: jsonArray(accountCase.signingSummary.escalationNotes),
      riskFlags: jsonArray(accountCase.riskFlags),
      missingFields: jsonArray(accountCase.missingFields),
      reviewerChecks: jsonArray(signingNotes.reviewerChecks),
      signingNotes: jsonObject(signingNotes),
      missingInfoResponses: jsonObject({}),
      extractedTextSummary: accountCase.extractedTextSummary,
      sourceAttachmentNames: jsonArray(accountCase.originalAttachmentNames),
      sourceFingerprint: accountCase.sourceFingerprint,
    },
    update: {
      inboundEmailId: input.inboundEmailId ?? undefined,
      messageId: input.messageId ?? null,
      senderEmail: accountCase.senderEmail,
      senderDomain: accountCase.senderDomain,
      subject: accountCase.subject,
      receivedAt: accountCase.receivedDate
        ? new Date(accountCase.receivedDate)
        : null,
      companyName: accountCase.structuredFields.companyName,
      detectedFormType: input.detectedFormType ?? null,
      recommendedSigner: signingNotes.recommendedSigner,
      signingStatement: signingNotes.defaultSigningStatement,
      signingExplanation: accountCase.signingSummary.signingExplanation,
      detectedNames: jsonArray(signingNotes.detectedNames),
      detectedRoles: jsonArray(signingNotes.detectedRolesOrSections),
      escalationNotes: jsonArray(accountCase.signingSummary.escalationNotes),
      riskFlags: jsonArray(accountCase.riskFlags),
      missingFields: jsonArray(accountCase.missingFields),
      reviewerChecks: jsonArray(signingNotes.reviewerChecks),
      signingNotes: jsonObject(signingNotes),
      extractedTextSummary: accountCase.extractedTextSummary,
      sourceAttachmentNames: jsonArray(accountCase.originalAttachmentNames),
    },
  };
}

export type AccountOpeningCaseEventInput = {
  accountOpeningCaseId: string;
  actionType: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorType?: string;
  actorIdentifier?: string | null;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type AccountOpeningOriginalFormBytesLoader = (
  form: AccountOpeningOriginalFormDetail,
) => Promise<
  | { status: 'AVAILABLE'; bytes: Uint8Array }
  | { status: 'UNAVAILABLE'; reason: string }
>;

export type AccountOpeningCaseRepository = {
  findUnique: (
    args: unknown,
  ) => Promise<PersistedAccountOpeningReviewCase | null>;
  update: (args: unknown) => Promise<PersistedAccountOpeningReviewCase>;
  replaceFieldMappings?: (args: {
    accountOpeningCaseId: string;
    mappings: Array<
      Omit<
        PersistedAccountOpeningFieldMapping,
        'id' | 'createdAt' | 'updatedAt'
      >
    >;
  }) => Promise<PersistedAccountOpeningFieldMapping[]>;
  replaceOriginalForms?: (args: {
    accountOpeningCaseId: string;
    forms: Array<
      Omit<
        PersistedAccountOpeningOriginalForm,
        'id' | 'createdAt' | 'updatedAt'
      >
    >;
  }) => Promise<PersistedAccountOpeningOriginalForm[]>;
  createFillPreview?: (args: {
    data: {
      accountOpeningCaseId: string;
      originalFormId: string | null;
      status: string;
      previewVersion: string;
      fileNames: Prisma.InputJsonValue;
      previewJson: Prisma.InputJsonValue;
      fieldSummary: Prisma.InputJsonValue;
      safetySummary: Prisma.InputJsonValue;
      createdByType: string | null;
      createdByIdentifier: string | null;
    };
  }) => Promise<PersistedAccountOpeningFillPreview>;
  createBinaryFillPreview?: (args: {
    data: {
      accountOpeningCaseId: string;
      originalFormId: string | null;
      status: string;
      previewVersion: string;
      binaryPreviewFileName: string | null;
      binaryPreviewContentType: string | null;
      binaryPreviewHash: string | null;
      binaryPreviewBytes: Uint8Array | Buffer | null;
      filledFieldCount: number;
      blankFieldCount: number;
      unsupportedReason: string | null;
      warnings: Prisma.InputJsonValue;
      brandingPreservationCheck: Prisma.InputJsonValue;
      safetySummary: Prisma.InputJsonValue;
      createdByType: string | null;
      createdByIdentifier: string | null;
    };
  }) => Promise<PersistedAccountOpeningBinaryFillPreview>;
  findBinaryFillPreview?: (args: {
    where: { id: string };
  }) => Promise<PersistedAccountOpeningBinaryFillPreview | null>;
  findCompletedFormFiling?: (args: {
    where?: {
      id?: string;
      accountOpeningCaseId?: string;
      binaryFillPreviewId?: string;
    };
    orderBy?: { createdAt: 'asc' | 'desc' };
  }) => Promise<PersistedAccountOpeningCompletedFormFiling | null>;
  createCompletedFormFiling?: (args: {
    data: Omit<
      PersistedAccountOpeningCompletedFormFiling,
      'id' | 'createdAt' | 'updatedAt'
    >;
  }) => Promise<PersistedAccountOpeningCompletedFormFiling>;
  updateCompletedFormFiling?: (args: {
    where: { id: string };
    data: Partial<
      Omit<
        PersistedAccountOpeningCompletedFormFiling,
        'id' | 'createdAt' | 'updatedAt'
      >
    >;
  }) => Promise<PersistedAccountOpeningCompletedFormFiling>;
  createEvent: (args: {
    data: AccountOpeningCaseEventInput;
  }) => Promise<unknown>;
};

function getAccountOpeningCaseRepository(): AccountOpeningCaseRepository {
  const client = db as never as {
    accountOpeningCase: {
      findUnique: (
        args: unknown,
      ) => Promise<PersistedAccountOpeningReviewCase | null>;
      update: (args: unknown) => Promise<PersistedAccountOpeningReviewCase>;
    };
    accountOpeningFieldMapping: {
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
      findMany: (
        args: unknown,
      ) => Promise<PersistedAccountOpeningFieldMapping[]>;
    };
    accountOpeningOriginalForm: {
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
      findMany: (
        args: unknown,
      ) => Promise<PersistedAccountOpeningOriginalForm[]>;
    };
    accountOpeningFillPreview: {
      create: (args: {
        data: {
          accountOpeningCaseId: string;
          originalFormId: string | null;
          status: string;
          previewVersion: string;
          fileNames: Prisma.InputJsonValue;
          previewJson: Prisma.InputJsonValue;
          fieldSummary: Prisma.InputJsonValue;
          safetySummary: Prisma.InputJsonValue;
          createdByType: string | null;
          createdByIdentifier: string | null;
        };
      }) => Promise<PersistedAccountOpeningFillPreview>;
    };
    accountOpeningBinaryFillPreview: {
      findUnique: (args: {
        where: { id: string };
      }) => Promise<PersistedAccountOpeningBinaryFillPreview | null>;
      create: (args: {
        data: {
          accountOpeningCaseId: string;
          originalFormId: string | null;
          status: string;
          previewVersion: string;
          binaryPreviewFileName: string | null;
          binaryPreviewContentType: string | null;
          binaryPreviewHash: string | null;
          binaryPreviewBytes: Uint8Array | Buffer | null;
          filledFieldCount: number;
          blankFieldCount: number;
          unsupportedReason: string | null;
          warnings: Prisma.InputJsonValue;
          brandingPreservationCheck: Prisma.InputJsonValue;
          safetySummary: Prisma.InputJsonValue;
          createdByType: string | null;
          createdByIdentifier: string | null;
        };
      }) => Promise<PersistedAccountOpeningBinaryFillPreview>;
    };
    accountOpeningCompletedFormFiling: {
      findFirst: (
        args: unknown,
      ) => Promise<PersistedAccountOpeningCompletedFormFiling | null>;
      create: (args: {
        data: Omit<
          PersistedAccountOpeningCompletedFormFiling,
          'id' | 'createdAt' | 'updatedAt'
        >;
      }) => Promise<PersistedAccountOpeningCompletedFormFiling>;
      update: (args: {
        where: { id: string };
        data: Partial<
          Omit<
            PersistedAccountOpeningCompletedFormFiling,
            'id' | 'createdAt' | 'updatedAt'
          >
        >;
      }) => Promise<PersistedAccountOpeningCompletedFormFiling>;
    };
    accountOpeningCaseEvent: {
      create: (args: {
        data: AccountOpeningCaseEventInput;
      }) => Promise<unknown>;
    };
  };

  return {
    findUnique: (args) => client.accountOpeningCase.findUnique(args),
    update: (args) => client.accountOpeningCase.update(args),
    replaceFieldMappings: async ({ accountOpeningCaseId, mappings }) => {
      await client.accountOpeningFieldMapping.deleteMany({
        where: { accountOpeningCaseId },
      });

      if (mappings.length > 0) {
        await client.accountOpeningFieldMapping.createMany({
          data: mappings,
        });
      }

      return client.accountOpeningFieldMapping.findMany({
        where: { accountOpeningCaseId },
        orderBy: { sortOrder: 'asc' },
      });
    },
    replaceOriginalForms: async ({ accountOpeningCaseId, forms }) => {
      await client.accountOpeningOriginalForm.deleteMany({
        where: { accountOpeningCaseId },
      });

      if (forms.length > 0) {
        await client.accountOpeningOriginalForm.createMany({
          data: forms,
        });
      }

      return client.accountOpeningOriginalForm.findMany({
        where: { accountOpeningCaseId },
        orderBy: { createdAt: 'asc' },
      });
    },
    createFillPreview: (args) => client.accountOpeningFillPreview.create(args),
    createBinaryFillPreview: (args) =>
      client.accountOpeningBinaryFillPreview.create(args),
    findBinaryFillPreview: (args) =>
      client.accountOpeningBinaryFillPreview.findUnique(args),
    findCompletedFormFiling: (args) =>
      client.accountOpeningCompletedFormFiling.findFirst(args),
    createCompletedFormFiling: (args) =>
      client.accountOpeningCompletedFormFiling.create(args),
    updateCompletedFormFiling: (args) =>
      client.accountOpeningCompletedFormFiling.update(args),
    createEvent: (args) => client.accountOpeningCaseEvent.create(args),
  };
}

export function buildAccountOpeningCaseDetail(
  accountCase: PersistedAccountOpeningReviewCase,
): AccountOpeningCaseDetail {
  const sourceEvidence = (accountCase.sourceEvidence ?? []).map(
    buildSourceEvidenceDetailFromPersisted,
  );
  const originalForms = (accountCase.originalForms ?? []).map(
    buildOriginalFormDetailFromPersisted,
  );
  const latestFillPreview = accountCase.fillPreviews?.[0]
    ? buildFillPreviewDetailFromPersisted(accountCase.fillPreviews[0])
    : null;
  const latestBinaryFillPreview = accountCase.binaryFillPreviews?.[0]
    ? buildBinaryFillPreviewDetailFromPersisted(
        accountCase.binaryFillPreviews[0],
      )
    : null;
  const latestCompletedFormFiling = accountCase.completedFormFilings?.[0]
    ? buildCompletedFormFilingDetailFromPersisted(
        accountCase.completedFormFilings[0],
      )
    : null;
  const riskFlags = stringArrayFromJson(accountCase.riskFlags);
  const detectedRoles = stringArrayFromJson(accountCase.detectedRoles);
  const detectedNames = stringArrayFromJson(accountCase.detectedNames);
  const missingFields = stringArrayFromJson(accountCase.missingFields);
  const missingInfoResponses = missingInfoResponsesFromJson(
    accountCase.missingInfoResponses,
  );
  const fallbackDraft = buildAccountOpeningCompletionDraft({
    missingInfoResponses,
    riskFlags,
    detectedRoles,
    detectedNames,
    missingFields,
    sourceEvidence: draftEvidenceFromDetails(sourceEvidence),
  });
  const completionDraft = isAccountOpeningCompletionDraft(accountCase.draftJson)
    ? {
        ...accountCase.draftJson,
        isStored: true,
      }
    : {
        ...fallbackDraft,
        status: 'PREVIEW' as const,
        isStored: false,
      };
  const fieldMappings = buildAccountOpeningFieldMappingReview({
    completionDraft,
    sourceEvidence: sourceEvidence.map((evidence) => ({
      id: evidence.id,
      sourceType: evidence.sourceType,
      sourceLabel: evidence.sourceLabel,
      fileName: evidence.fileName,
      safeSnippet: evidence.safeSnippet,
    })),
    persistedMappings: accountCase.fieldMappings ?? [],
  });

  return {
    id: accountCase.id,
    sourceFingerprint: accountCase.sourceFingerprint,
    messageId: accountCase.messageId,
    senderEmail: accountCase.senderEmail,
    senderDomain: accountCase.senderDomain,
    subject: accountCase.subject,
    receivedAt: accountCase.receivedAt?.toISOString() ?? null,
    companyName: accountCase.companyName,
    detectedFormType: accountCase.detectedFormType,
    status: accountCase.status,
    recommendedSigner: accountCase.recommendedSigner,
    signingStatement: accountCase.signingStatement,
    signingExplanation: accountCase.signingExplanation,
    detectedNames,
    detectedRoles,
    escalationNotes: stringArrayFromJson(accountCase.escalationNotes),
    riskFlags,
    missingFields,
    reviewerChecks: stringArrayFromJson(accountCase.reviewerChecks),
    signingNotes: buildSigningNotesFromPersistedCase(accountCase),
    missingInfoResponses,
    extractedTextSummary: accountCase.extractedTextSummary,
    storageStatus: accountCase.storageStatus,
    storageNote: accountCase.storageNote,
    storageSkippedReason: accountCase.storageSkippedReason,
    storageLastAttemptAt:
      accountCase.storageLastAttemptAt?.toISOString() ?? null,
    storageFolderUrl: accountCase.storageFolderUrl,
    sourceAttachmentNames: safeStringArrayFromJson(
      accountCase.sourceAttachmentNames,
    ),
    draftStatus: accountCase.draftStatus,
    draftVersion: accountCase.draftVersion,
    draftGeneratedAt: accountCase.draftGeneratedAt?.toISOString() ?? null,
    sourceEvidence,
    originalForms,
    completionDraft,
    fieldMappings,
    latestFillPreview,
    latestBinaryFillPreview,
    latestCompletedFormFiling,
    createdAt: accountCase.createdAt.toISOString(),
    updatedAt: accountCase.updatedAt.toISOString(),
  };
}

export async function getAccountOpeningCaseDetail(
  id: string,
  repository = getAccountOpeningCaseRepository(),
): Promise<AccountOpeningCaseDetail | null> {
  const accountCase = await repository.findUnique({
    where: { id },
    include: {
      sourceEvidence: {
        orderBy: { createdAt: 'asc' },
      },
      fieldMappings: {
        orderBy: { sortOrder: 'asc' },
      },
      originalForms: {
        orderBy: { createdAt: 'asc' },
      },
      fillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      binaryFillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      completedFormFilings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  return accountCase ? buildAccountOpeningCaseDetail(accountCase) : null;
}

export async function saveAccountOpeningMissingInfo(input: {
  id: string;
  missingInfoResponses: AccountOpeningMissingInfoResponses;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
}): Promise<AccountOpeningCaseDetail> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await repository.findUnique({
    where: { id: input.id },
  });

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const responses = sanitizeAccountOpeningMissingInfoResponses(
    input.missingInfoResponses,
  );
  const updated = await repository.update({
    where: { id: input.id },
    data: {
      missingInfoResponses: jsonObject(responses as Record<string, unknown>),
    },
  });
  const updatedWithEvidence =
    (await repository.findUnique({
      where: { id: input.id },
      include: {
        sourceEvidence: {
          orderBy: { createdAt: 'asc' },
        },
        fieldMappings: {
          orderBy: { sortOrder: 'asc' },
        },
        originalForms: {
          orderBy: { createdAt: 'asc' },
        },
        fillPreviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        binaryFillPreviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        completedFormFilings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })) ?? updated;

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'MISSING_INFO_SAVED',
      previousStatus: existing.status,
      newStatus: updated.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: jsonObject({ fields: Object.keys(responses) }),
    },
  });

  return buildAccountOpeningCaseDetail(updatedWithEvidence);
}

export async function updateAccountOpeningCaseStatus(input: {
  id: string;
  action: AccountOpeningStatusAction;
  note?: string | null;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  storageConfig?: AccountOpeningDriveArchiveConfig;
  storageUploader?: AccountOpeningDriveArchiveUploader;
  now?: Date;
}): Promise<AccountOpeningCaseDetail> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await repository.findUnique({
    where: { id: input.id },
  });

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const newStatus = STATUS_ACTIONS[input.action];
  let updated = await repository.update({
    where: { id: input.id },
    data: { status: newStatus },
  });
  updated =
    (await repository.findUnique({
      where: { id: input.id },
      include: {
        sourceEvidence: {
          orderBy: { createdAt: 'asc' },
        },
        fieldMappings: {
          orderBy: { sortOrder: 'asc' },
        },
        originalForms: {
          orderBy: { createdAt: 'asc' },
        },
        fillPreviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        binaryFillPreviews: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        completedFormFilings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })) ?? updated;

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: input.action,
      previousStatus: existing.status,
      newStatus,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      note: sanitizeDashboardText(input.note),
    },
  });

  if (input.action === 'APPROVED_FOR_COMPLETION') {
    const uploadResult = await uploadAccountOpeningArchivePack({
      item: buildAccountOpeningCaseDetail(updated),
      config: input.storageConfig,
      uploader: input.storageUploader,
      now: input.now,
    });

    updated = await repository.update({
      where: { id: input.id },
      data: {
        storageStatus: uploadResult.status,
        storageNote: uploadResult.note,
        storageSkippedReason: uploadResult.skippedReason,
        storageLastAttemptAt: uploadResult.attemptedAt,
        storageFolderUrl: uploadResult.folderUrl,
      },
    });
    updated =
      (await repository.findUnique({
        where: { id: input.id },
        include: {
          sourceEvidence: {
            orderBy: { createdAt: 'asc' },
          },
          fieldMappings: {
            orderBy: { sortOrder: 'asc' },
          },
          originalForms: {
            orderBy: { createdAt: 'asc' },
          },
          fillPreviews: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          binaryFillPreviews: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          completedFormFilings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })) ?? updated;

    await repository.createEvent({
      data: {
        accountOpeningCaseId: input.id,
        actionType:
          uploadResult.status === 'UPLOADED'
            ? 'MICROSOFT_DRIVE_ARCHIVE_UPLOADED'
            : uploadResult.status === 'UPLOAD_FAILED'
              ? 'MICROSOFT_DRIVE_ARCHIVE_FAILED'
              : 'MICROSOFT_DRIVE_ARCHIVE_SKIPPED',
        previousStatus: newStatus,
        newStatus,
        actorType: 'SYSTEM',
        actorIdentifier: 'account-opening-drive-archive',
        note: sanitizeDashboardText(uploadResult.note),
        metadata: jsonObject({
          status: uploadResult.status,
          skippedReason: uploadResult.skippedReason,
          folderUrl: uploadResult.folderUrl,
          packMetadata: uploadResult.packMetadata ?? null,
        }),
      },
    });
  }

  return buildAccountOpeningCaseDetail(updated);
}

async function findCaseWithEvidence(
  id: string,
  repository: AccountOpeningCaseRepository,
): Promise<PersistedAccountOpeningReviewCase | null> {
  return repository.findUnique({
    where: { id },
    include: {
      sourceEvidence: {
        orderBy: { createdAt: 'asc' },
      },
      fieldMappings: {
        orderBy: { sortOrder: 'asc' },
      },
      originalForms: {
        orderBy: { createdAt: 'asc' },
      },
      fillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      binaryFillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      completedFormFilings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

function fieldMappingSourceEvidenceFromDetails(
  evidence: AccountOpeningSourceEvidenceDetail[],
) {
  return evidence.map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel,
    fileName: item.fileName,
    safeSnippet: item.safeSnippet,
  }));
}

function fieldMappingRowsFromCandidates(input: {
  accountOpeningCaseId: string;
  candidates: AccountOpeningFieldMappingCandidate[];
}): Array<
  Omit<PersistedAccountOpeningFieldMapping, 'id' | 'createdAt' | 'updatedAt'>
> {
  return input.candidates.map((candidate, index) => ({
    accountOpeningCaseId: input.accountOpeningCaseId,
    supplierFieldLabel: candidate.supplierFieldLabel,
    supplierSectionLabel: candidate.supplierSectionLabel,
    normalizedLabel: candidate.normalizedLabel,
    sourceType: candidate.sourceType,
    sourceEvidenceId: candidate.sourceEvidenceId,
    evidenceSnippet: candidate.evidenceSnippet,
    suggestedDraftFieldKey: candidate.suggestedDraftFieldKey,
    mappedDraftFieldKey: candidate.mappedDraftFieldKey,
    proposedValue: candidate.proposedValue,
    valueSource: candidate.valueSource,
    confidence: candidate.confidence,
    riskLevel: candidate.riskLevel,
    status: candidate.status,
    requiresReview: candidate.requiresReview,
    blockedReason: candidate.blockedReason,
    reviewReason: candidate.reviewReason,
    operatorNote: candidate.operatorNote,
    sortOrder: index,
  }));
}

function fieldMappingAuditMetadata(
  review: AccountOpeningFieldMappingReview,
): Prisma.InputJsonValue {
  return jsonObject({
    status: review.status,
    summary: review.summary,
    fieldMappingControlsOnly: true,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    pdfWordFormsFilled: false,
    signedFormsIncluded: false,
    supplierMessageIncluded: false,
    purchaseWorkflowTriggered: false,
  });
}

export async function getAccountOpeningFieldMappingReview(input: {
  id: string;
  repository?: AccountOpeningCaseRepository;
}): Promise<AccountOpeningFieldMappingReview> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  return buildAccountOpeningCaseDetail(existing).fieldMappings;
}

export async function saveAccountOpeningFieldMappings(input: {
  id: string;
  mappings: AccountOpeningFieldMappingSaveInput[];
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
}): Promise<AccountOpeningFieldMappingReview> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  if (!repository.replaceFieldMappings) {
    throw new Error(
      'Account-opening field mapping repository is not writable.',
    );
  }

  const detail = buildAccountOpeningCaseDetail(existing);
  const sourceEvidence = fieldMappingSourceEvidenceFromDetails(
    detail.sourceEvidence,
  );
  const candidates = input.mappings.map((mapping) =>
    buildAccountOpeningFieldMappingCandidateForSave({
      mapping,
      completionDraft: detail.completionDraft,
      sourceEvidence,
    }),
  );
  const savedMappings = await repository.replaceFieldMappings({
    accountOpeningCaseId: input.id,
    mappings: fieldMappingRowsFromCandidates({
      accountOpeningCaseId: input.id,
      candidates,
    }),
  });
  const review = buildAccountOpeningFieldMappingReview({
    completionDraft: detail.completionDraft,
    sourceEvidence,
    persistedMappings: savedMappings,
  });

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'FIELD_MAPPINGS_SAVED',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: fieldMappingAuditMetadata(review),
    },
  });

  return review;
}

async function ensureOriginalFormReferences(input: {
  accountCase: PersistedAccountOpeningReviewCase;
  repository: AccountOpeningCaseRepository;
}): Promise<PersistedAccountOpeningReviewCase> {
  const existingForms = input.accountCase.originalForms ?? [];

  if (existingForms.length > 0) {
    return input.accountCase;
  }

  if (!input.repository.replaceOriginalForms) {
    return input.accountCase;
  }

  const sourceEvidence = input.accountCase.sourceEvidence ?? [];
  const formRows = originalFormRowsFromEvidence({
    accountOpeningCaseId: input.accountCase.id,
    sourceEvidence,
  });

  if (formRows.length === 0) {
    return input.accountCase;
  }

  await input.repository.replaceOriginalForms({
    accountOpeningCaseId: input.accountCase.id,
    forms: formRows,
  });

  await input.repository.createEvent({
    data: {
      accountOpeningCaseId: input.accountCase.id,
      actionType: 'ORIGINAL_FORM_REFERENCE_CAPTURED',
      previousStatus: input.accountCase.status,
      newStatus: input.accountCase.status,
      actorType: 'SYSTEM',
      actorIdentifier: 'account-opening-original-form-reference',
      metadata: jsonObject({
        formCount: formRows.length,
        rawFileBytesStored: false,
        rawExtractedTextStored: false,
        completedSupplierFormsGenerated: false,
        sharePointCompletedFormFiled: false,
      }),
    },
  });

  return (
    (await findCaseWithEvidence(input.accountCase.id, input.repository)) ??
    input.accountCase
  );
}

function assertCanGenerateFillPreview(detail: AccountOpeningCaseDetail) {
  if (!detail.completionDraft.isStored) {
    throw new Error(
      'Generate and store the completion draft before creating a fill preview.',
    );
  }

  if (detail.fieldMappings.status !== 'SAVED') {
    throw new Error(
      'Save reviewed field mappings before creating a fill preview.',
    );
  }

  if (detail.originalForms.length === 0) {
    throw new Error(
      'No original supplier/client form reference is available for this account-opening case.',
    );
  }
}

function fillPreviewAuditMetadata(
  pack: AccountOpeningFillPreviewPack,
  fileName?: string | null,
) {
  return jsonObject({
    generatedAt: pack.generatedAt,
    fileName: fileName ?? null,
    fileNames: pack.metadata.fileNames,
    summary: pack.payload.summary,
    internalPreviewOnly: true,
    rawExtractedTextIncluded: false,
    rawAttachmentBytesIncluded: false,
    rawBankDetailsIncluded: false,
    signedFormsIncluded: false,
    supplierMessageIncluded: false,
    supplierSubmissionTriggered: false,
    sharePointCompletedFormFiled: false,
    purchaseWorkflowTriggered: false,
  });
}

export async function generateAccountOpeningFillPreview(input: {
  id: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  now?: Date;
}): Promise<{
  item: AccountOpeningCaseDetail;
  preview: AccountOpeningFillPreviewPack;
}> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  let existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  existing = await ensureOriginalFormReferences({
    accountCase: existing,
    repository,
  });

  if (!repository.createFillPreview) {
    throw new Error('Account-opening fill preview repository is not writable.');
  }

  const detail = buildAccountOpeningCaseDetail(existing);
  assertCanGenerateFillPreview(detail);

  const pack = buildAccountOpeningFillPreviewPack(detail, input.now);
  await repository.createFillPreview({
    data: {
      accountOpeningCaseId: input.id,
      originalFormId: pack.payload.originalForm?.id ?? null,
      status: pack.payload.status,
      previewVersion: pack.payload.previewVersion,
      fileNames: jsonArray([...pack.metadata.fileNames]),
      previewJson: jsonObject(
        pack.payload as unknown as Record<string, unknown>,
      ),
      fieldSummary: jsonObject(
        pack.payload.summary as unknown as Record<string, unknown>,
      ),
      safetySummary: jsonObject(
        pack.payload.safety as unknown as Record<string, unknown>,
      ),
      createdByType: input.actorType?.trim() || 'OPERATOR',
      createdByIdentifier: sanitizeDashboardText(input.actorIdentifier),
    },
  });

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'FILL_PREVIEW_GENERATED',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: fillPreviewAuditMetadata(pack),
    },
  });

  const updated =
    (await findCaseWithEvidence(input.id, repository)) ?? existing;

  return {
    item: buildAccountOpeningCaseDetail(updated),
    preview: pack,
  };
}

export async function downloadAccountOpeningFillPreviewFile(input: {
  id: string;
  fileName: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
}): Promise<AccountOpeningFillPreviewFile> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const latestPreview = existing.fillPreviews?.[0] ?? null;

  if (
    !latestPreview ||
    !isAccountOpeningFillPreviewPayload(latestPreview.previewJson)
  ) {
    throw new Error(
      'Generate a fill preview before downloading preview files.',
    );
  }

  const pack = buildAccountOpeningFillPreviewPackFromPayload(
    latestPreview.previewJson,
  );
  const file = getAccountOpeningFillPreviewFile(pack, input.fileName);

  if (!file) {
    throw new Error('Account-opening fill preview file not found.');
  }

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'FILL_PREVIEW_FILE_DOWNLOADED',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: fillPreviewAuditMetadata(pack, file.fileName),
    },
  });

  return file;
}

function primaryBinaryFillOriginalForm(
  item: AccountOpeningCaseDetail,
): AccountOpeningOriginalFormDetail | null {
  return (
    item.originalForms.find((form) => form.formType === 'PDF') ??
    item.originalForms.find((form) => form.formType === 'WORD') ??
    item.originalForms[0] ??
    null
  );
}

function microsoftDriveOriginalFormReadSkippedReason(
  config: AccountOpeningDriveArchiveConfig,
): string | null {
  const label =
    config.provider === 'ONEDRIVE'
      ? 'OneDrive Microsoft Drive'
      : 'SharePoint Microsoft Drive';

  if (!config.enabled) {
    return `${label} account-opening storage is disabled.`;
  }

  if (config.provider === 'SHAREPOINT' && (!config.siteId || !config.driveId)) {
    return 'SharePoint account-opening storage is missing site or drive configuration.';
  }

  if (config.provider === 'ONEDRIVE' && !config.driveId) {
    return 'OneDrive account-opening storage needs a configured drive ID before original form download is enabled.';
  }

  if (!config.graphAuthConfigured) {
    return 'Missing Microsoft storage credentials. Set MICROSOFT_STORAGE_TENANT_ID, MICROSOFT_STORAGE_CLIENT_ID, MICROSOFT_STORAGE_CLIENT_SECRET.';
  }

  return null;
}

async function defaultAccountOpeningOriginalFormBytesLoader(
  form: AccountOpeningOriginalFormDetail,
): Promise<
  | { status: 'AVAILABLE'; bytes: Uint8Array }
  | { status: 'UNAVAILABLE'; reason: string }
> {
  if (!form.storageDriveItemId) {
    return {
      status: 'UNAVAILABLE',
      reason: 'Original form bytes are not available for binary fill preview.',
    };
  }

  const config = getAccountOpeningDriveArchiveConfig();
  const skippedReason = microsoftDriveOriginalFormReadSkippedReason(config);
  if (skippedReason) {
    return {
      status: 'UNAVAILABLE',
      reason: `Original form bytes are stored by Microsoft Drive reference, but download is not configured: ${skippedReason}`,
    };
  }

  if (!config.driveId) {
    return {
      status: 'UNAVAILABLE',
      reason:
        'Original form bytes are stored by Microsoft Drive reference, but a configured drive ID is required before binary fill preview generation.',
    };
  }

  try {
    const accessToken = await getMicrosoftStorageGraphAccessToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(form.storageDriveItemId)}/content`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      return {
        status: 'UNAVAILABLE',
        reason: `Original form bytes could not be downloaded from Microsoft Drive for binary fill preview. Graph returned ${response.status}.`,
      };
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES) {
      return {
        status: 'UNAVAILABLE',
        reason:
          'Original form bytes exceed the binary fill preview size limit.',
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_ACCOUNT_OPENING_BINARY_FILL_ORIGINAL_BYTES) {
      return {
        status: 'UNAVAILABLE',
        reason:
          'Original form bytes exceed the binary fill preview size limit.',
      };
    }

    return {
      status: 'AVAILABLE',
      bytes,
    };
  } catch {
    return {
      status: 'UNAVAILABLE',
      reason:
        'Original form bytes could not be downloaded from Microsoft Drive for binary fill preview.',
    };
  }
}

function binaryFillPreviewAuditMetadata(input: {
  preview: AccountOpeningBinaryFillPreviewResult;
  originalForm: AccountOpeningOriginalFormDetail | null;
  fileName?: string | null;
}): Prisma.InputJsonValue {
  return jsonObject({
    status: input.preview.status,
    originalFormId: input.originalForm?.id ?? null,
    formType: input.originalForm?.formType ?? null,
    fileName: sanitizeDashboardText(input.fileName) ?? null,
    binaryPreviewFileName: input.preview.fileName,
    binaryPreviewContentType: input.preview.contentType,
    binaryPreviewHash: input.preview.outputHash,
    filledFieldCount: input.preview.filledFieldCount,
    blankFieldCount: input.preview.blankFieldCount,
    unsupportedReason: input.preview.unsupportedReason,
    warnings: input.preview.warnings,
    brandingPreservationCheck: input.preview.brandingPreservationCheck,
    safetySummary: input.preview.safetySummary,
    rawFileContentsIncluded: false,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    signedFormsIncluded: false,
    supplierMessageIncluded: false,
    supplierSubmissionTriggered: false,
    sharePointCompletedFormFiled: false,
    purchaseWorkflowTriggered: false,
  });
}

function binaryPreviewActionType(
  preview: AccountOpeningBinaryFillPreviewResult,
):
  | 'BINARY_FILL_PREVIEW_GENERATED'
  | 'BINARY_FILL_PREVIEW_UNSUPPORTED'
  | 'BINARY_FILL_PREVIEW_FAILED' {
  if (preview.status === 'GENERATED_FOR_REVIEW') {
    return 'BINARY_FILL_PREVIEW_GENERATED';
  }

  if (preview.status === 'FAILED') {
    return 'BINARY_FILL_PREVIEW_FAILED';
  }

  return 'BINARY_FILL_PREVIEW_UNSUPPORTED';
}

function enforceBinaryPreviewPersistSizeLimit(
  preview: AccountOpeningBinaryFillPreviewResult,
  maxPreviewBytes: number,
): AccountOpeningBinaryFillPreviewResult {
  if (!preview.content || preview.content.byteLength <= maxPreviewBytes) {
    return preview;
  }

  return {
    ...preview,
    status: 'FAILED',
    fileName: null,
    contentType: null,
    content: null,
    outputHash: null,
    unsupportedReason: `Generated binary preview exceeds the storage size limit of ${maxPreviewBytes} bytes and was not persisted.`,
    warnings: compactUnique([
      ...preview.warnings,
      'Generated binary preview exceeded the BYTEA persistence size guard.',
    ]),
    safetySummary: {
      ...preview.safetySummary,
      binaryPreviewGenerated: false,
    },
  };
}

async function persistBinaryFillPreview(input: {
  accountCaseId: string;
  originalForm: AccountOpeningOriginalFormDetail | null;
  preview: AccountOpeningBinaryFillPreviewResult;
  actorType?: string | null;
  actorIdentifier?: string | null;
  maxPreviewBytes?: number;
  repository: AccountOpeningCaseRepository;
}) {
  if (!input.repository.createBinaryFillPreview) {
    throw new Error(
      'Account-opening binary fill preview repository is not writable.',
    );
  }

  return input.repository.createBinaryFillPreview({
    data: {
      accountOpeningCaseId: input.accountCaseId,
      originalFormId: input.originalForm?.id ?? null,
      status: input.preview.status,
      previewVersion: input.preview.previewVersion,
      binaryPreviewFileName: input.preview.fileName,
      binaryPreviewContentType: input.preview.contentType,
      binaryPreviewHash: input.preview.outputHash,
      binaryPreviewBytes:
        input.preview.content &&
        input.preview.content.byteLength <=
          (input.maxPreviewBytes ??
            MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES)
          ? Buffer.from(input.preview.content)
          : null,
      filledFieldCount: input.preview.filledFieldCount,
      blankFieldCount: input.preview.blankFieldCount,
      unsupportedReason: input.preview.unsupportedReason,
      warnings: jsonArray(input.preview.warnings),
      brandingPreservationCheck: jsonObject(
        input.preview.brandingPreservationCheck as unknown as Record<
          string,
          unknown
        >,
      ),
      safetySummary: jsonObject(
        input.preview.safetySummary as unknown as Record<string, unknown>,
      ),
      createdByType: input.actorType?.trim() || 'OPERATOR',
      createdByIdentifier: sanitizeDashboardText(input.actorIdentifier),
    },
  });
}

function unsupportedBinaryPreviewResult(input: {
  status?: 'UNSUPPORTED' | 'REQUIRES_MANUAL_COMPLETION';
  reason: string;
  warning?: string | null;
}): AccountOpeningBinaryFillPreviewResult {
  return {
    status: input.status ?? 'UNSUPPORTED',
    previewVersion: 'binary-fill-preview-v1',
    fileName: null,
    contentType: null,
    content: null,
    outputHash: null,
    filledFieldCount: 0,
    blankFieldCount: 0,
    unsupportedReason: sanitizeDashboardText(input.reason) ?? input.reason,
    warnings: compactUnique([sanitizeDashboardText(input.warning)]),
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

function failedBinaryPreviewResult(
  error: unknown,
): AccountOpeningBinaryFillPreviewResult {
  const message =
    error instanceof Error
      ? error.message
      : 'Binary fill preview generation failed.';

  return unsupportedBinaryPreviewResult({
    status: 'UNSUPPORTED',
    reason: 'Binary fill preview generation failed safely.',
    warning: message,
  });
}

export async function generateAccountOpeningBinaryFillPreview(input: {
  id: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  originalFormBytesLoader?: AccountOpeningOriginalFormBytesLoader;
  sizeLimits?: AccountOpeningBinaryFillPreviewSizeLimits;
}): Promise<{
  item: AccountOpeningCaseDetail;
  preview: AccountOpeningBinaryFillPreviewDetail;
}> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  let existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  existing = await ensureOriginalFormReferences({
    accountCase: existing,
    repository,
  });

  const detail = buildAccountOpeningCaseDetail(existing);
  const originalForm = primaryBinaryFillOriginalForm(detail);
  let preview: AccountOpeningBinaryFillPreviewResult;
  let actionType:
    | 'BINARY_FILL_PREVIEW_GENERATED'
    | 'BINARY_FILL_PREVIEW_UNSUPPORTED'
    | 'BINARY_FILL_PREVIEW_FAILED' = 'BINARY_FILL_PREVIEW_UNSUPPORTED';

  if (!detail.completionDraft.isStored) {
    preview = unsupportedBinaryPreviewResult({
      status: 'REQUIRES_MANUAL_COMPLETION',
      reason:
        'Generate and store the completion draft before creating a binary fill preview.',
    });
  } else if (detail.fieldMappings.status !== 'SAVED') {
    preview = unsupportedBinaryPreviewResult({
      status: 'REQUIRES_MANUAL_COMPLETION',
      reason:
        'Save reviewed field mappings before creating a binary fill preview.',
    });
  } else if (!originalForm) {
    preview = unsupportedBinaryPreviewResult({
      reason:
        'No original supplier/client form reference is available for binary fill preview.',
    });
  } else if (!['PDF', 'WORD'].includes(originalForm.formType)) {
    preview = unsupportedBinaryPreviewResult({
      reason: `${originalForm.formType} original forms are not supported for binary fill preview.`,
    });
  } else {
    const bytesLoader =
      input.originalFormBytesLoader ??
      defaultAccountOpeningOriginalFormBytesLoader;
    const loaded = await bytesLoader(originalForm);

    if (loaded.status === 'UNAVAILABLE') {
      preview = unsupportedBinaryPreviewResult({
        reason: loaded.reason,
      });
    } else {
      try {
        preview = await buildAccountOpeningBinaryFillPreview({
          item: detail,
          originalForm,
          sourceBytes: loaded.bytes,
          sizeLimits: input.sizeLimits,
        });
        preview = enforceBinaryPreviewPersistSizeLimit(
          preview,
          input.sizeLimits?.maxGeneratedPreviewBytes ??
            MAX_ACCOUNT_OPENING_BINARY_FILL_PREVIEW_BYTES,
        );
        actionType = binaryPreviewActionType(preview);
      } catch (error) {
        preview = failedBinaryPreviewResult(error);
        preview.status = 'FAILED';
        actionType = 'BINARY_FILL_PREVIEW_FAILED';
      }
    }
  }

  const persisted = await persistBinaryFillPreview({
    accountCaseId: input.id,
    originalForm,
    preview,
    actorType: input.actorType,
    actorIdentifier: input.actorIdentifier,
    maxPreviewBytes: input.sizeLimits?.maxGeneratedPreviewBytes,
    repository,
  });

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType,
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: binaryFillPreviewAuditMetadata({
        preview,
        originalForm,
      }),
    },
  });

  const updated = (await findCaseWithEvidence(input.id, repository)) ?? {
    ...existing,
    binaryFillPreviews: [persisted],
  };

  return {
    item: buildAccountOpeningCaseDetail(updated),
    preview: buildBinaryFillPreviewDetailFromPersisted(persisted),
  };
}

export async function downloadAccountOpeningBinaryFillPreviewFile(input: {
  id: string;
  fileName: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
}): Promise<AccountOpeningBinaryFillPreviewFile> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const latestPreview = existing.binaryFillPreviews?.[0] ?? null;

  if (
    !latestPreview ||
    latestPreview.status !== 'GENERATED_FOR_REVIEW' ||
    !latestPreview.binaryPreviewBytes ||
    !latestPreview.binaryPreviewFileName ||
    !latestPreview.binaryPreviewContentType
  ) {
    throw new Error(
      'Generate a binary fill preview before downloading preview files.',
    );
  }

  if (latestPreview.binaryPreviewFileName !== input.fileName) {
    throw new Error('Account-opening binary fill preview file not found.');
  }

  const file: AccountOpeningBinaryFillPreviewFile = {
    fileName:
      latestPreview.binaryPreviewFileName as AccountOpeningBinaryFillPreviewFileName,
    contentType:
      latestPreview.binaryPreviewContentType as AccountOpeningBinaryFillPreviewFile['contentType'],
    content: latestPreview.binaryPreviewBytes,
  };
  const preview = unsupportedBinaryPreviewResult({
    reason: '',
  });
  preview.status = 'GENERATED_FOR_REVIEW';
  preview.fileName = file.fileName;
  preview.contentType = file.contentType;
  preview.outputHash = latestPreview.binaryPreviewHash;
  preview.filledFieldCount = latestPreview.filledFieldCount;
  preview.blankFieldCount = latestPreview.blankFieldCount;
  preview.unsupportedReason = null;
  preview.warnings = safeStringArrayFromJson(latestPreview.warnings);
  preview.brandingPreservationCheck = jsonRecordFromUnknown(
    latestPreview.brandingPreservationCheck,
  ) as AccountOpeningBinaryFillPreviewResult['brandingPreservationCheck'];
  preview.safetySummary = jsonRecordFromUnknown(
    latestPreview.safetySummary,
  ) as AccountOpeningBinaryFillPreviewResult['safetySummary'];

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'BINARY_FILL_PREVIEW_DOWNLOADED',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: binaryFillPreviewAuditMetadata({
        preview,
        originalForm: existing.originalForms?.find(
          (form) => form.id === latestPreview.originalFormId,
        )
          ? buildOriginalFormDetailFromPersisted(
              existing.originalForms.find(
                (form) => form.id === latestPreview.originalFormId,
              ) as PersistedAccountOpeningOriginalForm,
            )
          : null,
        fileName: file.fileName,
      }),
    },
  });

  return file;
}

function binaryPreviewBytes(
  preview: PersistedAccountOpeningBinaryFillPreview,
): Uint8Array | null {
  return preview.binaryPreviewBytes
    ? new Uint8Array(preview.binaryPreviewBytes)
    : null;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function findBinaryPreviewForCompletedFormFiling(input: {
  id: string;
  binaryFillPreviewId?: string | null;
  accountCase: PersistedAccountOpeningReviewCase;
  repository: AccountOpeningCaseRepository;
}): Promise<PersistedAccountOpeningBinaryFillPreview> {
  const previewId =
    sanitizeDashboardText(input.binaryFillPreviewId) ??
    input.accountCase.binaryFillPreviews?.[0]?.id ??
    null;

  if (!previewId) {
    throw new Error(
      'Generate a binary fill preview before approving a completed unsigned form for filing.',
    );
  }

  const includedPreview = input.accountCase.binaryFillPreviews?.find(
    (preview) => preview.id === previewId,
  );
  const preview =
    includedPreview ??
    (input.repository.findBinaryFillPreview
      ? await input.repository.findBinaryFillPreview({
          where: { id: previewId },
        })
      : null);

  if (!preview) {
    throw new Error('Account-opening binary fill preview not found.');
  }

  if (
    preview.accountOpeningCaseId &&
    preview.accountOpeningCaseId !== input.id
  ) {
    throw new Error(
      'Account-opening binary fill preview does not belong to this case.',
    );
  }

  return preview;
}

function validateCompletedUnsignedPreview(
  preview: PersistedAccountOpeningBinaryFillPreview,
): Uint8Array {
  const bytes = binaryPreviewBytes(preview);

  if (
    preview.status !== 'GENERATED_FOR_REVIEW' ||
    !bytes ||
    !preview.binaryPreviewFileName ||
    !preview.binaryPreviewContentType
  ) {
    throw new Error(
      'Only generated supported binary PDF AcroForm previews with stored bytes can be approved for completed unsigned form filing.',
    );
  }

  if (preview.binaryPreviewContentType !== 'application/pdf') {
    throw new Error(
      'Only generated PDF AcroForm previews can be approved for completed unsigned form filing.',
    );
  }

  return bytes;
}

function completedFormFilingSafetySummary(input: {
  preview: PersistedAccountOpeningBinaryFillPreview;
}): Prisma.InputJsonValue {
  return jsonObject({
    completedUnsignedForm: true,
    approvedForFilingRequired: true,
    internalSharePointFilingOnly: true,
    notSigned: true,
    notSent: true,
    notSubmitted: true,
    blockedReviewRequiredFieldsRemainBlank: true,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    signedFormsIncluded: false,
    paymentAuthorityCompleted: false,
    directDebitMandateCompleted: false,
    guaranteeIndemnityCompleted: false,
    supplierMessageIncluded: false,
    supplierSubmissionTriggered: false,
    purchaseWorkflowTriggered: false,
    previewSafetySummary: jsonRecordFromUnknown(input.preview.safetySummary),
  });
}

function completedFormFilingMetadata(input: {
  preview: PersistedAccountOpeningBinaryFillPreview;
  fileHash: string;
  fileSizeBytes: number;
  storage?: {
    status: string;
    storageProvider: string | null;
    folderUrl: string | null;
    fileUrl: string | null;
    driveItemId: string | null;
    skippedReason: string | null;
  };
}): Prisma.InputJsonValue {
  return jsonObject({
    binaryFillPreviewId: input.preview.id,
    originalFormId: input.preview.originalFormId,
    previewVersion: input.preview.previewVersion,
    previewStatus: input.preview.status,
    binaryPreviewHash: input.preview.binaryPreviewHash,
    fileHash: input.fileHash,
    fileSizeBytes: input.fileSizeBytes,
    filledFieldCount: input.preview.filledFieldCount,
    blankFieldCount: input.preview.blankFieldCount,
    warnings: safeStringArrayFromJson(input.preview.warnings),
    storage: input.storage ?? null,
    rawFileBytesIncludedInAudit: false,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    signedFormsIncluded: false,
    supplierMessageIncluded: false,
    supplierSubmissionTriggered: false,
    purchaseWorkflowTriggered: false,
  });
}

async function findCompletedFormFilingForPreview(input: {
  accountOpeningCaseId: string;
  binaryFillPreviewId: string;
  repository: AccountOpeningCaseRepository;
}) {
  if (!input.repository.findCompletedFormFiling) {
    return null;
  }

  return input.repository.findCompletedFormFiling({
    where: {
      accountOpeningCaseId: input.accountOpeningCaseId,
      binaryFillPreviewId: input.binaryFillPreviewId,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function upsertCompletedFormFiling(input: {
  existing: PersistedAccountOpeningCompletedFormFiling | null;
  data: Omit<
    PersistedAccountOpeningCompletedFormFiling,
    'id' | 'createdAt' | 'updatedAt'
  >;
  repository: AccountOpeningCaseRepository;
}): Promise<PersistedAccountOpeningCompletedFormFiling> {
  if (input.existing) {
    if (!input.repository.updateCompletedFormFiling) {
      throw new Error(
        'Account-opening completed form filing repository is not writable.',
      );
    }

    return input.repository.updateCompletedFormFiling({
      where: { id: input.existing.id },
      data: input.data,
    });
  }

  if (!input.repository.createCompletedFormFiling) {
    throw new Error(
      'Account-opening completed form filing repository is not writable.',
    );
  }

  return input.repository.createCompletedFormFiling({
    data: input.data,
  });
}

export async function approveAccountOpeningCompletedFormFiling(input: {
  id: string;
  binaryFillPreviewId?: string | null;
  approvalNote?: string | null;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  now?: Date;
}): Promise<{
  item: AccountOpeningCaseDetail;
  filing: AccountOpeningCompletedFormFilingDetail;
}> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  if (existing.status === 'REJECTED') {
    throw new Error(REJECTED_ACCOUNT_OPENING_COMPLETED_FORM_FILING_MESSAGE);
  }

  const preview = await findBinaryPreviewForCompletedFormFiling({
    id: input.id,
    binaryFillPreviewId: input.binaryFillPreviewId,
    accountCase: existing,
    repository,
  });
  const bytes = validateCompletedUnsignedPreview(preview);
  const fileHash = preview.binaryPreviewHash ?? hashBytes(bytes);
  const existingFiling = await findCompletedFormFilingForPreview({
    accountOpeningCaseId: input.id,
    binaryFillPreviewId: preview.id,
    repository,
  });
  const now = input.now ?? new Date();
  const actorType = input.actorType?.trim() || 'OPERATOR';
  const actorIdentifier = sanitizeDashboardText(input.actorIdentifier) ?? null;
  const approvalNote = sanitizeDashboardText(input.approvalNote) ?? null;
  const filing = await upsertCompletedFormFiling({
    existing: existingFiling,
    repository,
    data: {
      accountOpeningCaseId: input.id,
      binaryFillPreviewId: preview.id,
      status:
        existingFiling?.status === 'FILED' ? 'FILED' : 'APPROVED_FOR_FILING',
      fileName:
        sanitizeDashboardText(preview.binaryPreviewFileName) ??
        'completed-unsigned-form.pdf',
      contentType:
        sanitizeDashboardText(preview.binaryPreviewContentType) ??
        'application/pdf',
      fileHash,
      fileSizeBytes: bytes.byteLength,
      storageProvider: existingFiling?.storageProvider ?? null,
      storageFolderUrl: existingFiling?.storageFolderUrl ?? null,
      storageFileUrl: existingFiling?.storageFileUrl ?? null,
      storageDriveItemId: existingFiling?.storageDriveItemId ?? null,
      approvedByType: actorType,
      approvedByIdentifier: actorIdentifier,
      approvedAt: now,
      approvalNote,
      filedByType: existingFiling?.filedByType ?? null,
      filedByIdentifier: existingFiling?.filedByIdentifier ?? null,
      filedAt: existingFiling?.filedAt ?? null,
      filingNote: existingFiling?.filingNote ?? null,
      skippedReason: existingFiling?.skippedReason ?? null,
      safetySummary: completedFormFilingSafetySummary({ preview }),
      metadata: completedFormFilingMetadata({
        preview,
        fileHash,
        fileSizeBytes: bytes.byteLength,
      }),
    },
  });

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'COMPLETED_UNSIGNED_FORM_APPROVED_FOR_FILING',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType,
      actorIdentifier,
      note: approvalNote,
      metadata: completedFormFilingMetadata({
        preview,
        fileHash,
        fileSizeBytes: bytes.byteLength,
      }),
    },
  });

  const updated = (await findCaseWithEvidence(input.id, repository)) ?? {
    ...existing,
    completedFormFilings: [filing],
  };

  return {
    item: buildAccountOpeningCaseDetail(updated),
    filing: buildCompletedFormFilingDetailFromPersisted(filing),
  };
}

async function persistCompletedFormFilingSkipped(input: {
  accountCase: PersistedAccountOpeningReviewCase;
  preview: PersistedAccountOpeningBinaryFillPreview;
  reason: string;
  actorType: string;
  actorIdentifier: string | null;
  filingNote: string | null;
  repository: AccountOpeningCaseRepository;
  now: Date;
}) {
  const bytes = binaryPreviewBytes(input.preview);
  const fileHash =
    input.preview.binaryPreviewHash ?? (bytes ? hashBytes(bytes) : null);
  const fileSizeBytes = bytes?.byteLength ?? null;
  const existingFiling = await findCompletedFormFilingForPreview({
    accountOpeningCaseId: input.accountCase.id,
    binaryFillPreviewId: input.preview.id,
    repository: input.repository,
  });
  const filing = await upsertCompletedFormFiling({
    existing: existingFiling,
    repository: input.repository,
    data: {
      accountOpeningCaseId: input.accountCase.id,
      binaryFillPreviewId: input.preview.id,
      status: 'FILING_SKIPPED',
      fileName:
        sanitizeDashboardText(input.preview.binaryPreviewFileName) ??
        'completed-unsigned-form.pdf',
      contentType:
        sanitizeDashboardText(input.preview.binaryPreviewContentType) ??
        'application/pdf',
      fileHash,
      fileSizeBytes,
      storageProvider: existingFiling?.storageProvider ?? null,
      storageFolderUrl: existingFiling?.storageFolderUrl ?? null,
      storageFileUrl: existingFiling?.storageFileUrl ?? null,
      storageDriveItemId: existingFiling?.storageDriveItemId ?? null,
      approvedByType: existingFiling?.approvedByType ?? null,
      approvedByIdentifier: existingFiling?.approvedByIdentifier ?? null,
      approvedAt: existingFiling?.approvedAt ?? null,
      approvalNote: existingFiling?.approvalNote ?? null,
      filedByType: null,
      filedByIdentifier: null,
      filedAt: null,
      filingNote: input.filingNote,
      skippedReason: input.reason,
      safetySummary: completedFormFilingSafetySummary({
        preview: input.preview,
      }),
      metadata: completedFormFilingMetadata({
        preview: input.preview,
        fileHash: fileHash ?? '',
        fileSizeBytes: fileSizeBytes ?? 0,
        storage: {
          status: 'FILING_SKIPPED',
          storageProvider: null,
          folderUrl: null,
          fileUrl: null,
          driveItemId: null,
          skippedReason: input.reason,
        },
      }),
    },
  });

  await input.repository.createEvent({
    data: {
      accountOpeningCaseId: input.accountCase.id,
      actionType: 'COMPLETED_UNSIGNED_FORM_FILING_SKIPPED',
      previousStatus: input.accountCase.status,
      newStatus: input.accountCase.status,
      actorType: input.actorType,
      actorIdentifier: input.actorIdentifier,
      note: input.reason,
      metadata: completedFormFilingMetadata({
        preview: input.preview,
        fileHash: fileHash ?? '',
        fileSizeBytes: fileSizeBytes ?? 0,
        storage: {
          status: 'FILING_SKIPPED',
          storageProvider: null,
          folderUrl: null,
          fileUrl: null,
          driveItemId: null,
          skippedReason: input.reason,
        },
      }),
    },
  });

  return filing;
}

export async function fileAccountOpeningCompletedFormToSharePoint(input: {
  id: string;
  binaryFillPreviewId?: string | null;
  filingNote?: string | null;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  storageConfig?: AccountOpeningDriveArchiveConfig;
  storageUploader?: AccountOpeningCompletedFormFilingUploader;
  now?: Date;
}): Promise<{
  item: AccountOpeningCaseDetail;
  filing: AccountOpeningCompletedFormFilingDetail;
}> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  if (existing.status === 'REJECTED') {
    throw new Error(REJECTED_ACCOUNT_OPENING_COMPLETED_FORM_FILING_MESSAGE);
  }

  const preview = await findBinaryPreviewForCompletedFormFiling({
    id: input.id,
    binaryFillPreviewId: input.binaryFillPreviewId,
    accountCase: existing,
    repository,
  });
  const bytes = validateCompletedUnsignedPreview(preview);
  const existingFiling = await findCompletedFormFilingForPreview({
    accountOpeningCaseId: input.id,
    binaryFillPreviewId: preview.id,
    repository,
  });
  const now = input.now ?? new Date();
  const actorType = input.actorType?.trim() || 'OPERATOR';
  const actorIdentifier = sanitizeDashboardText(input.actorIdentifier) ?? null;
  const filingNote = sanitizeDashboardText(input.filingNote) ?? null;

  if (existingFiling?.status === 'FILED') {
    return {
      item: buildAccountOpeningCaseDetail(existing),
      filing: buildCompletedFormFilingDetailFromPersisted(existingFiling),
    };
  }

  if (existingFiling?.status !== 'APPROVED_FOR_FILING') {
    const filing = await persistCompletedFormFilingSkipped({
      accountCase: existing,
      preview,
      reason:
        'Approve the completed unsigned form for filing before internal SharePoint filing.',
      actorType,
      actorIdentifier,
      filingNote,
      repository,
      now,
    });
    const updated = (await findCaseWithEvidence(input.id, repository)) ?? {
      ...existing,
      completedFormFilings: [filing],
    };

    return {
      item: buildAccountOpeningCaseDetail(updated),
      filing: buildCompletedFormFilingDetailFromPersisted(filing),
    };
  }

  const fileHash = preview.binaryPreviewHash ?? hashBytes(bytes);
  const uploadResult = await uploadAccountOpeningCompletedFormFiling({
    item: buildAccountOpeningCaseDetail(existing),
    preview: buildBinaryFillPreviewDetailFromPersisted(preview),
    content: bytes,
    fileHash,
    config: input.storageConfig,
    uploader: input.storageUploader,
    now,
  });
  const nextStatus =
    uploadResult.status === 'UPLOADED'
      ? 'FILED'
      : uploadResult.status === 'UPLOAD_FAILED'
        ? 'FILING_FAILED'
        : 'FILING_SKIPPED';

  if (!repository.updateCompletedFormFiling) {
    throw new Error(
      'Account-opening completed form filing repository is not writable.',
    );
  }

  const filing = await repository.updateCompletedFormFiling({
    where: { id: existingFiling.id },
    data: {
      status: nextStatus,
      fileName: uploadResult.fileName,
      contentType: 'application/pdf',
      fileHash: uploadResult.fileHash,
      fileSizeBytes: uploadResult.fileSizeBytes,
      storageProvider: uploadResult.storageProvider,
      storageFolderUrl: uploadResult.folderUrl,
      storageFileUrl: uploadResult.fileUrl,
      storageDriveItemId: uploadResult.driveItemId,
      approvedByType: existingFiling.approvedByType,
      approvedByIdentifier: existingFiling.approvedByIdentifier,
      approvedAt: existingFiling.approvedAt,
      approvalNote: existingFiling.approvalNote,
      filedByType: nextStatus === 'FILED' ? actorType : null,
      filedByIdentifier: nextStatus === 'FILED' ? actorIdentifier : null,
      filedAt: nextStatus === 'FILED' ? uploadResult.attemptedAt : null,
      filingNote,
      skippedReason: uploadResult.skippedReason,
      safetySummary: completedFormFilingSafetySummary({ preview }),
      metadata: completedFormFilingMetadata({
        preview,
        fileHash: uploadResult.fileHash,
        fileSizeBytes: uploadResult.fileSizeBytes,
        storage: {
          status: nextStatus,
          storageProvider: uploadResult.storageProvider,
          folderUrl: uploadResult.folderUrl,
          fileUrl: uploadResult.fileUrl,
          driveItemId: uploadResult.driveItemId,
          skippedReason: uploadResult.skippedReason,
        },
      }),
    },
  });
  const actionType =
    nextStatus === 'FILED'
      ? 'COMPLETED_UNSIGNED_FORM_FILING_COMPLETED'
      : nextStatus === 'FILING_FAILED'
        ? 'COMPLETED_UNSIGNED_FORM_FILING_FAILED'
        : 'COMPLETED_UNSIGNED_FORM_FILING_SKIPPED';

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType,
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType,
      actorIdentifier,
      note: sanitizeDashboardText(uploadResult.note),
      metadata: completedFormFilingMetadata({
        preview,
        fileHash: uploadResult.fileHash,
        fileSizeBytes: uploadResult.fileSizeBytes,
        storage: {
          status: nextStatus,
          storageProvider: uploadResult.storageProvider,
          folderUrl: uploadResult.folderUrl,
          fileUrl: uploadResult.fileUrl,
          driveItemId: uploadResult.driveItemId,
          skippedReason: uploadResult.skippedReason,
        },
      }),
    },
  });

  const updated = (await findCaseWithEvidence(input.id, repository)) ?? {
    ...existing,
    completedFormFilings: [filing],
  };

  return {
    item: buildAccountOpeningCaseDetail(updated),
    filing: buildCompletedFormFilingDetailFromPersisted(filing),
  };
}

export async function writeDraftAuditEvents(input: {
  accountCaseId: string;
  previousStatus?: string | null;
  draft: AccountOpeningCompletionDraft;
  generatedActionType: 'DRAFT_GENERATED' | 'DRAFT_REGENERATED';
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository: AccountOpeningCaseRepository;
}) {
  const actorType = input.actorType?.trim() || 'OPERATOR';
  const actorIdentifier = sanitizeDashboardText(input.actorIdentifier) ?? null;
  const metadata = draftAuditMetadata(input.draft);

  await input.repository.createEvent({
    data: {
      accountOpeningCaseId: input.accountCaseId,
      actionType: input.generatedActionType,
      previousStatus: input.previousStatus,
      newStatus: input.previousStatus,
      actorType,
      actorIdentifier,
      metadata,
    },
  });

  const routingEventType = draftRoutingEventType(input.draft);
  await input.repository.createEvent({
    data: {
      accountOpeningCaseId: input.accountCaseId,
      actionType: routingEventType,
      previousStatus: input.previousStatus,
      newStatus: input.previousStatus,
      actorType: 'SYSTEM',
      actorIdentifier: 'account-opening-draft-generator',
      metadata,
    },
  });
}

export async function generateAccountOpeningDraft(input: {
  id: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  now?: Date;
}): Promise<AccountOpeningCaseDetail> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const draft = buildCompletionDraftForCase({
    accountCase: existing,
    sourceEvidence: (existing.sourceEvidence ?? []).map(
      buildSourceEvidenceDetailFromPersisted,
    ),
    now: input.now,
    stored: true,
  });
  const generatedActionType = existing.draftGeneratedAt
    ? 'DRAFT_REGENERATED'
    : 'DRAFT_GENERATED';
  const updated = await repository.update({
    where: { id: input.id },
    data: {
      draftStatus: draft.status,
      draftVersion: draft.profileVersion,
      draftGeneratedAt: new Date(draft.generatedAt),
      draftJson: jsonObject(draft as unknown as Record<string, unknown>),
      draftSummary: jsonObject(
        draft.summary as unknown as Record<string, unknown>,
      ),
    },
  });
  const updatedWithEvidence =
    (await findCaseWithEvidence(input.id, repository)) ?? updated;

  await writeDraftAuditEvents({
    accountCaseId: input.id,
    previousStatus: existing.status,
    draft,
    generatedActionType,
    actorType: input.actorType,
    actorIdentifier: input.actorIdentifier,
    repository,
  });

  return buildAccountOpeningCaseDetail(updatedWithEvidence);
}

function exportAuditMetadata(
  pack: AccountOpeningReviewExportPack,
  fileName?: string | null,
) {
  return jsonObject({
    generatedAt: pack.generatedAt,
    fileName: fileName ?? null,
    fileNames: pack.metadata.fileNames,
    reviewExportOnly: true,
    rawExtractedTextIncluded: false,
    rawBankDetailsIncluded: false,
    signedFormsIncluded: false,
    completedSupplierFormsIncluded: false,
    pdfWordFormsFilled: false,
    supplierMessageIncluded: false,
    purchaseWorkflowTriggered: false,
  });
}

export async function exportAccountOpeningReviewedPack(input: {
  id: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  now?: Date;
}): Promise<AccountOpeningReviewExportPack> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const pack = buildAccountOpeningReviewExportPack(
    buildAccountOpeningCaseDetail(existing),
    input.now,
  );

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'SAFE_REVIEW_EXPORT_PACK_EXPORTED',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: exportAuditMetadata(pack),
    },
  });

  return pack;
}

export async function downloadAccountOpeningReviewedExportFile(input: {
  id: string;
  fileName: string;
  actorType?: string | null;
  actorIdentifier?: string | null;
  repository?: AccountOpeningCaseRepository;
  now?: Date;
}): Promise<AccountOpeningReviewExportFile> {
  const repository = input.repository ?? getAccountOpeningCaseRepository();
  const existing = await findCaseWithEvidence(input.id, repository);

  if (!existing) {
    throw new Error('Account-opening case not found.');
  }

  const pack = buildAccountOpeningReviewExportPack(
    buildAccountOpeningCaseDetail(existing),
    input.now,
  );
  const file = getAccountOpeningReviewExportFile(pack, input.fileName);

  if (!file) {
    throw new Error('Account-opening review export file not found.');
  }

  await repository.createEvent({
    data: {
      accountOpeningCaseId: input.id,
      actionType: 'SAFE_REVIEW_EXPORT_FILE_DOWNLOADED',
      previousStatus: existing.status,
      newStatus: existing.status,
      actorType: input.actorType?.trim() || 'OPERATOR',
      actorIdentifier: sanitizeDashboardText(input.actorIdentifier) ?? null,
      metadata: exportAuditMetadata(pack, file.fileName),
    },
  });

  return file;
}

export async function upsertAccountOpeningCase(
  input: AccountOpeningCasePersistenceInput,
) {
  const data = buildAccountOpeningCasePersistenceData(input);
  const evidenceRows = input.accountCase.sourceEvidence.map((evidence) => ({
    ...normalizeSourceEvidenceInput(evidence),
    metadata: evidence.metadata ? jsonObject(evidence.metadata) : undefined,
  }));
  const client = db as never as {
    accountOpeningCase: {
      upsert: (args: typeof data) => Promise<PersistedAccountOpeningReviewCase>;
      update: (args: unknown) => Promise<PersistedAccountOpeningReviewCase>;
      findUnique: (
        args: unknown,
      ) => Promise<PersistedAccountOpeningReviewCase | null>;
    };
    accountOpeningCaseEvent: {
      create: (args: {
        data: AccountOpeningCaseEventInput;
      }) => Promise<unknown>;
    };
    accountOpeningSourceEvidence: {
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
    };
    accountOpeningOriginalForm: {
      deleteMany: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
      findMany: (
        args: unknown,
      ) => Promise<PersistedAccountOpeningOriginalForm[]>;
    };
  };

  const accountCase = await client.accountOpeningCase.upsert(data);
  const existingWithEvidence = await client.accountOpeningCase.findUnique({
    where: { id: accountCase.id },
    include: {
      sourceEvidence: {
        orderBy: { createdAt: 'asc' },
      },
      fieldMappings: {
        orderBy: { sortOrder: 'asc' },
      },
      originalForms: {
        orderBy: { createdAt: 'asc' },
      },
      fillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      binaryFillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      completedFormFilings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  const existingEvidence = existingWithEvidence?.sourceEvidence ?? [];
  const evidenceChanged =
    evidenceFingerprint(existingEvidence) !== evidenceFingerprint(evidenceRows);

  if (evidenceChanged) {
    await client.accountOpeningSourceEvidence.deleteMany({
      where: { accountOpeningCaseId: accountCase.id },
    });

    if (evidenceRows.length > 0) {
      await client.accountOpeningSourceEvidence.createMany({
        data: evidenceRows.map((evidence) => ({
          ...evidence,
          accountOpeningCaseId: accountCase.id,
        })),
      });

      await client.accountOpeningCaseEvent.create({
        data: {
          accountOpeningCaseId: accountCase.id,
          actionType: 'SOURCE_EVIDENCE_CAPTURED',
          previousStatus: accountCase.status,
          newStatus: accountCase.status,
          actorType: 'SYSTEM',
          actorIdentifier: 'email-account-opening-ingestion',
          metadata: jsonObject({
            evidenceCount: evidenceRows.length,
            rawFileBytesStored: false,
            rawExtractedTextStored: false,
          }),
        },
      });
    }
  }

  let accountCaseWithEvidence = await client.accountOpeningCase.findUnique({
    where: { id: accountCase.id },
    include: {
      sourceEvidence: {
        orderBy: { createdAt: 'asc' },
      },
      fieldMappings: {
        orderBy: { sortOrder: 'asc' },
      },
      originalForms: {
        orderBy: { createdAt: 'asc' },
      },
      fillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      binaryFillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      completedFormFilings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!accountCaseWithEvidence) {
    return null;
  }

  const originalFormRows = originalFormRowsFromEvidence({
    accountOpeningCaseId: accountCase.id,
    sourceEvidence: accountCaseWithEvidence.sourceEvidence ?? [],
  });
  const originalFormsChanged =
    originalFormFingerprint(accountCaseWithEvidence.originalForms ?? []) !==
    originalFormFingerprint(originalFormRows);

  if (originalFormsChanged) {
    await client.accountOpeningOriginalForm.deleteMany({
      where: { accountOpeningCaseId: accountCase.id },
    });

    if (originalFormRows.length > 0) {
      await client.accountOpeningOriginalForm.createMany({
        data: originalFormRows,
      });

      await client.accountOpeningCaseEvent.create({
        data: {
          accountOpeningCaseId: accountCase.id,
          actionType: 'ORIGINAL_FORM_REFERENCE_CAPTURED',
          previousStatus: accountCase.status,
          newStatus: accountCase.status,
          actorType: 'SYSTEM',
          actorIdentifier: 'email-account-opening-ingestion',
          metadata: jsonObject({
            formCount: originalFormRows.length,
            rawFileBytesStored: false,
            rawExtractedTextStored: false,
            completedSupplierFormsGenerated: false,
            sharePointCompletedFormFiled: false,
          }),
        },
      });
    }

    accountCaseWithEvidence =
      (await client.accountOpeningCase.findUnique({
        where: { id: accountCase.id },
        include: {
          sourceEvidence: {
            orderBy: { createdAt: 'asc' },
          },
          fieldMappings: {
            orderBy: { sortOrder: 'asc' },
          },
          originalForms: {
            orderBy: { createdAt: 'asc' },
          },
          fillPreviews: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          binaryFillPreviews: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          completedFormFilings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })) ?? accountCaseWithEvidence;
  }

  const draft = buildCompletionDraftForCase({
    accountCase: accountCaseWithEvidence,
    sourceEvidence: (accountCaseWithEvidence.sourceEvidence ?? []).map(
      buildSourceEvidenceDetailFromPersisted,
    ),
    stored: true,
  });
  const generatedActionType = accountCaseWithEvidence.draftGeneratedAt
    ? 'DRAFT_REGENERATED'
    : 'DRAFT_GENERATED';
  const draftChanged =
    !isAccountOpeningCompletionDraft(accountCaseWithEvidence.draftJson) ||
    draftFingerprint(accountCaseWithEvidence.draftJson) !==
      draftFingerprint(draft);

  if (draftChanged) {
    await client.accountOpeningCase.update({
      where: { id: accountCase.id },
      data: {
        draftStatus: draft.status,
        draftVersion: draft.profileVersion,
        draftGeneratedAt: new Date(draft.generatedAt),
        draftJson: jsonObject(draft as unknown as Record<string, unknown>),
        draftSummary: jsonObject(
          draft.summary as unknown as Record<string, unknown>,
        ),
      },
    });

    await writeDraftAuditEvents({
      accountCaseId: accountCase.id,
      previousStatus: accountCase.status,
      draft,
      generatedActionType,
      actorType: 'SYSTEM',
      actorIdentifier: 'email-account-opening-ingestion',
      repository: {
        findUnique: (args) => client.accountOpeningCase.findUnique(args),
        update: (args) => client.accountOpeningCase.update(args),
        createEvent: (args) => client.accountOpeningCaseEvent.create(args),
      },
    });
  }

  return client.accountOpeningCase.findUnique({
    where: { id: accountCase.id },
    include: {
      sourceEvidence: {
        orderBy: { createdAt: 'asc' },
      },
      fieldMappings: {
        orderBy: { sortOrder: 'asc' },
      },
      originalForms: {
        orderBy: { createdAt: 'asc' },
      },
      fillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      binaryFillPreviews: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      completedFormFilings: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

export async function listOpenAccountOpeningCases(): Promise<
  PersistedAccountOpeningReviewCase[]
> {
  const client = db as never as {
    accountOpeningCase?: {
      findMany: (args: unknown) => Promise<PersistedAccountOpeningReviewCase[]>;
    };
  };

  if (!client.accountOpeningCase) {
    return [];
  }

  return client.accountOpeningCase.findMany({
    where: {
      status: {
        in: ['PENDING_REVIEW', 'NEEDS_INFO'],
      },
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 100,
  });
}

export function buildSigningNotesFromPersistedCase(
  accountCase: PersistedAccountOpeningReviewCase,
): AccountOpeningSigningNotes {
  const persistedNotes =
    accountCase.signingNotes &&
    typeof accountCase.signingNotes === 'object' &&
    !Array.isArray(accountCase.signingNotes)
      ? (accountCase.signingNotes as Partial<AccountOpeningSigningNotes>)
      : null;

  return {
    title: 'Account opening signing notes',
    recommendedSigner: 'Aman Dhillon',
    defaultSigningStatement:
      'Aman Dhillon can sign this account-opening form by default.',
    detectedNames:
      persistedNotes?.detectedNames &&
      Array.isArray(persistedNotes.detectedNames)
        ? stringArrayFromJson(persistedNotes.detectedNames)
        : stringArrayFromJson(accountCase.detectedNames),
    detectedRolesOrSections:
      persistedNotes?.detectedRolesOrSections &&
      Array.isArray(persistedNotes.detectedRolesOrSections)
        ? stringArrayFromJson(persistedNotes.detectedRolesOrSections)
        : stringArrayFromJson(accountCase.detectedRoles),
    reviewerChecks:
      persistedNotes?.reviewerChecks &&
      Array.isArray(persistedNotes.reviewerChecks)
        ? stringArrayFromJson(persistedNotes.reviewerChecks)
        : stringArrayFromJson(accountCase.reviewerChecks),
    riskFlags:
      persistedNotes?.riskFlags && Array.isArray(persistedNotes.riskFlags)
        ? stringArrayFromJson(persistedNotes.riskFlags)
        : stringArrayFromJson(accountCase.riskFlags),
    missingOrUnclear:
      persistedNotes?.missingOrUnclear &&
      Array.isArray(persistedNotes.missingOrUnclear)
        ? stringArrayFromJson(persistedNotes.missingOrUnclear)
        : stringArrayFromJson(accountCase.missingFields),
    signatureInstruction:
      'Leave signature fields blank until approved by a human reviewer.',
    summary:
      typeof persistedNotes?.summary === 'string' &&
      persistedNotes.summary.trim()
        ? persistedNotes.summary
        : [
            'Recommended signer: Aman Dhillon.',
            'Aman Dhillon can sign this account-opening form by default.',
            'Leave signature fields blank until approved by a human reviewer.',
          ].join(' '),
  };
}

export function buildAccountOpeningCase(
  input: BuildAccountOpeningCaseInput,
): AccountOpeningCase {
  const combinedText = textFromParts([
    input.subject,
    input.bodyText,
    ...input.attachments.map((attachment) => attachment.fileName),
    ...input.attachments.map((attachment) => attachment.extractedText),
  ]);
  const riskFlags = compactUnique(matchLabels(combinedText, RISK_TERMS));
  const signingSummary = buildAccountOpeningSigningSummary(combinedText);
  const directDebitRequested = /\bdirect\s+debit\b|\bdd\s+mandate\b/i.test(
    combinedText,
  );
  const guaranteeDetected = /\bguarantees?\b/i.test(combinedText);
  const regulatoryDeclarationDetected =
    /\bresponsible\s+person\b|\bRP\b|\bGDP\b|\bWDA\b/i.test(combinedText);
  const paymentMethodRequested = directDebitRequested
    ? 'Direct Debit requested'
    : /\bcredit\s+account\b|\bcredit\s+terms?\b/i.test(combinedText)
      ? 'Credit account requested'
      : TO_BE_CONFIRMED;
  const structuredFields: AccountOpeningStructuredFields = {
    companyName: 'AMBE LTD',
    tradingName: 'AMBE MEDICAL GROUP',
    companyNumber: TO_BE_CONFIRMED,
    vatNumber: TO_BE_CONFIRMED,
    registeredAddress: TO_BE_CONFIRMED,
    tradingAddress: TO_BE_CONFIRMED,
    contactName: TO_BE_CONFIRMED,
    contactEmail: TO_BE_CONFIRMED,
    contactPhone: TO_BE_CONFIRMED,
    accountsContact: TO_BE_CONFIRMED,
    paymentMethodRequested,
    directDebitRequested,
    guaranteeDetected,
    regulatoryDeclarationDetected,
    riskyTerms: riskFlags,
    missingOrUnclear: [],
    recommendedSigner: signingSummary.defaultSigner,
  };
  const missingFields = REQUIRED_FIELD_LABELS.filter(
    (field) => structuredFields[field] === TO_BE_CONFIRMED,
  );

  structuredFields.missingOrUnclear = missingFields;
  const signingNotes = buildAccountOpeningSigningNotes({
    signingSummary,
    riskFlags,
    missingOrUnclear: missingFields,
  });

  return {
    sourceFingerprint:
      input.sourceFingerprint ??
      buildAccountOpeningSourceFingerprint({
        senderEmail: input.senderEmail,
        subject: input.subject,
        attachmentFileNames: input.attachments.map(
          (attachment) => attachment.fileName,
        ),
      }),
    status: 'pending_review',
    senderEmail: input.senderEmail,
    senderDomain: input.senderDomain ?? extractSenderDomain(input.senderEmail),
    subject: input.subject,
    receivedDate: input.receivedAt?.toISOString() ?? null,
    detectedCompanyOrSupplierName:
      input.detectedCompanyOrSupplierName?.trim() || null,
    originalAttachmentNames: compactUnique(
      input.attachments.map((attachment) => attachment.fileName),
    ),
    extractedTextSummary: summarizeExtractedText(
      input.bodyText,
      input.attachments,
    ),
    riskFlags,
    missingFields,
    structuredFields,
    signingSummary,
    signingNotes,
    sourceEvidence: input.sourceEvidence ?? [
      ...(input.bodyText?.trim()
        ? [
            {
              sourceType: 'EMAIL_BODY' as const,
              sourceLabel: 'Email body',
              text: input.bodyText,
              rawFileAvailable: false,
            },
          ]
        : []),
      ...input.attachments.map((attachment) => ({
        sourceType: 'ATTACHMENT' as const,
        sourceLabel: attachment.fileName,
        fileName: attachment.fileName,
        text: attachment.extractedText ?? null,
        rawFileAvailable: false,
      })),
    ],
  };
}
