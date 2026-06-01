import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMAIL_ROUTE_CLASSIFIER_VERSION,
  classifyEmailRoute,
} from '../classification';

test('classifyEmailRoute returns versioned account-opening route for extracted attachment text', () => {
  const result = classifyEmailRoute({
    subject: 'Documents attached',
    bodyText: 'Please complete and return.',
    attachmentFileNames: ['form.pdf'],
    attachmentTexts: [
      'Credit account application. Company details, VAT number, company number and WDA number.',
    ],
  });

  assert.equal(result.classifierVersion, EMAIL_ROUTE_CLASSIFIER_VERSION);
  assert.equal(result.route, 'ACCOUNT_OPENING');
  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.accountOpeningDetected, true);
  assert.ok(result.matchedTerms.includes('credit account application'));
  assert.match(result.classificationReason, /attachment text/);
  assert.deepEqual(result.evidenceUsed, [
    'SUBJECT',
    'BODY',
    'ATTACHMENT_FILENAME',
    'ATTACHMENT_TEXT',
  ]);
});

test('classifyEmailRoute preserves account-opening detection from attachment filename only', () => {
  const result = classifyEmailRoute({
    subject: 'Documents attached',
    bodyText: 'Please see attached.',
    attachmentFileNames: ['supplier-account-application-form.pdf'],
  });

  assert.equal(result.route, 'ACCOUNT_OPENING');
  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.accountOpeningDetected, true);
  assert.deepEqual(result.matchedAttachmentNames, [
    'supplier-account-application-form.pdf',
  ]);
  assert.match(result.classificationReason, /attachment filename/);
});

test('classifyEmailRoute keeps supplier price lists on standard fallback route', () => {
  const result = classifyEmailRoute({
    subject: 'May supplier price list',
    bodyText:
      'Please find our wholesale price list attached. Amlodipine 5mg tablets GBP 1.20.',
    attachmentFileNames: ['supplier-price-list-may.xlsx'],
  });

  assert.equal(result.classifierVersion, EMAIL_ROUTE_CLASSIFIER_VERSION);
  assert.equal(result.route, 'IGNORED_OR_STANDARD');
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.accountOpeningDetected, false);
  assert.deepEqual(result.matchedTerms, []);
  assert.deepEqual(result.matchedAttachmentNames, []);
});

test('classifyEmailRoute keeps generic account wording on standard fallback route', () => {
  const result = classifyEmailRoute({
    subject: 'Customer account update',
    bodyText:
      'Please ask your accounts customer contact to confirm the latest quote and account statement.',
    attachmentFileNames: ['quote.pdf'],
  });

  assert.equal(result.route, 'IGNORED_OR_STANDARD');
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.accountOpeningDetected, false);
  assert.equal(
    result.classificationReason,
    'No account-opening route evidence matched.',
  );
});
