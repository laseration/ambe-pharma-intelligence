import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAccountOpeningFieldMappingCandidateForSave,
  buildAccountOpeningFieldMappingReview,
} from '../fieldMapping';
import type { AccountOpeningCompletionDraft } from '../draft';

function buildDraft(): AccountOpeningCompletionDraft {
  return {
    status: 'BLOCKED',
    overallConfidence: 'BLOCKED',
    isStored: true,
    profileId: 'ambe-account-opening-profile',
    profileVersion: '2026-06-09',
    generatedAt: '2026-05-15T10:00:00.000Z',
    fields: [
      {
        key: 'legalCompanyName',
        supplierLabel: 'Legal company name',
        proposedValue: 'Example configured company',
        valueSource: 'AMBE_MASTER_PROFILE',
        confidence: 'HIGH',
        riskLevel: 'LOW',
        requiresReview: false,
        reviewReason: null,
        evidence: [],
      },
      {
        key: 'responsiblePerson',
        supplierLabel: 'Responsible Person',
        proposedValue: 'To be confirmed',
        valueSource: 'SYSTEM_PLACEHOLDER',
        confidence: 'LOW',
        riskLevel: 'HIGH',
        requiresReview: true,
        reviewReason: 'Regulatory field requires reviewer confirmation.',
        evidence: [],
      },
      {
        key: 'directDebitOrBankAuthority',
        supplierLabel: 'Direct Debit or bank authority',
        proposedValue: 'To be confirmed in secure review',
        valueSource: 'SYSTEM_PLACEHOLDER',
        confidence: 'BLOCKED',
        riskLevel: 'BLOCKED',
        requiresReview: true,
        reviewReason: 'Direct Debit cannot be auto-filled.',
        evidence: [],
      },
      {
        key: 'bankDetails',
        supplierLabel: 'Bank details',
        proposedValue: 'To be confirmed in secure review',
        valueSource: 'SYSTEM_PLACEHOLDER',
        confidence: 'BLOCKED',
        riskLevel: 'BLOCKED',
        requiresReview: true,
        reviewReason: 'Bank details are blocked.',
        evidence: [],
      },
      {
        key: 'signature',
        supplierLabel: 'Signature',
        proposedValue: null,
        valueSource: 'NOT_PROVIDED',
        confidence: 'BLOCKED',
        riskLevel: 'BLOCKED',
        requiresReview: true,
        reviewReason: 'Signing is outside this workflow slice.',
        evidence: [],
      },
    ],
    summary: {
      totalFields: 5,
      highConfidenceFields: 1,
      reviewRequiredFields: 4,
      blockedFields: 3,
      safeToAutoFill: false,
    },
    safetyNotes: ['Review draft only.'],
  };
}

test('field mapping review classifies safe, review-required, and blocked candidates', () => {
  const review = buildAccountOpeningFieldMappingReview({
    completionDraft: buildDraft(),
    sourceEvidence: [
      {
        id: 'evidence-1',
        sourceType: 'ATTACHMENT',
        sourceLabel: 'supplier form',
        fileName: 'account-opening.pdf',
        safeSnippet:
          'Company Name, Responsible Person, Direct Debit Mandate, Bank Account Number, Sort Code and Director Signature are requested.',
      },
    ],
    now: new Date('2026-05-16T10:00:00.000Z'),
  });

  const companyName = review.mappings.find(
    (mapping) => mapping.supplierFieldLabel === 'Legal company name',
  );
  const responsiblePerson = review.mappings.find(
    (mapping) => mapping.supplierFieldLabel === 'Responsible Person',
  );
  const directDebit = review.mappings.find(
    (mapping) => mapping.supplierFieldLabel === 'Direct Debit Mandate',
  );
  const bankAccount = review.mappings.find(
    (mapping) => mapping.supplierFieldLabel === 'Bank Account Number',
  );
  const signature = review.mappings.find(
    (mapping) => mapping.supplierFieldLabel === 'Director Signature',
  );

  assert.equal(companyName?.status, 'MAPPED_SAFE');
  assert.equal(companyName?.proposedValue, 'Example configured company');
  assert.equal(responsiblePerson?.status, 'MAPPED_REVIEW_REQUIRED');
  assert.equal(responsiblePerson?.riskLevel, 'HIGH');
  assert.equal(directDebit?.status, 'BLOCKED');
  assert.equal(bankAccount?.status, 'BLOCKED');
  assert.equal(signature?.status, 'BLOCKED');
  assert.equal(review.summary.safeToFillSupplierForms, false);
});

test('operator mapping cannot downgrade bank details to safe and redacts notes', () => {
  const candidate = buildAccountOpeningFieldMappingCandidateForSave({
    completionDraft: buildDraft(),
    sourceEvidence: [],
    mapping: {
      supplierFieldLabel: 'Bank Account Number',
      sourceType: 'OPERATOR_CREATED',
      mappedDraftFieldKey: 'legalCompanyName',
      status: 'MAPPED_SAFE',
      operatorNote:
        'Supplier asked for account number 12345678 and sort code 12-34-56.',
    },
  });
  const serialized = JSON.stringify(candidate);

  assert.equal(candidate.status, 'BLOCKED');
  assert.equal(candidate.confidence, 'BLOCKED');
  assert.equal(candidate.riskLevel, 'BLOCKED');
  assert.equal(candidate.requiresReview, true);
  assert.doesNotMatch(serialized, /12345678/);
  assert.doesNotMatch(serialized, /12-34-56/);
  assert.match(serialized, /\[redacted bank account number\]/);
  assert.match(serialized, /\[redacted sort code\]/);
});
