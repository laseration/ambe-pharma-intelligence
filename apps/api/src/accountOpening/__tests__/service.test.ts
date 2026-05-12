import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAccountOpeningCase,
  buildAccountOpeningSigningNotes,
  buildAccountOpeningSigningSummary,
  detectAccountOpeningEmail,
  prepareAccountOpeningSharePointStorage,
} from '../service';

test('detectAccountOpeningEmail detects account-opening body and attachment names', () => {
  const result = detectAccountOpeningEmail({
    subject: 'Please complete new account form',
    bodyText: 'Can you return the trade account application?',
    attachmentFileNames: ['AMBE account opening form.pdf'],
  });

  assert.equal(result.detected, true);
  assert.ok(result.matchedTerms.includes('new account form'));
  assert.ok(result.matchedAttachmentNames.includes('AMBE account opening form.pdf'));
});

test('detectAccountOpeningEmail does not classify normal supplier price lists', () => {
  const result = detectAccountOpeningEmail({
    subject: 'May supplier price list',
    bodyText: 'Please find our wholesale price list attached. Amlodipine 5mg tablets GBP 1.20.',
    attachmentFileNames: ['supplier-price-list-may.xlsx'],
  });

  assert.equal(result.detected, false);
});

test('detectAccountOpeningEmail does not classify invoices or account statements', () => {
  const invoiceResult = detectAccountOpeningEmail({
    subject: 'Invoice and statement',
    bodyText: 'Attached invoice, delivery note and wholesale account statement for your records.',
    attachmentFileNames: ['invoice-1044.pdf', 'account-statement.pdf'],
  });
  const orderResult = detectAccountOpeningEmail({
    subject: 'Order confirmation',
    bodyText: 'Your order confirmation and delivery note are attached.',
    attachmentFileNames: ['order-confirmation.pdf', 'delivery-note.pdf'],
  });

  assert.equal(invoiceResult.detected, false);
  assert.equal(orderResult.detected, false);
});

test('account-opening case flags direct debit and guarantee wording', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Credit account application',
    bodyText: 'Please complete the Direct Debit mandate and personal guarantee section.',
    receivedAt: new Date('2026-05-12T10:00:00.000Z'),
    attachments: [],
    sharePoint,
  });

  assert.equal(accountCase.structuredFields.directDebitRequested, true);
  assert.equal(accountCase.structuredFields.guaranteeDetected, true);
  assert.ok(accountCase.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.riskFlags.includes('Personal guarantee'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('Personal guarantee'));
});

test('signer recommendation keeps Aman as default and explains director/regulatory/high-risk escalation', () => {
  const summary = buildAccountOpeningSigningSummary(
    'Director signature required. Sandeep Patel. Responsible Person RP GDP WDA Dilshad Moulana. Direct Debit guarantee indemnity.',
  );

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.ok(summary.detectedNames.includes('Sandeep Patel'));
  assert.ok(summary.detectedNames.includes('Dilshad Moulana'));
  assert.ok(summary.detectedSignatureRoles.includes('Director'));
  assert.ok(summary.signingExplanation.includes('Aman Dhillon can sign this account-opening form by default.'));
  assert.ok(summary.escalationNotes.some((note) => note.includes('director-only signature')));
  assert.ok(summary.escalationNotes.some((note) => note.includes('regulatory/RP wording')));
  assert.ok(summary.escalationNotes.some((note) => note.includes('High-risk section detected')));
});

test('Director wording keeps Aman as default signer with director-only escalation note', () => {
  const summary = buildAccountOpeningSigningSummary('Director signature box for the account opening form.');
  const notes = buildAccountOpeningSigningNotes({
    signingSummary: summary,
    riskFlags: ['Guarantee'],
    missingOrUnclear: [],
  });

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.match(summary.signingExplanation, /Aman Dhillon can sign this account-opening form by default/);
  assert.ok(summary.escalationNotes.some((note) => note.includes('director-only signature')));
  assert.equal(notes.recommendedSigner, 'Aman Dhillon');
  assert.ok(notes.reviewerChecks.some((check) => check.includes('director-only signature')));
});

test('RP GDP WDA wording keeps Aman as default signer with regulatory check note', () => {
  const summary = buildAccountOpeningSigningSummary('Responsible Person RP GDP WDA declaration.');
  const notes = buildAccountOpeningSigningNotes({
    signingSummary: summary,
    riskFlags: ['RP/GDP/WDA regulatory declaration'],
    missingOrUnclear: [],
  });

  assert.equal(summary.defaultSigner, 'Aman Dhillon');
  assert.equal(summary.canAmanSign, true);
  assert.match(summary.signingExplanation, /Aman Dhillon can sign this account-opening form by default/);
  assert.ok(summary.escalationNotes.some((note) => note.includes('regulatory/RP wording')));
  assert.ok(notes.reviewerChecks.some((check) => check.includes('regulatory/RP wording')));
});

test('unknown account-opening fields remain To be confirmed', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Supplier onboarding questionnaire',
    bodyText: 'Please complete this supplier onboarding questionnaire.',
    attachments: [],
    sharePoint,
  });

  assert.equal(accountCase.structuredFields.companyName, 'AMBE LTD');
  assert.equal(accountCase.structuredFields.tradingName, 'AMBE MEDICAL GROUP');
  assert.equal(accountCase.structuredFields.companyNumber, 'To be confirmed');
  assert.equal(accountCase.structuredFields.vatNumber, 'To be confirmed');
  assert.ok(accountCase.missingFields.includes('companyNumber'));
  assert.ok(accountCase.missingFields.includes('registeredAddress'));
  assert.ok(accountCase.signingNotes.missingOrUnclear.includes('companyNumber'));
});

test('ordinary account-opening form generates signing notes', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText: 'Please complete the account opening form.',
    attachments: [],
    sharePoint,
  });

  assert.equal(accountCase.signingNotes.title, 'Account opening signing notes');
  assert.equal(accountCase.signingNotes.recommendedSigner, 'Aman Dhillon');
  assert.equal(
    accountCase.signingNotes.defaultSigningStatement,
    'Aman Dhillon can sign this account-opening form by default.',
  );
  assert.match(accountCase.signingNotes.summary, /Leave signature fields blank/);
});

test('Direct Debit bank authority and guarantee wording appear in signing note risk flags', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText: 'Direct Debit mandate, bank authority signature, guarantee and indemnity sections apply.',
    attachments: [],
    sharePoint,
  });

  assert.ok(accountCase.signingNotes.riskFlags.includes('Direct Debit mandate'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('bank authority signature'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('Guarantee'));
  assert.ok(accountCase.signingNotes.riskFlags.includes('indemnity'));
});

test('dashboard-facing signing notes do not include bank account numbers', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({ enabled: false });
  const accountCase = buildAccountOpeningCase({
    senderEmail: 'forms@supplier.co.uk',
    senderDomain: 'supplier.co.uk',
    subject: 'Account opening form',
    bodyText:
      'Please complete the Direct Debit mandate. Account number 12345678 sort code 12-34-56 bank authority required.',
    attachments: [],
    sharePoint,
  });
  const dashboardFacingNotes = JSON.stringify(accountCase.signingNotes);

  assert.doesNotMatch(dashboardFacingNotes, /12345678/);
  assert.doesNotMatch(dashboardFacingNotes, /12-34-56/);
  assert.match(dashboardFacingNotes, /Direct Debit mandate/);
  assert.match(dashboardFacingNotes, /bank authority signature/);
});

test('SharePoint disabled path does not fail and records skipped upload note', () => {
  const sharePoint = prepareAccountOpeningSharePointStorage({
    enabled: false,
    siteId: '',
    driveId: '',
    folder: '',
  });

  assert.equal(sharePoint.enabled, false);
  assert.equal(sharePoint.folderUrl, null);
  assert.match(sharePoint.note, /upload skipped/i);
  assert.match(sharePoint.skippedReason ?? '', /disabled|configured/i);
});
