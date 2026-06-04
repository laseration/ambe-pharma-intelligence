import { createHash } from 'node:crypto';

import { redactSafeOutputString } from '../safety/redaction';

export type CorrectionEvalCandidateFieldName =
  | 'supplier'
  | 'product'
  | 'strength'
  | 'dosageForm'
  | 'packSize'
  | 'manufacturer'
  | 'unitPrice'
  | 'currencyCode'
  | 'minimumOrderQuantity'
  | 'availability';

export type CorrectionEvalCandidateReasonCategory =
  | 'supplier_resolution'
  | 'product_normalization'
  | 'commercial_terms'
  | 'availability'
  | 'field_correction';

export type CorrectionEvalCandidateCorrection = {
  id: string;
  emailDerivedOfferId: string;
  offerWorkflowItemId?: string | null;
  inboundEmailId?: string | null;
  correctionStatus: string;
  correctedSupplierName?: string | null;
  correctedRawProductText?: string | null;
  correctedNormalizedProductName?: string | null;
  correctedStrength?: string | null;
  correctedDosageForm?: string | null;
  correctedPackSize?: string | null;
  correctedManufacturer?: string | null;
  correctedUnitPrice?: number | string | null;
  correctedCurrencyCode?: string | null;
  correctedMinimumOrderQuantity?: number | null;
  correctedAvailability?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type CorrectionEvalCandidateOfferSnapshot = {
  supplierCandidate?: string | null;
  rawProductText?: string | null;
  normalizedProductNameCandidate?: string | null;
  strengthCandidate?: string | null;
  dosageFormCandidate?: string | null;
  packSizeCandidate?: string | null;
  manufacturerCandidate?: string | null;
  priceCandidate?: number | string | null;
  currencyCandidate?: string | null;
  minimumOrderQuantityCandidate?: number | null;
  availabilityCandidate?: string | null;
};

export type CorrectionEvalCandidateProvenanceInput = {
  sourceSystem?: string | null;
  sourceTemplateFingerprint?: string | null;
  sourceChecksumSha256?: string | null;
  attachmentChecksumSha256?: string | null;
  documentChecksumSha256?: string | null;
  extractionRunId?: string | null;
};

export type CorrectionEvalCandidateInputRecord = {
  sourceClassification: 'FAKE_DEMO' | string;
  reasonCategory?: CorrectionEvalCandidateReasonCategory | string | null;
  correction: CorrectionEvalCandidateCorrection;
  offer?: CorrectionEvalCandidateOfferSnapshot | null;
  provenance?: CorrectionEvalCandidateProvenanceInput | null;
};

export type CorrectionEvalCandidateFieldFact = {
  fieldName: CorrectionEvalCandidateFieldName;
  before: string | number | null;
  after: string | number | null;
  valueKind: 'safe_normalized_value' | 'numeric' | 'redacted_identity';
};

export type CorrectionEvalCandidate = {
  candidateId: string;
  status: 'candidate';
  requiresHumanSanitization: true;
  reasonCategory: CorrectionEvalCandidateReasonCategory;
  source: {
    correctionId: string;
    emailDerivedOfferId: string;
    offerWorkflowItemId: string | null;
    inboundEmailId: string | null;
    correctionUpdatedAt: string | null;
    sourceSystem: string | null;
    sourceTemplateFingerprint: string | null;
    sourceChecksumSha256: string | null;
    attachmentChecksumSha256: string | null;
    documentChecksumSha256: string | null;
    extractionRunId: string | null;
  };
  correctedFieldNames: CorrectionEvalCandidateFieldName[];
  fieldFacts: CorrectionEvalCandidateFieldFact[];
};

export type CorrectionEvalCandidateExport = {
  schemaVersion: 'correction-eval-candidates.v1';
  status: 'candidate';
  generatedAt: string;
  sourceClassification: 'FAKE_DEMO_ONLY';
  requiresHumanSanitization: true;
  safety: {
    rawEmailBodiesExported: false;
    attachmentContentsExported: false;
    fullPersonalDataExported: false;
    liveIntegrationsUsed: false;
    notesExported: false;
    fixtureCommitAllowedWithoutReview: false;
  };
  candidates: CorrectionEvalCandidate[];
  skipped: Array<{
    correctionId: string | null;
    reason: string;
  }>;
};

const SAFE_TEXT_MAX_LENGTH = 160;
const HEX_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableCandidateId(input: CorrectionEvalCandidateCorrection): string {
  return `correction-eval-candidate-${hashValue(
    [
      input.id,
      input.emailDerivedOfferId,
      input.offerWorkflowItemId ?? '',
      input.inboundEmailId ?? '',
      dateString(input.updatedAt) ?? '',
    ].join('|'),
  ).slice(0, 16)}`;
}

function dateString(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function safeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return redactSafeOutputString(trimmed).slice(0, SAFE_TEXT_MAX_LENGTH);
}

function normalizedCode(value: string | null | undefined): string | null {
  return safeText(value)?.toUpperCase() ?? null;
}

function safeNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeChecksum(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && HEX_SHA256_PATTERN.test(trimmed)
    ? trimmed.toLowerCase()
    : null;
}

function fieldFact(
  fieldName: CorrectionEvalCandidateFieldName,
  before: string | number | null | undefined,
  after: string | number | null | undefined,
  valueKind: CorrectionEvalCandidateFieldFact['valueKind'],
): CorrectionEvalCandidateFieldFact | null {
  const safeBefore =
    typeof before === 'string'
      ? safeText(before)
      : typeof before === 'number'
        ? before
        : null;
  const safeAfter =
    typeof after === 'string'
      ? safeText(after)
      : typeof after === 'number'
        ? after
        : null;

  if (safeAfter === null && safeBefore === null) {
    return null;
  }

  if (safeAfter === safeBefore) {
    return null;
  }

  return {
    fieldName,
    before: safeBefore,
    after: safeAfter,
    valueKind,
  };
}

function identityFieldFact(
  fieldName: CorrectionEvalCandidateFieldName,
  before: string | null | undefined,
  after: string | null | undefined,
): CorrectionEvalCandidateFieldFact | null {
  if (!before && !after) {
    return null;
  }

  if (before === after) {
    return null;
  }

  return {
    fieldName,
    before: before ? '[redacted identity present]' : null,
    after: after ? '[redacted identity present]' : null,
    valueKind: 'redacted_identity',
  };
}

function buildFieldFacts(
  input: CorrectionEvalCandidateInputRecord,
): CorrectionEvalCandidateFieldFact[] {
  const correction = input.correction;
  const offer = input.offer ?? {};
  const facts = [
    identityFieldFact(
      'supplier',
      offer.supplierCandidate,
      correction.correctedSupplierName,
    ),
    fieldFact(
      'product',
      offer.normalizedProductNameCandidate ?? offer.rawProductText,
      correction.correctedNormalizedProductName ??
        correction.correctedRawProductText,
      'safe_normalized_value',
    ),
    fieldFact(
      'strength',
      offer.strengthCandidate,
      correction.correctedStrength,
      'safe_normalized_value',
    ),
    fieldFact(
      'dosageForm',
      offer.dosageFormCandidate,
      correction.correctedDosageForm,
      'safe_normalized_value',
    ),
    fieldFact(
      'packSize',
      offer.packSizeCandidate,
      correction.correctedPackSize,
      'safe_normalized_value',
    ),
    fieldFact(
      'manufacturer',
      offer.manufacturerCandidate,
      correction.correctedManufacturer,
      'safe_normalized_value',
    ),
    fieldFact(
      'unitPrice',
      safeNumber(offer.priceCandidate),
      safeNumber(correction.correctedUnitPrice),
      'numeric',
    ),
    fieldFact(
      'currencyCode',
      normalizedCode(offer.currencyCandidate),
      normalizedCode(correction.correctedCurrencyCode),
      'safe_normalized_value',
    ),
    fieldFact(
      'minimumOrderQuantity',
      offer.minimumOrderQuantityCandidate ?? null,
      correction.correctedMinimumOrderQuantity ?? null,
      'numeric',
    ),
    fieldFact(
      'availability',
      offer.availabilityCandidate,
      correction.correctedAvailability,
      'safe_normalized_value',
    ),
  ];

  return facts.filter(
    (fact): fact is CorrectionEvalCandidateFieldFact => fact !== null,
  );
}

function reasonCategory(
  input: CorrectionEvalCandidateInputRecord,
  fields: CorrectionEvalCandidateFieldName[],
): CorrectionEvalCandidateReasonCategory {
  const explicit = input.reasonCategory;
  if (
    explicit === 'supplier_resolution' ||
    explicit === 'product_normalization' ||
    explicit === 'commercial_terms' ||
    explicit === 'availability' ||
    explicit === 'field_correction'
  ) {
    return explicit;
  }

  if (fields.includes('supplier')) {
    return 'supplier_resolution';
  }

  if (
    fields.some((field) =>
      [
        'product',
        'strength',
        'dosageForm',
        'packSize',
        'manufacturer',
      ].includes(field),
    )
  ) {
    return 'product_normalization';
  }

  if (
    fields.some((field) =>
      ['unitPrice', 'currencyCode', 'minimumOrderQuantity'].includes(field),
    )
  ) {
    return 'commercial_terms';
  }

  if (fields.includes('availability')) {
    return 'availability';
  }

  return 'field_correction';
}

export function buildCorrectionEvalCandidateExport(
  records: CorrectionEvalCandidateInputRecord[],
  options: { generatedAt?: Date } = {},
): CorrectionEvalCandidateExport {
  const generatedAt = (options.generatedAt ?? new Date()).toISOString();
  const candidates: CorrectionEvalCandidate[] = [];
  const skipped: CorrectionEvalCandidateExport['skipped'] = [];

  for (const record of records) {
    const correctionId = safeText(record.correction?.id) ?? null;
    if (!record.correction?.id || !record.correction.emailDerivedOfferId) {
      skipped.push({
        correctionId,
        reason: 'Record did not include required correction identifiers.',
      });
      continue;
    }

    if (record.sourceClassification !== 'FAKE_DEMO') {
      skipped.push({
        correctionId,
        reason: 'Record was not explicitly marked FAKE_DEMO.',
      });
      continue;
    }

    if (record.correction.correctionStatus !== 'APPLIED') {
      skipped.push({
        correctionId,
        reason: 'Only APPLIED corrections can become eval candidates.',
      });
      continue;
    }

    const fieldFacts = buildFieldFacts(record);
    if (fieldFacts.length === 0) {
      skipped.push({
        correctionId,
        reason: 'No changed safe field facts were present.',
      });
      continue;
    }

    const correctedFieldNames = fieldFacts.map((fact) => fact.fieldName);
    const provenance = record.provenance ?? {};
    const correction = record.correction;
    candidates.push({
      candidateId: stableCandidateId(correction),
      status: 'candidate',
      requiresHumanSanitization: true,
      reasonCategory: reasonCategory(record, correctedFieldNames),
      source: {
        correctionId: safeText(correction.id) ?? 'unknown-correction',
        emailDerivedOfferId:
          safeText(correction.emailDerivedOfferId) ?? 'unknown-offer',
        offerWorkflowItemId: safeText(correction.offerWorkflowItemId),
        inboundEmailId: safeText(correction.inboundEmailId),
        correctionUpdatedAt: dateString(correction.updatedAt),
        sourceSystem: safeText(provenance.sourceSystem),
        sourceTemplateFingerprint: safeText(
          provenance.sourceTemplateFingerprint,
        ),
        sourceChecksumSha256: safeChecksum(provenance.sourceChecksumSha256),
        attachmentChecksumSha256: safeChecksum(
          provenance.attachmentChecksumSha256,
        ),
        documentChecksumSha256: safeChecksum(provenance.documentChecksumSha256),
        extractionRunId: safeText(provenance.extractionRunId),
      },
      correctedFieldNames,
      fieldFacts,
    });
  }

  return {
    schemaVersion: 'correction-eval-candidates.v1',
    status: 'candidate',
    generatedAt,
    sourceClassification: 'FAKE_DEMO_ONLY',
    requiresHumanSanitization: true,
    safety: {
      rawEmailBodiesExported: false,
      attachmentContentsExported: false,
      fullPersonalDataExported: false,
      liveIntegrationsUsed: false,
      notesExported: false,
      fixtureCommitAllowedWithoutReview: false,
    },
    candidates,
    skipped,
  };
}
