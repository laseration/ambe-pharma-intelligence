import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccountOpeningCompletionDraft } from '../draft';
import { evaluateAccountOpeningAutofillPolicy } from '../policy';

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

  assert.equal(draft.profileVersion, '2026-06-09');
  assert.equal(draft.status, 'BLOCKED');
  assert.equal(draft.overallConfidence, 'BLOCKED');
  assert.equal(draft.summary.safeToAutoFill, false);
  assert.equal(website?.valueSource, 'REVIEWER_RESPONSE');
  assert.equal(website?.confidence, 'HIGH');
  assert.equal(website?.policyDecision, 'AUTOFILL_ALLOWED');
  assert.equal(directDebit?.confidence, 'BLOCKED');
  assert.equal(directDebit?.proposedValue, null);
  assert.equal(directDebit?.fieldClass, 'DIRECT_DEBIT');
  assert.equal(directDebit?.policyDecision, 'MUST_STAY_BLANK');
  assert.equal(directDebit?.requiresReview, true);
  assert.equal(signature?.riskLevel, 'BLOCKED');
  assert.equal(signature?.proposedValue, null);
  assert.equal(signature?.fieldClass, 'SIGNATURE');
  assert.equal(responsiblePerson?.requiresReview, true);
  assert.equal(responsiblePerson?.proposedValue, null);
  assert.equal(responsiblePerson?.fieldClass, 'REGULATORY_DECLARATION');
  assert.ok(
    draft.riskFlags.some((flag) => flag.fieldClass === 'DIRECT_DEBIT'),
  );
  assert.ok(draft.riskFlags.some((flag) => flag.fieldClass === 'SIGNATURE'));
  assert.ok(
    draft.signingNotes.some((note) => note.includes('Sandeep Patel')),
  );
  assert.ok(
    draft.signingNotes.some((note) => note.includes('Dilshad Moulana')),
  );
  assert.doesNotMatch(draftText, /12345678/);
  assert.doesNotMatch(draftText, /12-34-56/);
});

test('completion draft keeps unconfigured master profile values as review-required placeholders', () => {
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
  const website = draft.fields.find((field) => field.key === 'website');

  assert.equal(companyNumber?.proposedValue, 'To be confirmed');
  assert.equal(companyNumber?.valueSource, 'SYSTEM_PLACEHOLDER');
  assert.equal(companyNumber?.confidence, 'LOW');
  assert.equal(companyNumber?.requiresReview, true);
  assert.equal(registeredAddress?.valueSource, 'SYSTEM_PLACEHOLDER');
  assert.equal(registeredAddress?.requiresReview, true);
  assert.equal(website?.valueSource, 'SYSTEM_PLACEHOLDER');
  assert.equal(website?.requiresReview, true);
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
  assert.equal(gphc?.proposedValue, null);
  assert.equal(gphc?.riskLevel, 'HIGH');
  assert.equal(responsiblePerson?.requiresReview, true);
  assert.equal(responsiblePerson?.proposedValue, null);
  assert.equal(responsiblePerson?.riskLevel, 'HIGH');
});

test('reviewer-supplied sensitive account-opening values cannot become auto-fillable', () => {
  const draft = buildAccountOpeningCompletionDraft({
    missingInfoResponses: {
      directDebitRequested:
        'Please use account number 12345678 and sort code 12-34-56 for Direct Debit.',
      gphcPremisesNumber: '9012345',
      cqcRegistration: 'CQC-12345',
    },
    riskFlags: [
      'Direct Debit mandate',
      'bank authority signature',
      'Guarantee and indemnity',
      'Director-only signature',
      'RP/GDP/WDA regulatory declaration',
    ],
    detectedRoles: [
      'Director-only signature',
      'Responsible Person',
      'GDP',
      'WDA',
    ],
    detectedNames: ['Sandeep Patel'],
    missingFields: [],
    sourceEvidence: [
      {
        sourceType: 'ATTACHMENT',
        sourceLabel: 'supplier-form.pdf',
        safeSnippet:
          'Direct Debit, bank authority, director-only guarantee, indemnity, RP GDP WDA and signature sections.',
      },
    ],
    now: new Date('2026-05-15T10:00:00.000Z'),
  });
  const draftText = JSON.stringify(draft);
  const blockedKeys = [
    'directDebitOrBankAuthority',
    'bankDetails',
    'signature',
    'guaranteeIndemnityDirectorOnly',
  ];

  for (const key of blockedKeys) {
    const field = draft.fields.find((candidate) => candidate.key === key);
    assert.equal(field?.confidence, 'BLOCKED');
    assert.equal(field?.riskLevel, 'BLOCKED');
    assert.equal(field?.proposedValue, null);
    assert.equal(field?.requiresReview, true);
  }

  for (const key of [
    'gphcPremisesNumber',
    'responsiblePerson',
    'wholesaleDealerAuthorisation',
    'cqcRegistration',
  ]) {
    const field = draft.fields.find((candidate) => candidate.key === key);
    assert.equal(field?.requiresReview, true);
    assert.equal(field?.proposedValue, null);
    assert.notEqual(field?.riskLevel, 'LOW');
  }

  assert.equal(draft.summary.safeToAutoFill, false);
  assert.doesNotMatch(draftText, /12345678/);
  assert.doesNotMatch(draftText, /12-34-56/);
});

test('canonical policy keeps signature dates and unknown fields blank or review-required', () => {
  const signatureDatePolicy = evaluateAccountOpeningAutofillPolicy({
    fieldKey: 'signatureDate',
    fieldLabel: 'Date of signature',
  });
  const unknownPolicy = evaluateAccountOpeningAutofillPolicy({
    fieldKey: 'supplierSpecificQuestion',
    fieldLabel: 'How many vans do you operate?',
  });

  assert.equal(signatureDatePolicy.fieldClass, 'SIGNATURE');
  assert.equal(signatureDatePolicy.policyDecision, 'MUST_STAY_BLANK');
  assert.equal(signatureDatePolicy.leaveBlank, true);
  assert.equal(unknownPolicy.fieldClass, 'UNKNOWN');
  assert.equal(unknownPolicy.policyDecision, 'REVIEW_REQUIRED');
  assert.equal(unknownPolicy.leaveBlank, true);
});
