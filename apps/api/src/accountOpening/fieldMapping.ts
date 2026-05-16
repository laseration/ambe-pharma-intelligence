import { createHash } from 'node:crypto';

import type {
  AccountOpeningCompletionDraft,
  AccountOpeningDraftField,
} from './draft';

export type AccountOpeningFieldMappingStatus =
  | 'UNMAPPED'
  | 'MAPPED_SAFE'
  | 'MAPPED_REVIEW_REQUIRED'
  | 'BLOCKED'
  | 'IGNORED'
  | 'NEEDS_OPERATOR_INPUT';

export type AccountOpeningFieldMappingRiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'BLOCKED';

export type AccountOpeningFieldMappingConfidence =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'BLOCKED';

export type AccountOpeningFieldMappingSourceType =
  | 'DRAFT_FIELD'
  | 'SOURCE_EVIDENCE'
  | 'SYSTEM_RULE'
  | 'OPERATOR_CREATED';

export type AccountOpeningFieldMappingCandidate = {
  id: string;
  supplierFieldLabel: string;
  supplierSectionLabel: string | null;
  normalizedLabel: string;
  sourceType: AccountOpeningFieldMappingSourceType;
  sourceEvidenceId: string | null;
  evidenceSnippet: string | null;
  suggestedDraftFieldKey: string | null;
  mappedDraftFieldKey: string | null;
  proposedValue: string | null;
  valueSource: string | null;
  confidence: AccountOpeningFieldMappingConfidence;
  riskLevel: AccountOpeningFieldMappingRiskLevel;
  status: AccountOpeningFieldMappingStatus;
  requiresReview: boolean;
  blockedReason: string | null;
  reviewReason: string | null;
  operatorNote: string | null;
};

export type AccountOpeningFieldMappingReview = {
  status: 'PREVIEW' | 'SAVED';
  generatedAt: string;
  mappings: AccountOpeningFieldMappingCandidate[];
  summary: {
    totalMappings: number;
    mappedSafe: number;
    reviewRequired: number;
    blocked: number;
    ignored: number;
    unmapped: number;
    needsOperatorInput: number;
    safeToFillSupplierForms: false;
  };
  safetyNotes: string[];
};

export type AccountOpeningFieldMappingSourceEvidenceInput = {
  id: string | null;
  sourceType: string;
  sourceLabel: string | null;
  fileName: string | null;
  safeSnippet: string | null;
};

export type PersistedAccountOpeningFieldMapping = {
  id: string;
  accountOpeningCaseId?: string;
  supplierFieldLabel: string;
  supplierSectionLabel: string | null;
  normalizedLabel: string;
  sourceType: string;
  sourceEvidenceId: string | null;
  evidenceSnippet: string | null;
  suggestedDraftFieldKey: string | null;
  mappedDraftFieldKey: string | null;
  proposedValue: string | null;
  valueSource: string | null;
  confidence: string;
  riskLevel: string;
  status: string;
  requiresReview: boolean;
  blockedReason: string | null;
  reviewReason: string | null;
  operatorNote: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountOpeningFieldMappingSaveInput = {
  id?: string | null;
  supplierFieldLabel: string;
  supplierSectionLabel?: string | null;
  sourceType: AccountOpeningFieldMappingSourceType;
  sourceEvidenceId?: string | null;
  evidenceSnippet?: string | null;
  suggestedDraftFieldKey?: string | null;
  mappedDraftFieldKey?: string | null;
  status?: AccountOpeningFieldMappingStatus | null;
  operatorNote?: string | null;
};

const BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN =
  /\baccount\s*(?:no\.?|number)?\s*\d{8}\b/gi;
const BANK_ACCOUNT_NUMBER_PATTERN = /(^|[^\d])\d{8}(?!\d)/g;
const SORT_CODE_WITH_LABEL_PATTERN =
  /\bsort(?:\s*code)?[-\s]*\d{2}[-\s]?\d{2}[-\s]?\d{2}\b/gi;
const SORT_CODE_PATTERN = /(^|[^\d-])\d{2}-\d{2}-\d{2}(?![\d-])/g;

const STATUS_VALUES = new Set<AccountOpeningFieldMappingStatus>([
  'UNMAPPED',
  'MAPPED_SAFE',
  'MAPPED_REVIEW_REQUIRED',
  'BLOCKED',
  'IGNORED',
  'NEEDS_OPERATOR_INPUT',
]);
const RISK_VALUES = new Set<AccountOpeningFieldMappingRiskLevel>([
  'LOW',
  'MEDIUM',
  'HIGH',
  'BLOCKED',
]);
const CONFIDENCE_VALUES = new Set<AccountOpeningFieldMappingConfidence>([
  'HIGH',
  'MEDIUM',
  'LOW',
  'BLOCKED',
]);
const SOURCE_TYPE_VALUES = new Set<AccountOpeningFieldMappingSourceType>([
  'DRAFT_FIELD',
  'SOURCE_EVIDENCE',
  'SYSTEM_RULE',
  'OPERATOR_CREATED',
]);

const BLOCKED_FIELD_KEY_PATTERN =
  /^(directDebitOrBankAuthority|bankDetails|signature|guaranteeIndemnityDirectorOnly)$/i;
const BLOCKED_LABEL_PATTERN =
  /\b(direct\s*debit|dd\s*mandate|bank\s*(?:authority|mandate|account|details)|sort\s*code|account\s*(?:no\.?|number)|guarantee|indemnity|director[-\s]*(?:only|signature)|signature)\b/i;
const REVIEW_REQUIRED_FIELD_KEY_PATTERN =
  /^(gphcPremisesNumber|responsiblePerson|wholesaleDealerAuthorisation|cqcRegistration)$/i;
const REVIEW_REQUIRED_LABEL_PATTERN =
  /\b(responsible\s*person|rp\b|gdp\b|wda\b|gphc|cqc|credit\s*terms?|returns?\s*polic(?:y|ies)|return\s*obligations?)\b/i;

type SupplierFieldRule = {
  label: string;
  sectionLabel?: string;
  pattern: RegExp;
  draftFieldKey: string | null;
  sourceType?: AccountOpeningFieldMappingSourceType;
};

const SUPPLIER_FIELD_RULES: SupplierFieldRule[] = [
  {
    label: 'Company Name',
    pattern: /\b(company|legal)\s+name\b/i,
    draftFieldKey: 'legalCompanyName',
  },
  {
    label: 'Trading Name',
    pattern: /\btrading\s+name\b/i,
    draftFieldKey: 'tradingName',
  },
  {
    label: 'Company Number',
    pattern: /\b(company|registration)\s+(?:no\.?|number)\b/i,
    draftFieldKey: 'companyNumber',
  },
  {
    label: 'VAT Number',
    pattern: /\bvat\s+(?:no\.?|number|registration)\b/i,
    draftFieldKey: 'vatNumber',
  },
  {
    label: 'Registered Address',
    pattern: /\bregistered\s+address\b/i,
    draftFieldKey: 'registeredAddress',
  },
  {
    label: 'Trading Address',
    pattern: /\b(trading|delivery|premises)\s+address\b/i,
    draftFieldKey: 'tradingAddress',
  },
  {
    label: 'Contact Name',
    pattern: /\b(main\s+)?contact\s+name\b/i,
    draftFieldKey: 'mainContactName',
  },
  {
    label: 'Contact Email',
    pattern: /\b(contact|email)\s+(?:email|address)\b/i,
    draftFieldKey: 'mainContactEmail',
  },
  {
    label: 'Contact Phone',
    pattern: /\b(contact|telephone|phone)\s+(?:number|phone|telephone)\b/i,
    draftFieldKey: 'mainContactPhone',
  },
  {
    label: 'Accounts Contact',
    pattern: /\baccounts?\s+contact\b/i,
    draftFieldKey: 'accountsContact',
  },
  {
    label: 'Website',
    pattern: /\bwebsite\b|\bweb\s+site\b/i,
    draftFieldKey: 'website',
  },
  {
    label: 'Business Hours',
    pattern: /\bbusiness\s+hours\b|\bopening\s+hours\b/i,
    draftFieldKey: 'businessHours',
  },
  {
    label: 'Company Type',
    pattern: /\b(company|business)\s+type\b/i,
    draftFieldKey: 'companyType',
  },
  {
    label: 'Business Description',
    pattern: /\bbusiness\s+(?:description|activity|activities)\b/i,
    draftFieldKey: 'businessDescription',
  },
  {
    label: 'GPhC Premises Number',
    pattern: /\bgphc\b/i,
    draftFieldKey: 'gphcPremisesNumber',
  },
  {
    label: 'Responsible Person',
    pattern: /\bresponsible\s+person\b|\brp\b/i,
    draftFieldKey: 'responsiblePerson',
  },
  {
    label: 'WDA / GDP Declaration',
    pattern: /\bwda\b|\bgdp\b|\bwholesale\s+dealer\b/i,
    draftFieldKey: 'wholesaleDealerAuthorisation',
  },
  {
    label: 'CQC Registration',
    pattern: /\bcqc\b/i,
    draftFieldKey: 'cqcRegistration',
  },
  {
    label: 'Payment Preference',
    pattern: /\bpayment\s+(?:preference|terms|method)\b/i,
    draftFieldKey: 'standardPaymentPreference',
  },
  {
    label: 'Direct Debit Mandate',
    sectionLabel: 'Payment',
    pattern: /\bdirect\s+debit\b|\bdd\s+mandate\b/i,
    draftFieldKey: 'directDebitOrBankAuthority',
  },
  {
    label: 'Bank Authority',
    sectionLabel: 'Payment',
    pattern: /\bbank\s+(?:authority|mandate)\b/i,
    draftFieldKey: 'directDebitOrBankAuthority',
  },
  {
    label: 'Bank Account Number',
    sectionLabel: 'Payment',
    pattern: /\bbank\s+account\b|\baccount\s*(?:no\.?|number)\b/i,
    draftFieldKey: 'bankDetails',
  },
  {
    label: 'Sort Code',
    sectionLabel: 'Payment',
    pattern: /\bsort\s*code\b/i,
    draftFieldKey: 'bankDetails',
  },
  {
    label: 'Director Signature',
    sectionLabel: 'Signing',
    pattern: /\bdirector[-\s]*(?:only|signature)\b/i,
    draftFieldKey: 'signature',
  },
  {
    label: 'Personal Guarantee',
    sectionLabel: 'Legal',
    pattern: /\bpersonal\s+guarantee\b|\bdirector(?:s?'?)?\s+guarantee\b/i,
    draftFieldKey: 'guaranteeIndemnityDirectorOnly',
  },
  {
    label: 'Indemnity',
    sectionLabel: 'Legal',
    pattern: /\bindemnity\b|\bindemnif(?:y|ication)\b/i,
    draftFieldKey: 'guaranteeIndemnityDirectorOnly',
  },
  {
    label: 'Credit Terms',
    sectionLabel: 'Commercial',
    pattern: /\bcredit\s+terms?\b|\bcredit\s+account\b/i,
    draftFieldKey: 'standardPaymentPreference',
  },
  {
    label: 'Returns Policy Acceptance',
    sectionLabel: 'Commercial',
    pattern: /\breturns?\s+polic(?:y|ies)\b|\breturn\s+obligations?\b/i,
    draftFieldKey: null,
  },
];

function sanitizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const redacted = trimmed
    .replace(
      BANK_ACCOUNT_NUMBER_WITH_LABEL_PATTERN,
      '[redacted bank account number]',
    )
    .replace(BANK_ACCOUNT_NUMBER_PATTERN, '$1[redacted bank account number]')
    .replace(SORT_CODE_WITH_LABEL_PATTERN, '[redacted sort code]')
    .replace(SORT_CODE_PATTERN, '$1[redacted sort code]');

  return redacted || null;
}

function safeSnippet(value: string | null | undefined): string | null {
  const sanitized = sanitizeText(value);
  if (!sanitized) {
    return null;
  }

  return sanitized.length > 240 ? `${sanitized.slice(0, 237)}...` : sanitized;
}

export function normalizeAccountOpeningSupplierFieldLabel(
  value: string | null | undefined,
): string {
  return (
    sanitizeText(value)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ') ?? ''
  );
}

function hashId(parts: Array<string | null | undefined>): string {
  const hash = createHash('sha256')
    .update(parts.map((part) => part ?? '').join('|'))
    .digest('hex')
    .slice(0, 16);

  return hash;
}

function toStatus(value: string): AccountOpeningFieldMappingStatus {
  return STATUS_VALUES.has(value as AccountOpeningFieldMappingStatus)
    ? (value as AccountOpeningFieldMappingStatus)
    : 'NEEDS_OPERATOR_INPUT';
}

function toRiskLevel(value: string): AccountOpeningFieldMappingRiskLevel {
  return RISK_VALUES.has(value as AccountOpeningFieldMappingRiskLevel)
    ? (value as AccountOpeningFieldMappingRiskLevel)
    : 'MEDIUM';
}

function toConfidence(value: string): AccountOpeningFieldMappingConfidence {
  return CONFIDENCE_VALUES.has(value as AccountOpeningFieldMappingConfidence)
    ? (value as AccountOpeningFieldMappingConfidence)
    : 'LOW';
}

function toSourceType(value: string): AccountOpeningFieldMappingSourceType {
  return SOURCE_TYPE_VALUES.has(value as AccountOpeningFieldMappingSourceType)
    ? (value as AccountOpeningFieldMappingSourceType)
    : 'OPERATOR_CREATED';
}

function draftFieldMap(
  draft: AccountOpeningCompletionDraft,
): Map<string, AccountOpeningDraftField> {
  return new Map(draft.fields.map((field) => [field.key, field]));
}

function hasBlockedRisk(label: string, mappedDraftFieldKey: string | null) {
  return (
    (mappedDraftFieldKey
      ? BLOCKED_FIELD_KEY_PATTERN.test(mappedDraftFieldKey)
      : false) || BLOCKED_LABEL_PATTERN.test(label)
  );
}

function hasReviewRisk(label: string, mappedDraftFieldKey: string | null) {
  return (
    (mappedDraftFieldKey
      ? REVIEW_REQUIRED_FIELD_KEY_PATTERN.test(mappedDraftFieldKey)
      : false) || REVIEW_REQUIRED_LABEL_PATTERN.test(label)
  );
}

function proposedValueForField(
  draftField: AccountOpeningDraftField | null,
  status: AccountOpeningFieldMappingStatus,
) {
  if (!draftField || status === 'IGNORED') {
    return null;
  }

  return sanitizeText(draftField.proposedValue) ?? null;
}

function classifyMapping(input: {
  supplierFieldLabel: string;
  mappedDraftFieldKey: string | null;
  draftField: AccountOpeningDraftField | null;
  requestedStatus?: AccountOpeningFieldMappingStatus | null;
}): {
  status: AccountOpeningFieldMappingStatus;
  confidence: AccountOpeningFieldMappingConfidence;
  riskLevel: AccountOpeningFieldMappingRiskLevel;
  requiresReview: boolean;
  blockedReason: string | null;
  reviewReason: string | null;
} {
  const label = input.supplierFieldLabel;
  const blocked = hasBlockedRisk(label, input.mappedDraftFieldKey);
  const reviewRequired = hasReviewRisk(label, input.mappedDraftFieldKey);

  if (input.requestedStatus === 'IGNORED') {
    return {
      status: 'IGNORED',
      confidence: blocked ? 'BLOCKED' : 'MEDIUM',
      riskLevel: blocked ? 'BLOCKED' : reviewRequired ? 'HIGH' : 'LOW',
      requiresReview: false,
      blockedReason: blocked
        ? 'Supplier field is intentionally ignored and must not be filled.'
        : null,
      reviewReason: reviewRequired
        ? 'Supplier field was intentionally ignored after review.'
        : null,
    };
  }

  if (input.requestedStatus === 'BLOCKED' || blocked) {
    return {
      status: 'BLOCKED',
      confidence: 'BLOCKED',
      riskLevel: 'BLOCKED',
      requiresReview: true,
      blockedReason:
        'This supplier field is blocked from mapping because it concerns signing, Direct Debit, bank authority, bank details, guarantee, indemnity, or director-only risk.',
      reviewReason:
        'Do not fill this supplier field in any PDF/Word form. It needs a separate secure human process.',
    };
  }

  if (!input.mappedDraftFieldKey) {
    return {
      status:
        input.requestedStatus === 'NEEDS_OPERATOR_INPUT'
          ? 'NEEDS_OPERATOR_INPUT'
          : 'UNMAPPED',
      confidence: 'LOW',
      riskLevel: reviewRequired ? 'HIGH' : 'MEDIUM',
      requiresReview: true,
      blockedReason: null,
      reviewReason:
        'No AMBE completion draft field has been confirmed for this supplier field.',
    };
  }

  if (reviewRequired || input.draftField?.requiresReview) {
    return {
      status: 'MAPPED_REVIEW_REQUIRED',
      confidence:
        input.draftField?.confidence === 'BLOCKED'
          ? 'BLOCKED'
          : input.draftField?.confidence === 'LOW'
            ? 'LOW'
            : 'MEDIUM',
      riskLevel:
        input.draftField?.riskLevel === 'BLOCKED'
          ? 'BLOCKED'
          : reviewRequired
            ? 'HIGH'
            : (input.draftField?.riskLevel ?? 'MEDIUM'),
      requiresReview: true,
      blockedReason: null,
      reviewReason:
        input.draftField?.reviewReason ??
        'This mapping must be checked by an operator before any future form completion work.',
    };
  }

  if (
    input.requestedStatus === 'NEEDS_OPERATOR_INPUT' ||
    input.requestedStatus === 'UNMAPPED'
  ) {
    return {
      status: input.requestedStatus,
      confidence: 'LOW',
      riskLevel: 'MEDIUM',
      requiresReview: true,
      blockedReason: null,
      reviewReason:
        'Operator has not accepted this mapping for future form completion work.',
    };
  }

  return {
    status: 'MAPPED_SAFE',
    confidence: input.draftField?.confidence ?? 'HIGH',
    riskLevel: input.draftField?.riskLevel ?? 'LOW',
    requiresReview: false,
    blockedReason: null,
    reviewReason: null,
  };
}

function buildCandidate(input: {
  idPrefix: string;
  supplierFieldLabel: string;
  supplierSectionLabel?: string | null;
  sourceType: AccountOpeningFieldMappingSourceType;
  sourceEvidenceId?: string | null;
  evidenceSnippet?: string | null;
  suggestedDraftFieldKey?: string | null;
  mappedDraftFieldKey?: string | null;
  requestedStatus?: AccountOpeningFieldMappingStatus | null;
  operatorNote?: string | null;
  draftFields: Map<string, AccountOpeningDraftField>;
}): AccountOpeningFieldMappingCandidate {
  const supplierFieldLabel =
    sanitizeText(input.supplierFieldLabel) ?? 'Unlabelled supplier field';
  const supplierSectionLabel = sanitizeText(input.supplierSectionLabel) ?? null;
  const mappedDraftFieldKey =
    sanitizeText(input.mappedDraftFieldKey) ??
    sanitizeText(input.suggestedDraftFieldKey) ??
    null;
  const draftField = mappedDraftFieldKey
    ? (input.draftFields.get(mappedDraftFieldKey) ?? null)
    : null;
  const classification = classifyMapping({
    supplierFieldLabel,
    mappedDraftFieldKey,
    draftField,
    requestedStatus: input.requestedStatus,
  });
  const normalizedLabel =
    normalizeAccountOpeningSupplierFieldLabel(supplierFieldLabel) ||
    `field ${hashId([supplierFieldLabel])}`;
  const id = `${input.idPrefix}:${hashId([
    supplierFieldLabel,
    input.sourceType,
    input.sourceEvidenceId,
    mappedDraftFieldKey,
  ])}`;

  return {
    id,
    supplierFieldLabel,
    supplierSectionLabel,
    normalizedLabel,
    sourceType: input.sourceType,
    sourceEvidenceId: sanitizeText(input.sourceEvidenceId) ?? null,
    evidenceSnippet: safeSnippet(input.evidenceSnippet),
    suggestedDraftFieldKey: sanitizeText(input.suggestedDraftFieldKey) ?? null,
    mappedDraftFieldKey,
    proposedValue: proposedValueForField(draftField, classification.status),
    valueSource:
      draftField && classification.status !== 'IGNORED'
        ? draftField.valueSource
        : null,
    ...classification,
    operatorNote: safeSnippet(input.operatorNote),
  };
}

function generatedDraftFieldCandidates(
  draft: AccountOpeningCompletionDraft,
): AccountOpeningFieldMappingCandidate[] {
  const fields = draftFieldMap(draft);

  return draft.fields.map((field) =>
    buildCandidate({
      idPrefix: 'draft',
      supplierFieldLabel: field.supplierLabel,
      sourceType: 'DRAFT_FIELD',
      suggestedDraftFieldKey: field.key,
      mappedDraftFieldKey: field.key,
      evidenceSnippet:
        field.evidence
          .map((item) => item.snippet)
          .filter((item): item is string => Boolean(item))
          .join(' | ') || null,
      draftFields: fields,
    }),
  );
}

function generatedEvidenceCandidates(input: {
  draft: AccountOpeningCompletionDraft;
  sourceEvidence: AccountOpeningFieldMappingSourceEvidenceInput[];
}): AccountOpeningFieldMappingCandidate[] {
  const fields = draftFieldMap(input.draft);
  const candidates: AccountOpeningFieldMappingCandidate[] = [];
  const seen = new Set<string>();

  for (const evidence of input.sourceEvidence) {
    const searchableText = [
      evidence.sourceLabel,
      evidence.fileName,
      evidence.safeSnippet,
    ]
      .filter((item): item is string => Boolean(item))
      .join('\n');

    for (const rule of SUPPLIER_FIELD_RULES) {
      if (!rule.pattern.test(searchableText)) {
        continue;
      }

      const key = `${evidence.id ?? evidence.sourceLabel ?? evidence.fileName ?? 'evidence'}:${rule.label}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      candidates.push(
        buildCandidate({
          idPrefix: 'evidence',
          supplierFieldLabel: rule.label,
          supplierSectionLabel: rule.sectionLabel ?? null,
          sourceType: rule.sourceType ?? 'SOURCE_EVIDENCE',
          sourceEvidenceId: evidence.id,
          evidenceSnippet: evidence.safeSnippet,
          suggestedDraftFieldKey: rule.draftFieldKey,
          mappedDraftFieldKey: rule.draftFieldKey,
          draftFields: fields,
        }),
      );
    }
  }

  return candidates;
}

function candidateFromPersisted(
  mapping: PersistedAccountOpeningFieldMapping,
  draft: AccountOpeningCompletionDraft,
): AccountOpeningFieldMappingCandidate {
  const fields = draftFieldMap(draft);
  const candidate = buildCandidate({
    idPrefix: 'saved',
    supplierFieldLabel: mapping.supplierFieldLabel,
    supplierSectionLabel: mapping.supplierSectionLabel,
    sourceType: toSourceType(mapping.sourceType),
    sourceEvidenceId: mapping.sourceEvidenceId,
    evidenceSnippet: mapping.evidenceSnippet,
    suggestedDraftFieldKey: mapping.suggestedDraftFieldKey,
    mappedDraftFieldKey: mapping.mappedDraftFieldKey,
    requestedStatus: toStatus(mapping.status),
    operatorNote: mapping.operatorNote,
    draftFields: fields,
  });

  return {
    ...candidate,
    id: mapping.id,
    confidence:
      candidate.status === 'BLOCKED'
        ? 'BLOCKED'
        : toConfidence(mapping.confidence),
    riskLevel:
      candidate.status === 'BLOCKED'
        ? 'BLOCKED'
        : toRiskLevel(mapping.riskLevel),
    blockedReason:
      candidate.blockedReason ?? sanitizeText(mapping.blockedReason),
    reviewReason: candidate.reviewReason ?? sanitizeText(mapping.reviewReason),
  };
}

function mappingKey(mapping: {
  normalizedLabel: string;
  sourceType: string;
  sourceEvidenceId: string | null;
  suggestedDraftFieldKey: string | null;
}) {
  return [
    mapping.normalizedLabel,
    mapping.sourceType,
    mapping.sourceEvidenceId ?? '',
    mapping.suggestedDraftFieldKey ?? '',
  ].join('|');
}

function mergePersistedMappings(input: {
  generated: AccountOpeningFieldMappingCandidate[];
  persisted: PersistedAccountOpeningFieldMapping[];
  draft: AccountOpeningCompletionDraft;
}): AccountOpeningFieldMappingCandidate[] {
  if (input.persisted.length === 0) {
    return input.generated;
  }

  const savedCandidates = input.persisted
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((mapping) => candidateFromPersisted(mapping, input.draft));
  const savedKeys = new Set(savedCandidates.map(mappingKey));
  const newGenerated = input.generated.filter(
    (candidate) => !savedKeys.has(mappingKey(candidate)),
  );

  return [...savedCandidates, ...newGenerated];
}

export function buildAccountOpeningFieldMappingCandidateForSave(input: {
  mapping: AccountOpeningFieldMappingSaveInput;
  completionDraft: AccountOpeningCompletionDraft;
  sourceEvidence: AccountOpeningFieldMappingSourceEvidenceInput[];
}): AccountOpeningFieldMappingCandidate {
  const fields = draftFieldMap(input.completionDraft);
  const sourceEvidence = input.mapping.sourceEvidenceId
    ? input.sourceEvidence.find(
        (item) => item.id === input.mapping.sourceEvidenceId,
      )
    : null;

  return buildCandidate({
    idPrefix: input.mapping.id ? 'saved' : 'operator',
    supplierFieldLabel: input.mapping.supplierFieldLabel,
    supplierSectionLabel: input.mapping.supplierSectionLabel,
    sourceType: input.mapping.sourceType,
    sourceEvidenceId: sourceEvidence ? input.mapping.sourceEvidenceId : null,
    evidenceSnippet:
      input.mapping.evidenceSnippet ?? sourceEvidence?.safeSnippet ?? null,
    suggestedDraftFieldKey: input.mapping.suggestedDraftFieldKey,
    mappedDraftFieldKey: input.mapping.mappedDraftFieldKey,
    requestedStatus: input.mapping.status ?? null,
    operatorNote: input.mapping.operatorNote,
    draftFields: fields,
  });
}

export function buildAccountOpeningFieldMappingReview(input: {
  completionDraft: AccountOpeningCompletionDraft;
  sourceEvidence: AccountOpeningFieldMappingSourceEvidenceInput[];
  persistedMappings?: PersistedAccountOpeningFieldMapping[];
  now?: Date;
}): AccountOpeningFieldMappingReview {
  const generated = [
    ...generatedDraftFieldCandidates(input.completionDraft),
    ...generatedEvidenceCandidates({
      draft: input.completionDraft,
      sourceEvidence: input.sourceEvidence,
    }),
  ];
  const mappings = mergePersistedMappings({
    generated,
    persisted: input.persistedMappings ?? [],
    draft: input.completionDraft,
  });
  const reviewRequired = mappings.filter(
    (mapping) => mapping.requiresReview && mapping.status !== 'BLOCKED',
  ).length;
  const blocked = mappings.filter(
    (mapping) =>
      mapping.status === 'BLOCKED' ||
      mapping.riskLevel === 'BLOCKED' ||
      mapping.confidence === 'BLOCKED',
  ).length;

  return {
    status: input.persistedMappings?.length ? 'SAVED' : 'PREVIEW',
    generatedAt: (input.now ?? new Date()).toISOString(),
    mappings,
    summary: {
      totalMappings: mappings.length,
      mappedSafe: mappings.filter((mapping) => mapping.status === 'MAPPED_SAFE')
        .length,
      reviewRequired,
      blocked,
      ignored: mappings.filter((mapping) => mapping.status === 'IGNORED')
        .length,
      unmapped: mappings.filter((mapping) => mapping.status === 'UNMAPPED')
        .length,
      needsOperatorInput: mappings.filter(
        (mapping) => mapping.status === 'NEEDS_OPERATOR_INPUT',
      ).length,
      safeToFillSupplierForms: false,
    },
    safetyNotes: [
      'Field mappings are internal review controls only.',
      'This does not fill PDF/Word supplier forms.',
      'This does not sign, send, submit, or trigger purchase/order/buy workflows.',
      'Direct Debit, bank authority, bank details, signature, guarantee, indemnity, and director-only fields stay blocked.',
      'RP/GDP/WDA, credit terms, and returns obligations require human review.',
    ],
  };
}
