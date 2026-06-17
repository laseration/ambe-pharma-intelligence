import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateAccountOpeningAutofillPolicy } from '../policy';

test('safe company-profile fields remain autofill-allowed', () => {
  const decision = evaluateAccountOpeningAutofillPolicy({
    fieldKey: 'companyName',
    fieldLabel: 'Registered company name',
  });

  assert.equal(decision.safeToAutofill, true);
  assert.equal(decision.policyDecision, 'AUTOFILL_ALLOWED');
  assert.equal(decision.leaveBlank, false);
});

test('signature, bank, and direct-debit fields stay blank (deny-by-default regression guard)', () => {
  for (const label of [
    'Authorised signatory',
    'Bank account number',
    'Direct Debit mandate',
  ]) {
    const decision = evaluateAccountOpeningAutofillPolicy({
      fieldLabel: label,
    });
    assert.equal(decision.safeToAutofill, false, `expected "${label}" blocked`);
    assert.equal(decision.policyDecision, 'MUST_STAY_BLANK');
    assert.equal(decision.leaveBlank, true);
  }
});

test('warehouse / stockholding / cold-chain capability fields must stay blank for human review', () => {
  for (const label of [
    'Do you operate a warehouse?',
    'Stockholding capacity (pallets)',
    'Cold chain storage available',
    'Temperature controlled storage facility',
    'Refrigerated storage capability',
  ]) {
    const decision = evaluateAccountOpeningAutofillPolicy({
      fieldLabel: label,
    });
    assert.equal(decision.safeToAutofill, false, `expected "${label}" blocked`);
    assert.equal(decision.policyDecision, 'MUST_STAY_BLANK');
    assert.equal(decision.riskCategory, 'STOCKHOLDING');
    assert.equal(decision.fieldClass, 'STOCKHOLDING');
    assert.equal(decision.leaveBlank, true);
    assert.match(decision.signingNote ?? '', /active source evidence/i);
  }
});

test('ordinary low-risk wording is not mis-flagged as a stockholding capability claim', () => {
  // "storage" without a capacity/facility qualifier is not a capability claim;
  // an unknown field still defaults to review rather than a stockholding flag.
  const decision = evaluateAccountOpeningAutofillPolicy({
    fieldLabel: 'Preferred delivery times',
  });
  assert.notEqual(decision.riskCategory, 'STOCKHOLDING');
});
