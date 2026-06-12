import {
  getAccountOpeningMasterProfile,
  type AccountOpeningMasterProfile,
} from './masterProfile';
import {
  evaluateAccountOpeningAutofillPolicy,
  type AccountOpeningFieldClass,
  type AccountOpeningPolicyDecisionKind,
  type AccountOpeningPolicyRiskCategory,
} from './policy';

export type AccountOpeningDraftValueSource =
  | 'AMBE_MASTER_PROFILE'
  | 'REVIEWER_RESPONSE'
  | 'EXTRACTED_TEXT'
  | 'SYSTEM_PLACEHOLDER'
  | 'NOT_PROVIDED';

export type AccountOpeningDraftConfidence =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'BLOCKED';
export type AccountOpeningDraftRiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'BLOCKED';

export type AccountOpeningDraftEvidence = {
  sourceType:
    | 'MASTER_PROFILE'
    | 'EMAIL_BODY'
    | 'ATTACHMENT_TEXT'
    | 'REVIEWER_INPUT'
    | 'SYSTEM_RULE';
  sourceLabel: string | null;
  snippet: string | null;
};

export type AccountOpeningDraftField = {
  key: string;
  supplierLabel: string;
  proposedValue: string | null;
  valueSource: AccountOpeningDraftValueSource;
  confidence: AccountOpeningDraftConfidence;
  riskLevel: AccountOpeningDraftRiskLevel;
  fieldClass: AccountOpeningFieldClass;
  policyDecision: AccountOpeningPolicyDecisionKind;
  riskCategory: AccountOpeningPolicyRiskCategory;
  policyReason: string;
  signatoryRoutingNote: string | null;
  signingNote: string | null;
  requiresReview: boolean;
  reviewReason: string | null;
  evidence: AccountOpeningDraftEvidence[];
};

export type AccountOpeningPolicyRiskFlag = {
  fieldKey: string;
  supplierLabel: string;
  fieldClass: AccountOpeningFieldClass;
  policyDecision: AccountOpeningPolicyDecisionKind;
  riskCategory: AccountOpeningPolicyRiskCategory;
  reason: string;
  signatoryRoutingNote: string | null;
  signingNote: string | null;
};

export type AccountOpeningCompletionDraft = {
  status: 'PREVIEW' | 'READY_FOR_REVIEW' | 'REVIEW_REQUIRED' | 'BLOCKED';
  overallConfidence: AccountOpeningDraftConfidence;
  isStored: boolean;
  profileId: string;
  profileVersion: string;
  generatedAt: string;
  fields: AccountOpeningDraftField[];
  summary: {
    totalFields: number;
    highConfidenceFields: number;
    reviewRequiredFields: number;
    blockedFields: number;
    safeToAutoFill: boolean;
  };
  safetyNotes: string[];
  riskFlags: AccountOpeningPolicyRiskFlag[];
  signingNotes: string[];
};

export type AccountOpeningDraftSourceEvidenceInput = {
  sourceType: string;
  sourceLabel: string | null;
  safeSnippet: string | null;
  extractionMethod?: string | null;
};

export type AccountOpeningDraftInput = {
  missingInfoResponses: Record<string, string | null | undefined>;
  riskFlags: string[];
  detectedRoles: string[];
  detectedNames: string[];
  missingFields: string[];
  sourceEvidence: AccountOpeningDraftSourceEvidenceInput[];
  profile?: AccountOpeningMasterProfile;
  now?: Date;
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;
const PLACEHOLDER_VALUES = new Set([
  'to be confirmed',
  'to be confirmed in secure review',
]);

function redactSensitiveText(value: string): string {
  return value
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');
}

function safeSnippet(value: string | null | undefined): string | null {
  const redacted = redactSensitiveText(value?.trim() || '');
  if (!redacted) {
    return null;
  }

  return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
}

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = redactSensitiveText(value?.trim() || '');
  return trimmed || null;
}

function isPlaceholder(value: string | null): boolean {
  return value ? PLACEHOLDER_VALUES.has(value.trim().toLowerCase()) : false;
}

function reviewerValue(
  input: AccountOpeningDraftInput,
  key: keyof AccountOpeningDraftInput['missingInfoResponses'],
): string | null {
  return cleanValue(input.missingInfoResponses[key]);
}

function masterEvidence(
  profile: AccountOpeningMasterProfile,
  label: string,
): AccountOpeningDraftEvidence {
  return {
    sourceType: 'MASTER_PROFILE',
    sourceLabel: `${profile.profileId} ${profile.version}`,
    snippet: label,
  };
}

function reviewerEvidence(value: string | null): AccountOpeningDraftEvidence[] {
  return value
    ? [
        {
          sourceType: 'REVIEWER_INPUT',
          sourceLabel: 'Saved missing-info response',
          snippet: safeSnippet(value),
        },
      ]
    : [];
}

function systemEvidence(snippet: string): AccountOpeningDraftEvidence {
  return {
    sourceType: 'SYSTEM_RULE',
    sourceLabel: 'Account-opening safety rule',
    snippet,
  };
}

function extractedEvidence(
  input: AccountOpeningDraftInput,
  pattern: RegExp,
): AccountOpeningDraftEvidence[] {
  return input.sourceEvidence
    .filter((item) => item.safeSnippet && pattern.test(item.safeSnippet))
    .slice(0, 3)
    .map((item) => ({
      sourceType:
        item.sourceType === 'EMAIL_BODY' ? 'EMAIL_BODY' : 'ATTACHMENT_TEXT',
      sourceLabel: item.sourceLabel,
      snippet: safeSnippet(item.safeSnippet),
    }));
}

function baseField(input: {
  key: string;
  supplierLabel: string;
  proposedValue: string | null;
  valueSource: AccountOpeningDraftValueSource;
  evidence: AccountOpeningDraftEvidence[];
  reviewReason?: string | null;
  riskLevel?: AccountOpeningDraftRiskLevel;
  confidence?: AccountOpeningDraftConfidence;
  requiresReview?: boolean;
  policy?: ReturnType<typeof evaluateAccountOpeningAutofillPolicy>;
}): AccountOpeningDraftField {
  const policy =
    input.policy ??
    evaluateAccountOpeningAutofillPolicy({
      fieldKey: input.key,
      fieldLabel: input.supplierLabel,
    });
  const placeholder = isPlaceholder(input.proposedValue);
  const confidence =
    input.confidence ??
    (policy.policyDecision === 'MUST_STAY_BLANK'
      ? 'BLOCKED'
      : policy.policyDecision === 'REVIEW_REQUIRED' || placeholder
      ? 'LOW'
      : 'HIGH');
  const riskLevel =
    input.riskLevel ??
    (policy.policyDecision === 'MUST_STAY_BLANK'
      ? 'BLOCKED'
      : policy.policyDecision === 'REVIEW_REQUIRED' || placeholder
      ? 'MEDIUM'
      : 'LOW');
  const requiresReview =
    input.requiresReview ??
    (policy.policyDecision !== 'AUTOFILL_ALLOWED' || placeholder);

  return {
    key: input.key,
    supplierLabel: input.supplierLabel,
    proposedValue: policy.leaveBlank ? null : input.proposedValue,
    valueSource: policy.leaveBlank ? 'NOT_PROVIDED' : input.valueSource,
    confidence,
    riskLevel,
    fieldClass: policy.fieldClass,
    policyDecision: policy.policyDecision,
    riskCategory: policy.riskCategory,
    policyReason: policy.reason,
    signatoryRoutingNote: policy.defaultSignatoryRoutingNote,
    signingNote: policy.signingNote,
    requiresReview,
    reviewReason:
      input.reviewReason ??
      (policy.policyDecision !== 'AUTOFILL_ALLOWED' ? policy.reason : null) ??
      (placeholder
        ? 'Profile value is a placeholder and must be confirmed before completion.'
        : null),
    evidence: input.evidence,
  };
}

function safeProfileField(
  profile: AccountOpeningMasterProfile,
  key: string,
  supplierLabel: string,
  value: string,
): AccountOpeningDraftField {
  return baseField({
    key,
    supplierLabel,
    proposedValue: cleanValue(value),
    valueSource: isPlaceholder(value)
      ? 'SYSTEM_PLACEHOLDER'
      : 'AMBE_MASTER_PROFILE',
    evidence: [masterEvidence(profile, supplierLabel)],
  });
}

function reviewerOrProfileField(
  input: AccountOpeningDraftInput,
  profile: AccountOpeningMasterProfile,
  key: string,
  supplierLabel: string,
  reviewerKey: keyof AccountOpeningDraftInput['missingInfoResponses'],
  profileValue: string,
): AccountOpeningDraftField {
  const value = reviewerValue(input, reviewerKey);

  if (value) {
    return baseField({
      key,
      supplierLabel,
      proposedValue: value,
      valueSource: 'REVIEWER_RESPONSE',
      confidence: 'HIGH',
      riskLevel: 'LOW',
      requiresReview: false,
      evidence: reviewerEvidence(value),
    });
  }

  return safeProfileField(profile, key, supplierLabel, profileValue);
}

function hasRisk(input: AccountOpeningDraftInput, pattern: RegExp): boolean {
  return [...input.riskFlags, ...input.detectedRoles].some((value) =>
    pattern.test(value),
  );
}

function blockedField(input: {
  key: string;
  supplierLabel: string;
  proposedValue: string | null;
  reviewReason: string;
  evidence: AccountOpeningDraftEvidence[];
}): AccountOpeningDraftField {
  const policy = evaluateAccountOpeningAutofillPolicy({
    fieldKey: input.key,
    fieldLabel: input.supplierLabel,
  });

  return baseField({
    ...input,
    proposedValue: null,
    valueSource: 'NOT_PROVIDED',
    confidence: 'BLOCKED',
    riskLevel: 'BLOCKED',
    requiresReview: true,
    policy,
  });
}

function riskFlagFromField(
  field: AccountOpeningDraftField,
): AccountOpeningPolicyRiskFlag | null {
  if (field.policyDecision === 'AUTOFILL_ALLOWED') {
    return null;
  }

  return {
    fieldKey: field.key,
    supplierLabel: field.supplierLabel,
    fieldClass: field.fieldClass,
    policyDecision: field.policyDecision,
    riskCategory: field.riskCategory,
    reason: field.reviewReason ?? field.policyReason,
    signatoryRoutingNote: field.signatoryRoutingNote,
    signingNote: field.signingNote,
  };
}

export function buildAccountOpeningCompletionDraft(
  input: AccountOpeningDraftInput,
): AccountOpeningCompletionDraft {
  const profile = input.profile ?? getAccountOpeningMasterProfile();
  const values = profile.values;
  const regulatoryEvidence = extractedEvidence(
    input,
    /\b(responsible person|rp|gdp|wda|gphc|cqc)\b/i,
  );
  const directDebitEvidence = extractedEvidence(
    input,
    /\b(direct debit|bank authority|bank mandate)\b/i,
  );
  const guaranteeEvidence = extractedEvidence(
    input,
    /\b(guarantee|indemnity|director[-\s]+only)\b/i,
  );
  const fields: AccountOpeningDraftField[] = [
    safeProfileField(
      profile,
      'legalCompanyName',
      'Legal company name',
      values.legalCompanyName,
    ),
    safeProfileField(
      profile,
      'tradingName',
      'Trading name',
      values.tradingName,
    ),
    safeProfileField(
      profile,
      'companyNumber',
      'Company number',
      values.companyNumber,
    ),
    safeProfileField(profile, 'vatNumber', 'VAT number', values.vatNumber),
    safeProfileField(
      profile,
      'registeredAddress',
      'Registered address',
      values.registeredAddress,
    ),
    safeProfileField(
      profile,
      'tradingAddress',
      'Trading address',
      values.tradingAddress,
    ),
    safeProfileField(
      profile,
      'mainContactName',
      'Main contact name',
      values.mainContactName,
    ),
    safeProfileField(
      profile,
      'mainContactEmail',
      'Main contact email',
      values.mainContactEmail,
    ),
    safeProfileField(
      profile,
      'mainContactPhone',
      'Main contact phone',
      values.mainContactPhone,
    ),
    safeProfileField(
      profile,
      'accountsContact',
      'Accounts contact',
      values.accountsContact,
    ),
    reviewerOrProfileField(
      input,
      profile,
      'website',
      'Website',
      'website',
      values.website,
    ),
    reviewerOrProfileField(
      input,
      profile,
      'businessHours',
      'Business hours',
      'businessHours',
      values.businessHours,
    ),
    safeProfileField(
      profile,
      'companyType',
      'Company type',
      values.companyType,
    ),
    safeProfileField(
      profile,
      'businessDescription',
      'Business description',
      values.businessDescription,
    ),
    reviewerOrProfileField(
      input,
      profile,
      'gphcPremisesNumber',
      'GPhC premises number',
      'gphcPremisesNumber',
      values.gphcPremisesNumber,
    ),
    safeProfileField(
      profile,
      'responsiblePerson',
      'Responsible Person',
      values.responsiblePerson,
    ),
    safeProfileField(
      profile,
      'wholesaleDealerAuthorisation',
      'WDA/GDP licence details',
      values.wholesaleDealerAuthorisation,
    ),
    reviewerOrProfileField(
      input,
      profile,
      'cqcRegistration',
      'CQC registration',
      'cqcRegistration',
      values.cqcRegistration,
    ),
    safeProfileField(
      profile,
      'standardPaymentPreference',
      'Payment preference',
      values.standardPaymentPreference,
    ),
  ];

  const regulatoryDetected = hasRisk(
    input,
    /\b(RP|GDP|WDA|Responsible Person|regulatory)\b/i,
  );
  if (regulatoryDetected) {
    [
      'gphcPremisesNumber',
      'responsiblePerson',
      'wholesaleDealerAuthorisation',
      'cqcRegistration',
    ].forEach((key) => {
      const index = fields.findIndex((field) => field.key === key);
      const existing = fields[index];
      if (index >= 0 && existing) {
        fields[index] = {
          ...existing,
          confidence:
            existing.confidence === 'HIGH' ? 'MEDIUM' : existing.confidence,
          riskLevel: 'HIGH',
          requiresReview: true,
          reviewReason:
            'Regulatory/RP/GDP/WDA wording was detected and these fields require reviewer confirmation.',
          evidence: [
            ...existing.evidence,
            systemEvidence(
              'Regulatory fields are review-required when RP/GDP/WDA wording is detected.',
            ),
            ...regulatoryEvidence,
          ],
        };
      }
    });
  }

  const directDebitReviewerValue = reviewerValue(input, 'directDebitRequested');
  fields.push(
    blockedField({
      key: 'directDebitOrBankAuthority',
      supplierLabel: 'Direct Debit or bank authority',
      proposedValue: directDebitReviewerValue ?? values.directDebitPlaceholder,
      reviewReason:
        'Direct Debit, bank authority, and bank details are blocked from automatic completion and require secure review.',
      evidence: [
        systemEvidence(
          'Never auto-fill Direct Debit, bank authority, sort code, or account number fields.',
        ),
        ...reviewerEvidence(directDebitReviewerValue),
        ...directDebitEvidence,
      ],
    }),
    blockedField({
      key: 'bankDetails',
      supplierLabel: 'Bank details',
      proposedValue: values.bankDetailsPlaceholder,
      reviewReason:
        'Bank account and sort code values must not be exposed in dashboard drafts or SharePoint payloads.',
      evidence: [
        systemEvidence(
          'Sensitive bank fields stay blocked until a secure review flow exists.',
        ),
      ],
    }),
    blockedField({
      key: 'signature',
      supplierLabel: 'Signature',
      proposedValue: null,
      reviewReason:
        'Signing is outside this workflow slice. Leave all signature fields blank until a future explicit approval flow exists.',
      evidence: [
        systemEvidence(
          'Account-opening desk can prepare drafts only; it cannot sign forms.',
        ),
        ...input.detectedNames.map((name) => ({
          sourceType: 'SYSTEM_RULE' as const,
          sourceLabel: 'Detected signer name',
          snippet: safeSnippet(name),
        })),
      ],
    }),
  );

  if (hasRisk(input, /\b(guarantee|indemnity|director)/i)) {
    fields.push(
      blockedField({
        key: 'guaranteeIndemnityDirectorOnly',
        supplierLabel: 'Guarantee, indemnity, or director-only sections',
        proposedValue: null,
        reviewReason:
          'Guarantee, indemnity, and director-only sections are high risk and cannot be auto-filled.',
        evidence: [
          systemEvidence(
            'High-risk legal/signing sections require mandatory reviewer handling.',
          ),
          ...guaranteeEvidence,
        ],
      }),
    );
  }

  const highConfidenceFields = fields.filter(
    (field) => field.confidence === 'HIGH',
  ).length;
  const reviewRequiredFields = fields.filter(
    (field) => field.requiresReview,
  ).length;
  const blockedFields = fields.filter(
    (field) => field.confidence === 'BLOCKED',
  ).length;
  const status =
    blockedFields > 0
      ? 'BLOCKED'
      : reviewRequiredFields > 0
        ? 'REVIEW_REQUIRED'
        : 'READY_FOR_REVIEW';
  const overallConfidence =
    blockedFields > 0 ? 'BLOCKED' : reviewRequiredFields > 0 ? 'LOW' : 'HIGH';
  const riskFlags = fields
    .map(riskFlagFromField)
    .filter((flag): flag is AccountOpeningPolicyRiskFlag => Boolean(flag));
  const signingNotes = Array.from(
    new Set(
      fields
        .flatMap((field) => [field.signatoryRoutingNote, field.signingNote])
        .filter((note): note is string => Boolean(note)),
    ),
  );

  return {
    status,
    overallConfidence,
    isStored: false,
    profileId: profile.profileId,
    profileVersion: profile.version,
    generatedAt: (input.now ?? new Date()).toISOString(),
    fields,
    summary: {
      totalFields: fields.length,
      highConfidenceFields,
      reviewRequiredFields,
      blockedFields,
      safeToAutoFill: false,
    },
    safetyNotes: [
      'This is a structured completion draft only.',
      'Do not sign, send, submit, or complete blocked sections from this draft.',
      'Bank account numbers and sort codes are redacted and must stay in secure review.',
    ],
    riskFlags,
    signingNotes,
  };
}
