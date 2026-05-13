import { createHash } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { db } from '../lib/db';

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
  sourceAttachmentNames: string[];
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
  sourceAttachmentNames: unknown;
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
};

const TO_BE_CONFIRMED = 'To be confirmed';
const DEFAULT_SIGNER = 'Aman Dhillon';
const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN = /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN = /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
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
  { label: 'trade account application', pattern: /\btrade\s+account\s+applications?\b/i },
  { label: 'credit account application', pattern: /\bcredit\s+account\s+applications?\b/i },
  { label: 'direct debit mandate', pattern: /\bdirect\s+debit\s+mandates?\b/i },
  { label: 'personal guarantee', pattern: /\bpersonal\s+guarantees?\b/i },
  { label: 'director guarantee', pattern: /\bdirector(?:s?'?)?\s+guarantees?\b/i },
  {
    label: 'wholesale account',
    pattern:
      /\bwholesale\s+account\s+(?:applications?|forms?|opening|onboarding)\b|\b(?:applications?|forms?|opening|onboarding)\s+(?:for\s+)?(?:a\s+)?wholesale\s+account\b/i,
  },
  { label: 'onboarding questionnaire', pattern: /\bonboarding\s+questionnaires?\b/i },
];

const RISK_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Director guarantee', pattern: /\bdirector(?:s?'?)?\s+guarantees?\b/i },
  { label: 'Personal guarantee', pattern: /\bpersonal\s+guarantees?\b/i },
  { label: 'Guarantee', pattern: /\bguarantees?\b/i },
  { label: 'Direct Debit mandate', pattern: /\bdirect\s+debit\s+mandates?\b|\bdd\s+mandates?\b/i },
  { label: 'bank authority signature', pattern: /\bbank\s+authority\b|\bbank\s+mandates?\b/i },
  { label: 'indemnity', pattern: /\bindemnit(?:y|ies|ies?)\b|\bindemnif(?:y|ication)\b/i },
  { label: 'credit terms', pattern: /\bcredit\s+terms?\b|\bcredit\s+account\b/i },
  { label: 'RP/GDP/WDA regulatory declaration', pattern: /\bresponsible\s+person\b|\bRP\b|\bGDP\b|\bWDA\b|\bwholesale\s+dealer/i },
  { label: 'returns policy obligations', pattern: /\breturns?\s+polic(?:y|ies)\b|\breturn\s+obligations?\b/i },
];

const SIGNING_SIGNALS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Director-only signature', pattern: /\bdirector[-\s]+only\b|\bdirector\s+signature\b/i },
  { label: 'Director', pattern: /\bdirector\b/i },
  { label: 'Responsible Person', pattern: /\bresponsible\s+person\b/i },
  { label: 'RP', pattern: /\bRP\b/i },
  { label: 'GDP', pattern: /\bGDP\b/i },
  { label: 'WDA', pattern: /\bWDA\b/i },
  { label: 'bank authority', pattern: /\bbank\s+authority\b|\bbank\s+mandates?\b/i },
  { label: 'Direct Debit', pattern: /\bdirect\s+debit\b|\bdd\s+mandate\b/i },
  { label: 'guarantee', pattern: /\bguarantees?\b/i },
  { label: 'personal guarantee', pattern: /\bpersonal\s+guarantees?\b/i },
  { label: 'indemnity', pattern: /\bindemnit(?:y|ies|ies?)\b|\bindemnif(?:y|ication)\b/i },
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

function matchLabels(text: string, terms: Array<{ label: string; pattern: RegExp }>): string[] {
  return terms.filter((term) => term.pattern.test(text)).map((term) => term.label);
}

function jsonArray(values: string[]): Prisma.InputJsonValue {
  return values as Prisma.InputJsonValue;
}

function jsonObject(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function sanitizeDashboardText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed
    .replace(BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN, '[redacted bank account number]')
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function jsonRecordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function sanitizeAccountOpeningMissingInfoResponses(
  input: AccountOpeningMissingInfoResponses,
): AccountOpeningMissingInfoResponses {
  return MISSING_INFO_KEYS.reduce<AccountOpeningMissingInfoResponses>((responses, key) => {
    const sanitized = sanitizeDashboardText(input[key]);
    if (sanitized !== null) {
      responses[key] = sanitized;
    }
    return responses;
  }, {});
}

function missingInfoResponsesFromJson(value: unknown): AccountOpeningMissingInfoResponses {
  const record = jsonRecordFromUnknown(value);

  return sanitizeAccountOpeningMissingInfoResponses(
    MISSING_INFO_KEYS.reduce<AccountOpeningMissingInfoResponses>((responses, key) => {
      const rawValue = record[key];
      if (typeof rawValue === 'string') {
        responses[key] = rawValue;
      }
      return responses;
    }, {}),
  );
}

function safeStringArrayFromJson(value: unknown): string[] {
  return compactUnique(stringArrayFromJson(value).map((item) => sanitizeDashboardText(item)));
}

function normalizeFingerprintPart(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function extractSenderDomain(senderEmail: string): string | null {
  const domain = senderEmail.includes('@') ? senderEmail.split('@').pop()?.trim().toLowerCase() : null;
  return domain || null;
}

function summarizeExtractedText(bodyText: string | null, attachments: AccountOpeningAttachmentInput[]): string {
  const bodyChars = bodyText?.trim().length ?? 0;
  const attachmentTextChars = attachments.reduce(
    (total, attachment) => total + (attachment.extractedText?.trim().length ?? 0),
    0,
  );
  const textSources = [
    bodyChars > 0 ? `email body (${bodyChars} chars)` : null,
    attachmentTextChars > 0 ? `attachments (${attachmentTextChars} extracted chars)` : null,
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
    messageId: normalizeFingerprintPart(input.messageId ?? input.externalMessageId),
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
    (input.attachmentFileNames ?? []).filter((fileName) =>
      matchLabels(fileName ?? '', ACCOUNT_OPENING_TERMS).length > 0,
    ),
  );

  return {
    detected: matchedTerms.length > 0,
    matchedTerms: compactUnique(matchedTerms),
    matchedAttachmentNames,
  };
}

export function buildAccountOpeningSigningSummary(text: string): AccountOpeningSigningSummary {
  const detectedNames = matchLabels(text, SIGNING_NAMES);
  const detectedSignatureRoles = matchLabels(text, SIGNING_SIGNALS);
  const escalationNotes: string[] = [];

  if (/\bdirector\b/i.test(text) || /\bsandeep\s+patel\b/i.test(text)) {
    escalationNotes.push(
      'The form mentions Director/Sandeep Patel. Reviewer should confirm the supplier does not specifically require a director-only signature.',
    );
  }

  if (/\bresponsible\s+person\b|\bRP\b|\bGDP\b|\bWDA\b|\bdilshad\s+moulana\b/i.test(text)) {
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
    input.signingSummary.detectedSignatureRoles.includes('Director-only signature')
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
    defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
    detectedNames: input.signingSummary.detectedNames,
    detectedRolesOrSections: input.signingSummary.detectedSignatureRoles,
    reviewerChecks,
    riskFlags: input.riskFlags,
    missingOrUnclear: input.missingOrUnclear,
    signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
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

export function buildAccountOpeningCasePersistenceData(input: AccountOpeningCasePersistenceInput) {
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
      receivedAt: accountCase.receivedDate ? new Date(accountCase.receivedDate) : null,
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
      receivedAt: accountCase.receivedDate ? new Date(accountCase.receivedDate) : null,
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

export type AccountOpeningCaseRepository = {
  findUnique: (args: unknown) => Promise<PersistedAccountOpeningReviewCase | null>;
  update: (args: unknown) => Promise<PersistedAccountOpeningReviewCase>;
  createEvent: (args: { data: AccountOpeningCaseEventInput }) => Promise<unknown>;
};

function getAccountOpeningCaseRepository(): AccountOpeningCaseRepository {
  const client = db as never as {
    accountOpeningCase: {
      findUnique: (args: unknown) => Promise<PersistedAccountOpeningReviewCase | null>;
      update: (args: unknown) => Promise<PersistedAccountOpeningReviewCase>;
    };
    accountOpeningCaseEvent: {
      create: (args: { data: AccountOpeningCaseEventInput }) => Promise<unknown>;
    };
  };

  return {
    findUnique: (args) => client.accountOpeningCase.findUnique(args),
    update: (args) => client.accountOpeningCase.update(args),
    createEvent: (args) => client.accountOpeningCaseEvent.create(args),
  };
}

export function buildAccountOpeningCaseDetail(
  accountCase: PersistedAccountOpeningReviewCase,
): AccountOpeningCaseDetail {
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
    detectedNames: stringArrayFromJson(accountCase.detectedNames),
    detectedRoles: stringArrayFromJson(accountCase.detectedRoles),
    escalationNotes: stringArrayFromJson(accountCase.escalationNotes),
    riskFlags: stringArrayFromJson(accountCase.riskFlags),
    missingFields: stringArrayFromJson(accountCase.missingFields),
    reviewerChecks: stringArrayFromJson(accountCase.reviewerChecks),
    signingNotes: buildSigningNotesFromPersistedCase(accountCase),
    missingInfoResponses: missingInfoResponsesFromJson(accountCase.missingInfoResponses),
    extractedTextSummary: accountCase.extractedTextSummary,
    sourceAttachmentNames: safeStringArrayFromJson(accountCase.sourceAttachmentNames),
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

  const responses = sanitizeAccountOpeningMissingInfoResponses(input.missingInfoResponses);
  const updated = await repository.update({
    where: { id: input.id },
    data: {
      missingInfoResponses: jsonObject(responses as Record<string, unknown>),
    },
  });

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

  return buildAccountOpeningCaseDetail(updated);
}

export async function updateAccountOpeningCaseStatus(input: {
  id: string;
  action: AccountOpeningStatusAction;
  note?: string | null;
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

  const newStatus = STATUS_ACTIONS[input.action];
  const updated = await repository.update({
    where: { id: input.id },
    data: { status: newStatus },
  });

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

  return buildAccountOpeningCaseDetail(updated);
}

export async function upsertAccountOpeningCase(input: AccountOpeningCasePersistenceInput) {
  const data = buildAccountOpeningCasePersistenceData(input);

  return (db as never as {
    accountOpeningCase: {
      upsert: (args: typeof data) => Promise<PersistedAccountOpeningReviewCase>;
    };
  }).accountOpeningCase.upsert(data);
}

export async function listOpenAccountOpeningCases(): Promise<PersistedAccountOpeningReviewCase[]> {
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
    accountCase.signingNotes && typeof accountCase.signingNotes === 'object' && !Array.isArray(accountCase.signingNotes)
      ? (accountCase.signingNotes as Partial<AccountOpeningSigningNotes>)
      : null;

  return {
    title: 'Account opening signing notes',
    recommendedSigner: 'Aman Dhillon',
    defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
    detectedNames:
      persistedNotes?.detectedNames && Array.isArray(persistedNotes.detectedNames)
        ? stringArrayFromJson(persistedNotes.detectedNames)
        : stringArrayFromJson(accountCase.detectedNames),
    detectedRolesOrSections:
      persistedNotes?.detectedRolesOrSections && Array.isArray(persistedNotes.detectedRolesOrSections)
        ? stringArrayFromJson(persistedNotes.detectedRolesOrSections)
        : stringArrayFromJson(accountCase.detectedRoles),
    reviewerChecks:
      persistedNotes?.reviewerChecks && Array.isArray(persistedNotes.reviewerChecks)
        ? stringArrayFromJson(persistedNotes.reviewerChecks)
        : stringArrayFromJson(accountCase.reviewerChecks),
    riskFlags:
      persistedNotes?.riskFlags && Array.isArray(persistedNotes.riskFlags)
        ? stringArrayFromJson(persistedNotes.riskFlags)
        : stringArrayFromJson(accountCase.riskFlags),
    missingOrUnclear:
      persistedNotes?.missingOrUnclear && Array.isArray(persistedNotes.missingOrUnclear)
        ? stringArrayFromJson(persistedNotes.missingOrUnclear)
        : stringArrayFromJson(accountCase.missingFields),
    signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
    summary:
      typeof persistedNotes?.summary === 'string' && persistedNotes.summary.trim()
        ? persistedNotes.summary
        : [
            'Recommended signer: Aman Dhillon.',
            'Aman Dhillon can sign this account-opening form by default.',
            'Leave signature fields blank until approved by a human reviewer.',
          ].join(' '),
  };
}

export function buildAccountOpeningCase(input: BuildAccountOpeningCaseInput): AccountOpeningCase {
  const combinedText = textFromParts([
    input.subject,
    input.bodyText,
    ...input.attachments.map((attachment) => attachment.fileName),
    ...input.attachments.map((attachment) => attachment.extractedText),
  ]);
  const riskFlags = compactUnique(matchLabels(combinedText, RISK_TERMS));
  const signingSummary = buildAccountOpeningSigningSummary(combinedText);
  const directDebitRequested = /\bdirect\s+debit\b|\bdd\s+mandate\b/i.test(combinedText);
  const guaranteeDetected = /\bguarantees?\b/i.test(combinedText);
  const regulatoryDeclarationDetected = /\bresponsible\s+person\b|\bRP\b|\bGDP\b|\bWDA\b/i.test(combinedText);
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
  const missingFields = REQUIRED_FIELD_LABELS.filter((field) => structuredFields[field] === TO_BE_CONFIRMED);

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
        attachmentFileNames: input.attachments.map((attachment) => attachment.fileName),
      }),
    status: 'pending_review',
    senderEmail: input.senderEmail,
    senderDomain: input.senderDomain ?? extractSenderDomain(input.senderEmail),
    subject: input.subject,
    receivedDate: input.receivedAt?.toISOString() ?? null,
    detectedCompanyOrSupplierName: input.detectedCompanyOrSupplierName?.trim() || null,
    originalAttachmentNames: compactUnique(input.attachments.map((attachment) => attachment.fileName)),
    extractedTextSummary: summarizeExtractedText(input.bodyText, input.attachments),
    riskFlags,
    missingFields,
    structuredFields,
    signingSummary,
    signingNotes,
  };
}
