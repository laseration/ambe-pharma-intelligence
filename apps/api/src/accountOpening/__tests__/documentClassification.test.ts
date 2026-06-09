import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAccountOpeningDocument } from '../documentClassification';

test('classifies core account-opening attachment types with deterministic evidence', () => {
  const cases = [
    {
      fileName: 'new-account-application.pdf',
      text: 'New account application. Company number, VAT number and registered office.',
      classification: 'ACCOUNT_OPENING_FORM',
    },
    {
      fileName: 'gdp-questionnaire.pdf',
      text: 'GDP questionnaire for Responsible Person and WDA declarations.',
      classification: 'GDP_QUESTIONNAIRE',
    },
    {
      fileName: 'terms-and-conditions.pdf',
      text: 'Standard terms and conditions of sale.',
      classification: 'TERMS_AND_CONDITIONS',
    },
    {
      fileName: 'credit-application.pdf',
      text: 'Credit application and credit limit requested.',
      classification: 'CREDIT_APPLICATION',
    },
    {
      fileName: 'direct-debit-mandate.pdf',
      text: 'Direct Debit mandate.',
      classification: 'DIRECT_DEBIT_MANDATE',
    },
    {
      fileName: 'bank-mandate.pdf',
      text: 'Bank mandate and payment authority.',
      classification: 'BANK_MANDATE',
    },
    {
      fileName: 'director-guarantee.pdf',
      text: 'Director guarantee and indemnity.',
      classification: 'DIRECTOR_GUARANTEE',
    },
    {
      fileName: 'trade-references.pdf',
      text: 'Please provide two trade references.',
      classification: 'TRADE_REFERENCES',
    },
    {
      fileName: 'regulatory-declaration.pdf',
      text: 'Regulatory declaration for MHRA WDA and Responsible Person.',
      classification: 'REGULATORY_DECLARATION',
    },
  ] as const;

  for (const item of cases) {
    const result = classifyAccountOpeningDocument(item);

    assert.equal(result.classification, item.classification);
    assert.notEqual(result.matchedEvidence.length, 0);
    assert.equal(result.safeForAutomaticCompletion, false);
  }
});

test('low-confidence account-opening documents stay in review', () => {
  const result = classifyAccountOpeningDocument({
    fileName: 'supplier-doc.pdf',
    text: 'Please see attached.',
  });

  assert.equal(result.classification, 'UNKNOWN_OTHER');
  assert.equal(result.confidence, 'LOW');
  assert.match(result.warnings.join(' '), /operator review/);
  assert.equal(result.safeForAutomaticCompletion, false);
});
