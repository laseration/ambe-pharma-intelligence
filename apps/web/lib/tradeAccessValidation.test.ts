import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTradeAccessForm } from './tradeAccessValidation';

test('trade access form validation accepts a conservative buyer RFQ', () => {
  const result = validateTradeAccessForm({
    companyName: 'Buyer Pharmacy Ltd',
    contactName: 'Procurement Manager',
    contactEmail: 'BUYER@EXAMPLE.TEST',
    productName: 'Comparator requirement',
    quantityRequired: '100 packs',
    targetMarket: 'UK',
  });

  assert.equal(result.valid, true);
  assert.equal(result.values.contactEmail, 'buyer@example.test');
  assert.equal(result.values.quantityRequired, '100 packs');
});

test('trade access form validation blocks missing required fields and invalid email', () => {
  const result = validateTradeAccessForm({
    companyName: '',
    contactName: '',
    contactEmail: 'not-an-email',
    productName: '',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.companyName ?? '', /company name is required/i);
  assert.match(result.errors.contactName ?? '', /contact name is required/i);
  assert.match(result.errors.contactEmail ?? '', /valid business email/i);
  assert.match(
    result.errors.productName ?? '',
    /product requirement is required/i,
  );
});

test('trade access form validation rejects invalid required-by dates', () => {
  const result = validateTradeAccessForm({
    companyName: 'Buyer Pharmacy Ltd',
    contactName: 'Procurement Manager',
    contactEmail: 'buyer@example.test',
    productName: 'Comparator requirement',
    requiredBy: 'not-a-date',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.requiredBy ?? '', /valid required-by date/i);
});

test('trade access form validation rejects populated honeypot field', () => {
  const result = validateTradeAccessForm({
    companyName: 'Buyer Pharmacy Ltd',
    contactName: 'Procurement Manager',
    contactEmail: 'buyer@example.test',
    productName: 'Comparator requirement',
    website: 'https://spam.example',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.website ?? '', /could not be accepted/i);
});
