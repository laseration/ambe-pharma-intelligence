import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateAccountOpeningAutofillPolicy } from '../policy';
import { buildSafeAccountOpeningAutofill } from '../safeAutofill';

describe('account-opening safe autofill policy', () => {
  it('allows only explicit low-risk company profile fields', () => {
    const result = buildSafeAccountOpeningAutofill([
      {
        fieldKey: 'companyName',
        fieldLabel: 'Company name',
        value: 'Ambe Medical Group Ltd',
      },
      {
        fieldKey: 'email',
        fieldLabel: 'Accounts email',
        value: 'accounts@example.test',
      },
    ]);

    assert.deepEqual(result.values, {
      companyName: 'Ambe Medical Group Ltd',
      email: 'accounts@example.test',
    });
    assert.equal(result.safetySummary.externalSendAllowed, false);
  });

  it('blocks signatures bank Direct Debit guarantee indemnity credit and regulatory fields', () => {
    const blockedLabels = [
      'Signature',
      'Typed signature',
      'Bank account number',
      'Direct Debit mandate',
      'Personal guarantee',
      'Indemnity',
      'Credit limit approved',
      'Responsible Person GDP declaration',
      'WDA declaration',
    ];

    const result = buildSafeAccountOpeningAutofill(
      blockedLabels.map((fieldLabel) => ({
        fieldLabel,
        fieldKey: fieldLabel.replace(/\W+/g, ''),
        value: 'SHOULD NOT FILL',
      })),
    );

    assert.equal(Object.keys(result.values).length, 0);
    assert.equal(result.blocked.length, blockedLabels.length);
  });

  it('keeps unknown fields blank', () => {
    const decision = evaluateAccountOpeningAutofillPolicy({
      fieldKey: 'supplierSpecificUnknownField',
      fieldLabel: 'Supplier specific unknown field',
    });

    assert.equal(decision.safeToAutofill, false);
    assert.equal(decision.category, 'UNKNOWN');
  });
});
