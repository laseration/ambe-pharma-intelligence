import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccountOpeningCompletionDraft } from '../draft';

test('completion draft uses master profile and reviewer responses while blocking sensitive sections', () => {
  const draft = buildAccountOpeningCompletionDraft({
    missingInfoResponses: {
      website: 'https://ambe.example',
      businessHours: '9am to 5pm',
      directDebitRequested:
        'Supplier asks for DD mandate with account number 12345678 sort code 12-34-56.',
    },
    riskFlags: ['Direct Debit mandate', 'Personal guarantee'],
    detectedRoles: ['Director', 'Responsible Person', 'WDA'],
    detectedNames: ['Sandeep Patel'],
    missingFields: ['companyNumber'],
    sourceEvidence: [
      {
        sourceType: 'ATTACHMENT',
        sourceLabel: 'account-opening.pdf',
        safeSnippet:
          'Direct Debit mandate with account number 12345678 sort code 12-34-56 and Responsible Person declaration.',
        extractionMethod: 'PDF_TEXT',
      },
    ],
    now: new Date('2026-05-15T10:00:00.000Z'),
  });
  const draftText = JSON.stringify(draft);
  const website = draft.fields.find((field) => field.key === 'website');
  const directDebit = draft.fields.find(
    (field) => field.key === 'directDebitOrBankAuthority',
  );
  const signature = draft.fields.find((field) => field.key === 'signature');
  const responsiblePerson = draft.fields.find(
    (field) => field.key === 'responsiblePerson',
  );

  assert.equal(draft.profileVersion, '2026-05-15');
  assert.equal(draft.status, 'BLOCKED');
  assert.equal(draft.overallConfidence, 'BLOCKED');
  assert.equal(draft.summary.safeToAutoFill, false);
  assert.equal(website?.valueSource, 'REVIEWER_RESPONSE');
  assert.equal(website?.confidence, 'HIGH');
  assert.equal(directDebit?.confidence, 'BLOCKED');
  assert.equal(directDebit?.requiresReview, true);
  assert.equal(signature?.riskLevel, 'BLOCKED');
  assert.equal(responsiblePerson?.requiresReview, true);
  assert.doesNotMatch(draftText, /12345678/);
  assert.doesNotMatch(draftText, /12-34-56/);
});

test('completion draft keeps unresolved master profile placeholders review-required', () => {
  const draft = buildAccountOpeningCompletionDraft({
    missingInfoResponses: {},
    riskFlags: [],
    detectedRoles: [],
    detectedNames: [],
    missingFields: ['companyNumber', 'registeredAddress'],
    sourceEvidence: [],
    now: new Date('2026-05-15T10:00:00.000Z'),
  });
  const companyNumber = draft.fields.find(
    (field) => field.key === 'companyNumber',
  );
  const registeredAddress = draft.fields.find(
    (field) => field.key === 'registeredAddress',
  );

  assert.equal(companyNumber?.valueSource, 'SYSTEM_PLACEHOLDER');
  assert.equal(companyNumber?.requiresReview, true);
  assert.equal(registeredAddress?.requiresReview, true);
  assert.equal(draft.summary.safeToAutoFill, false);
});

test('guarantee indemnity director-only and RP GDP WDA fields require review or stay blocked', () => {
  const draft = buildAccountOpeningCompletionDraft({
    missingInfoResponses: {
      gphcPremisesNumber: '1234567',
    },
    riskFlags: [
      'indemnity',
      'Director guarantee',
      'RP/GDP/WDA regulatory declaration',
    ],
    detectedRoles: ['Director-only signature', 'RP', 'GDP', 'WDA'],
    detectedNames: [],
    missingFields: [],
    sourceEvidence: [
      {
        sourceType: 'ATTACHMENT',
        sourceLabel: 'terms.pdf',
        safeSnippet:
          'Director-only signature and indemnity wording. RP GDP WDA declaration.',
      },
    ],
    now: new Date('2026-05-15T10:00:00.000Z'),
  });
  const highRisk = draft.fields.find(
    (field) => field.key === 'guaranteeIndemnityDirectorOnly',
  );
  const gphc = draft.fields.find((field) => field.key === 'gphcPremisesNumber');
  const responsiblePerson = draft.fields.find(
    (field) => field.key === 'responsiblePerson',
  );

  assert.equal(highRisk?.confidence, 'BLOCKED');
  assert.equal(highRisk?.requiresReview, true);
  assert.equal(gphc?.requiresReview, true);
  assert.equal(gphc?.riskLevel, 'HIGH');
  assert.equal(responsiblePerson?.requiresReview, true);
  assert.equal(responsiblePerson?.riskLevel, 'HIGH');
});
