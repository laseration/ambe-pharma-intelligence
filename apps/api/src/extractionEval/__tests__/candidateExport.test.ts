import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCorrectionEvalCandidateExport,
  type CorrectionEvalCandidateInputRecord,
} from '../candidateExport';

const RAW_BODY_CANARY = 'RAW_EMAIL_BODY_SHOULD_NOT_EXPORT';
const ATTACHMENT_CANARY = 'ATTACHMENT_CONTENT_SHOULD_NOT_EXPORT';
const NOTE_CANARY = 'OPERATOR_NOTE_SHOULD_NOT_EXPORT';
const TOKEN_CANARY = 'sk-fake-correction-candidate-canary';
const CONNECTION_CANARY =
  'postgresql://user:password@db.example.test/real_database';

function fakeCorrectionRecord(
  overrides: Partial<CorrectionEvalCandidateInputRecord> = {},
): CorrectionEvalCandidateInputRecord {
  return {
    sourceClassification: 'FAKE_DEMO',
    reasonCategory: null,
    correction: {
      id: 'fixture-correction-1',
      emailDerivedOfferId: 'fixture-offer-1',
      offerWorkflowItemId: 'fixture-workflow-1',
      inboundEmailId: 'fixture-inbound-email-1',
      correctionStatus: 'APPLIED',
      correctedSupplierName: 'Fake Demo Supplier Ltd',
      correctedNormalizedProductName: 'demo product 5mg tablet 28',
      correctedStrength: '5mg',
      correctedDosageForm: 'tablet',
      correctedPackSize: '28',
      correctedManufacturer: 'Demo Manufacturer',
      correctedUnitPrice: 8.4,
      correctedCurrencyCode: 'gbp',
      correctedMinimumOrderQuantity: 10,
      correctedAvailability: `Available now ${TOKEN_CANARY}`,
      updatedAt: '2026-06-05T09:00:00.000Z',
      note: NOTE_CANARY,
    } as CorrectionEvalCandidateInputRecord['correction'] & {
      note: string;
    },
    offer: {
      supplierCandidate: 'Original Fake Supplier',
      normalizedProductNameCandidate: 'demo product 5mg tablets',
      strengthCandidate: '5 mg',
      dosageFormCandidate: 'tabs',
      packSizeCandidate: '30',
      manufacturerCandidate: 'Demo Mfr',
      priceCandidate: '8.90',
      currencyCandidate: 'eur',
      minimumOrderQuantityCandidate: 1,
      availabilityCandidate: 'Unknown',
      sourceBlockText: RAW_BODY_CANARY,
      attachmentContent: ATTACHMENT_CANARY,
      databaseUrl: CONNECTION_CANARY,
    } as CorrectionEvalCandidateInputRecord['offer'] & {
      sourceBlockText: string;
      attachmentContent: string;
      databaseUrl: string;
    },
    provenance: {
      sourceSystem: 'fixture-email',
      sourceTemplateFingerprint: 'fixture-template-v1',
      sourceChecksumSha256:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      attachmentChecksumSha256:
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      extractionRunId: 'fixture-extraction-run-1',
      graphPayload: { bodyText: RAW_BODY_CANARY },
    } as CorrectionEvalCandidateInputRecord['provenance'] & {
      graphPayload: { bodyText: string };
    },
    ...overrides,
  };
}

test('correction eval candidate export emits safe candidate shape for fake demo corrections', () => {
  const payload = buildCorrectionEvalCandidateExport([fakeCorrectionRecord()], {
    generatedAt: new Date('2026-06-05T10:00:00.000Z'),
  });

  assert.equal(payload.schemaVersion, 'correction-eval-candidates.v1');
  assert.equal(payload.status, 'candidate');
  assert.equal(payload.sourceClassification, 'FAKE_DEMO_ONLY');
  assert.equal(payload.requiresHumanSanitization, true);
  assert.equal(payload.safety.rawEmailBodiesExported, false);
  assert.equal(payload.safety.attachmentContentsExported, false);
  assert.equal(payload.safety.liveIntegrationsUsed, false);
  assert.equal(payload.safety.notesExported, false);
  assert.equal(payload.candidates.length, 1);
  assert.equal(payload.skipped.length, 0);

  const [candidate] = payload.candidates;
  assert.ok(candidate);
  assert.equal(candidate.status, 'candidate');
  assert.equal(candidate.requiresHumanSanitization, true);
  assert.equal(candidate.reasonCategory, 'supplier_resolution');
  assert.deepEqual(candidate.correctedFieldNames, [
    'supplier',
    'product',
    'strength',
    'dosageForm',
    'packSize',
    'manufacturer',
    'unitPrice',
    'currencyCode',
    'minimumOrderQuantity',
    'availability',
  ]);
  assert.equal(candidate.source.correctionId, 'fixture-correction-1');
  assert.equal(candidate.source.emailDerivedOfferId, 'fixture-offer-1');
  assert.equal(
    candidate.source.sourceChecksumSha256,
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  assert.ok(
    candidate.fieldFacts.some(
      (fact) =>
        fact.fieldName === 'supplier' &&
        fact.valueKind === 'redacted_identity' &&
        fact.before === '[redacted identity present]' &&
        fact.after === '[redacted identity present]',
    ),
  );
  assert.ok(
    candidate.fieldFacts.some(
      (fact) =>
        fact.fieldName === 'unitPrice' &&
        fact.valueKind === 'numeric' &&
        fact.before === 8.9 &&
        fact.after === 8.4,
    ),
  );
});

test('correction eval candidate export omits raw bodies attachments notes and secrets', () => {
  const payload = buildCorrectionEvalCandidateExport([fakeCorrectionRecord()]);
  const serialized = JSON.stringify(payload);

  assert.doesNotMatch(serialized, new RegExp(RAW_BODY_CANARY));
  assert.doesNotMatch(serialized, new RegExp(ATTACHMENT_CANARY));
  assert.doesNotMatch(serialized, new RegExp(NOTE_CANARY));
  assert.doesNotMatch(serialized, new RegExp(TOKEN_CANARY));
  assert.doesNotMatch(serialized, /postgresql:\/\//);
  assert.match(serialized, /\[redacted\]/);
});

test('correction eval candidate export skips non-demo and non-applied records', () => {
  const payload = buildCorrectionEvalCandidateExport([
    {
      sourceClassification: 'FAKE_DEMO',
      correction: null,
    } as unknown as CorrectionEvalCandidateInputRecord,
    fakeCorrectionRecord({
      sourceClassification: 'UNKNOWN',
    }),
    fakeCorrectionRecord({
      correction: {
        ...fakeCorrectionRecord().correction,
        id: 'fixture-correction-2',
        correctionStatus: 'SUPERSEDED',
      },
    }),
  ]);

  assert.equal(payload.candidates.length, 0);
  assert.deepEqual(
    payload.skipped.map((item) => item.reason),
    [
      'Record did not include required correction identifiers.',
      'Record was not explicitly marked FAKE_DEMO.',
      'Only APPLIED corrections can become eval candidates.',
    ],
  );
});
