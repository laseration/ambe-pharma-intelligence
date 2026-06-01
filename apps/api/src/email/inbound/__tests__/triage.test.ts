import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreInboundEmailTriage } from '../triage';

test('known supplier and structured price list body is auto-processed', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'pricing@supplier.co',
    fromName: 'Supplier Co',
    subject: 'Price list April',
    bodyText: [
      'Amlodipine 5mg tabs 28 - 8.40 GBP',
      'Paracetamol 500mg caplets 16 - 1.25 GBP',
      'Metformin 500mg 28 - 3.10 GBP',
    ].join('\n'),
    hasAttachment: false,
    knownSupplierDomains: ['supplier.co'],
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
    parserConfidence: 'HIGH',
    parsedStructuredRowCount: 3,
  });

  assert.equal(result.status, 'AUTO_PROCESSED');
});

test('trusted sender with commercially relevant but unclear email becomes AI review eligible', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'sandeep@ambemedical.com',
    fromName: 'Sandeep',
    subject: 'Offer this week',
    bodyText:
      'Available: Paracetamol 500mg caplets 16 by Teva at GBP 1.25 MOQ 20.',
    hasAttachment: false,
    trustedSender: true,
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
    parserConfidence: 'LOW',
    parsedStructuredRowCount: 0,
  });

  assert.equal(result.status, 'AI_REVIEW_ELIGIBLE');
});

test('known supplier messy but commercial email with prices is AI review eligible', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'pricing@supplier.co',
    fromName: 'Supplier Co',
    subject: 'Offer this week',
    bodyText: [
      'We can do Paracetamol 500mg caplets 16 at 1.25 GBP if useful.',
      'Metformin 500mg tablets 28 can also be supplied at 3.10 GBP.',
    ].join('\n'),
    hasAttachment: false,
    knownSupplierDomains: ['supplier.co'],
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
    parserConfidence: 'LOW',
    parsedStructuredRowCount: 0,
  });

  assert.equal(result.status, 'AI_REVIEW_ELIGIBLE');
  assert.equal(result.aiEligible, true);
});

test('unknown sender with conversational message is ignored non-actionable', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'random@example.com',
    fromName: 'Random',
    subject: 'Hope you are well',
    bodyText: 'Hope you are well. Please call me when free.',
    hasAttachment: false,
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
  });

  assert.equal(result.status, 'IGNORED_NON_ACTIONABLE');
});

test('unknown sender vague admin chatter becomes rejected low value or ignored', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'ops@example.com',
    fromName: 'Ops',
    subject: 'As discussed',
    bodyText: 'Attached as discussed. See below and let me know.',
    hasAttachment: false,
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
  });

  assert.ok(
    ['REJECTED_LOW_VALUE', 'IGNORED_NON_ACTIONABLE'].includes(result.status),
  );
});

test('known supplier with attachment and unclear body becomes manual review when AI limit exceeded', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'pricing@supplier.co',
    fromName: 'Supplier Co',
    subject: 'Offer attached',
    bodyText: 'Please review attached.',
    attachmentFileName: 'offer.pdf',
    attachmentMimeType: 'application/pdf',
    hasAttachment: true,
    knownSupplierDomains: ['supplier.co'],
    dailyAiReviewCount: 10,
    dailyAiReviewLimit: 10,
    perSupplierDailyAiReviewCount: 0,
    perSupplierDailyAiReviewLimit: 2,
    parserConfidence: 'LOW',
  });

  assert.equal(result.status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(result.aiBlockedReason, 'daily_ai_review_limit_exceeded');
});

test('body with only signature or footer is ignored', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'person@example.com',
    fromName: 'Person',
    subject: 'Thanks',
    bodyText: 'Thanks\nRegards',
    hasAttachment: false,
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
  });

  assert.equal(result.status, 'IGNORED_NON_ACTIONABLE');
});

test('spreadsheet attachment with product rows can auto-process with high parser confidence', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'unknown@example.com',
    fromName: 'Unknown',
    subject: 'Attached',
    bodyText: '',
    attachmentFileName: 'spreadsheet.xlsx',
    attachmentMimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    hasAttachment: true,
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
    parserConfidence: 'HIGH',
    parsedStructuredRowCount: 3,
  });

  assert.equal(result.status, 'AUTO_PROCESSED');
});

test('duplicate near-identical commercial email is blocked from AI with clear reason', () => {
  const result = scoreInboundEmailTriage({
    fromEmail: 'pricing@supplier.co',
    fromName: 'Supplier Co',
    subject: 'Offer this week',
    bodyText: [
      'We can do Metformin 500mg tablets 28 at 3.10 GBP if useful.',
      'Paracetamol 500mg caplets 16 are available at 1.25 GBP.',
    ].join('\n'),
    hasAttachment: false,
    knownSupplierDomains: ['supplier.co'],
    dailyAiReviewCount: 0,
    dailyAiReviewLimit: 10,
    perSupplierDailyAiReviewCount: 0,
    perSupplierDailyAiReviewLimit: 2,
    duplicateBodyDetected: true,
    parserConfidence: 'LOW',
  });

  assert.equal(result.status, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(result.aiBlockedReason, 'duplicate_recent_body_detected');
});
