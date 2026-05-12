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

export type AccountOpeningSharePointResult = {
  enabled: boolean;
  folderUrl: string | null;
  note: string;
  skippedReason: string | null;
};

export type AccountOpeningCase = {
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  senderEmail: string;
  senderDomain: string | null;
  subject: string | null;
  receivedDate: string | null;
  detectedCompanyOrSupplierName: string | null;
  originalAttachmentNames: string[];
  extractedTextSummary: string;
  riskFlags: string[];
  missingFields: string[];
  sharePointFolderUrl: string | null;
  sharePointNote: string;
  structuredFields: AccountOpeningStructuredFields;
  signingSummary: AccountOpeningSigningSummary;
  signingNotes: AccountOpeningSigningNotes;
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
  sharePoint: AccountOpeningSharePointResult;
};

const TO_BE_CONFIRMED = 'To be confirmed';
const DEFAULT_SIGNER = 'Aman Dhillon';

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

export function prepareAccountOpeningSharePointStorage(input: {
  enabled: boolean;
  siteId?: string | null;
  driveId?: string | null;
  folder?: string | null;
}): AccountOpeningSharePointResult {
  const missingConfig = !input.siteId?.trim() || !input.driveId?.trim() || !input.folder?.trim();

  if (!input.enabled || missingConfig) {
    return {
      enabled: false,
      folderUrl: null,
      skippedReason: 'SharePoint account-opening upload is disabled or not fully configured.',
      note: 'SharePoint upload skipped; review item was still created.',
    };
  }

  return {
    enabled: true,
    folderUrl: null,
    skippedReason: 'SharePoint upload adapter is configured but no uploader is active in this review-first slice.',
    note: 'SharePoint upload skipped by the current adapter; review item was still created.',
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
    sharePointFolderUrl: input.sharePoint.folderUrl,
    sharePointNote: input.sharePoint.note,
    structuredFields,
    signingSummary,
    signingNotes,
  };
}
